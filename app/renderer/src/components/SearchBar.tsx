import { useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "@/lib/api";
import { Search, X, Loader2, MessageSquare, Headphones, Hash, CornerDownRight, FileText, Image as ImageIcon, Sparkles } from "lucide-react";

interface Props {
  onSelect: (r: SearchResult) => void;
}

function contextIcon(r: SearchResult) {
  if (r.channel_type === "dm") return <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
  if (r.channel_type === "support") return <Headphones className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  return <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
}

function contextLabel(r: SearchResult): string {
  if (r.channel_type === "dm") return `DM con ${r.dm_other_name ?? "agente"}`;
  if (r.channel_type === "support") return `Soporte · ${r.visitor_name ?? "visitante"}`;
  return r.channel_name;
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
      <mark className="bg-indigo-500/20 text-indigo-300 rounded px-1 font-medium">
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
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 bg-white/[0.07] hover:bg-white/[0.1] focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-white/20 rounded-xl px-3 py-1.5 transition-all border border-white/5">
        <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (results.length || q.trim()) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } }}
          placeholder="Buscar mensajes…"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-500 text-zinc-200"
        />
        {loading ? (
          <Loader2 className="w-3 h-3 text-zinc-400 animate-spin shrink-0" />
        ) : q ? (
          <button
            onClick={() => { setQ(""); setResults([]); setOpen(false); }}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex text-[10px] text-zinc-500 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl max-h-96 overflow-y-auto p-1.5 divide-y divide-white/5">
          {results.length === 0 && !loading && (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-zinc-400 font-medium">
                {q.trim().length < 2 ? "Escribe al menos 2 caracteres" : `Sin resultados para "${q}"`}
              </p>
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-white/10 rounded-xl transition-all group flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {contextIcon(r)}
                  <span className="text-xs font-semibold text-zinc-200 truncate">
                    {contextLabel(r)}
                  </span>
                  {r.parent_id && (
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                      <CornerDownRight className="w-2.5 h-2.5" /> hilo
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 font-medium">{fmtDate(r.created_at)}</span>
              </div>
              <div className="text-xs text-zinc-400 truncate pl-5">
                <span className="font-semibold text-zinc-300">{r.author_name}: </span>
                {r.kind === "text" ? (
                  <Snippet text={r.body} q={q.trim()} />
                ) : r.kind === "image" ? (
                  <span className="inline-flex items-center gap-1 text-zinc-400 italic">
                    <ImageIcon className="w-3 h-3 inline" /> imagen
                  </span>
                ) : r.kind === "file" ? (
                  <span className="inline-flex items-center gap-1 text-zinc-400 italic">
                    <FileText className="w-3 h-3 inline" /> archivo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-zinc-400 italic">
                    <Sparkles className="w-3 h-3 inline" /> sticker
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
