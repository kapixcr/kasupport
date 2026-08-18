import { useRef, useState } from "react";
import { api, type Agent, type Channel, type Conversation, type Department, type Dm, type SearchResult, type Theme } from "@/lib/api";
import type { Selection } from "@/lib/selection";
import { SearchBar } from "@/components/SearchBar";

const STATUS_DOT: Record<string, string> = {
  open: "bg-green-400",
  pending: "bg-yellow-400",
  closed: "bg-zinc-500",
};

const STATUS_PRESETS = [
  { emoji: "📅", text: "En reunión" },
  { emoji: "🍽️", text: "Almorzando" },
  { emoji: "🏠", text: "Trabajando remoto" },
  { emoji: "🤒", text: "Enfermo" },
  { emoji: "🌴", text: "De vacaciones" },
  { emoji: "🔕", text: "No molestar" },
];

interface Props {
  channels: Channel[];
  departments: Department[];
  conversations: Conversation[];
  agents: Agent[];
  dms: Dm[];
  onlineIds: Set<number>;
  selection: Selection | null;
  agent: Agent;
  theme: Theme;
  onSelect: (s: Selection) => void;
  onAddChannel: (name: string) => void;
  onStartDm: (agentId: number) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onAvatarChange: (file: File) => void;
  onAgentChange: (a: Agent) => void;
  onSearchSelect: (r: SearchResult) => void;
  unreads?: Record<number, number>;
  onNewMeeting?: () => void;
  onOpenCalendar?: () => void;
}

export function Sidebar({
  channels,
  departments,
  conversations,
  agents,
  dms,
  onlineIds,
  selection,
  agent,
  theme,
  unreads = {},
  onSelect,
  onAddChannel,
  onStartDm,
  onOpenSettings,
  onLogout,
  onAvatarChange,
  onAgentChange,
  onSearchSelect,
  onNewMeeting,
  onOpenCalendar,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusEmoji, setStatusEmoji] = useState("");
  const [statusText, setStatusText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isSelected = (kind: Selection["kind"], id: number) =>
    selection?.kind === kind && selection.id === id;

  const convsByDept = (deptId?: number) =>
    conversations.filter((c) =>
      deptId ? c.department_id === deptId : !c.department_id
    );

  const openStatusEditor = () => {
    setStatusEmoji(agent.status_emoji || "");
    setStatusText(agent.status_text || "");
    setStatusOpen((v) => !v);
  };

  const saveStatus = async (emoji: string | null, text: string | null) => {
    try {
      const updated = await api.updateMe({ status_emoji: emoji, status_text: text });
      onAgentChange(updated);
    } catch (e) {
      console.error(e);
    }
    setStatusOpen(false);
  };

  return (
    <aside
      className="w-72 shrink-0 text-zinc-300 flex flex-col h-full"
      style={{ background: theme.sidebar }}
    >
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1
            className="text-white font-bold text-lg tracking-tight"
            style={theme.glow ? { textShadow: `0 0 10px ${theme.glow}, 0 0 24px ${theme.glow}` } : undefined}
          >
            Kasupport
          </h1>
          <p className="text-xs text-zinc-500">Centro de comunicación</p>
        </div>
        <button
          onClick={onOpenSettings}
          title="Configuración"
          className="text-zinc-400 hover:text-white text-lg"
        >
          ⚙️
        </button>
      </div>

      <div className="pt-3 pb-2 border-b border-white/10 px-3 space-y-2">
        <SearchBar onSelect={onSearchSelect} />
        <div className="flex gap-2">
          {onNewMeeting && (
            <button
              onClick={onNewMeeting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl py-2 flex items-center justify-center gap-1.5 transition-all shadow-md"
            >
              <span>📹</span>
              <span>Reunión</span>
            </button>
          )}
          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 font-bold text-xs rounded-xl py-2 flex items-center justify-center gap-1.5 transition-all shadow-md"
            >
              <span>📅</span>
              <span>Agenda</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-5">
        {/* Canales internos */}
        <section>
          <header className="px-4 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
            <span>Canales</span>
            <button
              className="text-zinc-400 hover:text-white text-base leading-none"
              title="Crear canal"
              onClick={() => setAdding((v) => !v)}
            >
              +
            </button>
          </header>
          {adding && (
            <form
              className="px-4 mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) onAddChannel(newName.trim());
                setNewName("");
                setAdding(false);
              }}
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="nombre-del-canal"
                className="w-full bg-white/10 rounded px-2 py-1 text-sm outline-none placeholder:text-zinc-500"
              />
            </form>
          )}
          <ul className="mt-1">
            {channels.map((c) => {
              const count = unreads[c.id] || 0;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect({ kind: "channel", id: c.id, channelId: c.id })}
                    className={`w-full text-left px-4 py-1 text-sm hover:bg-white/5 flex items-center gap-1.5 ${
                      isSelected("channel", c.id) ? "text-white font-semibold" : count > 0 ? "text-white font-bold" : ""
                    }`}
                    style={isSelected("channel", c.id) ? {
                      background: theme.accent,
                      boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                    } : undefined}
                  >
                    <span className="text-zinc-500 shrink-0">
                      {c.is_private ? "🔒" : c.post_policy === "admin" ? "📢" : "#"}
                    </span>
                    <span className="truncate flex-1">{c.name}</span>
                    {count > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

        </section>

        {/* Soporte por departamento */}
        <section>
          <header className="px-4 text-xs uppercase tracking-wide text-zinc-500">
            Soporte web
          </header>
          {departments.map((d) => {
            const convs = convsByDept(d.id);
            const openCount = convs.filter((c) => c.status === "open").length;
            return (
              <div key={d.id} className="mt-2">
                <p className="px-4 text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  {d.name}
                  {openCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
                      {openCount}
                    </span>
                  )}
                </p>
                <ul>
                  {convs.length === 0 && (
                    <li className="px-4 py-0.5 text-xs text-zinc-600 italic">sin chats</li>
                  )}
                  {convs.map((cv) => {
                    const count = unreads[cv.channel_id] || 0;
                    return (
                      <li key={cv.id}>
                        <button
                          onClick={() =>
                            onSelect({ kind: "conversation", id: cv.id, channelId: cv.channel_id })
                          }
                          className={`w-full text-left px-4 py-1 text-sm hover:bg-white/5 flex items-center gap-2 ${
                            isSelected("conversation", cv.id) ? "text-white font-semibold" : count > 0 ? "text-white font-bold" : ""
                          }`}
                          style={isSelected("conversation", cv.id) ? {
                            background: theme.accent,
                            boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                          } : undefined}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[cv.status]}`} />
                          {cv.source === "email" && (
                            <span className="text-xs shrink-0" title="Ticket recibido por correo">✉️</span>
                          )}
                          <span className="truncate flex-1" title={cv.subject ? `${cv.visitor_name}: ${cv.subject}` : cv.visitor_name}>
                            {cv.visitor_name}
                          </span>

                          {count > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        {/* Mensajes directos */}
        <section>
          <header className="px-4 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
            <span>Mensajes directos</span>
            <button
              className="text-zinc-400 hover:text-white text-base leading-none"
              title="Nuevo mensaje directo"
              onClick={() => setDmPickerOpen((v) => !v)}
            >
              +
            </button>
          </header>
          {dmPickerOpen && (
            <ul className="mx-3 mt-1 bg-white/5 rounded-lg py-1">
              {agents.filter((a) => a.id !== agent.id).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => { setDmPickerOpen(false); onStartDm(a.id); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10 flex items-center gap-2"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${onlineIds.has(a.id) ? "bg-green-400" : "bg-zinc-500"}`} />
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-1">
            {dms.length === 0 && !dmPickerOpen && (
              <li className="px-4 py-0.5 text-xs text-zinc-600 italic">sin conversaciones</li>
            )}
            {dms.map((dm) => {
              const count = unreads[dm.id] || 0;
              return (
                <li key={dm.id}>
                  <button
                    onClick={() => onSelect({ kind: "dm", id: dm.id, channelId: dm.id })}
                    className={`w-full text-left px-4 py-1 text-sm hover:bg-white/5 flex items-center gap-2 ${
                      isSelected("dm", dm.id) ? "text-white font-semibold" : count > 0 ? "text-white font-bold" : ""
                    }`}
                    style={isSelected("dm", dm.id) ? {
                      background: theme.accent,
                      boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                    } : undefined}
                  >
                    <span className="relative shrink-0">
                      <span
                        className="w-5 h-5 rounded text-white flex items-center justify-center text-[10px] font-bold overflow-hidden"
                        style={{ background: "#4f46e5" }}
                      >
                        {dm.other_avatar ? (
                          <img src={dm.other_avatar} alt={dm.other_name} className="w-full h-full object-cover" />
                        ) : (
                          dm.other_name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border ${
                          onlineIds.has(dm.other_id) ? "bg-green-400" : "bg-zinc-500"
                        }`}
                        style={{ borderColor: theme.sidebar }}
                      />
                    </span>
                    <span className="truncate flex-1">{dm.other_name}</span>
                    {dm.other_status_emoji && <span className="text-xs shrink-0">{dm.other_status_emoji}</span>}
                    {count > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

        </section>

        {/* Equipo: presencia y estados */}
        <section>
          <header className="px-4 text-xs uppercase tracking-wide text-zinc-500">
            Equipo — {onlineIds.size} en línea
          </header>
          <ul className="mt-1">
            {agents.map((a) => (
              <li key={a.id} className="px-4 py-1 flex items-center gap-2">
                <span className="relative shrink-0">
                  <span
                    className="w-6 h-6 rounded text-white flex items-center justify-center text-[10px] font-bold overflow-hidden"
                    style={{ background: a.color || "#4f46e5" }}
                  >
                    {a.avatar ? (
                      <img src={a.avatar} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      a.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${
                      onlineIds.has(a.id) ? "bg-green-400" : "bg-zinc-500"
                    }`}
                    style={{ borderColor: theme.sidebar }}
                    title={onlineIds.has(a.id) ? "En línea" : "Desconectado"}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm truncate ${onlineIds.has(a.id) ? "text-zinc-200" : "text-zinc-500"}`}>
                    {a.name}{a.id === agent.id ? " (tú)" : ""}
                  </span>
                  {(a.status_emoji || a.status_text) && (
                    <span className="block text-[10px] text-zinc-500 truncate">
                      {a.status_emoji} {a.status_text}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Futuros canales */}
        <section>
          <header className="px-4 text-xs uppercase tracking-wide text-zinc-600">
            Próximamente
          </header>
          <p className="px-4 py-1 text-sm text-zinc-600">✉️ Email</p>
          <p className="px-4 py-1 text-sm text-zinc-600">💬 WhatsApp</p>
        </section>
      </div>

      <footer className="px-4 py-3 border-t border-white/10 relative">
        {/* Editor de estado */}
        {statusOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-zinc-800 border border-white/10 rounded-xl shadow-xl p-3 z-20">
            <p className="text-xs font-semibold text-zinc-300 mb-2">¿Cómo estás hoy?</p>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {STATUS_PRESETS.map((p) => (
                <button
                  key={p.text}
                  onClick={() => saveStatus(p.emoji, p.text)}
                  className="text-left text-xs text-zinc-300 hover:bg-white/10 rounded px-2 py-1.5"
                >
                  {p.emoji} {p.text}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
                placeholder="😀"
                maxLength={4}
                className="w-11 bg-white/10 rounded px-2 py-1 text-sm text-center outline-none placeholder:text-zinc-600"
              />
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Estado personalizado..."
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveStatus(statusEmoji || null, statusText.trim() || null);
                }}
                className="flex-1 bg-white/10 rounded px-2 py-1 text-sm outline-none placeholder:text-zinc-600"
              />
              <button
                onClick={() => saveStatus(statusEmoji || null, statusText.trim() || null)}
                className="text-xs text-white rounded px-2.5"
                style={{ background: theme.accent }}
              >
                OK
              </button>
            </div>
            {(agent.status_emoji || agent.status_text) && (
              <button
                onClick={() => saveStatus(null, null)}
                className="mt-2 w-full text-[11px] text-red-400 hover:text-red-300"
              >
                ✕ Limpiar estado
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAvatarChange(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            title="Cambiar foto de perfil"
            className="relative w-8 h-8 rounded text-white flex items-center justify-center text-sm font-bold shrink-0 overflow-visible"
            style={{ background: agent.color || "#4f46e5" }}
          >
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover rounded" />
            ) : (
              agent.name.charAt(0).toUpperCase()
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2"
              style={{ borderColor: theme.sidebar }}
              title="En línea"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white truncate">{agent.name}</p>
            <button
              onClick={openStatusEditor}
              title="Cambiar tu estado"
              className="text-[10px] text-zinc-500 hover:text-zinc-300 truncate block max-w-full text-left"
            >
              {agent.status_emoji || agent.status_text
                ? `${agent.status_emoji ?? ""} ${agent.status_text ?? ""}`.trim()
                : "+ Pon tu estado"}
            </button>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="text-zinc-500 hover:text-white text-sm shrink-0"
          >
            ⏻
          </button>
        </div>
      </footer>
    </aside>
  );
}
