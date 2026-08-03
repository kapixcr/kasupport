import { useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "@/lib/api";

interface Props {
  onSelect: (r: SearchResult) => void;
}

function contextLabel(r: SearchResult): string {
  if (r.channel_type === "dm") return `💬 DM con ${r.dm_other_name ?? "agente"}`;
  if (r.channel_type === "support") return `🌐 Soporte · ${r.visitor_name ?? "visitante"}`;
  return `# ${r.channel_name}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// Resalta las coincidencias del término en el texto
function Snippet({ text, q }: { text: string; q: string }) {
  const display = text.length > 140 ? text.slice(0, 140) + "…" : text;
  const idx = display.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <span>{display}</span>;
  return (
    <span>
      {display.slice(0, idx)}
      <mark className="bg-yellow-300/80 text-inherit rounded-sm px-0.5">
        {display.slice(idx, idx + q.length)}
      </mark>
      {display.slice(idx + q.length)}
    </span>
  );
}

export function SearchBar({ onSelect }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda con debounce de 300 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(q.trim().length > 0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.search(q.trim());
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (r: SearchResult) => {
    setOpen(false);
    setQ("");
    setResults([]);
    onSelect(r);
  };

  return (
    <div ref={boxRef} className="relative px-3 pb-3">
      <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5">
        <span className="text-zinc-500 text-sm">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (results.length || q.trim()) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } }}
          placeholder="Buscar mensajes…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500 text-zinc-200"
        />
        {loading && <span className="text-[10px] text-zinc-500">…</span>}
        {q && (
          <button onClick={() => { setQ(""); setResults([]); setOpen(false); }} className="text-zinc-500 hover:text-zinc-300 text-xs">
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-30 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl max-h-96 overflow-y-auto">
          {results.length === 0 && !loading && (
            <p className="px-3 py-3 text-xs text-zinc-500 italic">
              {q.trim().length < 2 ? "Escribe al menos 2 caracteres" : `Sin resultados para "${q}"`}
            </p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 hover:bg-white/10 border-b border-white/5 last:border-0"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-300 truncate">
                  {contextLabel(r)}
                  {r.parent_id && <span className="text-zinc-500 font-normal"> · hilo</span>}
                </span>
                <span className="text-[10px] text-zinc-500 shrink-0">{fmtDate(r.created_at)}</span>
              </span>
              <span className="block text-xs text-zinc-400 truncate mt-0.5">
                <span className="font-semibold text-zinc-300">{r.author_name}: </span>
                {r.kind === "text" ? (
                  <Snippet text={r.body} q={q.trim()} />
                ) : (
                  <em>{r.kind === "image" ? "📷 imagen" : r.kind === "file" ? "📄 archivo" : "🧩 sticker"}</em>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
