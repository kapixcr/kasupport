import { useCallback, useEffect, useRef, useState } from "react";
import { socket, type Agent } from "@/lib/api";
import { playDing } from "@/lib/notify";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  Maximize2,
  Minimize2,
  Expand,
  Shrink,
  PhoneOff,
  Headphones,
} from "lucide-react";

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
  channelId: number | null;
  participants: HuddleParticipant[];
  onLeave: () => void;
}

/* Video remoto/local con srcObject y soporte para Enfocar / Pantalla Completa */
function HuddleVideo({
  stream,
  label,
  muted = false,
  mirror = false,
  objectFit = "cover",
  onClick,
  isPinned = false,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  objectFit?: "cover" | "contain";
  onClick?: () => void;
  isPinned?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-black rounded-2xl overflow-hidden group cursor-pointer border transition-all h-full w-full flex items-center justify-center ${
        isPinned ? "border-indigo-500 ring-2 ring-indigo-500/40" : "border-white/10 hover:border-indigo-400/50"
      }`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full ${objectFit === "contain" ? "object-contain" : "object-cover"} ${
          mirror ? "-scale-x-100" : ""
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <span className="absolute bottom-2.5 left-2.5 text-[11px] font-semibold text-white bg-black/70 backdrop-blur rounded-lg px-2.5 py-1 border border-white/10 flex items-center gap-1.5 z-10">
        {label}
      </span>
      {onClick && (
        <span className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-indigo-600 text-white rounded-lg px-2 py-1 font-medium shadow-sm z-10">
          {isPinned ? "Normal" : "Maximizar"}
        </span>
      )}
    </div>
  );
}

export function HuddleManager({ me, channelId, participants, onLeave }: Props) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({});

  // Ventana y posición (Arrastrar, Maximizar, Pantalla Completa)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sizeMode, setSizeMode] = useState<"floating" | "large">("floating");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinnedId, setPinnedId] = useState<number | "local" | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const pcsRef = useRef(new Map<number, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingIce = useRef(new Map<number, RTCIceCandidateInit[]>());
  const prevParticipants = useRef<Set<number>>(new Set());

  const active = channelId !== null;

  /* ------------------------------ arrastrar ventana ------------------------------ */

  const startDrag = (e: React.MouseEvent) => {
    if (sizeMode === "large" || isFullscreen) return;
    const currentX = pos?.x ?? Math.max(20, (window.innerWidth - 720) / 2);
    const currentY = pos?.y ?? Math.max(20, window.innerHeight - 380);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: currentX,
      posY: currentY,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextX = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.posX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 100, dragStartRef.current.posY + dy));
      setPos({ x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

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
    setPinnedId(null);
    setPos(null);
    setSizeMode("floating");
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

  useEffect(() => {
    if (!channelId) return;
    const current = new Set(participants.map((p) => p.id).filter((id) => id !== me.id));
    for (const id of current) {
      if (!prevParticipants.current.has(id)) playDing();
    }
    for (const id of prevParticipants.current) {
      if (!current.has(id)) {
        pcsRef.current.get(id)?.close();
        pcsRef.current.delete(id);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (pinnedId === id) setPinnedId(null);
      }
    }
    prevParticipants.current = current;
  }, [participants, channelId, me.id, pinnedId]);

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
    if (pinnedId === "local") setPinnedId(null);
  }, [pinnedId]);

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
      setPinnedId("local");
    } catch (e) {
      console.error("compartir pantalla cancelado/falló", e);
    }
  };

  /* ---------------------------------- render ---------------------------------- */

  if (!active) return null;

  const others = participants.filter((p) => p.id !== me.id);
  const myStream = sharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current;
  const activeFocusId = pinnedId ?? (sharing ? "local" : null);

  const getStreamForId = (id: number | "local") => {
    if (id === "local") return myStream;
    return remoteStreams[id] ?? null;
  };

  const getLabelForId = (id: number | "local") => {
    if (id === "local") return sharing ? `${me.name} (Pantalla)` : `${me.name} (tú)`;
    const p = others.find((item) => item.id === id);
    return p ? p.name : "Participante";
  };

  const getContainerStyle = (): { className: string; style?: React.CSSProperties } => {
    if (isFullscreen) {
      return { className: "fixed inset-0 z-[100] w-screen h-screen bg-zinc-950 p-4 flex flex-col" };
    }
    if (sizeMode === "large") {
      return { className: "fixed inset-4 sm:inset-10 z-50 bg-zinc-900/95 backdrop-blur rounded-3xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in fade-in" };
    }
    if (pos) {
      return {
        className: "fixed z-50 w-[720px] max-w-[95vw]",
        style: { left: `${pos.x}px`, top: `${pos.y}px` },
      };
    }
    return { className: "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[720px] max-w-[95vw]" };
  };

  const containerProps = getContainerStyle();

  return (
    <div ref={containerRef} className={containerProps.className} style={containerProps.style}>
      <div className="bg-zinc-900 text-white rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col h-full w-full animate-in fade-in zoom-in-95">
        {/* Header */}
        <div
          onMouseDown={startDrag}
          className="px-4 py-2.5 flex items-center gap-2 border-b border-white/10 select-none cursor-grab active:cursor-grabbing bg-zinc-850/80"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div className="flex items-center gap-1.5 text-xs font-bold flex-1 truncate">
            <Headphones className="w-3.5 h-3.5 text-emerald-400" />
            <span>Huddle · {others.length + 1} en llamada</span>
            {sharing && <span className="ml-2 text-indigo-400 font-normal">🖥️ compartiendo</span>}
          </div>
          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSizeMode(sizeMode === "floating" ? "large" : "floating")}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 transition-colors"
              title={sizeMode === "floating" ? "Maximizar huddle" : "Reducir ventana"}
            >
              {sizeMode === "floating" ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              title="Pantalla completa"
            >
              {isFullscreen ? <Shrink className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Cuerpo del Video */}
        <div className="flex-1 p-3 flex flex-col gap-2 min-h-0 overflow-hidden bg-black/60">
          {activeFocusId ? (
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex-1 min-h-0">
                <HuddleVideo
                  stream={getStreamForId(activeFocusId)}
                  label={getLabelForId(activeFocusId)}
                  muted={activeFocusId === "local"}
                  mirror={activeFocusId === "local" && !sharing}
                  objectFit={sharing && activeFocusId === "local" ? "contain" : "contain"}
                  isPinned
                  onClick={() => setPinnedId(null)}
                />
              </div>

              {/* Tira inferior */}
              <div className="h-24 flex gap-2 overflow-x-auto shrink-0 pb-1">
                {activeFocusId !== "local" && (
                  <div className="w-36 h-full shrink-0">
                    <HuddleVideo
                      stream={myStream}
                      label={`${me.name} (tú)`}
                      muted
                      mirror={!sharing}
                      onClick={() => setPinnedId("local")}
                    />
                  </div>
                )}
                {others.map((p) => {
                  if (activeFocusId === p.id) return null;
                  return (
                    <div key={p.id} className="w-36 h-full shrink-0">
                      <HuddleVideo
                        stream={remoteStreams[p.id] ?? null}
                        label={p.name}
                        onClick={() => setPinnedId(p.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`grid gap-2 flex-1 min-h-0 ${
                others.length === 0
                  ? "grid-cols-1"
                  : others.length === 1
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3"
              }`}
            >
              <HuddleVideo
                stream={myStream}
                label={`${me.name} (tú)`}
                muted
                mirror={!sharing}
                objectFit={sharing ? "contain" : "cover"}
                onClick={() => setPinnedId("local")}
              />
              {others.map((p) => (
                <HuddleVideo
                  key={p.id}
                  stream={remoteStreams[p.id] ?? null}
                  label={p.name}
                  onClick={() => setPinnedId(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Barra de Controles Inferior */}
        <div className="px-4 pb-3.5 pt-2 flex items-center justify-center gap-3 bg-zinc-950 shrink-0 border-t border-white/10">
          <button
            onClick={toggleMic}
            title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
              micOn ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-rose-600 text-white"
            }`}
          >
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleCam}
            title={camOn ? "Apagar cámara" : "Encender cámara"}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
              camOn || sharing ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-rose-600 text-white"
            }`}
          >
            {camOn || sharing ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          <button
            onClick={shareScreen}
            title={sharing ? "Dejar de compartir pantalla" : "Compartir pantalla"}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
              sharing ? "bg-indigo-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            }`}
          >
            <ScreenShare className="w-4 h-4" />
          </button>

          <button
            onClick={leave}
            title="Salir del huddle"
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-2xl px-4 h-10 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </div>
  );
}
