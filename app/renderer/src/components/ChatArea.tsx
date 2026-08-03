import { useEffect, useRef, useState } from "react";
import {
  API,
  api,
  emitTyping,
  fileToBase64,
  parseFileBody,
  type Channel,
  type Conversation,
  type Message,
  type Reaction,
  type StickerItem,
  type Theme,
} from "@/lib/api";
import { ReactionsBar } from "@/components/Reactions";

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

const AVATAR_COLORS = ["#e01e5a", "#36c5f0", "#2eb67d", "#ecb22e", "#611f69", "#1264a3"];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function stickerSrc(body: string) {
  // Mensajes nuevos guardan la ruta completa; los viejos solo el nombre (.svg)
  return body.startsWith("/") ? `${API}${body}` : `${API}/stickers/${body}.svg`;
}

const EMOJIS = [
  "😀","😄","😂","🤣","😊","😍","😘","😎","🤔","😅","😭","😡","🥺","😴","🤯","🥳",
  "👍","👎","👏","🙌","🙏","💪","🤝","✌️","👋","🫶","❤️","🔥","✨","🎉","💯","✅",
  "❌","⚠️","❓","💡","📌","🚀","☕","🍕","🎂","🌮","📅","🔔","💬","🐛","🛠️","📈",
];

/* --------------------- render del contenido de un mensaje --------------------- */

function AuthorAvatar({ m, size = "w-9 h-9", text = "text-sm" }: { m: Message; size?: string; text?: string }) {
  if (m.author_avatar) {
    return (
      <img
        src={m.author_avatar}
        alt={m.author_name}
        className={`${size} rounded shrink-0 object-cover`}
      />
    );
  }
  return (
    <span
      className={`${size} rounded shrink-0 text-white flex items-center justify-center ${text} font-bold`}
      style={{ background: colorFor(m.author_name) }}
    >
      {m.author_name.charAt(0).toUpperCase()}
    </span>
  );
}

function MessageContent({ m }: { m: Message }) {
  if (m.kind === "sticker") {
    return <img src={stickerSrc(m.body)} alt="sticker" className="w-24 h-24" />;
  }
  if (m.kind === "image") {
    const f = parseFileBody(m.body);
    if (!f) return <p className="text-sm">[imagen]</p>;
    return (
      <a href={`${API}${f.url}`} target="_blank" rel="noreferrer">
        <img
          src={`${API}${f.url}`}
          alt={f.name}
          className="max-w-xs max-h-64 rounded-lg border border-black/10"
        />
      </a>
    );
  }
  if (m.kind === "file") {
    const f = parseFileBody(m.body);
    if (!f) return <p className="text-sm">[archivo]</p>;
    return (
      <a
        href={`${API}${f.url}`}
        download={f.name}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 bg-black/5 rounded-lg px-3 py-2 text-sm hover:bg-black/10"
      >
        <span className="text-xl">📄</span>
        <span>
          <span className="block font-medium break-all">{f.name}</span>
          <span className="block text-xs opacity-70">{fmtSize(f.size)} · descargar</span>
        </span>
      </a>
    );
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>;
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId]);

  // Resaltar un mensaje venido de la búsqueda (scroll + destello amarillo)
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (!el) { onHighlightDone?.(); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevBg = el.style.background;
    const prevTransition = el.style.transition;
    el.style.transition = "background 0.4s";
    el.style.background = "rgba(250, 204, 21, 0.28)";
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
    <main className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {channel?.is_private && <span title="Canal privado">🔒</span>}
            {channel?.post_policy === "admin" && <span title="Solo admins escriben">📢</span>}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {onToggleHuddle && (
          <button
            onClick={onToggleHuddle}
            disabled={huddleActive}
            title={huddleActive ? "Ya estás en el huddle" : huddleCount > 0 ? `Unirse al huddle (${huddleCount})` : "Iniciar huddle"}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              huddleActive
                ? "bg-green-600 text-white cursor-default"
                : huddleCount > 0
                  ? "bg-green-600/15 text-green-600 dark:text-green-400 hover:bg-green-600/25 border border-green-600/40"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600"
            }`}
          >
            🎧 {huddleActive ? "En huddle" : huddleCount > 0 ? `Huddle · ${huddleCount}` : "Huddle"}
          </button>
        )}
        {dmPeer && onStartCall && (
          <button
            onClick={() => onStartCall(dmPeer)}
            title={`Llamar a ${dmPeer.name}`}
            className="text-lg px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            📞
          </button>
        )}
        {conversation && (
          <div className="flex items-center gap-2 text-xs">
            <select
              value={conversation.status}
              onChange={(e) => onStatusChange(conversation.id, e.target.value)}
              className="border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-xs bg-white dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="open">Abierto</option>
              <option value="pending">Pendiente</option>
              <option value="closed">Cerrado</option>
            </select>
          </div>
        )}
      </header>

      {/* Ficha del visitante */}
      {conversation && (
        <div className="px-5 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 flex gap-6">
          <span>👤 {conversation.visitor_name}</span>
          {conversation.visitor_email && <span>✉️ {conversation.visitor_email}</span>}
          {conversation.visitor_phone && <span>📞 {conversation.visitor_phone}</span>}
          {conversation.department_name && <span>🏢 {conversation.department_name}</span>}
        </div>
      )}

      {/* Mensajes */}
      <div
        className={`flex-1 overflow-y-auto px-5 py-4 ${conversation ? "bg-zinc-100 dark:bg-zinc-950" : ""}`}
        style={bgImage ? {
          backgroundImage: `linear-gradient(${darkMode ? "rgba(9,9,11,0.82), rgba(9,9,11,0.82)" : "rgba(255,255,255,0.86), rgba(255,255,255,0.86)"}), url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
        onClick={() => setPicker("none")}
      >
        {messages.length === 0 && (
          <p className="text-sm text-zinc-400 italic">
            No hay mensajes todavía. ¡Empieza la conversación!
          </p>
        )}
        {messages.map((m, i) => {
          const day = fmtDay(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = messages[i - 1];

          /* ---- Modo burbuja (conversaciones de soporte) ---- */
          if (conversation) {
            const isAgent = m.author_type === "agent";
            return (
              <div key={m.id} id={`msg-${m.id}`} className="group rounded-lg">
                {showDay && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                    <span className="text-xs font-semibold text-zinc-500">{day}</span>
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                )}
                <div className={`flex items-end gap-2 mt-2 ${isAgent ? "justify-end" : "justify-start"}`}>
                  {!isAgent && <AuthorAvatar m={m} size="w-7 h-7" text="text-xs" />}
                  <div
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2 ${
                      isAgent
                        ? "text-white rounded-br-md"
                        : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 rounded-bl-md shadow-sm"
                    }`}
                    style={isAgent ? {
                      background: theme.bubble,
                      boxShadow: theme.glow ? `0 0 16px ${theme.glow}` : undefined,
                    } : undefined}
                  >
                    <MessageContent m={m} />
                    <p
                      className={`text-[10px] mt-1 ${
                        isAgent ? "text-white/70 text-right" : "text-zinc-400"
                      }`}
                    >
                      {m.author_name} · {fmtTime(m.created_at)}
                    </p>
                  </div>
                  {isAgent && <AuthorAvatar m={m} size="w-7 h-7" text="text-xs" />}
                </div>
                {/* responder / ver hilo (modo burbuja) */}
                <div className={`flex ${isAgent ? "justify-end" : "justify-start"} mt-0.5`}>
                  <div className="flex items-center gap-2">
                    <ReactionsBar m={m} myId={myId} onUpdate={onReactionUpdate} />
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onOpenThread(m)}
                      className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:underline"
                    >
                      ↩ Responder
                    </button>
                    {Number(m.reply_count || 0) > 0 && (
                      <button
                        onClick={() => onOpenThread(m)}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        🧵 {m.reply_count} respuesta{Number(m.reply_count) === 1 ? "" : "s"}
                      </button>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          /* ---- Modo Slack (canales internos) ---- */
          const grouped =
            !showDay && prev &&
            prev.author_name === m.author_name &&
            prev.author_type === m.author_type &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
          return (
            <div key={m.id} id={`msg-${m.id}`} className="group rounded-lg">
              {showDay && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                  <span className="text-xs font-semibold text-zinc-500">{day}</span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                </div>
              )}
              <div className={`flex gap-3 ${grouped ? "mt-0.5" : "mt-3"}`}>
                {grouped ? (
                  <span className="w-9 shrink-0" />
                ) : (
                  <AuthorAvatar m={m} />
                )}
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="text-sm">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{m.author_name}</span>
                      <span className="ml-2 text-xs text-zinc-400">{fmtTime(m.created_at)}</span>
                    </p>
                  )}
                  <MessageContent m={m} />
                  <ReactionsBar m={m} myId={myId} onUpdate={onReactionUpdate} />
                  {/* responder / ver hilo (modo Slack) */}
                  <div className={`flex items-center gap-3 mt-0.5 ${Number(m.reply_count || 0) > 0 ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <button
                      onClick={() => onOpenThread(m)}
                      className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:underline"
                    >
                      ↩ Responder en hilo
                    </button>
                    {Number(m.reply_count || 0) > 0 && (
                      <button
                        onClick={() => onOpenThread(m)}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        🧵 {m.reply_count} respuesta{Number(m.reply_count) === 1 ? "" : "s"}
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

      {/* Composer */}
      <div className="px-5 pb-5 relative">
        {/* Indicador de "está escribiendo..." */}
        <p className={`text-xs italic text-zinc-500 dark:text-zinc-400 h-5 ${typingText ? "" : "invisible"}`}>
          {typingText || "·"}
        </p>
        {/* Pickers */}
        {picker !== "none" && canPost && (
          <div
            className="absolute bottom-full left-5 mb-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3 z-10 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            {picker === "emoji" ? (
              <div className="grid grid-cols-8 gap-1 max-h-44 overflow-y-auto">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => insertEmoji(e)}
                    className="text-xl hover:bg-zinc-100 rounded p-0.5"
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                  {stickers.map((s) => (
                    <button
                      key={s.url}
                      onClick={() => sendSticker(s)}
                      className="hover:bg-zinc-100 rounded-lg p-1"
                      title={s.name}
                    >
                      <img src={`${API}${s.url}`} alt={s.name} className="w-14 h-14 mx-auto object-contain" />
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
                      className="mt-2 w-full text-xs text-indigo-600 border border-dashed border-indigo-300 rounded-lg py-1.5 hover:bg-indigo-50"
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
          <div className="border border-zinc-300 dark:border-zinc-600 rounded-lg focus-within:ring-2 focus-within:ring-indigo-300">
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
              placeholder={`Mensaje en ${title} (pega imágenes con Ctrl/Cmd+V)`}
              rows={2}
              className="w-full px-3 py-2 text-sm outline-none rounded-lg resize-none bg-white dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            <div className="flex items-center px-2 pb-2">
              <button
                onClick={() => fileRef.current?.click()}
                title="Adjuntar archivo"
                disabled={uploading}
                className="text-lg px-1.5 py-0.5 rounded hover:bg-zinc-100"
              >
                📎
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPicker(picker === "emoji" ? "none" : "emoji"); }}
                title="Emojis"
                className="text-lg px-1.5 py-0.5 rounded hover:bg-zinc-100"
              >
                😊
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPicker(picker === "sticker" ? "none" : "sticker"); }}
                title="Stickers"
                className="text-lg px-1.5 py-0.5 rounded hover:bg-zinc-100"
              >
                🧩
              </button>
              {uploading && <span className="text-xs text-zinc-400 ml-2">Subiendo...</span>}
              <button
                onClick={send}
                disabled={!draft.trim() || uploading}
                className="ml-auto disabled:bg-zinc-300 text-white text-sm font-semibold rounded px-3 py-1"
                style={draft.trim() && !uploading ? { background: theme.accent } : undefined}
              >
                Enviar
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-200 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-500 text-center">
            {postBlockReason || "No puedes escribir en este canal"}
          </div>
        )}
      </div>
    </main>
  );
}
