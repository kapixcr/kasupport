import { useEffect, useState } from "react";
import { API, type Agent } from "@/lib/api";
import {
  CalendarDays,
  UserCheck,
  Plus,
  Trash2,
  Video,
  Clock,
  X,
  Calendar,
} from "lucide-react";

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
  onClose?: () => void;
  embedded?: boolean;
}

export function MeetingCalendarModal({ agents, currentAgent, onJoinMeeting, onClose, embedded }: Props) {
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

  const handleCancelMeeting = async (publicId: string) => {
    if (!publicId) return;
    if (!confirm("¿Seguro que deseas cancelar y eliminar esta reunión?")) return;
    try {
      const res = await fetch(`${API}/api/meetings/${publicId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("kasupport_token")}` },
      });
      if (res.ok) {
        void loadCalendar();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error al cancelar: ${err.error || err.detail || res.statusText}`);
      }
    } catch (e) {
      console.error("Error al cancelar reunión:", e);
      alert("No se pudo enviar la solicitud de cancelación.");
    }
  };

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

  const content = (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-3xl flex flex-col overflow-hidden shadow-sm ${
        embedded ? "w-full max-w-5xl h-full mx-auto" : "w-full max-w-4xl max-h-[90vh] shadow-2xl animate-in fade-in zoom-in-95"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Modal */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              Calendario de Reuniones y Agenda
            </h2>
            <p className="text-xs text-zinc-400">
              Coordina sesiones con tu equipo y revisa la disponibilidad del personal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setScheduleOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Programar Reunión</span>
          </button>
          {onClose && !embedded && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

        {/* Pestañas Superior */}
        <div className="px-6 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex gap-2 bg-zinc-50/30 dark:bg-zinc-950/20">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "calendar"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Vista Calendario ({meetings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("availability")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "availability"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Disponibilidad del Personal</span>
          </button>
        </div>

        {/* Formulario Modal de Programar Reunión */}
        {scheduleOpen && (
          <div className="p-6 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nueva Reunión Programada
                </h3>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Título:</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. Revisión Semanal de Proyecto"
                    required
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Fecha:</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Hora:</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Invitar al equipo:</label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleInvitee(a.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        selectedInvitees.includes(a.id)
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      {selectedInvitees.includes(a.id) ? "✓ " : "+ "}
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={scheduling}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {scheduling ? "Guardando..." : "Guardar Reunión"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Contenido Principal */}
        <div className="flex-1 p-6 overflow-y-auto min-h-0">
          {activeTab === "calendar" && (
            <div className="space-y-3">
              {loading && <p className="text-xs text-zinc-400 text-center py-8">Cargando reuniones...</p>}

              {!loading && meetings.length === 0 && (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-950/40 rounded-3xl border border-zinc-200 dark:border-zinc-800">
                  <Calendar className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No hay reuniones programadas</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Haz clic en "Programar Reunión" para crear una nueva
                  </p>
                </div>
              )}

              {meetings.map((m) => {
                const startDate = m.starts_at ? new Date(m.starts_at) : new Date(m.created_at);
                const isToday = startDate.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={m.id}
                    className="bg-white dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-indigo-400/50 transition-all shadow-xs"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">{m.title}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.status === "active"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 animate-pulse"
                              : m.status === "waiting"
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                          }`}
                        >
                          {m.status === "active" ? "En vivo" : m.status === "waiting" ? "Esperando" : "Programada"}
                        </span>
                        {isToday && (
                          <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Hoy
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-400 flex items-center gap-2">
                        <span>Anfitrión: <strong className="text-zinc-700 dark:text-zinc-300">{m.host_name || "Personal"}</strong></span>
                        <span>•</span>
                        <span>Código: <code className="text-indigo-600 dark:text-indigo-400 font-mono">{m.public_id}</code></span>
                      </p>

                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span>{startDate.toLocaleDateString()} a las {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        onClick={() => onJoinMeeting(m.public_id)}
                        className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Unirse</span>
                      </button>
                      <button
                        onClick={() => void handleCancelMeeting(m.public_id)}
                        title="Cancelar y eliminar reunión"
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-zinc-200 dark:border-zinc-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "availability" && (
            <div className="space-y-4">
              <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Personal:</label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Fecha:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              {availability && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        availability.is_occupied ? "bg-rose-500 animate-ping" : "bg-emerald-400 animate-pulse"
                      }`}
                    />
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      {availability.is_occupied ? "Ocupado en reunión actualmente" : "Disponible para reuniones"}
                    </h3>
                  </div>

                  <p className="text-xs text-zinc-400">
                    Tiene <strong className="text-zinc-700 dark:text-zinc-300">{availability.scheduled_count}</strong> reunión(es) agendada(s) para el {availability.date}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  );

  if (embedded) {
    return (
      <div className="flex-1 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950 p-6 md:p-8 overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      {content}
    </div>
  );
}
