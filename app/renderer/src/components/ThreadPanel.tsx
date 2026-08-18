import { useEffect, useRef, useState } from "react";
import { api, socket, parseFileBody, API, type Message, type Reaction, type Theme } from "@/lib/api";
import { ReactionsBar } from "@/components/Reactions";
import { MessageSquareQuote, X, Send, FileText, Download } from "lucide-react";

interface Props {
  parent: Message;
  theme: Theme;
  myId: number;
  onClose: () => void;
  onReactionUpdate: (messageId: number, reactions: Reaction[]) => void;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const AVATAR_COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Body({ m }: { m: Message }) {
  if (m.kind === "sticker") {
    const src = m.body.startsWith("/") ? `${API}${m.body}` : `${API}/stickers/${m.body}.svg`;
    return <img src={src} alt="sticker" className="w-20 h-20 hover:scale-105 transition-transform" />;
  }
  if (m.kind === "image" || m.kind === "file") {
    const f = parseFileBody(m.body);
    if (f) {
      return m.kind === "image" ? (
        <img src={`${API}${f.url}`} alt={f.name} className="max-w-full max-h-48 rounded-2xl border border-black/10 dark:border-white/10 my-1" />
      ) : (
        <a
          href={`${API}${f.url}`}
          target="_blank"
          rel="noreferrer"
          download={f.name}
          className="inline-flex items-center gap-2 text-xs bg-zinc-50 dark:bg-zinc-800 p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 my-1 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="truncate">{f.name}</span>
          <Download className="w-3 h-3 shrink-0 ml-1 text-zinc-400" />
        </a>
      );
    }
  }
  return <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>;
}

export function ThreadPanel({ parent, theme, myId, onClose, onReactionUpdate }: Props) {
  const [replies, setReplies] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.thread(parent.id).then((t) => setReplies(t.replies)).catch(() => {});
  }, [parent.id]);

  // Respuestas en tiempo real
  useEffect(() => {
    const onMessage = (m: Message) => {
      if (m.parent_id === parent.id) {
        setReplies((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
      }
    };
    socket.on("message:new", onMessage);
    return () => { socket.off("message:new", onMessage); };
  }, [parent.id]);

  // Reacciones: el padre se actualiza desde App; las respuestas aquí
  const handleReaction = (messageId: number, reactions: Reaction[]) => {
    if (messageId === parent.id) {
      onReactionUpdate(messageId, reactions);
    } else {
      setReplies((prev) => prev.map((p) => (p.id === messageId ? { ...p, reactions } : p)));
    }
  };

  // Reacciones en tiempo real sobre las respuestas
  useEffect(() => {
    const onReaction = (p: { message_id: number; reactions: Reaction[] }) => {
      if (p.message_id !== parent.id) {
        setReplies((prev) =>
          prev.some((r) => r.id === p.message_id)
            ? prev.map((r) => (r.id === p.message_id ? { ...r, reactions: p.reactions } : r))
            : prev
        );
      }
    };
    socket.on("reaction:update", onReaction);
    return () => { socket.off("reaction:update", onReaction); };
  }, [parent.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const saved = await api.sendMessage(parent.channel_id, body, "text", parent.id);
    setReplies((prev) => (prev.some((p) => p.id === saved.id) ? prev : [...prev, saved]));
  };

  const renderMsg = (m: Message, isParent = false) => (
    <div
      key={m.id}
      className={`group flex gap-3 px-4 py-3 transition-colors ${
        isParent
          ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100/80 dark:border-indigo-900/40"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      }`}
    >
      {m.author_avatar ? (
        <img src={m.author_avatar} alt={m.author_name} className="w-7 h-7 rounded-xl shrink-0 object-cover shadow-xs" />
      ) : (
        <div
          className="w-7 h-7 rounded-xl shrink-0 text-white flex items-center justify-center text-xs font-bold shadow-xs"
          style={{ background: colorFor(m.author_name) }}
        >
          {m.author_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{m.author_name}</span>
          <span className="text-[10px] text-zinc-400 font-medium">{fmtTime(m.created_at)}</span>
        </div>
        <Body m={m} />
        <ReactionsBar m={m} myId={myId} onUpdate={handleReaction} />
      </div>
    </div>
  );

  return (
    <aside className="w-96 shrink-0 border-l border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col h-full z-10 shadow-sm">
      <header className="px-5 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-xs text-zinc-900 dark:text-zinc-100">Hilo</h3>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200/80 dark:border-indigo-800">
            {replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {renderMsg(parent, true)}
        {replies.map((m) => renderMsg(m))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-xs focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/50 transition-all p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Responder en el hilo…"
            rows={2}
            className="w-full px-2 py-1 text-xs outline-none rounded-xl resize-none bg-transparent dark:text-zinc-100 placeholder:text-zinc-400"
          />
          <div className="flex justify-end pt-1">
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="disabled:opacity-30 text-white text-xs font-semibold rounded-xl px-3.5 py-1.5 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
              style={draft.trim() ? { background: theme.accent } : { background: "#4f46e5" }}
            >
              <span>Responder</span>
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
