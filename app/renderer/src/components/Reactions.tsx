import { useState } from "react";
import { api, type Message, type Reaction } from "@/lib/api";
import { SmilePlus } from "lucide-react";

const QUICK = ["👍", "❤️", "😂", "🎉", "😮", "🙏", "🚀", "🔥"];

interface Props {
  m: Message;
  myId: number;
  onUpdate: (messageId: number, reactions: Reaction[]) => void;
}

export function ReactionsBar({ m, myId, onUpdate }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggle = async (emoji: string) => {
    setPickerOpen(false);
    try {
      const res = await api.toggleReaction(m.id, emoji);
      onUpdate(res.message_id, res.reactions);
    } catch (e) {
      console.error(e);
    }
  };

  const reactions = m.reactions || [];

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {reactions.map((r) => {
        const mine = r.agent_ids.includes(myId);
        return (
          <button
            key={r.emoji}
            onClick={() => toggle(r.emoji)}
            className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 py-0.5 border transition-all duration-150 active:scale-95 ${
              mine
                ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs"
                : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
            }`}
            title={mine ? "Quitar mi reacción" : "Reaccionar igual"}
          >
            <span className="text-xs">{r.emoji}</span>
            <span className="text-[11px] font-medium leading-none">{r.count}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
          className="inline-flex items-center justify-center p-1 rounded-lg border border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all"
          title="Agregar reacción"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && (
          <div
            className="absolute bottom-full left-0 mb-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/80 rounded-2xl shadow-xl px-2 py-1.5 flex gap-1 z-30 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {QUICK.map((e) => (
              <button
                key={e}
                onClick={() => toggle(e)}
                className="text-base hover:scale-125 transition-transform p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
