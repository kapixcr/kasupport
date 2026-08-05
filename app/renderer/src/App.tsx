import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  socket,
  getToken,
  setToken,
  fileToAvatar,
  setPresenceAgent,
  DEFAULT_THEME,
  type Agent,
  type Channel,
  type Conversation,
  type Department,
  type Dm,
  type Message,
  type Reaction,
  type SearchResult,
  type Theme,
} from "@/lib/api";
import type { Selection } from "@/lib/selection";
import { desktopNotify, ensureNotificationPermission, playDing, playRing } from "@/lib/notify";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { AuthScreen } from "@/components/AuthScreen";
import { SettingsModal } from "@/components/SettingsModal";
import { ThreadPanel } from "@/components/ThreadPanel";
import { CallManager, type CallPeer } from "@/components/CallManager";
import { HuddleManager, type HuddleParticipant } from "@/components/HuddleManager";
import { MeetingRoom } from "@/components/MeetingRoom";

export default function App() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openThread, setOpenThread] = useState<Message | null>(null);
  const [callRequest, setCallRequest] = useState<CallPeer | null>(null);
  const [huddles, setHuddles] = useState<Record<number, HuddleParticipant[]>>({});
  const [huddleChannel, setHuddleChannel] = useState<number | null>(null);
  const [activeMeetingCode, setActiveMeetingCode] = useState<string | null>(null);
  const [highlightMsgId, setHighlightMsgId] = useState<number | null>(null);

  // Escuchar enlaces de reunión en URL (ej: #meet/meet-x89q2p)
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#meet/")) {
        const code = hash.replace("#meet/", "");
        if (code) setActiveMeetingCode(code);
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  const handleCreateMeeting = async () => {
    try {
      const m = await api.createMeeting("Reunión Kasupport");
      setActiveMeetingCode(m.public_id);
    } catch (e) {
      console.error("Error al crear reunión:", e);
    }
  };

  const [agents, setAgents] = useState<Agent[]>([]);
  const [dms, setDms] = useState<Dm[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [unreads, setUnreads] = useState<Record<number, number>>({});
  // channelId -> lista de nombres escribiendo (con expiración)
  const [typingByChannel, setTypingByChannel] = useState<Record<number, string[]>>({});
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Limpiar mensajes no leídos del canal activo al seleccionarlo
  useEffect(() => {
    if (!selection) return;
    setUnreads((prev) => {
      if (!prev[selection.channelId]) return prev;
      const next = { ...prev };
      delete next[selection.channelId];
      return next;
    });
  }, [selection]);

  // Contador total de no leídos para actualizar título y badge del Dock/Barra de tareas
  const totalUnreads = useMemo(() => {
    return Object.values(unreads).reduce((sum, count) => sum + count, 0);
  }, [unreads]);

  useEffect(() => {
    document.title = totalUnreads > 0 ? `(${totalUnreads}) Kasupport` : "Kasupport";
    const desktop = (window as unknown as { kasupportDesktop?: { setBadge: (n: number) => void } }).kasupportDesktop;
    if (desktop?.setBadge) {
      desktop.setBadge(totalUnreads);
    }
  }, [totalUnreads]);


  // Sesión existente
  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    api.me()
      .then(setAgent)
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const refreshConversations = useCallback(() => {
    api.conversations().then(setConversations).catch(() => {});
  }, []);

  const refreshDms = useCallback(() => {
    api.dms().then(setDms).catch(() => {});
  }, []);

  const refreshAll = useCallback(() => {
    api.departments().then(setDepartments).catch(() => {});
    api.channels().then(setChannels).catch(() => {});
    refreshConversations();
  }, [refreshConversations]);

  // Carga inicial tras login
  useEffect(() => {
    if (!agent) return;
    void ensureNotificationPermission();
    setPresenceAgent(agent.id); // registrar presencia online
    return () => setPresenceAgent(null);
  }, [agent?.id]);

  useEffect(() => {
    if (!agent) return;
    api.agents().then(setAgents).catch(() => {});
    api.channels().then((cs) => {
      setChannels(cs);
      setSelection((sel) => sel ?? (cs.length ? { kind: "channel", id: cs[0].id, channelId: cs[0].id } : null));
    }).catch(() => {});
    api.departments().then(setDepartments).catch(() => {});
    refreshConversations();
    refreshDms();
  }, [agent?.id, refreshConversations, refreshDms]);

  // Mensajes del canal seleccionado
  useEffect(() => {
    if (!agent || !selection) return;
    setOpenThread(null); // cerrar hilo al cambiar de canal/conversación
    api.messages(selection.channelId).then(setMessages).catch(() => {});
  }, [agent, selection]);

  // Tiempo real
  useEffect(() => {
    if (!agent) return;
    if (socket.connected) socket.emit("agents:join");

    const notifOn = agent.notif_enabled !== false;
    const soundOn = agent.notif_sound !== false;
    const ding = () => { if (soundOn) playDing(); };

    const onMessage = (m: Message) => {
      // Las respuestas de hilo no van al listado principal; ThreadPanel las capta
      if (!m.parent_id) {
        setMessages((prev) => {
          if (!selection || m.channel_id !== selection.channelId) return prev;
          if (prev.some((p) => p.id === m.id)) return prev;
          return [...prev, m];
        });
      } else {
        // Actualizar contador de respuestas del padre en la lista
        setMessages((prev) =>
          prev.map((p) =>
            p.id === m.parent_id
              ? { ...p, reply_count: String(Number(p.reply_count || 0) + 1) }
              : p
          )
        );
      }
      refreshConversations();

      // Notificación y conteo de no leídos para TODOS los mensajes recibidos que NO sean míos
      const isMine = m.author_type === "agent" && m.author_id === agent.id;
      if (!isMine) {
        const viewingIt = selection?.channelId === m.channel_id && !document.hidden;
        if (!viewingIt) {
          setUnreads((prev) => ({
            ...prev,
            [m.channel_id]: (prev[m.channel_id] || 0) + 1,
          }));
          ding();
          if (notifOn) {
            const body = m.kind === "image" ? "📷 Imagen" : m.kind === "file" ? "📄 Archivo" : m.body;
            desktopNotify(`💬 ${m.author_name}`, body, () => {
              setSelection({ kind: "channel", id: m.channel_id, channelId: m.channel_id });
            });
          }
        }
      }
    };

    const refresh = () => refreshAll();
    const onChannelNew = (c: Channel) =>
      setChannels((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
    const onReaction = (p: { message_id: number; reactions: Reaction[] }) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === p.message_id ? { ...m, reactions: p.reactions } : m))
      );

    // Aviso cuando alguien reacciona a UNO DE MIS mensajes
    const onReactionAdded = (p: { emoji: string; reactor_id: number; reactor_name: string; author_id: number }) => {
      if (p.author_id !== agent.id || p.reactor_id === agent.id) return;
      ding();
      if (notifOn) {
        desktopNotify(`${p.emoji} ${p.reactor_name}`, "reaccionó a tu mensaje");
      }
    };

    // DM nuevo donde soy participante
    const onDmNew = (p: { member_ids: number[] }) => {
      if (p.member_ids?.includes(agent.id)) refreshDms();
    };

    // Estado de huddles (salas de voz/video por canal)
    const onHuddleState = (p: { channel_id: number; participants: HuddleParticipant[] }) =>
      setHuddles((prev) => ({ ...prev, [p.channel_id]: p.participants }));

    // Presencia
    const onPresenceList = (ids: number[]) => setOnlineIds(new Set(ids));
    const onPresenceUpdate = (p: { agent_id: number; online: boolean }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.agent_id);
        else next.delete(p.agent_id);
        return next;
      });

    // Cambios de perfil/estado de cualquier agente
    const onAgentUpdate = (a: Agent) => {
      setAgents((prev) => prev.map((p) => (p.id === a.id ? { ...p, ...a } : p)));
      if (a.id === agent.id) setAgent((me) => (me ? { ...me, ...a } : me));
    };

    // "Está escribiendo...": se muestra 3.5 s por persona
    const onTyping = (p: { channel_id: number; name: string }) => {
      const key = `${p.channel_id}:${p.name}`;
      setTypingByChannel((prev) => {
        const list = prev[p.channel_id] || [];
        if (list.includes(p.name)) return prev;
        return { ...prev, [p.channel_id]: [...list, p.name] };
      });
      const timers = typingTimers.current;
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => {
        setTypingByChannel((prev) => ({
          ...prev,
          [p.channel_id]: (prev[p.channel_id] || []).filter((n) => n !== p.name),
        }));
        timers.delete(key);
      }, 3500));
    };

    // Aviso de chat nuevo de soporte
    const onNewConversation = (payload: { visitor?: { name?: string }; department?: { name?: string } }) => {
      refresh();
      ding();
      if (notifOn) {
        desktopNotify(
          "🔔 Nuevo chat de soporte",
          `${payload?.visitor?.name ?? "Visitante"} · ${payload?.department?.name ?? ""}`,
        );
      }
    };

    // Timbre y notificación de llamada entrante
    const onCallInvite = (payload: { to: number; from: { id: number; name: string } }) => {
      if (payload.to === agent.id) {
        if (soundOn) playRing();
        if (notifOn) {
          desktopNotify("📞 Llamada Entrante", `${payload.from.name} te está llamando`);
        }
      }
    };

    socket.on("call:invite", onCallInvite);
    socket.on("message:new", onMessage);

    socket.on("dm:new", onDmNew);
    socket.on("huddle:state", onHuddleState);
    socket.on("reaction:update", onReaction);
    socket.on("reaction:added", onReactionAdded);
    socket.on("presence:list", onPresenceList);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("agent:update", onAgentUpdate);
    socket.on("typing", onTyping);
    socket.on("conversation:new", onNewConversation);
    socket.on("conversation:update", refresh);
    socket.on("channel:new", onChannelNew);
    socket.on("channel:update", refresh);
    socket.on("channel:delete", refresh);
    socket.on("department:new", refresh);
    socket.on("department:update", refresh);
    socket.on("department:delete", refresh);
    return () => {
      socket.off("call:invite", onCallInvite);
      socket.off("message:new", onMessage);
      socket.off("dm:new", onDmNew);
      socket.off("huddle:state", onHuddleState);
      socket.off("reaction:update", onReaction);
      socket.off("reaction:added", onReactionAdded);
      socket.off("presence:list", onPresenceList);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("agent:update", onAgentUpdate);
      socket.off("typing", onTyping);
      socket.off("conversation:new", onNewConversation);
      socket.off("conversation:update", refresh);
      socket.off("channel:new", onChannelNew);
      socket.off("channel:update", refresh);
      socket.off("channel:delete", refresh);
      socket.off("department:new", refresh);
      socket.off("department:update", refresh);
      socket.off("department:delete", refresh);
    };
  }, [agent, selection, refreshConversations, refreshAll, refreshDms]);

  const handleAddChannel = async (name: string) => {
    const c = await api.createChannel(name);
    setChannels((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
    setSelection({ kind: "channel", id: c.id, channelId: c.id });
  };

  const handleStartDm = async (agentId: number) => {
    try {
      const r = await api.createDm(agentId);
      await refreshDms();
      setSelection({ kind: "dm", id: r.channel_id, channelId: r.channel_id });
    } catch (e) {
      console.error(e);
    }
  };

  // Navegar a un resultado de búsqueda (canal / DM / soporte / hilo)
  const handleSearchSelect = async (r: SearchResult) => {
    if (r.channel_type === "dm") {
      setSelection({ kind: "dm", id: r.channel_id, channelId: r.channel_id });
    } else if (r.channel_type === "support") {
      let cv = conversations.find((c) => c.channel_id === r.channel_id);
      if (!cv) {
        try {
          const convs = await api.conversations();
          setConversations(convs);
          cv = convs.find((c) => c.channel_id === r.channel_id);
        } catch { /* ignorar */ }
      }
      if (cv) setSelection({ kind: "conversation", id: cv.id, channelId: cv.channel_id });
    } else {
      setSelection({ kind: "channel", id: r.channel_id, channelId: r.channel_id });
    }
    if (r.parent_id) {
      // Es respuesta de hilo: abrir el hilo del mensaje padre
      try {
        const t = await api.thread(r.parent_id);
        setOpenThread(t.parent);
      } catch { /* ignorar */ }
    } else {
      setHighlightMsgId(r.id);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    await api.setConversationStatus(id, status);
    refreshConversations();
  };

  const handleReactionUpdate = (messageId: number, reactions: Reaction[]) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
    );

  const handleLogout = () => {
    setPresenceAgent(null);
    setToken(null);
    setAgent(null);
    setSelection(null);
    setMessages([]);
  };

  const handleAvatarChange = async (file: File) => {
    try {
      const avatar = await fileToAvatar(file);
      const updated = await api.updateMe({ avatar });
      setAgent(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleThemeChange = async (theme: Theme | null) => {
    // Optimista: se ve al instante
    setAgent((a) => (a ? { ...a, theme: theme ?? null } : a));
    try {
      const updated = await api.updateMe({ theme });
      setAgent(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDarkModeChange = async (dark: boolean) => {
    setAgent((a) => (a ? { ...a, dark_mode: dark } : a));
    try {
      const updated = await api.updateMe({ dark_mode: dark });
      setAgent(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBgImageChange = async (bg_image: string | null) => {
    setAgent((a) => (a ? { ...a, bg_image } : a));
    try {
      const updated = await api.updateMe({ bg_image });
      setAgent(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrefChange = async (data: { notif_enabled?: boolean; notif_sound?: boolean }) => {
    setAgent((a) => (a ? { ...a, ...data } : a));
    try {
      const updated = await api.updateMe(data);
      setAgent(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const current = useMemo(() => {
    if (!selection || !agent) return null;
    if (selection.kind === "channel") {
      const c = channels.find((x) => x.id === selection.id);
      const adminOnlyBlocked = c?.post_policy === "admin" && agent.role !== "admin";
      return {
        title: `# ${c?.name ?? "canal"}`,
        subtitle:
          c?.post_policy === "admin"
            ? "Canal de anuncios · solo admins escriben"
            : c?.is_private
              ? "Canal privado"
              : "Canal interno del equipo",
        channel: c ?? null,
        conversation: null,
        canPost: !adminOnlyBlocked,
        postBlockReason: adminOnlyBlocked
          ? "📢 Este es un canal de anuncios: solo los administradores pueden escribir."
          : undefined,
        dmPeer: null as { id: number; name: string; avatar?: string | null } | null,
      };
    }
    if (selection.kind === "dm") {
      const dm = dms.find((x) => x.id === selection.id);
      return {
        title: dm?.other_name ?? "Mensaje directo",
        subtitle: onlineIds.has(dm?.other_id ?? -1) ? "🟢 En línea" : "⚫ Desconectado",
        channel: null,
        conversation: null,
        canPost: true,
        postBlockReason: undefined,
        dmPeer: dm
          ? { id: dm.other_id, name: dm.other_name, avatar: dm.other_avatar }
          : null,
      };
    }
    const cv = conversations.find((x) => x.id === selection.id);
    return {
      title: cv?.visitor_name ?? "Conversación",
      subtitle: `Chat web · ${cv?.department_name ?? ""}`,
      channel: null,
      conversation: cv ?? null,
      canPost: true,
      postBlockReason: undefined,
      dmPeer: null as { id: number; name: string; avatar?: string | null } | null,
    };
  }, [selection, channels, conversations, agent, dms, onlineIds]);

  if (!authChecked) {
    return <div className="h-screen w-screen bg-[#19171d]" />;
  }
  if (!agent) {
    return <AuthScreen onAuth={setAgent} />;
  }

  const theme: Theme = agent.theme ?? DEFAULT_THEME;

  return (
    <div className={`h-screen w-screen flex overflow-hidden bg-white dark:bg-zinc-900 ${agent.dark_mode ? "dark" : ""}`}>
      <Sidebar
        channels={channels}
        departments={departments}
        conversations={conversations}
        selection={selection}
        agent={agent}
        agents={agents}
        dms={dms}
        onlineIds={onlineIds}
        theme={theme}
        onSelect={setSelection}
        onAddChannel={handleAddChannel}
        onStartDm={handleStartDm}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        onAvatarChange={handleAvatarChange}
        onAgentChange={setAgent}
        onSearchSelect={handleSearchSelect}
        unreads={unreads}
        onNewMeeting={handleCreateMeeting}
      />


      {selection && current ? (
        <ChatArea
          title={current.title}
          subtitle={current.subtitle}
          channel={current.channel}
          channelId={selection.channelId}
          conversation={current.conversation}
          messages={messages}
          canPost={current.canPost}
          postBlockReason={current.postBlockReason}
          isAdmin={agent.role === "admin"}
          theme={theme}
          darkMode={!!agent.dark_mode}
          bgImage={agent.bg_image}
          myId={agent.id}
          myName={agent.name}
          typingNames={typingByChannel[selection.channelId] || []}
          dmPeer={current.dmPeer}
          onStartCall={setCallRequest}
          huddleCount={selection.kind === "channel" ? (huddles[selection.channelId] || []).length : 0}
          huddleActive={huddleChannel === selection.channelId}
          onToggleHuddle={selection.kind === "channel" ? () => setHuddleChannel(selection.channelId) : undefined}
          highlightId={highlightMsgId}
          onHighlightDone={() => setHighlightMsgId(null)}
          onStatusChange={handleStatusChange}
          onOpenThread={setOpenThread}
          onReactionUpdate={handleReactionUpdate}
        />
      ) : (
        <main className="flex-1 flex items-center justify-center text-zinc-400">
          Selecciona un canal o conversación
        </main>
      )}
      {openThread && (
        <ThreadPanel
          parent={openThread}
          theme={theme}
          myId={agent.id}
          onClose={() => setOpenThread(null)}
          onReactionUpdate={handleReactionUpdate}
        />
      )}
      <CallManager
        me={agent}
        callRequest={callRequest}
        onRequestHandled={() => setCallRequest(null)}
      />
      <HuddleManager
        me={agent}
        channelId={huddleChannel}
        participants={huddleChannel ? (huddles[huddleChannel] || []) : []}
        onLeave={() => setHuddleChannel(null)}
      />
      {activeMeetingCode && (
        <MeetingRoom
          me={agent}
          meetingCode={activeMeetingCode}
          onLeave={() => {
            setActiveMeetingCode(null);
            window.location.hash = "";
          }}
        />
      )}
      {settingsOpen && (

        <SettingsModal
          me={agent}
          theme={theme}
          onThemeChange={handleThemeChange}
          darkMode={!!agent.dark_mode}
          onDarkModeChange={handleDarkModeChange}
          bgImage={agent.bg_image}
          onBgImageChange={handleBgImageChange}
          onPrefChange={handlePrefChange}
          onClose={() => setSettingsOpen(false)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
