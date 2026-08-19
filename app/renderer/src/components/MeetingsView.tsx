import { useState } from "react";
import {
  Video,
  Plus,
  ArrowRight,
  Sparkles,
  Calendar,
  Users,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface Props {
  onCreateMeeting: () => void;
  onJoinMeeting: (code: string) => void;
  onOpenCalendar: () => void;
}

export function MeetingsView({
  onCreateMeeting,
  onJoinMeeting,
  onOpenCalendar,
}: Props) {
  const [meetingCode, setMeetingCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (meetingCode.trim()) {
      onJoinMeeting(meetingCode.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-y-auto p-6 md:p-10">
      <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="text-center space-y-2 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Videollamadas y Salas de Reunión Kasupport</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Reuniones en alta definición para tu equipo
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
            Inicia una videollamada instantánea, únete a una sala en curso con un código o programa reuniones desde la agenda.
          </p>
        </div>

        {/* Tarjetas Principales de Acción */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          
          {/* Iniciar Reunión Instantánea */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-indigo-500/40 transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <Video className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                  Nueva Reunión Instantánea
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Crea una sala segura al instante y comparte el enlace o código con tus compañeros.
                </p>
              </div>
            </div>
            <div className="pt-6">
              <button
                onClick={onCreateMeeting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-2xl py-3 px-4 flex items-center justify-center gap-2 shadow-md shadow-indigo-600/25 active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Iniciar reunión ahora</span>
              </button>
            </div>
          </div>

          {/* Unirse a una reunión existente */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                  Unirse con Código
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Ingresa el código o identificador de la reunión que recibiste (ej. meet-abc123).
                </p>
              </div>
            </div>
            <form onSubmit={handleJoin} className="pt-6 space-y-3">
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl px-3.5 py-2 border border-zinc-200/80 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-indigo-500/50">
                <input
                  type="text"
                  placeholder="meet-xxxxxx"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!meetingCode.trim()}
                className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-40 text-white font-semibold text-sm rounded-2xl py-3 px-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <span>Entrar a la sala</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>

        {/* Acceso Rápido a la Agenda */}
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                ¿Deseas programar para más tarde?
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Organiza eventos, consulta la disponibilidad de tus compañeros y programa citas.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenCalendar}
            className="shrink-0 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-semibold py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xs transition-all flex items-center gap-2"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>Abrir Agenda</span>
          </button>
        </div>

        {/* Características / Seguridad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Encriptación WebRTC de punto a punto</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Audio y video de baja latencia</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Sin límites de participantes internos</span>
          </div>
        </div>

      </div>
    </div>
  );
}
