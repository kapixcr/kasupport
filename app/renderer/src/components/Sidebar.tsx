import { useRef, useState } from "react";
import { api, type Agent, type Channel, type Conversation, type Department, type Dm, type SearchResult, type Theme } from "@/lib/api";
import type { Selection } from "@/lib/selection";
import { SearchBar } from "@/components/SearchBar";
import {
  Settings,
  Video,
  Calendar,
  Plus,
  Hash,
  Lock,
  Megaphone,
  Mail,
  LogOut,
  Smile,
  X,
  Users,
  Building2,
  Sparkles,
  Check,
} from "lucide-react";

const STATUS_DOT: Record<string, string> = {
  open: "bg-emerald-400 ring-4 ring-emerald-400/20",
  pending: "bg-amber-400 ring-4 ring-amber-400/20",
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
  onOpenMailbox?: () => void;
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
  onOpenMailbox,
}: Props) {

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusEmoji, setStatusEmoji] = useState("");
  const [statusText, setStatusText] = useState("");
  const [showClosedTickets, setShowClosedTickets] = useState(false);
  const [closedLimits, setClosedLimits] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);


  const isSelected = (kind: Selection["kind"], id: number) =>
    selection?.kind === kind && selection.id === id;

  const convsByDept = (deptId?: number) =>
    conversations.filter((c) => {
      const matchDept = deptId ? c.department_id === deptId : !c.department_id;
      if (!matchDept) return false;
      return showClosedTickets ? true : c.status !== "closed";
    });


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
      className="w-72 shrink-0 text-zinc-300 flex flex-col h-full select-none border-r border-white/5"
      style={{ background: theme.sidebar }}
    >
      {/* Header Minimalista */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1
              className="text-white font-bold text-sm tracking-tight flex items-center gap-1.5"
              style={theme.glow ? { textShadow: `0 0 10px ${theme.glow}, 0 0 24px ${theme.glow}` } : undefined}
            >
              Kasupport
            </h1>
            <p className="text-[10px] text-zinc-400 font-medium">Workspace</p>
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          title="Configuración"
          className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Buscador y Accesos Directos */}
      <div className="pt-3 pb-2.5 border-b border-white/[0.08] px-3 space-y-2">
        <SearchBar onSelect={onSearchSelect} />
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {onNewMeeting && (
            <button
              onClick={onNewMeeting}
              className="bg-indigo-600/90 hover:bg-indigo-600 text-white font-medium text-xs rounded-xl py-2 px-2.5 flex items-center justify-center gap-1.5 transition-all shadow-sm border border-indigo-400/20 active:scale-[0.98]"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Reunión</span>
            </button>
          )}
          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/10 font-medium text-xs rounded-xl py-2 px-2.5 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-300" />
              <span>Agenda</span>
            </button>
          )}
        </div>
        {onOpenMailbox && (
          <button
            onClick={onOpenMailbox}
            className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-white border border-indigo-500/30 font-medium text-xs rounded-xl py-2 px-3 flex items-center justify-between transition-all active:scale-[0.98] shadow-xs"
          >
            <span className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              <span>Buzón de Soporte</span>
            </span>
            <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {conversations.filter((c) => c.source === "email").length > 0
                ? `${conversations.filter((c) => c.source === "email").length} correos`
                : "soporte@"}
            </span>
          </button>
        )}
      </div>


      {/* Navegación y Listados */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5 custom-scrollbar">
        {/* Canales Internos */}
        <section>
          <header className="px-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400/90 mb-1">
            <span>Canales</span>
            <button
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
              title="Crear canal"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </header>
          {adding && (
            <form
              className="px-2 mb-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) onAddChannel(newName.trim());
                setNewName("");
                setAdding(false);
              }}
            >
              <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2.5 py-1.5 border border-white/15 focus-within:ring-1 focus-within:ring-indigo-400">
                <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="nuevo-canal"
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-500"
                />
              </div>
            </form>
          )}
          <ul className="space-y-0.5">
            {channels.map((c) => {
              const count = unreads[c.id] || 0;
              const active = isSelected("channel", c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect({ kind: "channel", id: c.id, channelId: c.id })}
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-xl transition-all flex items-center gap-2 ${
                      active
                        ? "text-white font-semibold"
                        : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                    }`}
                    style={
                      active
                        ? {
                            background: theme.accent,
                            boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                          }
                        : undefined
                    }
                  >
                    <span className="text-zinc-400 shrink-0">
                      {c.is_private ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : c.post_policy === "admin" ? (
                        <Megaphone className="w-3.5 h-3.5" />
                      ) : (
                        <Hash className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <span className="truncate flex-1">{c.name}</span>
                    {count > 0 && (
                      <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Tickets & Soporte */}
        <section>
          <header className="px-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400/90 mb-1">
            <span>Tickets & Soporte</span>
            <button
              onClick={() => setShowClosedTickets((v) => !v)}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors lowercase font-normal"
            >
              {showClosedTickets ? "ocultar cerrados" : "ver cerrados"}
            </button>
          </header>

          {departments.map((d) => {
            const allConvs = convsByDept(d.id);
            const openCount = allConvs.filter((c) => c.status === "open").length;
            const limit = closedLimits[String(d.id)] || 10;
            const visibleConvs = allConvs.slice(0, limit);
            const remaining = allConvs.length - visibleConvs.length;

            return (
              <div key={d.id} className="mt-2.5">
                <div className="px-2.5 py-1 text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <Building2 className="w-3 h-3 text-zinc-500" />
                    {d.name}
                  </span>
                  {openCount > 0 && (
                    <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] rounded-full px-1.5 py-0.2 font-bold">
                      {openCount}
                    </span>
                  )}
                </div>
                <ul className="space-y-0.5 mt-0.5">
                  {allConvs.length === 0 && (
                    <li className="px-3 py-1 text-[11px] text-zinc-500 italic">sin tickets activos</li>
                  )}
                  {visibleConvs.map((cv) => {
                    const count = unreads[cv.channel_id] || 0;
                    const active = isSelected("conversation", cv.id);
                    return (
                      <li key={cv.id}>
                        <button
                          onClick={() =>
                            onSelect({ kind: "conversation", id: cv.id, channelId: cv.channel_id })
                          }
                          className={`w-full text-left px-2.5 py-1.5 text-xs rounded-xl transition-all flex items-center gap-2 ${
                            active
                              ? "text-white font-semibold"
                              : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                          }`}
                          style={
                            active
                              ? {
                                  background: theme.accent,
                                  boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                                }
                              : undefined
                          }
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[cv.status] || STATUS_DOT.open}`} />
                          {cv.source === "email" && (
                            <span title="Ticket recibido por correo">
                              <Mail className="w-3 h-3 text-indigo-300 shrink-0" />
                            </span>
                          )}
                          <span
                            className="truncate flex-1"
                            title={cv.subject ? `${cv.visitor_name}: ${cv.subject}` : cv.visitor_name}
                          >
                            {cv.visitor_name}
                          </span>
                          {count > 0 && (
                            <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {remaining > 0 && (
                    <li className="pt-1 px-1">
                      <button
                        onClick={() =>
                          setClosedLimits((prev) => ({
                            ...prev,
                            [String(d.id)]: limit + 10,
                          }))
                        }
                        className="w-full py-1 text-center text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      >
                        + Ver más ({remaining} restantes)
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}

          {/* Tickets sin departamento específico o generales */}
          {(() => {
            const deptIds = new Set(departments.map((d) => d.id));
            const orphanConvs = conversations.filter((c) => {
              const isOrphan = !c.department_id || !deptIds.has(c.department_id);
              if (!isOrphan) return false;
              return showClosedTickets ? true : c.status !== "closed";
            });
            if (orphanConvs.length === 0) return null;
            const limit = closedLimits["orphan"] || 10;
            const visibleOrphans = orphanConvs.slice(0, limit);
            const remaining = orphanConvs.length - visibleOrphans.length;

            return (
              <div className="mt-2.5">
                <div className="px-2.5 py-1 text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 text-indigo-400" />
                    Bandeja General
                  </span>
                  <span className="bg-indigo-500/20 text-indigo-300 text-[10px] rounded-full px-1.5 py-0.2 font-bold">
                    {orphanConvs.length}
                  </span>
                </div>
                <ul className="space-y-0.5 mt-0.5">
                  {visibleOrphans.map((cv) => {
                    const count = unreads[cv.channel_id] || 0;
                    const active = isSelected("conversation", cv.id);
                    return (
                      <li key={cv.id}>
                        <button
                          onClick={() =>
                            onSelect({ kind: "conversation", id: cv.id, channelId: cv.channel_id })
                          }
                          className={`w-full text-left px-2.5 py-1.5 text-xs rounded-xl transition-all flex items-center gap-2 ${
                            active
                              ? "text-white font-semibold"
                              : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                          }`}
                          style={
                            active
                              ? {
                                  background: theme.accent,
                                  boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                                }
                              : undefined
                          }
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[cv.status] || STATUS_DOT.open}`} />
                          {cv.source === "email" && (
                            <span title="Ticket recibido por correo">
                              <Mail className="w-3 h-3 text-indigo-300 shrink-0" />
                            </span>
                          )}
                          <span
                            className="truncate flex-1"
                            title={cv.subject ? `${cv.visitor_name}: ${cv.subject}` : cv.visitor_name}
                          >
                            {cv.visitor_name}
                          </span>
                          {count > 0 && (
                            <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {remaining > 0 && (
                    <li className="pt-1 px-1">
                      <button
                        onClick={() =>
                          setClosedLimits((prev) => ({
                            ...prev,
                            orphan: limit + 10,
                          }))
                        }
                        className="w-full py-1 text-center text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      >
                        + Ver más ({remaining} restantes)
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })()}
        </section>



        {/* Mensajes Directos */}
        <section>
          <header className="px-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400/90 mb-1">
            <span>Mensajes Directos</span>
            <button
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
              title="Nuevo mensaje directo"
              onClick={() => setDmPickerOpen((v) => !v)}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </header>
          {dmPickerOpen && (
            <div className="mx-1 mb-2 bg-zinc-900/90 border border-white/10 rounded-xl p-1.5 shadow-xl">
              <p className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">Iniciar conversación</p>
              <ul className="space-y-0.5">
                {agents.filter((a) => a.id !== agent.id).map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => { setDmPickerOpen(false); onStartDm(a.id); }}
                      className="w-full text-left px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-all"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${onlineIds.has(a.id) ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      <span className="truncate">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="space-y-0.5">
            {dms.length === 0 && !dmPickerOpen && (
              <li className="px-3 py-1 text-[11px] text-zinc-500 italic">sin conversaciones</li>
            )}
            {dms.map((dm) => {
              const count = unreads[dm.id] || 0;
              const active = isSelected("dm", dm.id);
              const isOnline = onlineIds.has(dm.other_id);
              return (
                <li key={dm.id}>
                  <button
                    onClick={() => onSelect({ kind: "dm", id: dm.id, channelId: dm.id })}
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-xl transition-all flex items-center gap-2.5 ${
                      active
                        ? "text-white font-semibold"
                        : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                    }`}
                    style={
                      active
                        ? {
                            background: theme.accent,
                            boxShadow: theme.glow ? `0 0 14px ${theme.glow}` : undefined,
                          }
                        : undefined
                    }
                  >
                    <div className="relative shrink-0">
                      <div
                        className="w-5 h-5 rounded-lg text-white flex items-center justify-center text-[10px] font-bold overflow-hidden shadow-sm"
                        style={{ background: "#4f46e5" }}
                      >
                        {dm.other_avatar ? (
                          <img src={dm.other_avatar} alt={dm.other_name} className="w-full h-full object-cover" />
                        ) : (
                          dm.other_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-zinc-900 ${
                          isOnline ? "bg-emerald-400" : "bg-zinc-500"
                        }`}
                      />
                    </div>
                    <span className="truncate flex-1">{dm.other_name}</span>
                    {dm.other_status_emoji && <span className="text-xs shrink-0">{dm.other_status_emoji}</span>}
                    {count > 0 && (
                      <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shrink-0 shadow-sm animate-pulse">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Equipo y Presencia */}
        <section>
          <header className="px-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400/90 mb-1">
            <span className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-zinc-400" />
              Equipo
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">{onlineIds.size} en línea</span>
          </header>
          <ul className="space-y-0.5">
            {agents.map((a) => {
              const isOnline = onlineIds.has(a.id);
              return (
                <li key={a.id} className="px-2.5 py-1 flex items-center gap-2 rounded-lg hover:bg-white/[0.04] transition-all">
                  <div className="relative shrink-0">
                    <div
                      className="w-5 h-5 rounded-lg text-white flex items-center justify-center text-[10px] font-bold overflow-hidden shadow-sm"
                      style={{ background: a.color || "#4f46e5" }}
                    >
                      {a.avatar ? (
                        <img src={a.avatar} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        a.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-zinc-900 ${
                        isOnline ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                      title={isOnline ? "En línea" : "Desconectado"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={`block text-xs truncate ${isOnline ? "text-zinc-200 font-medium" : "text-zinc-500"}`}>
                      {a.name}{a.id === agent.id ? " (tú)" : ""}
                    </span>
                    {(a.status_emoji || a.status_text) && (
                      <span className="block text-[10px] text-zinc-400 truncate">
                        {a.status_emoji} {a.status_text}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Footer de Usuario */}
      <footer className="p-2.5 border-t border-white/[0.08] relative bg-black/10">
        {/* Editor de estado */}
        {statusOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-3.5 z-30 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-indigo-400" />
                ¿Cómo estás hoy?
              </p>
              <button onClick={() => setStatusOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {STATUS_PRESETS.map((p) => (
                <button
                  key={p.text}
                  onClick={() => saveStatus(p.emoji, p.text)}
                  className="text-left text-xs text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl px-2.5 py-1.5 transition-all border border-white/5 flex items-center gap-1.5"
                >
                  <span>{p.emoji}</span>
                  <span className="truncate text-[11px]">{p.text}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
                placeholder="😀"
                maxLength={4}
                className="w-10 bg-white/10 rounded-xl px-2 py-1.5 text-xs text-center outline-none border border-white/10 placeholder:text-zinc-600 text-white"
              />
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Estado personalizado…"
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveStatus(statusEmoji || null, statusText.trim() || null);
                }}
                className="flex-1 bg-white/10 rounded-xl px-3 py-1.5 text-xs outline-none border border-white/10 placeholder:text-zinc-600 text-white"
              />
              <button
                onClick={() => saveStatus(statusEmoji || null, statusText.trim() || null)}
                className="text-xs text-white font-semibold rounded-xl px-3 py-1.5 transition-all shadow-sm"
                style={{ background: theme.accent }}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
            {(agent.status_emoji || agent.status_text) && (
              <button
                onClick={() => saveStatus(null, null)}
                className="mt-2.5 w-full text-[11px] text-rose-400 hover:text-rose-300 py-1 hover:bg-rose-500/10 rounded-lg transition-all"
              >
                Limpiar estado actual
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5 bg-white/[0.04] hover:bg-white/[0.07] p-2 rounded-2xl border border-white/5 transition-all">
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
            className="relative w-8 h-8 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm overflow-visible group"
            style={{ background: agent.color || "#4f46e5" }}
          >
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              agent.name.charAt(0).toUpperCase()
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-900"
              title="En línea"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate leading-snug">{agent.name}</p>
            <button
              onClick={openStatusEditor}
              title="Cambiar tu estado"
              className="text-[10px] text-zinc-400 hover:text-zinc-200 truncate block max-w-full text-left leading-snug"
            >
              {agent.status_emoji || agent.status_text
                ? `${agent.status_emoji ?? ""} ${agent.status_text ?? ""}`.trim()
                : "+ Pon tu estado"}
            </button>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </aside>
  );
}
