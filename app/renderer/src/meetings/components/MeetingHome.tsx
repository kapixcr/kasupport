import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Copy,
  DoorOpen,
  History,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Users,
  Video,
} from "lucide-react";
import { CreateMeetingModal } from "./CreateMeetingModal";
import { meetingErrorCopy } from "../lib/errors";
import { meetingsApi } from "../meetingsApi";
import type { MeetingDetail, MeetingSummary } from "../types";

export interface MeetingHomeProps {
  onJoinMeeting: (meeting: MeetingSummary) => void;
  onCreated?: (meeting: MeetingDetail) => void;
  compact?: boolean;
  className?: string;
}

function formatMeetingDate(value?: string) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Fecha no disponible";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(meeting: MeetingSummary) {
  if (meeting.status === "ended") return "Finalizada";
  if (meeting.status === "expired") return "Expirada";
  if (meeting.status === "revoked") return "Revocada";
  if (meeting.locked) return "Bloqueada";
  return "Activa";
}

export function MeetingHome({
  onJoinMeeting,
  onCreated,
  compact = false,
  className,
}: MeetingHomeProps) {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string>();

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await meetingsApi.listMeetings();
      setMeetings(next);
    } catch (cause) {
      setError(meetingErrorCopy(cause).description);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return meetings;
    return meetings.filter((meeting) =>
      `${meeting.title} ${meeting.publicId} ${meeting.hostName ?? ""}`.toLocaleLowerCase().includes(normalized),
    );
  }, [meetings, query]);

  const active = filtered.filter((meeting) => meeting.status === "active" || meeting.status === "waiting");
  const history = filtered.filter((meeting) => meeting.status !== "active" && meeting.status !== "waiting");

  const copyInvite = async (meeting: MeetingSummary) => {
    const inviteUrl = meeting.inviteUrl || `${window.location.origin}/meet/${encodeURIComponent(meeting.publicId)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedId(meeting.publicId);
      window.setTimeout(() => setCopiedId(undefined), 1_800);
    } catch {
      setError("No se pudo copiar el enlace de la reunión.");
    }
  };

  const handleCreated = (meeting: MeetingDetail) => {
    setMeetings((current) => [meeting, ...current.filter((item) => item.publicId !== meeting.publicId)]);
    onCreated?.(meeting);
  };

  return (
    <section className={`flex min-h-0 flex-col bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white ${className ?? ""}`} aria-labelledby="meeting-home-title">
      <header className={`border-b border-zinc-200 dark:border-zinc-800 ${compact ? "p-4" : "p-6 sm:p-8"}`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Kasupport Meet</p>
            <h1 id="meeting-home-title" className={`${compact ? "text-xl" : "text-3xl"} mt-1 font-bold`}>Reuniones</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Videollamadas seguras para tu equipo e invitados.</p>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500">
            <Plus className="size-4" /> Nueva reunión
          </button>
        </div>
      </header>

      <div className={`mx-auto w-full max-w-6xl flex-1 overflow-y-auto ${compact ? "p-4" : "p-6 sm:p-8"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full max-w-md" htmlFor="meeting-search">
            <span className="sr-only">Buscar reuniones</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input id="meeting-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o código" className="h-10 w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </div>

        {error && (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            <span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">Reintentar</button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center" role="status"><Loader2 className="size-8 animate-spin text-indigo-500" /><span className="sr-only">Cargando reuniones</span></div>
        ) : meetings.length === 0 ? (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
            <span className="flex size-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Video className="size-8" /></span>
            <h2 className="mt-5 text-xl font-bold">Crea tu primera reunión</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-500">Obtendrás un enlace público para hasta 15 personas, con sala de espera y controles de anfitrión.</p>
            <button type="button" onClick={() => setCreateOpen(true)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"><Plus className="size-4" /> Nueva reunión</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">No hay reuniones que coincidan con “{query}”.</div>
        ) : (
          <div className="mt-7 space-y-9">
            <MeetingSection title="Activas" icon={<CalendarClock className="size-5 text-emerald-500" />} meetings={active} empty="No hay reuniones activas." onJoin={onJoinMeeting} onCopy={(meeting) => void copyInvite(meeting)} copiedId={copiedId} />
            {history.length > 0 && <MeetingSection title="Historial" icon={<History className="size-5 text-zinc-500" />} meetings={history} onJoin={onJoinMeeting} onCopy={(meeting) => void copyInvite(meeting)} copiedId={copiedId} />}
          </div>
        )}
      </div>

      <CreateMeetingModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        onJoin={(meeting) => {
          setCreateOpen(false);
          onJoinMeeting(meeting);
        }}
      />
    </section>
  );
}

function MeetingSection({
  title,
  icon,
  meetings,
  empty,
  onJoin,
  onCopy,
  copiedId,
}: {
  title: string;
  icon: React.ReactNode;
  meetings: MeetingSummary[];
  empty?: string;
  onJoin: (meeting: MeetingSummary) => void;
  onCopy: (meeting: MeetingSummary) => void;
  copiedId?: string;
}) {
  return (
    <section aria-labelledby={`meeting-section-${title}`}>
      <h2 id={`meeting-section-${title}`} className="flex items-center gap-2 text-base font-bold">{icon}{title}</h2>
      {meetings.length === 0 ? (
        empty && <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {meetings.map((meeting) => {
            const canJoin = meeting.status === "active" || meeting.status === "waiting";
            return (
              <li key={meeting.publicId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-indigo-700">
                <div className="flex items-start gap-3">
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${canJoin ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}><Video className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-semibold">{meeting.title}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${canJoin && !meeting.locked ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{statusLabel(meeting)}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{formatMeetingDate(meeting.createdAt)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Users className="size-3.5" /> {meeting.participantCount}/{meeting.maxParticipants}</span>
                      {meeting.locked && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300"><Lock className="size-3.5" /> Bloqueada</span>}
                      <span className="font-mono">{meeting.publicId}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <button type="button" onClick={() => onCopy(meeting)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"><Copy className="size-3.5" />{copiedId === meeting.publicId ? "Copiado" : "Copiar enlace"}</button>
                  {canJoin && (
                    <button type="button" onClick={() => onJoin(meeting)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500"><DoorOpen className="size-3.5" /> Entrar</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
