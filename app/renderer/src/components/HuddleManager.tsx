import { useCallback, useEffect, useRef, useState } from "react";
import { socket, type Agent } from "@/lib/api";
import { playDing } from "@/lib/notify";

export interface HuddleParticipant {
  id: number;
  name: string;
  avatar?: string | null;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface Props {
  me: Agent;
  channelId: number | null;         // canal del huddle al que me uní (null = fuera)
  participants: HuddleParticipant[]; // participantes actuales de ESE canal
  onLeave: () => void;
}

/* Video remoto/local con srcObject */
function HuddleVideo({ stream, label, muted = false, mirror = false }: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative bg-zinc-800 rounded-xl overflow-hidden aspect-video">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${mirror ? "-scale-x-100" : ""}`}
      />
      <span className="absolute bottom-1.5 left-2 text-[11px] text-white bg-black/50 rounded px-1.5 py-0.5">
        {label}
      </span>
    </div>
  );
}

export function HuddleManager({ me, channelId, participants, onLeave }: Props) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({});

  const pcsRef = useRef(new Map<number, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingIce = useRef(new Map<number, RTCIceCandidateInit[]>());
  const prevParticipants = useRef<Set<number>>(new Set());

  const active = channelId !== null;

  /* ------------------------------ ciclo de vida ------------------------------ */

  const cleanup = useCallback(() => {
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    pendingIce.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camTrackRef.current = null;
    prevParticipants.current = new Set();
    setRemoteStreams({});
    setMicOn(true);
    setCamOn(true);
    setSharing(false);
  }, []);

  const leave = useCallback(() => {
    if (channelId) socket.emit("huddle:leave", { channelId });
    cleanup();
    onLeave();
  }, [channelId, cleanup, onLeave]);

  /* --------------------------------- WebRTC ---------------------------------- */

  const ensureLocalStream = async () => {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] || null;
    }
    return localStreamRef.current;
  };

  const createPC = useCallback((peerId: number) => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate && channelId) {
        socket.emit("huddle:signal", {
          channelId, to: peerId, from: me.id,
          data: { candidate: e.candidate.toJSON() },
        });
      }
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] }));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    }
    pcsRef.current.set(peerId, pc);
    return pc;
  }, [channelId, me.id]);

  const makeOffer = useCallback(async (peerId: number) => {
    const pc = createPC(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("huddle:signal", {
      channelId, to: peerId, from: me.id,
      data: { sdp: pc.localDescription },
    });
  }, [channelId, me.id, createPC]);

  // Unirme al huddle cuando App pone channelId
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        await ensureLocalStream();
      } catch {
        setError("No se pudo acceder a la cámara/micrófono");
        onLeave();
        return;
      }
      if (cancelled) return;
      socket.emit("huddle:join", {
        channelId,
        agent: { id: me.id, name: me.name, avatar: me.avatar ?? null },
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  /* ------------------------------ señalización -------------------------------- */

  useEffect(() => {
    if (!channelId) return;

    // Yo entré: el server me manda los que ya estaban → les hago offer
    const onJoined = (d: { channel_id: number; participants: HuddleParticipant[] }) => {
      if (d.channel_id !== channelId) return;
      d.participants.forEach((p) => { void makeOffer(p.id); });
    };

    const onSignal = async (d: {
      channelId: number; to: number; from: number;
      data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      if (d.channelId !== channelId || d.to !== me.id) return;
      if (d.data.candidate) {
        const pc = pcsRef.current.get(d.from);
        if (pc?.remoteDescription) {
          try { await pc.addIceCandidate(d.data.candidate); } catch { /* ignorar */ }
        } else {
          const q = pendingIce.current.get(d.from) || [];
          q.push(d.data.candidate);
          pendingIce.current.set(d.from, q);
        }
        return;
      }
      if (d.data.sdp) {
        if (d.data.sdp.type === "offer") {
          const pc = createPC(d.from);
          await pc.setRemoteDescription(d.data.sdp);
          const queued = pendingIce.current.get(d.from) || [];
          for (const c of queued) {
            try { await pc.addIceCandidate(c); } catch { /* ignorar */ }
          }
          pendingIce.current.delete(d.from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("huddle:signal", {
            channelId, to: d.from, from: me.id,
            data: { sdp: pc.localDescription },
          });
        } else {
          const pc = pcsRef.current.get(d.from);
          if (pc) await pc.setRemoteDescription(d.data.sdp);
        }
      }
    };

    socket.on("huddle:joined", onJoined);
    socket.on("huddle:signal", onSignal);
    return () => {
      socket.off("huddle:joined", onJoined);
      socket.off("huddle:signal", onSignal);
    };
  }, [channelId, me.id, createPC, makeOffer]);

  // Reaccionar a altas/bajas de participantes mientras estoy dentro
  useEffect(() => {
    if (!channelId) return;
    const current = new Set(participants.map((p) => p.id).filter((id) => id !== me.id));
    // Nuevos mientras yo ya estoy: NO hago offer (ellos la hacen al entrar); solo suena
    for (const id of current) {
      if (!prevParticipants.current.has(id)) playDing();
    }
    // Bajas: cerrar su conexión y quitar su video
    for (const id of prevParticipants.current) {
      if (!current.has(id)) {
        pcsRef.current.get(id)?.close();
        pcsRef.current.delete(id);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
    prevParticipants.current = current;
  }, [participants, channelId, me.id]);

  /* --------------------------------- acciones --------------------------------- */

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const toggleCam = () => {
    const track = camTrackRef.current;
    if (track && !sharing) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  };

  const stopShare = useCallback(async () => {
    for (const pc of pcsRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && camTrackRef.current) {
        try { await sender.replaceTrack(camTrackRef.current); } catch { /* ignorar */ }
      }
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setSharing(false);
  }, []);

  const shareScreen = async () => {
    if (sharing) { await stopShare(); return; }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      screenStreamRef.current = display;
      track.onended = () => { void stopShare(); };
      setSharing(true);
    } catch (e) {
      console.error("compartir pantalla cancelado/falló", e);
    }
  };

  /* ---------------------------------- render ---------------------------------- */

  if (!active) return null;

  const others = participants.filter((p) => p.id !== me.id);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[720px] max-w-[95vw]">
      <div className="bg-zinc-900/95 backdrop-blur text-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/10">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-sm font-semibold flex-1">
            Huddle · {others.length + 1} participante{others.length === 0 ? "" : "s"}
            {sharing && <span className="ml-2 text-indigo-300">🖥️ compartiendo pantalla</span>}
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className={`grid gap-2 p-3 ${others.length === 0 ? "grid-cols-1" : others.length === 1 ? "grid-cols-2" : "grid-cols-3"}`}>
          <HuddleVideo
            stream={sharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current}
            label={`${me.name} (tú)`}
            muted
            mirror={!sharing}
          />
          {others.map((p) => (
            <HuddleVideo key={p.id} stream={remoteStreams[p.id] ?? null} label={p.name} />
          ))}
          {others.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-1">
              Esperando a que alguien se una al huddle…
            </p>
          )}
        </div>

        <div className="px-4 pb-3.5 flex items-center justify-center gap-3">
          <button
            onClick={toggleMic}
            title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
            className={`w-10 h-10 rounded-full ${micOn ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
          >
            {micOn ? "🎙️" : "🔇"}
          </button>
          <button
            onClick={toggleCam}
            title={camOn ? "Apagar cámara" : "Encender cámara"}
            className={`w-10 h-10 rounded-full ${camOn || sharing ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
          >
            {camOn || sharing ? "📷" : "🚫"}
          </button>
          <button
            onClick={shareScreen}
            title={sharing ? "Dejar de compartir" : "Compartir pantalla"}
            className={`w-10 h-10 rounded-full ${sharing ? "bg-indigo-600" : "bg-zinc-700 hover:bg-zinc-600"}`}
          >
            🖥️
          </button>
          <button
            onClick={leave}
            title="Salir del huddle"
            className="bg-red-600 hover:bg-red-500 rounded-full px-4 h-10 text-sm font-semibold"
          >
            Salir 📵
          </button>
        </div>
      </div>
    </div>
  );
}
