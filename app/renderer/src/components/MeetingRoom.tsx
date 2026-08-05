import { useCallback, useEffect, useRef, useState } from "react";
import { API, socket, type Agent, type Meeting } from "@/lib/api";
import { playDing } from "@/lib/notify";

export interface MeetingParticipant {
  id: string | number;
  name: string;
  avatar?: string | null;
  isGuest?: boolean;
  handRaised?: boolean;
  audioActive?: boolean;
}

export interface InMeetingChatMessage {
  id: number | string;
  senderId: string | number;
  senderName: string;
  text: string;
  time: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface Props {
  me: Agent | null; // null si es invitado externo
  meetingCode: string;
  onLeave: () => void;
}


function MeetingVideo({
  stream,
  label,
  muted = false,
  mirror = false,
  objectFit = "cover",
  isPinned = false,
  handRaised = false,
  audioActive = false,
  onClick,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  objectFit?: "cover" | "contain";
  isPinned?: boolean;
  handRaised?: boolean;
  audioActive?: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-black rounded-2xl overflow-hidden group cursor-pointer border transition-all h-full w-full flex items-center justify-center ${
        audioActive ? "ring-4 ring-green-400 border-green-500" : isPinned ? "ring-2 ring-indigo-500 border-indigo-500" : "border-white/10 hover:border-indigo-400/50"
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

      {/* Etiqueta del participante */}
      <span className="absolute bottom-3 left-3 text-xs font-semibold text-white bg-black/70 backdrop-blur rounded-lg px-2.5 py-1 border border-white/10 flex items-center gap-2 z-10 shadow-lg">
        {audioActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />}
        {label}
      </span>

      {/* Insignia de Mano Levantada ✋ */}
      {handRaised && (
        <div className="absolute top-3 left-3 bg-amber-500 text-white rounded-xl px-2.5 py-1 text-sm font-bold shadow-xl animate-bounce z-20 flex items-center gap-1">
          <span>✋</span>
          <span className="text-xs">Mano levantada</span>
        </div>
      )}

      {onClick && (
        <span className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-indigo-600 text-white rounded-lg px-2.5 py-1 font-medium shadow-lg z-10">
          {isPinned ? "🔍 Desenfocar" : "🔍 Enfocar video"}
        </span>
      )}
    </div>
  );
}

export function MeetingRoom({ me, meetingCode, onLeave }: Props) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [guestName, setGuestName] = useState("");
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string | number, MediaStream>>({});

  const [drawerTab, setDrawerTab] = useState<"none" | "chat" | "people">("none");
  const [chatMessages, setChatMessages] = useState<InMeetingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | number | "local" | null>(null);


  const containerRef = useRef<HTMLDivElement>(null);
  const pcsRef = useRef(new Map<string | number, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const myParticipantId = useRef<string | number>(me ? me.id : `guest_${Math.random().toString(36).substring(2, 8)}`);

  const myDisplayName = me ? me.name : (guestName.trim() || "Invitado");

  /* ------------------------------ Cargar Info ------------------------------ */

  useEffect(() => {
    fetch(`${API}/api/meetings/${meetingCode}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setMeeting)
      .catch(() => {});
  }, [meetingCode]);

  /* ------------------------------ Pantalla Completa ------------------------------ */

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  /* ------------------------------ Conexión WebRTC ------------------------------ */

  const ensureLocalStream = async () => {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] || null;
    }
    return localStreamRef.current;
  };

  const createPC = useCallback((peerId: string | number) => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("meeting:signal", {
          code: meetingCode,
          to: peerId,
          data: { candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] }));
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    }

    pcsRef.current.set(peerId, pc);
    return pc;
  }, [meetingCode]);

  const makeOffer = useCallback(async (peerId: string | number) => {
    const pc = createPC(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("meeting:signal", {
      code: meetingCode,
      to: peerId,
      data: { sdp: pc.localDescription },
    });
  }, [meetingCode, createPC]);

  /* ------------------------------ Socket Eventos ------------------------------ */

  useEffect(() => {
    if (!joined) return;

    const onState = (data: { code: string; participants: MeetingParticipant[] }) => {
      if (data.code !== meetingCode) return;
      setParticipants(data.participants);


      // Iniciar ofertas WebRTC con participantes nuevos
      data.participants.forEach((p) => {
        if (p.id !== myParticipantId.current && !pcsRef.current.has(p.id)) {
          void makeOffer(p.id);
        }
      });
    };

    const onSignal = async (d: { code: string; to: string | number; from: string | number; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (d.code !== meetingCode || String(d.to) !== String(myParticipantId.current)) return;
      const pc = createPC(d.from);

      if (d.data.candidate) {
        try { await pc.addIceCandidate(d.data.candidate); } catch { /* ignorar */ }
      }
      if (d.data.sdp) {
        await pc.setRemoteDescription(d.data.sdp);
        if (d.data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("meeting:signal", {
            code: meetingCode,
            to: d.from,
            data: { sdp: pc.localDescription },
          });
        }
      }
    };

    const onChatMessage = (msg: InMeetingChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      playDing();
    };

    socket.on("meeting:state", onState);
    socket.on("meeting:signal", onSignal);
    socket.on("meeting:chat_message", onChatMessage);

    return () => {
      socket.off("meeting:state", onState);
      socket.off("meeting:signal", onSignal);
      socket.off("meeting:chat_message", onChatMessage);
    };
  }, [joined, meetingCode, createPC, makeOffer]);

  /* ------------------------------ Unirse a la Reunión ------------------------------ */

  const joinMeeting = async () => {
    try {
      await ensureLocalStream();
    } catch {
      alert("No se pudo acceder a la cámara o micrófono");
      return;
    }

    socket.emit("meeting:join", {
      code: meetingCode,
      name: myDisplayName,
      avatar: me?.avatar ?? null,
      isGuest: !me,
    });

    setJoined(true);
  };

  const leaveMeeting = () => {
    socket.emit("meeting:leave", { code: meetingCode });
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setJoined(false);
    onLeave();
  };

  /* ------------------------------ Acciones de Video/Audio ------------------------------ */

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  const toggleCam = () => {
    const track = camTrackRef.current;
    if (track && !sharing) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    socket.emit("meeting:hand_raise", { code: meetingCode, raised: next });
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
      console.error("error al compartir pantalla", e);
    }
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    socket.emit("meeting:chat_message", { code: meetingCode, text, name: myDisplayName });
  };

  const endMeeting = async () => {
    if (!confirm("¿Seguro que deseas finalizar y cancelar esta reunión para todos los participantes?")) return;
    try {
      await fetch(`${API}/api/meetings/${meetingCode}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("kasupport_token")}` },
      });
    } catch {
      /* ignorar */
    }
    leaveMeeting();
  };

  const copyMeetingLink = () => {

    const origin = window.location.origin.includes("file:")
      ? "http://jdycqg6dnnt1x8qxav2bvbgd.192.99.247.181.sslip.io"
      : window.location.origin;
    const link = `${origin}/#meet/${meetingCode}`;

    const copyText = (text: string): Promise<void> => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
          textArea.remove();
          return Promise.resolve();
        } catch (e) {
          textArea.remove();
          return Promise.reject(e);
        }
      }
    };

    copyText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        alert(`Enlace de la reunión: ${link}`);
      });
  };


  /* ------------------------------ Render Sala de Espera / Ingreso ------------------------------ */

  if (!joined) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center p-4 text-white">
        <div className="bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/10 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg">
            📹
          </div>
          <h2 className="text-2xl font-bold mb-1">{meeting?.title || "Reunión Kasupport"}</h2>
          <p className="text-sm text-zinc-400 mb-6">Código: <span className="font-mono text-indigo-400 font-bold">{meetingCode}</span></p>

          {!me && (
            <div className="mb-6 text-left">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Tu nombre para ingresar:</label>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ej. Carlos Mendoza"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onLeave}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-3 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={joinMeeting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/30"
            >
              Unirse ahora 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Render Sala Principal ------------------------------ */

  const others = participants.filter((p) => String(p.id) !== String(myParticipantId.current));
  const myStream = sharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current;
  const activeFocusId = pinnedId ?? (sharing ? "local" : null);

  const getStreamForId = (id: string | number | "local") => {
    if (id === "local") return myStream;
    return remoteStreams[id] ?? null;
  };

  const getLabelForId = (id: string | number | "local") => {
    if (id === "local") return sharing ? `${myDisplayName} (Pantalla)` : `${myDisplayName} (tú)`;
    const p = others.find((item) => String(item.id) === String(id));
    return p ? p.name : "Participante";
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-zinc-950 text-white flex flex-col h-screen w-screen overflow-hidden select-none">
      {/* Header Superior */}
      <header className="px-6 py-3 bg-zinc-900/90 backdrop-blur border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <div>
            <h1 className="font-bold text-base text-white flex items-center gap-2">
              {meeting?.title || "Reunión Kasupport"}
            </h1>
            <p className="text-xs text-zinc-400 font-mono">Código: {meetingCode}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyMeetingLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-xl border border-white/10 transition-colors"
          >
            {copied ? "✅ Enlace Copiado" : "🔗 Copiar Enlace"}
          </button>
          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-xl border border-white/10 transition-colors"
          >
            {isFullscreen ? "↙ Salir Pantalla Completa" : "⛶ Pantalla Completa"}
          </button>
        </div>
      </header>

      {/* Área Central: Video Canvas + Sidebar Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Grilla / Canvas de Video */}
        <div className="flex-1 p-4 flex flex-col gap-3 min-h-0 overflow-hidden">
          {activeFocusId ? (
            /* Vista Encamada (Enfocada / Compartir Pantalla) */
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex-1 min-h-0">
                <MeetingVideo
                  stream={getStreamForId(activeFocusId)}
                  label={getLabelForId(activeFocusId)}
                  muted={activeFocusId === "local"}
                  mirror={activeFocusId === "local" && !sharing}
                  objectFit={sharing && activeFocusId === "local" ? "contain" : "contain"}
                  isPinned
                  onClick={() => setPinnedId(null)}
                />
              </div>

              {/* Tira de Miniaturas */}
              <div className="h-28 flex gap-3 overflow-x-auto shrink-0 pb-1">
                {activeFocusId !== "local" && (
                  <div className="w-44 h-full shrink-0">
                    <MeetingVideo
                      stream={myStream}
                      label={`${myDisplayName} (tú)`}
                      muted
                      mirror={!sharing}
                      handRaised={handRaised}
                      onClick={() => setPinnedId("local")}
                    />
                  </div>
                )}
                {others.map((p) => {
                  if (String(activeFocusId) === String(p.id)) return null;
                  return (
                    <div key={p.id} className="w-44 h-full shrink-0">
                      <MeetingVideo
                        stream={remoteStreams[p.id] ?? null}
                        label={p.name}
                        handRaised={p.handRaised}
                        onClick={() => setPinnedId(p.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Vista Mosaico Grid */
            <div
              className={`grid gap-3 flex-1 min-h-0 ${
                others.length === 0
                  ? "grid-cols-1"
                  : others.length === 1
                  ? "grid-cols-2"
                  : "grid-cols-2 lg:grid-cols-3"
              }`}
            >
              <MeetingVideo
                stream={myStream}
                label={`${myDisplayName} (tú)`}
                muted
                mirror={!sharing}
                objectFit={sharing ? "contain" : "cover"}
                handRaised={handRaised}
                onClick={() => setPinnedId("local")}
              />
              {others.map((p) => (
                <MeetingVideo
                  key={p.id}
                  stream={remoteStreams[p.id] ?? null}
                  label={p.name}
                  handRaised={p.handRaised}
                  onClick={() => setPinnedId(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel Desplegable (Drawer de Chat / Participantes) */}
        {drawerTab !== "none" && (
          <aside className="w-80 border-l border-white/10 bg-zinc-900/95 backdrop-blur flex flex-col shrink-0">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setDrawerTab("people")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    drawerTab === "people" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  👥 Personas ({participants.length})
                </button>
                <button
                  onClick={() => setDrawerTab("chat")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    drawerTab === "chat" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  💬 Chat
                </button>
              </div>
              <button onClick={() => setDrawerTab("none")} className="text-zinc-400 hover:text-white text-lg font-bold">
                ×
              </button>
            </div>

            {/* Pestaña de Personas */}
            {drawerTab === "people" && (
              <div className="flex-1 p-4 overflow-y-auto divide-y divide-white/5">
                <p className="text-xs font-semibold text-zinc-400 mb-3">En la reunión ({participants.length})</p>
                <div className="py-2 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    {myDisplayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{myDisplayName} (tú)</p>
                    <p className="text-xs text-zinc-500">{me?.role === "admin" ? "Anfitrión" : "Participante"}</p>
                  </div>
                  {handRaised && <span>✋</span>}
                </div>
                {others.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-zinc-700 text-white font-bold flex items-center justify-center text-xs">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.isGuest ? "Invitado" : "Agente"}</p>
                    </div>
                    {p.handRaised && <span>✋</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Pestaña de Chat */}
            {drawerTab === "chat" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center italic mt-4">
                      Los mensajes enviados solo son visibles durante esta reunión.
                    </p>
                  )}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="bg-zinc-800/60 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-indigo-400">{msg.senderName}</span>
                        <span className="text-[10px] text-zinc-500">{msg.time}</span>
                      </div>
                      <p className="text-xs text-zinc-200 break-words">{msg.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={sendChatMessage} className="p-3 border-t border-white/10 flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Enviar un mensaje a todos..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold">
                    Enviar
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Barra Inferior de Controles */}
      <footer className="px-6 py-4 bg-zinc-900 border-t border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerTab(drawerTab === "people" ? "none" : "people")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              drawerTab === "people" ? "bg-indigo-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            👥 <span>{participants.length}</span>
          </button>
          <button
            onClick={() => setDrawerTab(drawerTab === "chat" ? "none" : "chat")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              drawerTab === "chat" ? "bg-indigo-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            💬 <span>Chat</span>
          </button>
        </div>

        {/* Botones de Acción Principal */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMic}
            title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
            className={`w-12 h-12 rounded-2xl text-xl transition-all shadow-lg ${
              micOn ? "bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10" : "bg-red-600 text-white"
            }`}
          >
            {micOn ? "🎙️" : "🔇"}
          </button>

          <button
            onClick={toggleCam}
            title={camOn ? "Apagar cámara" : "Encender cámara"}
            className={`w-12 h-12 rounded-2xl text-xl transition-all shadow-lg ${
              camOn || sharing ? "bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10" : "bg-red-600 text-white"
            }`}
          >
            {camOn || sharing ? "📷" : "🚫"}
          </button>

          <button
            onClick={shareScreen}
            title={sharing ? "Dejar de compartir" : "Compartir pantalla"}
            className={`w-12 h-12 rounded-2xl text-xl transition-all shadow-lg ${
              sharing ? "bg-indigo-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10"
            }`}
          >
            🖥️
          </button>

          <button
            onClick={toggleHand}
            title={handRaised ? "Bajar la mano" : "Levantar la mano"}
            className={`w-12 h-12 rounded-2xl text-xl transition-all shadow-lg ${
              handRaised ? "bg-amber-500 text-white ring-4 ring-amber-500/30" : "bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10"
            }`}
          >
            ✋
          </button>

          <button
            onClick={leaveMeeting}
            title="Salir de la reunión"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-2xl px-4 h-11 sm:h-12 font-bold text-xs shadow-lg transition-all flex items-center gap-1.5"
          >
            <span>Salir</span>
            <span>🚪</span>
          </button>

          <button
            onClick={endMeeting}
            title="Finalizar y cancelar reunión para todos los participantes"
            className="bg-red-600 hover:bg-red-500 text-white rounded-2xl px-4 h-11 sm:h-12 font-bold text-xs shadow-xl transition-all flex items-center gap-1.5"
          >
            <span>Finalizar</span>
            <span>🛑</span>
          </button>
        </div>

        <div className="text-xs text-zinc-500 font-mono hidden md:block">
          Kasupport Meet
        </div>
      </footer>
    </div>
  );
}


