import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Plus, ShieldCheck, Video, X } from "lucide-react";
import { meetingErrorCopy } from "../lib/errors";
import { meetingsApi } from "../meetingsApi";
import type { MeetingDetail } from "../types";

export interface CreateMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (meeting: MeetingDetail) => void;
  onJoin?: (meeting: MeetingDetail) => void;
}

export function CreateMeetingModal({
  open,
  onOpenChange,
  onCreated,
  onJoin,
}: CreateMeetingModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [lobbyEnabled, setLobbyEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<MeetingDetail>();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setLobbyEnabled(true);
    setCreated(undefined);
    setError(null);
    setCopied(false);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating, onOpenChange, open]);

  if (!open) return null;

  const inviteUrl = created?.inviteUrl || (created ? `${window.location.origin}/meet/${encodeURIComponent(created.publicId)}` : "");

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const meeting = await meetingsApi.createMeeting({
        title: title.trim() || undefined,
        lobbyEnabled,
      });
      setCreated(meeting);
      onCreated?.(meeting);
    } catch (cause) {
      setError(meetingErrorCopy(cause).description);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("No se pudo copiar el enlace. Selecciónalo y cópialo manualmente.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) onOpenChange(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-meeting-title"
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500">Kasupport Meet</p>
            <h1 id="create-meeting-title" className="mt-1 text-xl font-bold">
              {created ? "Reunión lista" : "Crear reunión"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={creating}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </header>

        {created ? (
          <div className="mt-6">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Video className="size-5" /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{created.title}</p>
                <p className="text-xs opacity-75">Máximo {created.maxParticipants} participantes</p>
              </div>
            </div>
            <label className="mt-5 block text-sm font-medium" htmlFor="new-meeting-link">Enlace para invitados</label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="new-meeting-link"
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button type="button" onClick={() => void copy()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                <Copy className="size-4" /> {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Los invitados no necesitan cuenta. Si la sala de espera está activada, tú decides quién entra.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Cerrar</button>
              <button type="button" onClick={() => onJoin?.(created)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500"><Video className="size-4" /> Entrar ahora</button>
            </div>
          </div>
        ) : (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meeting-title">
              Título <span className="font-normal text-zinc-500">(opcional)</span>
              <input
                ref={titleRef}
                id="new-meeting-title"
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Reunión de Kasupport"
                className="h-11 rounded-lg border border-zinc-300 bg-white px-3 outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <span>
                <span className="block text-sm font-semibold">Usar sala de espera</span>
                <span className="mt-1 block text-xs text-zinc-500">Revisa y admite a cada invitado antes de que entre.</span>
              </span>
              <input
                type="checkbox"
                checked={lobbyEnabled}
                onChange={(event) => setLobbyEnabled(event.target.checked)}
                className="mt-1 size-5 shrink-0 accent-indigo-600"
              />
            </label>

            {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => onOpenChange(false)} disabled={creating} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancelar</button>
              <button type="submit" disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {creating ? "Creando…" : "Crear reunión"}
              </button>
            </div>
          </form>
        )}

        {created && error && <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">{error}</p>}
      </section>
    </div>
  );
}
