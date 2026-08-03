import { useEffect, useRef, useState } from "react";
import { api, socket, parseFileBody, API, type Message, type Reaction, type Theme } from "@/lib/api";
import { ReactionsBar } from "@/components/Reactions";

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

const AVATAR_COLORS = ["#e01e5a", "#36c5f0", "#2eb67d", "#ecb22e", "#611f69", "#1264a3"];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Body({ m }: { m: Message }) {
  if (m.kind === "sticker") {
    const src = m.body.startsWith("/") ? `${API}${m.body}` : `${API}/stickers/${m.body}.svg`;
    return <img src={src} alt="sticker" className="w-20 h-20" />;
  }
  if (m.kind === "image" || m.kind === "file") {
    const f = parseFileBody(m.body);
    if (f) {
      return m.kind === "image" ? (
        <img src={`${API}${f.url}`} alt={f.name} className="max-w-full max-h-40 rounded-lg" />
      ) : (
        <a href={`${API}${f.url}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 underline">
          📄 {f.name}
        </a>
      );
    }
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>;
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
    // Mostrar de inmediato (el socket también la trae; se deduplica por id)
    setReplies((prev) => (prev.some((p) => p.id === saved.id) ? prev : [...prev, saved]));
  };

  const renderMsg = (m: Message, highlight = false) => (
    <div key={m.id} className={`flex gap-2.5 px-4 py-2.5 ${highlight ? "bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-900" : ""}`}>
      {m.author_avatar ? (
        <img src={m.author_avatar} alt={m.author_name} className="w-8 h-8 rounded shrink-0 object-cover" />
      ) : (
        <span
          className="w-8 h-8 rounded shrink-0 text-white flex items-center justify-center text-xs font-bold"
          style={{ background: colorFor(m.author_name) }}
        >
          {m.author_name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm">
          <span className="font-bold text-zinc-900 dark:text-zinc-100">{m.author_name}</span>
          <span className="ml-2 text-xs text-zinc-400">{fmtTime(m.created_at)}</span>
        </p>
        <Body m={m} />
        <ReactionsBar m={m} myId={myId} onUpdate={handleReaction} />
      </div>
    </div>
  );

  return (
    <aside className="w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex flex-col h-full">
      <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Hilo</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{replies.length} respuesta{replies.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xl">×</button>
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {renderMsg(parent, true)}
        {replies.map((m) => renderMsg(m))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-700">
        <div className="border border-zinc-300 dark:border-zinc-600 rounded-lg focus-within:ring-2 focus-within:ring-indigo-300">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Responder en el hilo..."
            rows={2}
            className="w-full px-3 py-2 text-sm outline-none rounded-lg resize-none bg-white dark:bg-zinc-800 dark:text-zinc-100"
          />
          <div className="flex justify-end px-2 pb-2">
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="disabled:bg-zinc-300 text-white text-sm font-semibold rounded px-3 py-1"
              style={draft.trim() ? { background: theme.accent } : undefined}
            >
              Responder
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
