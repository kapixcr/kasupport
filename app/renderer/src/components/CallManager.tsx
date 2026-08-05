import { useCallback, useEffect, useRef, useState } from "react";
import { socket, type Agent } from "@/lib/api";
import {
  tryAcquireMediaSession,
  type MediaSessionLease,
} from "@/lib/mediaSessionCoordinator";
import { playDing } from "@/lib/notify";

export interface CallPeer {
  id: number;
  name: string;
  avatar?: string | null;
}

type Phase = "idle" | "outgoing" | "incoming" | "active";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface Props {
  me: Agent;
  callRequest: CallPeer | null;
  onRequestHandled: () => void;
}

export function CallManager({ me, callRequest, onRequestHandled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Posición y Tamaño (Arrastrar, Maximizar, Pantalla Completa)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sizeMode, setSizeMode] = useState<"floating" | "large">("floating");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const ringTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaLeaseRef = useRef<MediaSessionLease | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const peerRef = useRef<CallPeer | null>(null);
  const sharingRef = useRef(false);
  const camEnabledRef = useRef(true);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const meRef = useRef(me);
  meRef.current = me;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  /* ------------------------------ arrastrar ventana ------------------------------ */

  const startDrag = (e: React.MouseEvent) => {
    if (sizeMode === "large" || isFullscreen) return;
    const currentX = pos?.x ?? Math.max(20, (window.innerWidth - 680) / 2);
    const currentY = pos?.y ?? Math.max(20, (window.innerHeight - 500) / 2);
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
    const container = containerRef.current;
    if (!container) return;
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : container.requestFullscreen();
    void action.catch(() => {});
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /* ------------------------------ ciclo de vida ------------------------------ */

  const setCallPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const setCallPeer = useCallback((next: CallPeer | null) => {
    peerRef.current = next;
    if (mountedRef.current) setPeer(next);
  }, []);

  const setShareState = useCallback((next: boolean) => {
    sharingRef.current = next;
    if (mountedRef.current) setSharing(next);
  }, []);

  const setCameraState = useCallback((next: boolean) => {
    camEnabledRef.current = next;
    if (mountedRef.current) setCamOn(next);
  }, []);

  const clearErrorTimer = useCallback(() => {
    if (errorTimer.current) {
      clearTimeout(errorTimer.current);
      errorTimer.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    clearErrorTimer();
    if (mountedRef.current) setError(null);
  }, [clearErrorTimer]);

  const showError = useCallback((message: string, dismissAfterMs?: number) => {
    clearErrorTimer();
    if (mountedRef.current) setError(message);
    if (dismissAfterMs) {
      errorTimer.current = setTimeout(() => {
        errorTimer.current = null;
        if (mountedRef.current) setError(null);
      }, dismissAfterMs);
    }
  }, [clearErrorTimer]);

  const acquireMedia = useCallback(() => {
    if (mediaLeaseRef.current) return true;
    const lease = tryAcquireMediaSession("call");
    if (!lease) return false;
    mediaLeaseRef.current = lease;
    return true;
  }, []);

  const cleanup = useCallback(() => {
    operationRef.current += 1;
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    screenStreamRef.current = null;
    camTrackRef.current = null;
    pendingCandidates.current = [];
    if (ringTimer.current) {
      clearInterval(ringTimer.current);
      ringTimer.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    mediaLeaseRef.current?.release();
    mediaLeaseRef.current = null;
    setCallPhase("idle");
    setCallPeer(null);
    setCameraState(true);
    setShareState(false);
    if (mountedRef.current) {
      setMicOn(true);
      setPos(null);
      setSizeMode("floating");
    }
    if (document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [setCallPeer, setCallPhase, setCameraState, setShareState]);

  const hangUp = useCallback(() => {
    const currentPeer = peerRef.current;
    if (currentPeer) socket.emit("call:end", { to: currentPeer.id, from: { id: me.id } });
    clearError();
    cleanup();
  }, [me.id, clearError, cleanup]);

  /* --------------------------------- WebRTC ---------------------------------- */

  const ensureLocalStream = useCallback(async () => {
    const existing = localStreamRef.current;
    if (existing?.getTracks().some((track) => track.readyState === "live")) {
      if (localVideoRef.current && !screenStreamRef.current) {
        localVideoRef.current.srcObject = existing;
      }
      return existing;
    }

    const alreadyOwnedLease = mediaLeaseRef.current !== null;
    if (!acquireMedia()) {
      throw new Error("Ya hay otra sesión de audio o video activa");
    }

    existing?.getTracks().forEach((track) => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (!mountedRef.current || !mediaLeaseRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("La sesión de medios ya no está activa");
      }
      localStreamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] || null;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (cause) {
      if (!alreadyOwnedLease) {
        mediaLeaseRef.current?.release();
        mediaLeaseRef.current = null;
      }
      throw cause;
    }
  }, [acquireMedia]);

  const closePeerConnection = useCallback((pc: RTCPeerConnection) => {
    if (pcRef.current === pc) pcRef.current = null;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pendingCandidates.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const createPeerConnection = useCallback((peerId: number) => {
    if (pcRef.current) closePeerConnection(pcRef.current);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("call:signal", { to: peerId, data: { candidate: e.candidate.toJSON() } });
      }
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        closePeerConnection(pc);
        if (phaseRef.current !== "idle") {
          showError("Se perdió la conexión de la llamada", 4000);
          cleanup();
        }
      }
    };
    pcRef.current = pc;
    return pc;
  }, [cleanup, closePeerConnection, showError]);

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // A stale candidate must not prevent the rest of the queue from flushing.
      }
    }
  }, []);

  const startCall = useCallback(async (p: CallPeer) => {
    if (phaseRef.current !== "idle" || pcRef.current || localStreamRef.current) {
      showError("Ya hay una llamada en curso", 4000);
      return;
    }

    clearError();
    setCallPeer(p);
    setCallPhase("outgoing");
    const operation = ++operationRef.current;
    try {
      await ensureLocalStream();
      if (!mountedRef.current || operation !== operationRef.current) return;
    } catch (cause) {
      console.error(cause);
      if (operation !== operationRef.current) return;
      const message = cause instanceof Error && cause.message.includes("otra sesión")
        ? cause.message
        : "No se pudo acceder a la cámara/micrófono";
      cleanup();
      showError(message, 4000);
      return;
    }
    const currentMe = meRef.current;
    socket.emit("call:invite", {
      to: p.id,
      from: { id: currentMe.id, name: currentMe.name, avatar: currentMe.avatar ?? null },
    });
  }, [clearError, cleanup, ensureLocalStream, setCallPeer, setCallPhase, showError]);

  useEffect(() => {
    if (callRequest) {
      void startCall(callRequest);
      onRequestHandled();
    }
  }, [callRequest, startCall, onRequestHandled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearErrorTimer();
      const currentPeer = peerRef.current;
      if (currentPeer && phaseRef.current !== "idle") {
        socket.emit("call:end", { to: currentPeer.id, from: { id: meRef.current.id } });
      }
      cleanup();
    };
  }, [cleanup, clearErrorTimer]);

  /* ------------------------------ señalización -------------------------------- */

  useEffect(() => {
    const onInvite = (d: { to: number; from: CallPeer }) => {
      if (d.to !== me.id) return;
      if (phaseRef.current !== "idle" || mediaLeaseRef.current) {
        socket.emit("call:decline", { to: d.from.id, from: { id: me.id } });
        return;
      }
      clearError();
      setCallPeer(d.from);
      setCallPhase("incoming");
      playDing();
      if (ringTimer.current) clearInterval(ringTimer.current);
      ringTimer.current = setInterval(playDing, 2500);
    };

    const onAccept = async (d: { to: number }) => {
      const currentPeer = peerRef.current;
      if (d.to !== me.id || !currentPeer || phaseRef.current !== "outgoing") return;
      const operation = ++operationRef.current;
      try {
        const stream = await ensureLocalStream();
        if (!mountedRef.current || operation !== operationRef.current) return;
        const pc = createPeerConnection(currentPeer.id);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!mountedRef.current || operation !== operationRef.current || pcRef.current !== pc) return;
        socket.emit("call:signal", { to: currentPeer.id, data: { sdp: pc.localDescription } });
        setCallPhase("active");
      } catch (cause) {
        console.error(cause);
        if (operation !== operationRef.current) return;
        socket.emit("call:end", { to: currentPeer.id, from: { id: me.id } });
        cleanup();
        showError("Error al establecer la llamada", 4000);
      }
    };

    const onDecline = (d: { to: number }) => {
      if (d.to !== me.id || phaseRef.current === "idle") return;
      cleanup();
      showError("Llamada rechazada", 3000);
    };

    const onSignal = async (d: {
      to: number;
      from?: number;
      data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      if (d.to !== me.id) return;
      const pc = pcRef.current;
      if (d.data.candidate) {
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(d.data.candidate);
          } catch {
            // Ignore stale candidates from a connection that has already ended.
          }
        } else if (phaseRef.current !== "idle") {
          pendingCandidates.current.push(d.data.candidate);
        }
        return;
      }
      if (!d.data.sdp || !pc) return;
      try {
        await pc.setRemoteDescription(d.data.sdp);
        await flushCandidates(pc);
        if (d.data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const currentPeer = peerRef.current;
          const targetId = currentPeer?.id ?? d.from;
          if (targetId) {
            socket.emit("call:signal", { to: targetId, data: { sdp: pc.localDescription } });
          }
        }
      } catch (cause) {
        console.error(cause);
        closePeerConnection(pc);
        cleanup();
        showError("Error al establecer la llamada", 4000);
      }
    };

    const onEnd = (d: { to: number }) => {
      if (d.to !== me.id) return;
      clearError();
      cleanup();
    };

    socket.on("call:invite", onInvite);
    socket.on("call:accept", onAccept);
    socket.on("call:decline", onDecline);
    socket.on("call:signal", onSignal);
    socket.on("call:end", onEnd);
    return () => {
      socket.off("call:invite", onInvite);
      socket.off("call:accept", onAccept);
      socket.off("call:decline", onDecline);
      socket.off("call:signal", onSignal);
      socket.off("call:end", onEnd);
    };
  }, [
    me.id,
    cleanup,
    clearError,
    closePeerConnection,
    createPeerConnection,
    ensureLocalStream,
    flushCandidates,
    setCallPeer,
    setCallPhase,
    showError,
  ]);

  /* --------------------------------- acciones --------------------------------- */

  const acceptCall = async () => {
    const currentPeer = peerRef.current;
    if (!currentPeer || phaseRef.current !== "incoming") return;
    if (ringTimer.current) {
      clearInterval(ringTimer.current);
      ringTimer.current = null;
    }
    clearError();
    const operation = ++operationRef.current;
    try {
      const stream = await ensureLocalStream();
      if (!mountedRef.current || operation !== operationRef.current) return;
      const pc = createPeerConnection(currentPeer.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      socket.emit("call:accept", { to: currentPeer.id, from: { id: me.id, name: me.name } });
      setCallPhase("active");
    } catch (cause) {
      console.error(cause);
      if (operation !== operationRef.current) return;
      socket.emit("call:decline", { to: currentPeer.id, from: { id: me.id } });
      const message = cause instanceof Error && cause.message.includes("otra sesión")
        ? cause.message
        : "No se pudo acceder a la cámara/micrófono";
      cleanup();
      showError(message, 4000);
    }
  };

  const declineCall = () => {
    const currentPeer = peerRef.current;
    if (currentPeer) socket.emit("call:decline", { to: currentPeer.id, from: { id: me.id } });
    clearError();
    cleanup();
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const toggleCam = () => {
    const track = camTrackRef.current;
    if (track && !sharingRef.current) {
      track.enabled = !track.enabled;
      setCameraState(track.enabled);
    }
  };

  const getUsableCameraTrack = useCallback(async () => {
    const current = camTrackRef.current;
    if (current?.readyState === "live") return current;

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const cameraTrack = cameraStream.getVideoTracks()[0] ?? null;
      if (!cameraTrack || !mountedRef.current || !mediaLeaseRef.current) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return null;
      }
      cameraTrack.enabled = camEnabledRef.current;
      const localStream = localStreamRef.current ?? new MediaStream();
      localStream.getVideoTracks().forEach((track) => {
        localStream.removeTrack(track);
        if (track !== current) track.stop();
      });
      localStream.addTrack(cameraTrack);
      localStreamRef.current = localStream;
      camTrackRef.current = cameraTrack;
      return cameraTrack;
    } catch {
      camTrackRef.current = null;
      setCameraState(false);
      return null;
    }
  }, [setCameraState]);

  const stopShare = useCallback(async () => {
    const display = screenStreamRef.current;
    screenStreamRef.current = null;
    display?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    const cameraTrack = await getUsableCameraTrack();
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((item) => item.track?.kind === "video");
    if (sender) {
      try {
        await sender.replaceTrack(cameraTrack);
      } catch {
        // The connection may have closed while the picker was being dismissed.
      }
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = cameraTrack ? localStreamRef.current : null;
    }
    setShareState(false);
  }, [getUsableCameraTrack, setShareState]);

  const shareScreen = async () => {
    if (sharingRef.current) {
      await stopShare();
      return;
    }
    clearError();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track || !mountedRef.current || phaseRef.current !== "active") {
        display.getTracks().forEach((item) => item.stop());
        return;
      }
      const sender = pcRef.current?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      screenStreamRef.current?.getTracks().forEach((item) => item.stop());
      screenStreamRef.current = display;
      track.onended = () => { void stopShare(); };
      if (localVideoRef.current) localVideoRef.current.srcObject = display;
      setShareState(true);
    } catch (cause) {
      console.error("compartir pantalla cancelado/falló", cause);
    }
  };

  /* ---------------------------------- render ---------------------------------- */

  if (phase === "idle" && !error) return null;

  const getContainerStyle = (): { className: string; style?: React.CSSProperties } => {
    if (isFullscreen) {
      return { className: "fixed inset-0 z-[100] w-screen h-screen bg-zinc-950 p-4 flex flex-col" };
    }
    if (sizeMode === "large") {
      return { className: "fixed inset-4 sm:inset-10 z-50 bg-zinc-900/95 backdrop-blur rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden" };
    }
    if (pos) {
      return {
        className: "fixed z-50 w-[680px] max-w-[95vw]",
        style: { left: `${pos.x}px`, top: `${pos.y}px` },
      };
    }
    return { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" };
  };

  const containerProps = getContainerStyle();

  return (
    <div ref={containerRef} className={containerProps.className} style={containerProps.style}>
      <div className="bg-zinc-900 text-white rounded-2xl shadow-2xl w-full h-full max-w-[95vw] flex flex-col overflow-hidden border border-white/10">
        {/* Header con Arrastrar y Pantalla Completa */}
        <div
          onMouseDown={startDrag}
          className="px-5 py-3 border-b border-white/10 flex items-center gap-3 select-none cursor-grab active:cursor-grabbing bg-zinc-800/60 shrink-0"
        >
          <span className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center font-bold overflow-hidden shrink-0">
            {peer?.avatar ? (
              <img src={peer.avatar} alt={peer.name} className="w-full h-full object-cover" />
            ) : (
              peer?.name?.charAt(0).toUpperCase()
            )}
          </span>
          <div className="flex-1">
            <p className="font-semibold">{peer?.name}</p>
            <p className="text-xs text-zinc-400">
              {phase === "outgoing" && "Llamando…"}
              {phase === "incoming" && "📞 Llamada entrante"}
              {phase === "active" && (sharing ? "🖥️ Compartiendo pantalla" : "En llamada")}
            </p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSizeMode(sizeMode === "floating" ? "large" : "floating")}
              className="px-2.5 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md transition-colors"
              title={sizeMode === "floating" ? "Maximizar llamada" : "Reducir ventana"}
            >
              {sizeMode === "floating" ? "🗖 Agrandar" : "🗗 Reducir"}
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors font-medium"
              title="Pantalla completa"
            >
              {isFullscreen ? "↙ Salir pantalla completa" : "⛶ Pantalla completa"}
            </button>
          </div>
        </div>

        {/* Videos Area */}
        <div className="relative bg-black flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full ${sharing ? "object-contain" : "object-contain"}`}
          />
          {phase !== "active" && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm font-medium">
              {phase === "outgoing" ? "Esperando a que contesten…" : ""}
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-40 rounded-xl border border-white/20 bg-zinc-800 shadow-xl object-cover"
          />
        </div>

        {/* Controles Inferiores */}
        <div className="px-5 py-3.5 flex items-center justify-center gap-3 bg-zinc-900 shrink-0 border-t border-white/10">
          {phase === "incoming" ? (
            <>
              <button
                onClick={acceptCall}
                className="bg-green-600 hover:bg-green-500 text-white rounded-full px-6 py-2.5 font-semibold transition-colors"
              >
                📞 Contestar
              </button>
              <button
                onClick={declineCall}
                className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 py-2.5 font-semibold transition-colors"
              >
                Rechazar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMic}
                title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
                className={`w-11 h-11 rounded-full text-lg transition-colors ${micOn ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
              >
                {micOn ? "🎙️" : "🔇"}
              </button>
              <button
                onClick={toggleCam}
                title={camOn ? "Apagar cámara" : "Encender cámara"}
                className={`w-11 h-11 rounded-full text-lg transition-colors ${camOn || sharing ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
              >
                {camOn || sharing ? "📷" : "🚫"}
              </button>
              {phase === "active" && (
                <button
                  onClick={shareScreen}
                  title={sharing ? "Dejar de compartir" : "Compartir pantalla"}
                  className={`w-11 h-11 rounded-full text-lg transition-colors ${sharing ? "bg-indigo-600" : "bg-zinc-700 hover:bg-zinc-600"}`}
                >
                  🖥️
                </button>
              )}
              <button
                onClick={hangUp}
                title="Colgar"
                className="w-11 h-11 rounded-full text-lg bg-red-600 hover:bg-red-500 transition-colors"
              >
                📵
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
