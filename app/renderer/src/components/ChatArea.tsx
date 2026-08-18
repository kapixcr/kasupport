import { useEffect, useRef, useState } from "react";
import {
  API,
  api,
  emitTyping,
  fileToBase64,
  parseFileBody,
  type Agent,
  type Channel,
  type Conversation,
  type Message,
  type Reaction,
  type StickerItem,
  type Theme,
} from "@/lib/api";
import { ReactionsBar } from "@/components/Reactions";
import {
  Hash,
  Lock,
  Megaphone,
  Users,
  Headphones,
  Phone,
  Paperclip,
  Smile,
  Sparkles,
  Send,
  User,
  Mail,
  Building2,
  FileText,
  Download,
  CornerUpLeft,
  MessageCircle,
  X,
  Plus,
  Loader2,
} from "lucide-react";

/* ------------------ modal para gestionar miembros de canales privados ------------------ */

function ChannelMembersModal({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = () => {
    api.channelMembers(channel.id).then(setMembers).catch(() => {});
    api.agents().then(setAllAgents).catch(() => {});
  };

  useEffect(loadData, [channel.id]);

  const nonMembers = allAgents.filter((a) => !members.some((m) => m.id === a.id));

  const addMember = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await api.addChannelMember(channel.id, Number(selectedId));
      setSelectedId("");
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (agentId: number) => {
    try {
      await api.removeChannelMember(channel.id, agentId);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3.5 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Miembros de #{channel.name}
              </h3>
              <p className="text-xs text-zinc-400">Canal privado</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario agregar miembro */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
            Agregar usuario al canal
          </label>
          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Selecciona un miembro del equipo...</option>
              {nonMembers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
            <button
              onClick={addMember}
              disabled={!selectedId || loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl px-4 py-2 shrink-0 transition-all flex items-center gap-1.5 shadow-sm"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Agregar
            </button>
          </div>
        </div>

        {/* Lista de miembros actuales */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 flex items-center justify-between">
            <span>Miembros actuales</span>
            <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
              {members.length}
            </span>
          </p>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-56 overflow-y-auto pr-1">
            {members.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden shadow-xs"
                  style={{ background: m.color || "#4f46e5" }}
                >
                  {m.avatar ? (
                    <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    m.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{m.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{m.email}</p>
                </div>
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1 rounded-lg transition-colors font-medium"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  channel: Channel | null;         // null cuando es conversación de soporte
  channelId: number;
  conversation?: Conversation | null;
  messages: Message[];
  canPost: boolean;
  postBlockReason?: string;
  isAdmin: boolean;
  theme: Theme;
  darkMode: boolean;
  bgImage?: string | null;
  myId: number;
  myName: string;
  typingNames?: string[];
  dmPeer?: { id: number; name: string; avatar?: string | null } | null;
  onStartCall?: (peer: { id: number; name: string; avatar?: string | null }) => void;
  huddleCount?: number;
  huddleActive?: boolean;
  onToggleHuddle?: () => void;
  highlightId?: number | null;
  onHighlightDone?: () => void;
  onStatusChange: (id: number, status: string) => void;
  onOpenThread: (m: Message) => void;
  onReactionUpdate: (messageId: number, reactions: Reaction[]) => void;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const AVATAR_COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function stickerSrc(body: string) {
  return body.startsWith("/") ? `${API}${body}` : `${API}/stickers/${body}.svg`;
}

const EMOJIS = [
  "😀","😄","😂","🤣","😊","😍","😘","😎","🤔","😅","😭","😡","🥺","😴","🤯","🥳",
  "👍","👎","👏","🙌","🙏","💪","🤝","✌️","👋","🫶","❤️","🔥","✨","🎉","💯","✅",
  "❌","⚠️","❓","💡","📌","🚀","☕","🍕","🎂","🌮","📅","🔔","💬","🐛","🛠️","📈",
];

/* --------------------- render del contenido de un mensaje --------------------- */

function AuthorAvatar({ m, size = "w-8 h-8", text = "text-xs" }: { m: Message; size?: string; text?: string }) {
  if (m.author_avatar) {
    return (
      <img
        src={m.author_avatar}
        alt={m.author_name}
        className={`${size} rounded-xl shrink-0 object-cover shadow-xs`}
      />
    );
  }
  return (
    <div
      className={`${size} rounded-xl shrink-0 text-white flex items-center justify-center ${text} font-bold shadow-xs`}
      style={{ background: colorFor(m.author_name) }}
    >
      {m.author_name.charAt(0).toUpperCase()}
    </div>
  );
}

function MessageContent({ m }: { m: Message }) {
  if (m.kind === "sticker") {
    return <img src={stickerSrc(m.body)} alt="sticker" className="w-24 h-24 hover:scale-105 transition-transform" />;
  }
  if (m.kind === "image") {
    const f = parseFileBody(m.body);
    if (!f) return <p className="text-xs">[imagen]</p>;
    return (
      <a href={`${API}${f.url}`} target="_blank" rel="noreferrer" className="block my-1">
        <img
          src={`${API}${f.url}`}
          alt={f.name}
          className="max-w-sm max-h-72 rounded-2xl border border-black/10 dark:border-white/10 shadow-sm object-cover hover:opacity-95 transition-opacity"
        />
      </a>
    );
  }
  if (m.kind === "file") {
    const f = parseFileBody(m.body);
    if (!f) return <p className="text-xs">[archivo]</p>;
    return (
      <a
        href={`${API}${f.url}`}
        download={f.name}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl p-3 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-xs my-1 group max-w-sm"
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{f.name}</p>
          <p className="text-[10px] text-zinc-400">{fmtSize(f.size)}</p>
        </div>
        <Download className="w-4 h-4 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-colors" />
      </a>
    );
  }
  return <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>;
}

/* --------------------------------- componente --------------------------------- */

export function ChatArea({
  title,
  subtitle,
  channel,
  channelId,
  conversation,
  messages,
  canPost,
  postBlockReason,
  isAdmin,
  theme,
  darkMode,
  bgImage,
  myId,
  myName,
  typingNames = [],
  dmPeer,
  onStartCall,
  huddleCount = 0,
  huddleActive = false,
  onToggleHuddle,
  highlightId,
  onHighlightDone,
  onStatusChange,
  onOpenThread,
  onReactionUpdate,
}: Props) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<"none" | "emoji" | "sticker">("none");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId]);

  // Resaltar un mensaje venido de la búsqueda (scroll + destello)
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (!el) { onHighlightDone?.(); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevBg = el.style.background;
    const prevTransition = el.style.transition;
    el.style.transition = "background 0.4s";
    el.style.background = "rgba(99, 102, 241, 0.18)";
    const t = setTimeout(() => {
      el.style.background = prevBg;
      setTimeout(() => { el.style.transition = prevTransition; }, 400);
      onHighlightDone?.();
    }, 1800);
    return () => clearTimeout(t);
  }, [highlightId, messages, onHighlightDone]);

  useEffect(() => {
    if (picker === "sticker") api.stickers().then(setStickers).catch(() => {});
  }, [picker]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !canPost) return;
    setDraft("");
    await api.sendMessage(channelId, body);
  };

  const sendSticker = async (s: StickerItem) => {
    if (!canPost) return;
    setPicker("none");
    await api.sendMessage(channelId, s.url, "sticker");
  };

  const sendFile = async (file: File) => {
    if (!canPost || uploading) return;
    setUploading(true);
    try {
      const payload = await fileToBase64(file);
      const uploaded = await api.upload(payload);
      const kind = file.type.startsWith("image/") ? "image" : "file";
      await api.sendMessage(channelId, JSON.stringify(uploaded), kind);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  // Pegar screenshots / imágenes directo en el composer
  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          sendFile(file);
          return;
        }
      }
    }
  };

  const uploadStickerFile = async (file: File) => {
    const name = (file.name || "sticker").replace(/\.[^.]+$/, "");
    try {
      const payload = await fileToBase64(file);
      await api.uploadSticker(name, payload);
      const list = await api.stickers();
      setStickers(list);
    } catch (e) {
      console.error(e);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setDraft((d) => d + emoji); return; }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  let lastDay = "";

  const othersTyping = typingNames.filter((n) => n !== myName);
  const typingText =
    othersTyping.length === 0
      ? ""
      : othersTyping.length === 1
        ? `${othersTyping[0]} está escribiendo…`
        : `${othersTyping.slice(0, -1).join(", ")} y ${othersTyping[othersTyping.length - 1]} están escribiendo…`;

  return (
    <main className="flex-1 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 min-w-0">
      {/* Header Minimalista */}
      <header className="px-6 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400">
                {channel?.is_private ? (
                  <Lock className="w-4 h-4 text-amber-500" />
                ) : channel?.post_policy === "admin" ? (
                  <Megaphone className="w-4 h-4 text-indigo-500" />
                ) : dmPeer ? (
                  <User className="w-4 h-4 text-indigo-500" />
                ) : conversation ? (
                  <Mail className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Hash className="w-4 h-4 text-zinc-400" />
                )}
              </span>
              <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                {title}
              </h2>
            </div>
            {subtitle && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{subtitle}</p>}
          </div>

          {channel?.is_private && (
            <button
              onClick={() => setShowMembersModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 px-3 py-1.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 transition-all shrink-0"
              title="Gestionar miembros"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Miembros</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleHuddle && (
            <button
              onClick={onToggleHuddle}
              disabled={huddleActive}
              title={huddleActive ? "En huddle" : huddleCount > 0 ? `Unirse (${huddleCount})` : "Iniciar huddle"}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all ${
                huddleActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : huddleCount > 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-700/60"
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{huddleActive ? "En huddle" : huddleCount > 0 ? `Huddle (${huddleCount})` : "Huddle"}</span>
            </button>
          )}

          {dmPeer && onStartCall && (
            <button
              onClick={() => onStartCall(dmPeer)}
              title={`Llamar a ${dmPeer.name}`}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-zinc-200/60 dark:border-zinc-700/60 transition-all"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          {conversation && (
            <div className="flex items-center gap-1.5">
              <select
                value={conversation.status}
                onChange={(e) => onStatusChange(conversation.id, e.target.value)}
                className="border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-xs outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="open">🟢 Abierto</option>
                <option value="pending">🟡 Pendiente</option>
                <option value="closed">⚪ Cerrado</option>
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Ficha del visitante (soporte) */}
      {conversation && (
        <div className="px-6 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100/60 dark:border-indigo-900/40 text-xs text-zinc-700 dark:text-zinc-300 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-950 dark:text-indigo-200">
            <User className="w-3.5 h-3.5 text-indigo-500" />
            <span>{conversation.visitor_name}</span>
          </div>
          {conversation.visitor_email && (
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <Mail className="w-3.5 h-3.5" />
              <span>{conversation.visitor_email}</span>
            </div>
          )}
          {conversation.visitor_phone && (
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <Phone className="w-3.5 h-3.5" />
              <span>{conversation.visitor_phone}</span>
            </div>
          )}
          {conversation.department_name && (
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 ml-auto">
              <Building2 className="w-3.5 h-3.5" />
              <span className="bg-indigo-100/80 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-medium px-2 py-0.5 rounded-md text-[10px]">
                {conversation.department_name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mensajes Feed */}
      <div
        className={`flex-1 overflow-y-auto px-6 py-5 space-y-4 ${conversation ? "bg-zinc-100/40 dark:bg-zinc-950" : ""}`}
        style={bgImage ? {
          backgroundImage: `linear-gradient(${darkMode ? "rgba(9,9,11,0.85), rgba(9,9,11,0.85)" : "rgba(255,255,255,0.90), rgba(255,255,255,0.90)"}), url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
        onClick={() => setPicker("none")}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-xs font-medium text-zinc-500">No hay mensajes todavía.</p>
            <p className="text-[11px] text-zinc-400">¡Escribe el primer mensaje para empezar!</p>
          </div>
        )}

        {messages.map((m, i) => {
          const day = fmtDay(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = messages[i - 1];

          /* ---- Modo burbuja (soporte) ---- */
          if (conversation) {
            const isAgent = m.author_type === "agent";
            return (
              <div key={m.id} id={`msg-${m.id}`} className="group relative">
                {showDay && (
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-3 py-1 rounded-full border border-zinc-200/60 dark:border-zinc-800">
                      {day}
                    </span>
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                )}
                <div className={`flex items-end gap-2.5 mt-2 ${isAgent ? "justify-end" : "justify-start"}`}>
                  {!isAgent && <AuthorAvatar m={m} size="w-7 h-7" text="text-[10px]" />}
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 transition-all ${
                      isAgent
                        ? "text-white rounded-br-xs shadow-sm"
                        : "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-xs shadow-xs"
                    }`}
                    style={isAgent ? {
                      background: theme.bubble,
                      boxShadow: theme.glow ? `0 0 16px ${theme.glow}` : undefined,
                    } : undefined}
                  >
                    <MessageContent m={m} />
                    <p
                      className={`text-[10px] mt-1.5 ${
                        isAgent ? "text-white/75 text-right" : "text-zinc-400"
                      }`}
                    >
                      {m.author_name} · {fmtTime(m.created_at)}
                    </p>
                  </div>
                  {isAgent && <AuthorAvatar m={m} size="w-7 h-7" text="text-[10px]" />}
                </div>

                <div className={`flex ${isAgent ? "justify-end" : "justify-start"} mt-1`}>
                  <div className="flex items-center gap-2">
                    <ReactionsBar m={m} myId={myId} onUpdate={onReactionUpdate} />
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onOpenThread(m)}
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        <CornerUpLeft className="w-3 h-3" />
                        Responder
                      </button>
                      {Number(m.reply_count || 0) > 0 && (
                        <button
                          onClick={() => onOpenThread(m)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800"
                        >
                          <MessageCircle className="w-3 h-3" />
                          {m.reply_count}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          /* ---- Modo Slack (canales internos y DMs) ---- */
          const grouped =
            !showDay && prev &&
            prev.author_name === m.author_name &&
            prev.author_type === m.author_type &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

          return (
            <div key={m.id} id={`msg-${m.id}`} className="group relative rounded-2xl p-1.5 -mx-1.5 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60 transition-colors">
              {showDay && (
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-3 py-1 rounded-full border border-zinc-200/60 dark:border-zinc-800">
                    {day}
                  </span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>
              )}

              <div className="flex gap-3">
                {grouped ? (
                  <div className="w-8 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] text-zinc-400">
                    {fmtTime(m.created_at)}
                  </div>
                ) : (
                  <AuthorAvatar m={m} />
                )}
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{m.author_name}</span>
                      <span className="text-[10px] text-zinc-400 font-medium">{fmtTime(m.created_at)}</span>
                    </div>
                  )}
                  <MessageContent m={m} />
                  <ReactionsBar m={m} myId={myId} onUpdate={onReactionUpdate} />

                  <div className={`flex items-center gap-3 mt-1.5 ${Number(m.reply_count || 0) > 0 ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <button
                      onClick={() => onOpenThread(m)}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium"
                    >
                      <CornerUpLeft className="w-3 h-3" />
                      Responder en hilo
                    </button>
                    {Number(m.reply_count || 0) > 0 && (
                      <button
                        onClick={() => onOpenThread(m)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800/80"
                      >
                        <MessageCircle className="w-3 h-3" />
                        {m.reply_count} respuesta{Number(m.reply_count) === 1 ? "" : "s"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer Minimalista */}
      <div className="px-6 pb-5 pt-1 relative">
        {/* Indicador de "está escribiendo..." */}
        <p className={`text-[11px] text-zinc-400 dark:text-zinc-500 italic h-4 mb-1 flex items-center gap-1.5 ${typingText ? "" : "invisible"}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          {typingText || "·"}
        </p>

        {/* Pickers flotantes */}
        {picker !== "none" && canPost && (
          <div
            className="absolute bottom-full left-6 mb-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-3.5 z-30 w-80 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {picker === "emoji" ? "Emojis" : "Stickers"}
              </span>
              <button onClick={() => setPicker("none")} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {picker === "emoji" ? (
              <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto pr-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => insertEmoji(e)}
                    className="text-lg hover:scale-125 transition-transform rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                  {stickers.map((s) => (
                    <button
                      key={s.url}
                      onClick={() => sendSticker(s)}
                      className="hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl p-1.5 transition-all group"
                      title={s.name}
                    >
                      <img src={`${API}${s.url}`} alt={s.name} className="w-12 h-12 mx-auto object-contain group-hover:scale-110 transition-transform" />
                    </button>
                  ))}
                </div>
                {isAdmin && (
                  <>
                    <input
                      ref={stickerFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadStickerFile(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => stickerFileRef.current?.click()}
                      className="mt-2.5 w-full text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all font-medium"
                    >
                      + Subir sticker nuevo
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {canPost ? (
          <div className="border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/50 transition-all">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) sendFile(f);
                e.target.value = "";
              }}
            />
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                emitTyping(channelId, myName);
              }}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Escribe un mensaje en ${title}…`}
              rows={2}
              className="w-full px-4 pt-3 pb-1 text-xs outline-none rounded-2xl resize-none bg-transparent dark:text-zinc-100 placeholder:text-zinc-400"
            />
            <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Adjuntar archivo o imagen"
                  disabled={uploading}
                  className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPicker(picker === "emoji" ? "none" : "emoji"); }}
                  title="Insertar emoji"
                  className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPicker(picker === "sticker" ? "none" : "sticker"); }}
                  title="Insertar sticker"
                  className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                {uploading && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-indigo-500 font-medium ml-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Subiendo…
                  </span>
                )}
              </div>

              <button
                onClick={send}
                disabled={!draft.trim() || uploading}
                className="disabled:opacity-30 text-white text-xs font-semibold rounded-xl px-3.5 py-1.5 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                style={draft.trim() && !uploading ? { background: theme.accent } : { background: "#4f46e5" }}
              >
                <span>Enviar</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-100/60 dark:bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500 text-center">
            {postBlockReason || "No puedes escribir en este canal"}
          </div>
        )}
      </div>

      {showMembersModal && channel && (
        <ChannelMembersModal channel={channel} onClose={() => setShowMembersModal(false)} />
      )}
    </main>
  );
}
