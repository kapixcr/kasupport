import { useEffect, useState } from "react";
import { API, type Agent } from "@/lib/api";



export interface CalendarMeeting {
  id: number;
  public_id: string;
  title: string;
  status: "active" | "waiting" | "scheduled" | "ended";
  starts_at?: string | null;
  started_at?: string | null;
  created_at: string;
  created_by_agent_id?: number | null;
  host_name?: string;
  host_avatar?: string | null;
  participants: { id: number; name: string; role: string; status: string }[];
}

export interface StaffAvailability {
  agent_id: number;
  date: string;
  is_occupied: boolean;
  scheduled_count: number;
  meetings: CalendarMeeting[];
}

interface Props {
  agents: Agent[];
  currentAgent: Agent;
  onJoinMeeting: (code: string) => void;
  onClose: () => void;
}

export function MeetingCalendarModal({ agents, currentAgent, onJoinMeeting, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"calendar" | "availability">("calendar");
  const [meetings, setMeetings] = useState<CalendarMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de disponibilidad
  const [selectedAgentId, setSelectedAgentId] = useState<number>(currentAgent.id);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [availability, setAvailability] = useState<StaffAvailability | null>(null);

  // Formulario de programación
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTime, setNewTime] = useState("10:00");
  const [selectedInvitees, setSelectedInvitees] = useState<number[]>([]);
  const [scheduling, setScheduling] = useState(false);

  /* ------------------------------ Cargar Datos ------------------------------ */

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/meetings/calendar`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("kasupport_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (e) {
      console.error("Error al cargar calendario:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async (agentId: number, dateStr: string) => {
    try {
      const res = await fetch(`${API}/api/meetings/availability?agent_id=${agentId}&date=${dateStr}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("kasupport_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailability(data);
      }
    } catch (e) {
      console.error("Error al cargar disponibilidad:", e);
    }
  };

  useEffect(() => {
    void loadCalendar();
  }, []);

  useEffect(() => {
    if (activeTab === "availability") {
      void loadAvailability(selectedAgentId, selectedDate);
    }
  }, [activeTab, selectedAgentId, selectedDate]);

  /* ------------------------------ Programar ------------------------------ */

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setScheduling(true);

    try {
      const startsAtIso = new Date(`${newDate}T${newTime}:00`).toISOString();
      const res = await fetch(`${API}/api/meetings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("kasupport_token")}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          starts_at: startsAtIso,
          participant_agent_ids: selectedInvitees,
        }),
      });

      if (res.ok) {
        setScheduleOpen(false);
        setNewTitle("");
        setSelectedInvitees([]);
        void loadCalendar();
      }
    } catch (e) {
      console.error("Error al programar reunión:", e);
    } finally {
      setScheduling(false);
    }
  };

  const toggleInvitee = (id: number) => {
    setSelectedInvitees((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 text-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-950/60">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>📅</span> Calendario de Reuniones y Disponibilidad
            </h2>
            <p className="text-xs text-zinc-400">
              Programa reuniones con el equipo y consulta la agenda de cada integrante.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setScheduleOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-1.5"
            >
              <span>➕</span> Programar Reunión
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white font-bold text-xl px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Pestañas Superior */}
        <div className="px-6 pt-3 pb-2 border-b border-white/10 bg-zinc-900/80 flex gap-3">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "calendar" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            📅 Vista Calendario ({meetings.length})
          </button>
          <button
            onClick={() => setActiveTab("availability")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "availability" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            👤 Disponibilidad del Personal
          </button>
        </div>

        {/* Formulario Modal de Programar Reunión */}
        {scheduleOpen && (
          <div className="p-6 bg-zinc-950 border-b border-white/10">
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm text-indigo-400">➕ Nueva Reunión Programada</h3>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Título de la reunión:</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. Revisión Semanal de Proyecto"
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Fecha:</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Hora de Inicio:</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2">Invitar integrantes del personal:</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-zinc-800/50 rounded-xl border border-white/5">
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleInvitee(a.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selectedInvitees.includes(a.id)
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                      }`}
                    >
                      {selectedInvitees.includes(a.id) ? "✓ " : "+ "}
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={scheduling}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {scheduling ? "Guardando..." : "Guardar Reunión 🚀"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Contenido Principal */}
        <div className="flex-1 p-6 overflow-y-auto min-h-0">
          {/* Tab 1: Vista Calendario */}
          {activeTab === "calendar" && (
            <div className="space-y-4">
              {loading && <p className="text-xs text-zinc-400 text-center py-8">Cargando reuniones...</p>}

              {!loading && meetings.length === 0 && (
                <div className="text-center py-12 bg-zinc-950/40 rounded-2xl border border-white/5">
                  <span className="text-4xl">📅</span>
                  <p className="text-sm font-semibold text-zinc-300 mt-2">No hay reuniones programadas</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Haz clic en "Programar Reunión" para agendar una sesión con tu equipo.
                  </p>
                </div>
              )}

              {meetings.map((m) => {
                const startDate = m.starts_at ? new Date(m.starts_at) : new Date(m.created_at);
                const isToday = startDate.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={m.id}
                    className="bg-zinc-800/60 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-indigo-500/40 transition-all"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-white truncate">{m.title}</h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            m.status === "active"
                              ? "bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse"
                              : m.status === "waiting"
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          }`}
                        >
                          {m.status === "active" ? "🔴 En vivo" : m.status === "waiting" ? "⏳ Esperando" : "📅 Programada"}
                        </span>
                        {isToday && (
                          <span className="bg-indigo-600/30 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Hoy
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-400 flex items-center gap-3">
                        <span>Anfitrión: <strong className="text-zinc-200">{m.host_name || "Desconocido"}</strong></span>
                        <span>•</span>
                        <span>Código: <code className="text-indigo-400 font-mono">{m.public_id}</code></span>
                      </p>

                      <p className="text-xs text-zinc-400">
                        Fecha: <strong>{startDate.toLocaleDateString()}</strong> a las <strong>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                      </p>

                      {m.participants && m.participants.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-[10px] text-zinc-500 mr-1">Invitados:</span>
                          {m.participants.map((p) => (
                            <span key={p.id} className="text-[10px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-md">
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => onJoinMeeting(m.public_id)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all shrink-0 w-full sm:w-auto"
                    >
                      🚀 Unirse a la Sala
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2: Disponibilidad del Personal */}
          {activeTab === "availability" && (
            <div className="space-y-6">
              {/* Filtro de Persona y Fecha */}
              <div className="bg-zinc-800/60 border border-white/10 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Seleccionar Integrante del Personal:</label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Fecha a Consultar:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Indicador de Disponibilidad */}
              {availability && (
                <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 text-center space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <span
                      className={`w-4 h-4 rounded-full ${
                        availability.is_occupied ? "bg-red-500 animate-ping" : "bg-green-400 animate-pulse"
                      }`}
                    />
                    <h3 className="text-lg font-bold">
                      {availability.is_occupied ? "🔴 Ocupado en reunión en este momento" : "🟢 Disponible para reuniones"}
                    </h3>
                  </div>

                  <p className="text-xs text-zinc-400">
                    Tiene <strong className="text-white">{availability.scheduled_count}</strong> reunión(es) agendada(s) para el {availability.date}.
                  </p>

                  {/* Lista de Reuniones de la Persona en ese día */}
                  <div className="pt-4 text-left space-y-3 border-t border-white/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Agenda del día</h4>
                    {availability.meetings.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">No hay compromisos agendados para este día.</p>
                    ) : (
                      availability.meetings.map((m) => {
                        const timeStr = m.starts_at
                          ? new Date(m.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Todo el día";

                        return (
                          <div
                            key={m.id}
                            className="bg-zinc-900 border border-white/10 rounded-xl p-3 flex items-center justify-between"
                          >
                            <div>
                              <p className="text-xs font-bold text-white">{m.title}</p>
                              <p className="text-[10px] text-zinc-400">Hora: {timeStr} • Código: {m.public_id}</p>
                            </div>

                            <button
                              onClick={() => onJoinMeeting(m.public_id)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg"
                            >
                              Unirse 🚀
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
