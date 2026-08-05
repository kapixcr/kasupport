import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  isTrackReference,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import {
  Camera,
  CameraOff,
  Circle,
  Copy,
  Hand,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  Radio,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  StopCircle,
  Unlock,
  Users,
  X,
} from "lucide-react";
import {
  ConnectionState,
  DisconnectReason,
  RoomEvent,
  Track,
  type Participant,
} from "livekit-client";
import { useMeetingMediaDevices } from "../hooks/useMediaDevices";
import { useMeetingSocket } from "../hooks/useMeetingSocket";
import { meetingErrorCopy } from "../lib/errors";
import { meetingsApi } from "../meetingsApi";
import type {
  MeetingChatMessage,
  MeetingDetail,
  MeetingJoinCredentials,
  MeetingLobbyRequest,
  MeetingPreJoinChoices,
  MeetingReactionEmoji,
  MeetingReactionEvent,
  MeetingRecordingState,
} from "../types";

const REACTIONS: MeetingReactionEmoji[] = ["👍", "👏", "❤️", "😂", "🎉", "😮"];
const REACTION_LIFETIME_MS = 3_600;

interface SocketMeetingPayload {
  public_id?: string;
  participant_id?: number;
  raised?: boolean;
  emoji?: string;
  ts?: number;
  status?: string;
  message?: unknown;
}

export interface MeetingRoomProps {
  credentials: MeetingJoinCredentials;
  choices?: Partial<MeetingPreJoinChoices>;
  guestToken?: string;
  onLeave?: () => void;
  onEnded?: () => void;
  className?: string;
}

interface ControlButtonProps {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}

function ControlButton({
  label,
  active = true,
  danger = false,
  disabled,
  children,
  onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={!danger ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45 ${
        danger
          ? "border-red-400/50 bg-red-600 hover:bg-red-500"
          : active
            ? "border-white/15 bg-zinc-700 hover:bg-zinc-600"
            : "border-red-400/50 bg-red-600 hover:bg-red-500"
      }`}
    >
      {children}
    </button>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function participantRecord(participant: Participant) {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = participant.metadata ? (JSON.parse(participant.metadata) as Record<string, unknown>) : {};
  } catch {
    metadata = {};
  }
  const participantId =
    participant.attributes["kasupport.participant_id"] ??
    (metadata.kasupport_participant_id !== undefined
      ? String(metadata.kasupport_participant_id)
      : undefined);
  return {
    participantId,
    role:
      participant.attributes["kasupport.role"] ??
      (typeof metadata.role === "string" ? metadata.role : "participant"),
  };
}

function participantIdFromSocket(payload: SocketMeetingPayload) {
  return payload.participant_id === undefined ? undefined : String(payload.participant_id);
}

function Tile({
  trackRef,
  raised,
  pinned,
  onPin,
  canKick,
  onKick,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  raised: boolean;
  pinned: boolean;
  onPin: () => void;
  canKick: boolean;
  onKick: () => void;
}) {
  const { participant } = trackRef;
  const publication = trackRef.publication;
  const hasVideo = Boolean(
    publication &&
      !publication.isMuted &&
      isTrackReference(trackRef) &&
      (trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare),
  );
  const displayName = participant.name || participant.identity;
  const isLocal = participant.isLocal;
  const isScreen = trackRef.source === Track.Source.ScreenShare;

  return (
    <article
      className={`group relative min-h-0 overflow-hidden rounded-2xl border bg-zinc-900 shadow-lg transition ${
        participant.isSpeaking
          ? "border-emerald-400 ring-2 ring-emerald-400/45"
          : pinned
            ? "border-indigo-400 ring-2 ring-indigo-400/40"
            : "border-white/10"
      }`}
      aria-label={`${displayName}${isLocal ? ", tú" : ""}${participant.isSpeaking ? ", hablando" : ""}`}
    >
      <button
        type="button"
        onClick={onPin}
        className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
        aria-label={pinned ? `Quitar ${displayName} de la vista principal` : `Fijar a ${displayName}`}
      />
      {hasVideo && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef as TrackReference}
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${isLocal && !isScreen ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
          <span className="flex size-20 items-center justify-center rounded-full bg-indigo-500/90 text-2xl font-bold text-white shadow-xl">
            {initials(displayName)}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between bg-gradient-to-t from-black/80 via-black/25 to-transparent p-3 pt-10">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {displayName}{isLocal ? " (tú)" : ""}{isScreen ? " · pantalla" : ""}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300">
            {participant.isMicrophoneEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-red-400" />}
            {participant.isSpeaking && <span>Hablando</span>}
          </div>
        </div>
        {raised && (
          <span className="rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-amber-950" title="Mano levantada">
            <Hand className="inline size-3.5" />
          </span>
        )}
      </div>

      {canKick && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onKick();
          }}
          className="absolute right-3 top-3 z-30 hidden size-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white hover:bg-red-600 group-hover:flex focus:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          title={`Expulsar a ${displayName}`}
          aria-label={`Expulsar a ${displayName}`}
        >
          <MoreVertical className="size-4" />
        </button>
      )}
    </article>
  );
}

function WaitingLobby({
  requests,
  busyId,
  onAdmit,
  onReject,
}: {
  requests: MeetingLobbyRequest[];
  busyId?: string;
  onAdmit: (request: MeetingLobbyRequest) => void;
  onReject: (request: MeetingLobbyRequest) => void;
}) {
  return (
    <section aria-labelledby="meeting-lobby-title" className="border-b border-white/10 p-4">
      <div className="flex items-center justify-between">
        <h2 id="meeting-lobby-title" className="text-sm font-semibold text-white">Sala de espera</h2>
        <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-bold text-white">{requests.length}</span>
      </div>
      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {requests.map((request) => {
            const id = String(request.participantId ?? request.id);
            const busy = busyId === id;
            return (
              <li key={id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="truncate text-sm font-medium text-white">{request.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">Solicita entrar</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReject(request)}
                    className="rounded-lg border border-white/15 px-2 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAdmit(request)}
                    className="rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy ? "Procesando…" : "Admitir"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ChatPanel({
  messages,
  loading,
  sending,
  error,
  onSend,
}: {
  messages: MeetingChatMessage[];
  loading: boolean;
  sending: boolean;
  error?: string | null;
  onSend: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setBody("");
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="meeting-chat-title">
      <header className="border-b border-white/10 px-4 py-3">
        <h2 id="meeting-chat-title" className="font-semibold text-white">Chat de la reunión</h2>
      </header>
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="size-4 animate-spin" /> Cargando mensajes…</p>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center text-zinc-500">
            <MessageSquare className="mx-auto mb-2 size-7" />
            <p className="text-sm">Aún no hay mensajes.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article key={String(message.id)} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="truncate text-zinc-100">{message.authorName}</strong>
                <time className="shrink-0 text-[10px] text-zinc-500" dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-zinc-300">{message.body}</p>
            </article>
          ))
        )}
      </div>
      <form onSubmit={submit} className="border-t border-white/10 p-3">
        {error && <p className="mb-2 text-xs text-red-300" role="alert">{error}</p>}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="meeting-chat-input">Mensaje</label>
          <textarea
            id="meeting-chat-input"
            value={body}
            maxLength={4000}
            rows={1}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escribe un mensaje"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-white/15 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar mensaje"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}

function DeviceMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const room = useRoomContext();
  const devices = useMeetingMediaDevices();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    try {
      setError(null);
      await room.switchActiveDevice(kind, deviceId, true);
      if (kind === "audioinput") devices.setAudioInputId(deviceId);
      if (kind === "videoinput") devices.setVideoInputId(deviceId);
      if (kind === "audiooutput") devices.setAudioOutputId(deviceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el dispositivo.");
    }
  };

  const select = (
    id: string,
    label: string,
    kind: MediaDeviceKind,
    list: MediaDeviceInfo[],
    value?: string,
  ) => (
    <label htmlFor={id} className="grid gap-1 text-xs text-zinc-300">
      {label}
      <select
        id={id}
        value={value ?? ""}
        disabled={!list.length}
        onChange={(event) => void switchDevice(kind, event.target.value)}
        className="h-9 rounded-lg border border-white/15 bg-zinc-800 px-2 text-sm text-white outline-none focus:border-indigo-400"
      >
        {!list.length && <option value="">No disponible</option>}
        {list.map((device, index) => (
          <option key={device.deviceId || `${kind}-${index}`} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="absolute bottom-16 left-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-zinc-900 p-4 text-white shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Dispositivos</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Cerrar selección de dispositivos"><X className="size-4" /></button>
      </div>
      <div className="mt-3 grid gap-3">
        {select("room-mic", "Micrófono", "audioinput", devices.audioInputs, devices.audioInputId)}
        {select("room-camera", "Cámara", "videoinput", devices.videoInputs, devices.videoInputId)}
        {devices.audioOutputs.length > 0 && select("room-speaker", "Altavoz", "audiooutput", devices.audioOutputs, devices.audioOutputId)}
      </div>
      {error && <p className="mt-3 text-xs text-red-300" role="alert">{error}</p>}
    </div>
  );
}

function MeetingRoomInner({
  credentials,
  choices,
  guestToken,
  onLeave,
  onEnded,
}: Omit<MeetingRoomProps, "className">) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const socketSession = useMeetingSocket({ publicId: credentials.meeting.publicId, guestToken });
  const isHost = credentials.role === "host";

  const [meeting, setMeeting] = useState<MeetingDetail>(credentials.meeting);
  const [sidePanel, setSidePanel] = useState<"chat" | "people" | null>(null);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<MeetingLobbyRequest[]>([]);
  const [lobbyBusyId, setLobbyBusyId] = useState<string>();
  const [hands, setHands] = useState<Record<string, boolean>>({});
  const [handRaised, setHandRaised] = useState(false);
  const [reactions, setReactions] = useState<MeetingReactionEvent[]>([]);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [recording, setRecording] = useState<MeetingRecordingState>({ status: meeting.recordingStatus ?? "idle" });
  const [hostBusy, setHostBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason>();
  const [ended, setEnded] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const myParticipantId = String(credentials.participantId ?? socketSession.participantId ?? "");

  const appendMessage = useCallback((next: MeetingChatMessage) => {
    setMessages((current) => {
      if (current.some((message) => String(message.id) === String(next.id))) return current;
      if (next.clientId && current.some((message) => message.clientId === next.clientId)) return current;
      return [...current, next].sort((left, right) => {
        const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        return byTime || String(left.id).localeCompare(String(right.id));
      });
    });
  }, []);

  const refreshLobby = useCallback(async () => {
    if (!isHost) return;
    try {
      const requests = await meetingsApi.getLobby(meeting.publicId);
      setLobby(requests.filter((request) => request.status === "pending"));
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    }
  }, [isHost, meeting.publicId]);

  useEffect(() => {
    let cancelled = false;
    setChatLoading(true);
    meetingsApi
      .getChat(meeting.publicId, undefined, guestToken)
      .then((page) => {
        if (!cancelled) setMessages(page.messages);
      })
      .catch((cause) => {
        if (!cancelled) setChatError(meetingErrorCopy(cause).description);
      })
      .finally(() => {
        if (!cancelled) setChatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guestToken, meeting.publicId]);

  useEffect(() => {
    if (!isHost) return;
    void refreshLobby();
    const timer = window.setInterval(() => void refreshLobby(), 5_000);
    return () => window.clearInterval(timer);
  }, [isHost, refreshLobby]);

  useEffect(() => {
    if (!isHost) return;
    meetingsApi.getRecordingState(meeting.publicId).then(setRecording).catch(() => undefined);
  }, [isHost, meeting.publicId]);

  useEffect(() => {
    if (choices?.audioOutputId) void room.switchActiveDevice("audiooutput", choices.audioOutputId).catch(() => undefined);
  }, [choices?.audioOutputId, room]);

  useEffect(() => {
    const socket = socketSession.socket;
    const sameMeeting = (payload: SocketMeetingPayload) => !payload.public_id || payload.public_id === meeting.publicId;

    const onChat = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload) || !payload.message) return;
      const raw = payload.message as Record<string, unknown>;
      appendMessage({
        id: String(raw.id ?? crypto.randomUUID()),
        body: String(raw.body ?? ""),
        authorId: raw.participant_id !== undefined ? String(raw.participant_id) : undefined,
        authorName: String(raw.author_name ?? "Participante"),
        createdAt: String(raw.created_at ?? new Date().toISOString()),
      });
    };
    const onReaction = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload) || !REACTIONS.includes(payload.emoji as MeetingReactionEmoji)) return;
      const id = `${payload.participant_id ?? "unknown"}-${payload.ts ?? Date.now()}-${payload.emoji}`;
      const eventParticipantId = participantIdFromSocket(payload);
      const participant = participants.find(
        (item) =>
          participantRecord(item).participantId === eventParticipantId ||
          item.identity === eventParticipantId,
      );
      const isMine = eventParticipantId !== undefined && eventParticipantId === myParticipantId;
      if (isMine) return;
      setReactions((current) => [
        ...current,
        {
          id,
          emoji: payload.emoji as MeetingReactionEmoji,
          participantIdentity: participant?.identity ?? eventParticipantId ?? "unknown",
          participantName:
            participant?.name ?? (isMine ? localParticipant.name || localParticipant.identity : "Participante"),
          createdAt: payload.ts ?? Date.now(),
        },
      ]);
      window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), REACTION_LIFETIME_MS);
    };
    const onHand = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload) || payload.participant_id === undefined) return;
      setHands((current) => ({ ...current, [String(payload.participant_id)]: Boolean(payload.raised) }));
    };
    const onEndedSocket = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload)) return;
      setEnded(true);
      onEnded?.();
    };
    const onRemoved = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload)) return;
      if (String(payload.participant_id) === myParticipantId) setDisconnectReason(DisconnectReason.PARTICIPANT_REMOVED);
    };
    const onRecording = (payload: SocketMeetingPayload) => {
      if (!sameMeeting(payload) || !payload.status) return;
      const status = payload.status === "active" ? "recording" : payload.status;
      if (status === "recording" || status === "starting" || status === "stopping" || status === "complete" || status === "failed" || status === "idle") {
        setRecording((current) => ({ ...current, status }));
      }
    };
    const onLobby = (payload: SocketMeetingPayload) => {
      if (sameMeeting(payload) && isHost) void refreshLobby();
    };

    socket.on("meeting:chat", onChat);
    socket.on("meeting:reaction", onReaction);
    socket.on("meeting:hand_raise", onHand);
    socket.on("meeting:ended", onEndedSocket);
    socket.on("meeting:participant_removed", onRemoved);
    socket.on("meeting:recording", onRecording);
    socket.on("meeting:lobby_request", onLobby);
    socket.on("meeting:lobby_update", onLobby);
    return () => {
      socket.off("meeting:chat", onChat);
      socket.off("meeting:reaction", onReaction);
      socket.off("meeting:hand_raise", onHand);
      socket.off("meeting:ended", onEndedSocket);
      socket.off("meeting:participant_removed", onRemoved);
      socket.off("meeting:recording", onRecording);
      socket.off("meeting:lobby_request", onLobby);
      socket.off("meeting:lobby_update", onLobby);
    };
  }, [appendMessage, isHost, localParticipant, meeting.publicId, myParticipantId, onEnded, participants, refreshLobby, socketSession.socket]);

  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => setDisconnectReason(reason);
    const onConnected = () => setDisconnectReason(undefined);
    const onRecordingChanged = (isRecording: boolean) => {
      setRecording((current) => ({
        ...current,
        status: isRecording ? "recording" : current.status === "recording" ? "idle" : current.status,
      }));
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    room.on(RoomEvent.RecordingStatusChanged, onRecordingChanged);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Reconnected, onConnected);
      room.off(RoomEvent.RecordingStatusChanged, onRecordingChanged);
    };
  }, [room]);

  const gridTracks = useMemo(() => {
    const combined: TrackReferenceOrPlaceholder[] = [...screenTracks, ...cameraTracks];
    if (!pinnedIdentity) return combined;
    return [...combined].sort((left, right) => {
      const leftPinned = left.participant.identity === pinnedIdentity || (left.source === Track.Source.ScreenShare && left.participant.identity === pinnedIdentity);
      const rightPinned = right.participant.identity === pinnedIdentity || (right.source === Track.Source.ScreenShare && right.participant.identity === pinnedIdentity);
      return Number(rightPinned) - Number(leftPinned);
    });
  }, [cameraTracks, pinnedIdentity, screenTracks]);

  const pinned = gridTracks.find((track) => track.participant.identity === pinnedIdentity);
  const otherTracks = pinned ? gridTracks.filter((track) => track !== pinned) : gridTracks;

  const toggleMicrophone = async () => {
    setActionError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, choices?.audioInputId ? { deviceId: choices.audioInputId } : undefined);
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    }
  };

  const toggleCamera = async () => {
    setActionError(null);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled, choices?.videoInputId ? { deviceId: choices.videoInputId } : undefined);
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    }
  };

  const toggleScreenShare = async () => {
    setActionError(null);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    }
  };

  const toggleHand = () => {
    const raised = !handRaised;
    setHandRaised(raised);
    if (myParticipantId) setHands((current) => ({ ...current, [myParticipantId]: raised }));
    socketSession.socket.emit("meeting:hand_raise", { raised });
  };

  const react = (emoji: MeetingReactionEmoji) => {
    socketSession.socket.emit("meeting:reaction", { emoji });
    const id = `local-${crypto.randomUUID()}`;
    setReactions((current) => [
      ...current,
      {
        id,
        emoji,
        participantIdentity: localParticipant.identity,
        participantName: localParticipant.name || localParticipant.identity,
        createdAt: Date.now(),
      },
    ]);
    window.setTimeout(
      () => setReactions((current) => current.filter((item) => item.id !== id)),
      REACTION_LIFETIME_MS,
    );
    setReactionMenuOpen(false);
  };

  const sendChat = async (body: string) => {
    const clientId = crypto.randomUUID();
    setChatSending(true);
    setChatError(null);
    try {
      const sent = await meetingsApi.sendChat(meeting.publicId, body, clientId, guestToken);
      appendMessage({ ...sent, clientId: sent.clientId ?? clientId });
    } catch (cause) {
      setChatError(meetingErrorCopy(cause).description);
    } finally {
      setChatSending(false);
    }
  };

  const processLobby = async (request: MeetingLobbyRequest, admit: boolean) => {
    const id = String(request.participantId ?? request.id);
    setLobbyBusyId(id);
    setActionError(null);
    try {
      if (admit) await meetingsApi.admitLobby(meeting.publicId, id);
      else await meetingsApi.rejectLobby(meeting.publicId, id);
      setLobby((current) => current.filter((item) => String(item.participantId ?? item.id) !== id));
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
      void refreshLobby();
    } finally {
      setLobbyBusyId(undefined);
    }
  };

  const kick = async (participant: Participant) => {
    const id = participantRecord(participant).participantId;
    if (!id) {
      setActionError("No se encontró el identificador de este participante.");
      return;
    }
    if (!window.confirm(`¿Expulsar a ${participant.name || participant.identity} de la reunión?`)) return;
    setHostBusy(`kick:${id}`);
    try {
      await meetingsApi.kickParticipant(meeting.publicId, id);
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    } finally {
      setHostBusy(null);
    }
  };

  const toggleLock = async () => {
    setHostBusy("lock");
    setActionError(null);
    try {
      const updated = await meetingsApi.setLocked(meeting.publicId, !meeting.locked);
      setMeeting((current) => ({ ...current, ...updated }));
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    } finally {
      setHostBusy(null);
    }
  };

  const toggleRecording = async () => {
    const stopping = recording.status === "recording" || recording.status === "starting";
    if (!stopping && !window.confirm("Al iniciar, todos verán un indicador de grabación. Confirma que cuentas con el consentimiento requerido.")) return;
    setHostBusy("recording");
    setActionError(null);
    try {
      const state = stopping
        ? await meetingsApi.stopRecording(meeting.publicId)
        : await meetingsApi.startRecording(meeting.publicId);
      setRecording(state);
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    } finally {
      setHostBusy(null);
    }
  };

  const endMeeting = async () => {
    if (!window.confirm("¿Finalizar la reunión para todas las personas? Esta acción no se puede deshacer.")) return;
    setHostBusy("end");
    setActionError(null);
    try {
      await meetingsApi.endMeeting(meeting.publicId);
      setEnded(true);
      onEnded?.();
      room.disconnect();
    } catch (cause) {
      setActionError(meetingErrorCopy(cause).description);
    } finally {
      setHostBusy(null);
    }
  };

  const leave = () => {
    room.disconnect();
    onLeave?.();
  };

  const inviteUrl = meeting.inviteUrl || `${window.location.origin}/meet/${encodeURIComponent(meeting.publicId)}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1_800);
    } catch {
      setActionError("No se pudo copiar el enlace. Cópialo desde la barra del navegador.");
    }
  };

  if (ended || disconnectReason === DisconnectReason.ROOM_DELETED) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md text-center">
          <PhoneOff className="mx-auto size-12 text-zinc-400" />
          <h1 className="mt-5 text-2xl font-bold">La reunión terminó</h1>
          <p className="mt-2 text-zinc-400">El anfitrión finalizó la sala para todas las personas.</p>
          <button type="button" onClick={onLeave} className="mt-6 rounded-xl bg-white px-5 py-2.5 font-semibold text-zinc-950 hover:bg-zinc-200">Salir</button>
        </div>
      </div>
    );
  }

  if (disconnectReason === DisconnectReason.PARTICIPANT_REMOVED) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto size-12 text-amber-400" />
          <h1 className="mt-5 text-2xl font-bold">Se terminó tu participación</h1>
          <p className="mt-2 text-zinc-400">El anfitrión te retiró de esta reunión.</p>
          <button type="button" onClick={onLeave} className="mt-6 rounded-xl bg-white px-5 py-2.5 font-semibold text-zinc-950 hover:bg-zinc-200">Cerrar</button>
        </div>
      </div>
    );
  }

  const reconnecting = connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;
  const disconnectedUnexpectedly =
    connectionState === ConnectionState.Disconnected &&
    disconnectReason !== undefined &&
    disconnectReason !== DisconnectReason.CLIENT_INITIATED;

  return (
    <div className="relative flex h-full min-h-[520px] overflow-hidden bg-zinc-950 text-white">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{meeting.title}</h1>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              {reconnecting ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-2 fill-emerald-400 text-emerald-400" />}
              {reconnecting ? "Reconectando…" : `${participants.length} de ${meeting.maxParticipants}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(recording.status === "recording" || recording.status === "starting") && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-3 py-1 text-xs font-semibold text-red-300" role="status">
                <Circle className="size-2.5 animate-pulse fill-red-500 text-red-500" /> Grabando
              </span>
            )}
            {meeting.locked && <span className="hidden items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 sm:flex"><Lock className="size-3" /> Bloqueada</span>}
            <button type="button" onClick={() => void copyInvite()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10" title="Copiar enlace de invitación">
              <Copy className="size-3.5" /> <span className="hidden sm:inline">{copyDone ? "Copiado" : "Copiar enlace"}</span>
            </button>
          </div>
        </header>

        {(reconnecting || connectionState === ConnectionState.Connecting) && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs text-amber-200" role="status">
            <Loader2 className="size-4 animate-spin" /> {reconnecting ? "La conexión se interrumpió. Intentando volver…" : "Conectando audio y video…"}
          </div>
        )}
        {disconnectedUnexpectedly && (
          <div className="flex items-center justify-center gap-2 bg-red-500/15 px-4 py-2 text-xs text-red-200" role="alert">
            La conexión terminó inesperadamente.
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1 font-semibold underline">
              <RefreshCw className="size-3.5" /> Volver a conectar
            </button>
          </div>
        )}
        {socketSession.state === "error" && (
          <div className="flex items-center justify-center gap-2 bg-red-500/15 px-4 py-2 text-xs text-red-200" role="alert">
            {socketSession.error} <button type="button" onClick={socketSession.reconnect} className="underline">Reintentar</button>
          </div>
        )}
        {actionError && (
          <div className="flex items-center justify-between gap-3 bg-red-500/15 px-4 py-2 text-xs text-red-200" role="alert">
            <span>{actionError}</span><button type="button" onClick={() => setActionError(null)} aria-label="Cerrar error"><X className="size-4" /></button>
          </div>
        )}

        <div className="relative min-h-0 flex-1 p-3 sm:p-4">
          {participants.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-center">
              <div>
                <Users className="mx-auto size-10 text-zinc-500" />
                <h2 className="mt-4 font-semibold">Esperando a otras personas</h2>
                <p className="mt-1 text-sm text-zinc-500">Comparte el enlace para invitar a alguien.</p>
              </div>
            </div>
          ) : pinned ? (
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Tile
                trackRef={pinned}
                raised={hands[participantRecord(pinned.participant).participantId ?? ""] ?? false}
                pinned
                onPin={() => setPinnedIdentity(null)}
                canKick={isHost && !pinned.participant.isLocal}
                onKick={() => void kick(pinned.participant)}
              />
              <div className="grid min-h-0 auto-rows-[150px] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-1">
                {otherTracks.map((track, index) => (
                  <Tile
                    key={`${track.participant.identity}-${track.source}-${index}`}
                    trackRef={track}
                    raised={hands[participantRecord(track.participant).participantId ?? ""] ?? false}
                    pinned={false}
                    onPin={() => setPinnedIdentity(track.participant.identity)}
                    canKick={isHost && !track.participant.isLocal}
                    onKick={() => void kick(track.participant)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              className="grid h-full min-h-0 gap-3"
              style={{
                gridTemplateColumns: `repeat(${gridTracks.length <= 1 ? 1 : gridTracks.length <= 4 ? 2 : gridTracks.length <= 9 ? 3 : 4}, minmax(0, 1fr))`,
                gridAutoRows: "minmax(0, 1fr)",
              }}
            >
              {gridTracks.map((track, index) => (
                <Tile
                  key={`${track.participant.identity}-${track.source}-${index}`}
                  trackRef={track}
                  raised={hands[participantRecord(track.participant).participantId ?? ""] ?? false}
                  pinned={false}
                  onPin={() => setPinnedIdentity(track.participant.identity)}
                  canKick={isHost && !track.participant.isLocal && hostBusy !== `kick:${participantRecord(track.participant).participantId}`}
                  onKick={() => void kick(track.participant)}
                />
              ))}
            </div>
          )}

          <div aria-live="polite" className="pointer-events-none absolute inset-0 overflow-hidden">
            {reactions.map((reaction, index) => (
              <div
                key={reaction.id}
                className="absolute bottom-5 animate-bounce rounded-full bg-zinc-900/90 px-3 py-2 text-2xl shadow-xl"
                style={{ left: `${10 + ((index * 17) % 75)}%` }}
                title={`${reaction.participantName}: ${reaction.emoji}`}
              >
                {reaction.emoji}
              </div>
            ))}
          </div>
        </div>

        <footer className="relative flex min-h-16 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-zinc-900/95 px-3 py-2 sm:px-5">
          <div className="hidden min-w-0 text-xs text-zinc-500 md:block">
            <span className="block truncate">{meeting.publicId}</span>
            {meeting.recordingEnabled && <span className="text-amber-300">La sala permite grabación</span>}
          </div>
          <div className="mx-auto flex items-center gap-2">
            <ControlButton label={isMicrophoneEnabled ? "Apagar micrófono" : "Encender micrófono"} active={isMicrophoneEnabled} onClick={() => void toggleMicrophone()}>
              {isMicrophoneEnabled ? <Mic /> : <MicOff />}
            </ControlButton>
            <ControlButton label={isCameraEnabled ? "Apagar cámara" : "Encender cámara"} active={isCameraEnabled} onClick={() => void toggleCamera()}>
              {isCameraEnabled ? <Camera /> : <CameraOff />}
            </ControlButton>
            <ControlButton label={isScreenShareEnabled ? "Dejar de compartir pantalla" : "Compartir pantalla"} active={!isScreenShareEnabled} onClick={() => void toggleScreenShare()}>
              {isScreenShareEnabled ? <StopCircle /> : <MonitorUp />}
            </ControlButton>
            <ControlButton label={handRaised ? "Bajar la mano" : "Levantar la mano"} active={!handRaised} onClick={toggleHand}>
              <Hand className={handRaised ? "text-amber-300" : ""} />
            </ControlButton>
            <div className="relative">
              <ControlButton label="Enviar reacción" onClick={() => setReactionMenuOpen((current) => !current)}><Sparkles /></ControlButton>
              {reactionMenuOpen && (
                <div className="absolute bottom-14 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-white/15 bg-zinc-800 p-2 shadow-xl">
                  {REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => react(emoji)} className="rounded-full p-1.5 text-xl hover:bg-white/10" aria-label={`Reaccionar con ${emoji}`}>{emoji}</button>)}
                </div>
              )}
            </div>
            <ControlButton label="Seleccionar dispositivos" onClick={() => setDeviceMenuOpen((current) => !current)}><Settings /></ControlButton>
            <ControlButton label="Salir de la reunión" danger onClick={leave}><LogOut /></ControlButton>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSidePanel((current) => current === "people" ? null : "people")} className={`relative flex size-10 items-center justify-center rounded-full hover:bg-white/10 ${sidePanel === "people" ? "bg-white/15" : ""}`} aria-label="Mostrar participantes">
              <Users className="size-5" />{lobby.length > 0 && isHost && <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold">{lobby.length}</span>}
            </button>
            <button type="button" onClick={() => setSidePanel((current) => current === "chat" ? null : "chat")} className={`flex size-10 items-center justify-center rounded-full hover:bg-white/10 ${sidePanel === "chat" ? "bg-white/15" : ""}`} aria-label="Mostrar chat"><MessageSquare className="size-5" /></button>
          </div>
          <DeviceMenu open={deviceMenuOpen} onClose={() => setDeviceMenuOpen(false)} />
        </footer>
      </main>

      {sidePanel && (
        <aside className="absolute inset-y-0 right-0 z-40 flex w-[min(92vw,340px)] flex-col border-l border-white/10 bg-zinc-900 shadow-2xl sm:relative sm:z-auto" aria-label={sidePanel === "chat" ? "Chat" : "Participantes"}>
          <button type="button" onClick={() => setSidePanel(null)} className="absolute right-3 top-3 z-10 rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar panel"><X className="size-5" /></button>
          {sidePanel === "chat" ? (
            <ChatPanel messages={messages} loading={chatLoading} sending={chatSending} error={chatError} onSend={(body) => void sendChat(body)} />
          ) : (
            <Fragment>
              {isHost && <WaitingLobby requests={lobby} busyId={lobbyBusyId} onAdmit={(request) => void processLobby(request, true)} onReject={(request) => void processLobby(request, false)} />}
              <section className="min-h-0 flex-1 overflow-y-auto p-4" aria-labelledby="meeting-participants-title">
                <h2 id="meeting-participants-title" className="font-semibold text-white">En la reunión ({participants.length})</h2>
                <ul className="mt-3 space-y-2">
                  {participants.map((participant) => {
                    const info = participantRecord(participant);
                    return (
                      <li key={participant.identity} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold">{initials(participant.name || participant.identity)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{participant.name || participant.identity}{participant.isLocal ? " (tú)" : ""}</span>
                          <span className="block text-xs text-zinc-500">{info.role === "host" ? "Anfitrión" : participant.isSpeaking ? "Hablando" : "Participante"}</span>
                        </span>
                        {hands[info.participantId ?? ""] && <Hand className="size-4 text-amber-300" />}
                        {participant.isMicrophoneEnabled ? <Mic className="size-4 text-zinc-400" /> : <MicOff className="size-4 text-red-400" />}
                        {isHost && !participant.isLocal && (
                          <button type="button" onClick={() => void kick(participant)} className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-300" aria-label={`Expulsar a ${participant.name || participant.identity}`}><MoreVertical className="size-4" /></button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
              {isHost && (
                <section className="border-t border-white/10 p-4">
                  <h2 className="text-sm font-semibold">Controles del anfitrión</h2>
                  <div className="mt-3 grid gap-2">
                    <button type="button" disabled={Boolean(hostBusy)} onClick={() => void toggleLock()} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                      <span className="flex items-center gap-2">{meeting.locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}{meeting.locked ? "Desbloquear reunión" : "Bloquear reunión"}</span>{hostBusy === "lock" && <Loader2 className="size-4 animate-spin" />}
                    </button>
                    {meeting.recordingEnabled && (
                      <button type="button" disabled={Boolean(hostBusy) || recording.status === "stopping"} onClick={() => void toggleRecording()} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                        <span className="flex items-center gap-2">{recording.status === "recording" || recording.status === "starting" ? <StopCircle className="size-4 text-red-400" /> : <Radio className="size-4" />}{recording.status === "recording" || recording.status === "starting" ? "Detener grabación" : "Iniciar grabación"}</span>{hostBusy === "recording" && <Loader2 className="size-4 animate-spin" />}
                      </button>
                    )}
                    <button type="button" disabled={Boolean(hostBusy)} onClick={() => void endMeeting()} className="flex items-center justify-between rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <span className="flex items-center gap-2"><PhoneOff className="size-4" />Finalizar para todos</span>{hostBusy === "end" && <Loader2 className="size-4 animate-spin" />}
                    </button>
                  </div>
                </section>
              )}
            </Fragment>
          )}
        </aside>
      )}
      <RoomAudioRenderer />
      <StartAudio label="Activar audio" className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-950 shadow-xl" />
    </div>
  );
}

export function MeetingRoom({
  credentials,
  choices,
  guestToken,
  onLeave,
  onEnded,
  className,
}: MeetingRoomProps) {
  const [connectError, setConnectError] = useState<Error | null>(null);
  const audioOptions = choices?.audioEnabled
    ? choices.audioInputId
      ? { deviceId: choices.audioInputId }
      : true
    : false;
  const videoOptions = choices?.videoEnabled
    ? choices.videoInputId
      ? { deviceId: choices.videoInputId }
      : true
    : false;

  if (connectError) {
    const copy = meetingErrorCopy(connectError);
    return (
      <div className={`flex h-full min-h-[520px] items-center justify-center bg-zinc-950 p-6 text-white ${className ?? ""}`}>
        <div className="max-w-md text-center">
          <RefreshCw className="mx-auto size-12 text-amber-400" />
          <h1 className="mt-5 text-2xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-zinc-400">{copy.description}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={() => setConnectError(null)} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-zinc-950 hover:bg-zinc-200">Reintentar</button>
            <button type="button" onClick={onLeave} className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold hover:bg-white/10">Salir</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={credentials.livekitUrl}
      token={credentials.livekitToken}
      connect
      audio={audioOptions}
      video={videoOptions}
      options={{ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true }}
      onError={setConnectError}
      className={`h-full min-h-[520px] ${className ?? ""}`}
      data-lk-theme="default"
    >
      <MeetingRoomInner
        credentials={credentials}
        choices={choices}
        guestToken={guestToken}
        onLeave={onLeave}
        onEnded={onEnded}
      />
    </LiveKitRoom>
  );
}
