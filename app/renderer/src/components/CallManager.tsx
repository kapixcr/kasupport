import { useCallback, useEffect, useRef, useState } from "react";
import { socket, type Agent } from "@/lib/api";
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
  callRequest: CallPeer | null;      // App lo pone al pulsar 📞
  onRequestHandled: () => void;
}

export function CallManager({ me, callRequest, onRequestHandled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const ringTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  /* ------------------------------ ciclo de vida ------------------------------ */

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camTrackRef.current = null;
    pendingCandidates.current = [];
    if (ringTimer.current) { clearInterval(ringTimer.current); ringTimer.current = null; }
    setPhase("idle");
    setPeer(null);
    setMicOn(true);
    setCamOn(true);
    setSharing(false);
  }, []);

  const hangUp = useCallback(() => {
    if (peer) socket.emit("call:end", { to: peer.id, from: { id: me.id } });
    cleanup();
  }, [peer, me.id, cleanup]);

  /* --------------------------------- WebRTC ---------------------------------- */

  const ensureLocalStream = async () => {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] || null;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }
    return localStreamRef.current;
  };

  const createPeerConnection = (peerId: number) => {
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
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // dar un margen; el cierre real lo hace el usuario o call:end
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const flushCandidates = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(c); } catch { /* ignorar */ }
    }
    pendingCandidates.current = [];
  };

  // Quien INICIA la llamada (al pulsar 📞)
  const startCall = useCallback(async (p: CallPeer) => {
    setError(null);
    setPeer(p);
    setPhase("outgoing");
    try {
      await ensureLocalStream(); // pedir permisos ya, para fallar rápido
    } catch {
      setError("No se pudo acceder a la cámara/micrófono");
      setPhase("idle");
      setPeer(null);
      return;
    }
    socket.emit("call:invite", {
      to: p.id,
      from: { id: me.id, name: me.name, avatar: me.avatar ?? null },
    });
  }, [me]);

  // App pidió iniciar llamada
  useEffect(() => {
    if (callRequest) {
      startCall(callRequest);
      onRequestHandled();
    }
  }, [callRequest, startCall, onRequestHandled]);

  /* ------------------------------ señalización -------------------------------- */

  useEffect(() => {
    const onInvite = (d: { to: number; from: CallPeer }) => {
      if (d.to !== me.id || phase !== "idle") return;
      setPeer(d.from);
      setPhase("incoming");
      playDing();
      ringTimer.current = setInterval(playDing, 2500);
    };

    const onAccept = async (d: { to: number }) => {
      if (d.to !== me.id || !peer) return;
      if (ringTimer.current) { clearInterval(ringTimer.current); ringTimer.current = null; }
      try {
        const stream = await ensureLocalStream();
        const pc = createPeerConnection(peer.id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:signal", { to: peer.id, data: { sdp: pc.localDescription } });
        setPhase("active");
      } catch (e) {
        console.error(e);
        setError("Error al establecer la llamada");
        hangUp();
      }
    };

    const onDecline = (d: { to: number }) => {
      if (d.to !== me.id) return;
      setError("Llamada rechazada");
      setTimeout(cleanup, 1500);
    };

    const onSignal = async (d: { to: number; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (d.to !== me.id) return;
      const pc = pcRef.current;
      if (d.data.candidate) {
        if (pc?.remoteDescription) {
          try { await pc.addIceCandidate(d.data.candidate); } catch { /* ignorar */ }
        } else {
          pendingCandidates.current.push(d.data.candidate);
        }
        return;
      }
      if (d.data.sdp && pc) {
        await pc.setRemoteDescription(d.data.sdp);
        await flushCandidates();
        if (d.data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("call:signal", { to: peer?.id ?? d.to, data: { sdp: pc.localDescription } });
        }
      }
    };

    const onEnd = (d: { to: number }) => {
      if (d.to !== me.id) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, peer, phase, cleanup, hangUp]);

  /* --------------------------------- acciones --------------------------------- */

  const acceptCall = async () => {
    if (!peer) return;
    if (ringTimer.current) { clearInterval(ringTimer.current); ringTimer.current = null; }
    try {
      const stream = await ensureLocalStream();
      createPeerConnection(peer.id);
      stream.getTracks().forEach((t) => pcRef.current!.addTrack(t, stream));
      socket.emit("call:accept", { to: peer.id, from: { id: me.id, name: me.name } });
      setPhase("active");
    } catch {
      setError("No se pudo acceder a la cámara/micrófono");
      socket.emit("call:decline", { to: peer.id, from: { id: me.id } });
      setTimeout(cleanup, 1500);
    }
  };

  const declineCall = () => {
    if (peer) socket.emit("call:decline", { to: peer.id, from: { id: me.id } });
    cleanup();
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const toggleCam = () => {
    const track = camTrackRef.current;
    if (track && !sharing) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  };

  const stopShare = useCallback(async () => {
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (sender && camTrackRef.current) {
      try { await sender.replaceTrack(camTrackRef.current); } catch { /* ignorar */ }
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    setSharing(false);
  }, []);

  const shareScreen = async () => {
    if (sharing) { await stopShare(); return; }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      screenStreamRef.current = display;
      track.onended = () => { void stopShare(); };
      if (localVideoRef.current) localVideoRef.current.srcObject = display;
      setSharing(true);
    } catch (e) {
      console.error("compartir pantalla cancelado/falló", e);
    }
  };

  /* ---------------------------------- render ---------------------------------- */

  if (phase === "idle" && !error) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 text-white rounded-2xl shadow-2xl w-[640px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
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
        </div>

        {/* Videos */}
        <div className="relative bg-black aspect-video">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
          {phase !== "active" && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
              {phase === "outgoing" ? "Esperando a que contesten…" : ""}
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-36 rounded-lg border border-white/20 bg-zinc-800"
          />
        </div>

        {/* Controles */}
        <div className="px-5 py-4 flex items-center justify-center gap-3">
          {phase === "incoming" ? (
            <>
              <button
                onClick={acceptCall}
                className="bg-green-600 hover:bg-green-500 text-white rounded-full px-6 py-2.5 font-semibold"
              >
                📞 Contestar
              </button>
              <button
                onClick={declineCall}
                className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 py-2.5 font-semibold"
              >
                Rechazar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMic}
                title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
                className={`w-11 h-11 rounded-full text-lg ${micOn ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
              >
                {micOn ? "🎙️" : "🔇"}
              </button>
              <button
                onClick={toggleCam}
                title={camOn ? "Apagar cámara" : "Encender cámara"}
                className={`w-11 h-11 rounded-full text-lg ${camOn || sharing ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600"}`}
              >
                {camOn || sharing ? "📷" : "🚫"}
              </button>
              {phase === "active" && (
                <button
                  onClick={shareScreen}
                  title={sharing ? "Dejar de compartir" : "Compartir pantalla"}
                  className={`w-11 h-11 rounded-full text-lg ${sharing ? "bg-indigo-600" : "bg-zinc-700 hover:bg-zinc-600"}`}
                >
                  🖥️
                </button>
              )}
              <button
                onClick={hangUp}
                title="Colgar"
                className="w-11 h-11 rounded-full text-lg bg-red-600 hover:bg-red-500"
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
