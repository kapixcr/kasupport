import { useState } from "react";
import { api, type Message, type Reaction } from "@/lib/api";

const QUICK = ["👍", "❤️", "😂", "🎉", "😮", "🙏"];

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
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {reactions.map((r) => {
        const mine = r.agent_ids.includes(myId);
        return (
          <button
            key={r.emoji}
            onClick={() => toggle(r.emoji)}
            className={`text-xs rounded-full px-2 py-0.5 border transition-colors ${
              mine
                ? "bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-600 font-semibold"
                : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
            title={mine ? "Quitar mi reacción" : "Reaccionar igual"}
          >
            {r.emoji} {r.count}
          </button>
        );
      })}

      <span className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
          className="text-xs rounded-full px-1.5 py-0.5 border border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Agregar reacción"
        >
          😄+
        </button>
        {pickerOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-lg px-2 py-1 flex gap-1 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {QUICK.map((e) => (
              <button
                key={e}
                onClick={() => toggle(e)}
                className="text-lg hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
