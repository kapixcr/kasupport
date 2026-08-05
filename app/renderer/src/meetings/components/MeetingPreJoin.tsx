import { useEffect, useMemo, useRef } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useMeetingMediaDevices } from "../hooks/useMediaDevices";
import { usePreJoinPreview } from "../hooks/usePreJoinPreview";
import type { MeetingPreJoinChoices, MeetingPublicInfo } from "../types";

export interface MeetingPreJoinProps {
  meeting: MeetingPublicInfo;
  choices: MeetingPreJoinChoices;
  onChange: (choices: MeetingPreJoinChoices) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
  submitLabel?: string;
  nameRequired?: boolean;
}

function DeviceSelect({
  id,
  label,
  value,
  devices,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  devices: MediaDeviceInfo[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled || devices.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {devices.length === 0 ? (
          <option value="">No disponible</option>
        ) : (
          devices.map((device, index) => (
            <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId}>
              {device.label || `${label} ${index + 1}`}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

export function MeetingPreJoin({
  meeting,
  choices,
  onChange,
  onSubmit,
  submitting = false,
  error,
  submitLabel = "Solicitar acceso",
  nameRequired = true,
}: MeetingPreJoinProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const devices = useMeetingMediaDevices();
  const preview = usePreJoinPreview({
    audioEnabled: choices.audioEnabled,
    videoEnabled: choices.videoEnabled,
    audioInputId: choices.audioInputId,
    videoInputId: choices.videoInputId,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = preview.stream;
    if (preview.stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [preview.stream]);

  useEffect(() => {
    const nextAudio = choices.audioInputId ?? devices.audioInputId;
    const nextVideo = choices.videoInputId ?? devices.videoInputId;
    const nextOutput = choices.audioOutputId ?? devices.audioOutputId;
    if (
      nextAudio !== choices.audioInputId ||
      nextVideo !== choices.videoInputId ||
      nextOutput !== choices.audioOutputId
    ) {
      onChange({
        ...choices,
        audioInputId: nextAudio,
        videoInputId: nextVideo,
        audioOutputId: nextOutput,
      });
    }
  }, [
    choices,
    devices.audioInputId,
    devices.audioOutputId,
    devices.videoInputId,
    onChange,
  ]);

  const initials = useMemo(() => {
    const parts = choices.name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase()).join("") || "TÚ";
  }, [choices.name]);

  const update = <K extends keyof MeetingPreJoinChoices>(key: K, value: MeetingPreJoinChoices[K]) => {
    onChange({ ...choices, [key]: value });
  };

  const canSubmit = (!nameRequired || Boolean(choices.name.trim())) && !submitting;
  const permissionDenied =
    preview.audioPermission === "denied" || preview.videoPermission === "denied";

  return (
    <form
      className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <section className="min-h-[300px] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <div className="relative flex min-h-[300px] aspect-video items-center justify-center overflow-hidden bg-zinc-950">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Vista previa de tu cámara"
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${
              choices.videoEnabled && preview.stream?.getVideoTracks().length ? "block" : "hidden"
            }`}
          />
          {(!choices.videoEnabled || !preview.stream?.getVideoTracks().length) && (
            <div className="flex size-24 items-center justify-center rounded-full bg-indigo-500 text-3xl font-semibold text-white shadow-xl">
              {initials}
            </div>
          )}
          {preview.loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white" role="status">
              <Loader2 className="size-7 animate-spin" aria-hidden="true" />
              <span className="sr-only">Preparando dispositivos</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => update("audioEnabled", !choices.audioEnabled)}
              aria-pressed={choices.audioEnabled}
              aria-label={choices.audioEnabled ? "Apagar micrófono" : "Encender micrófono"}
              className={`flex size-12 items-center justify-center rounded-full border text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                choices.audioEnabled
                  ? "border-white/20 bg-zinc-800/90 hover:bg-zinc-700"
                  : "border-red-400/50 bg-red-600 hover:bg-red-500"
              }`}
            >
              {choices.audioEnabled ? <Mic /> : <MicOff />}
            </button>
            <button
              type="button"
              onClick={() => update("videoEnabled", !choices.videoEnabled)}
              aria-pressed={choices.videoEnabled}
              aria-label={choices.videoEnabled ? "Apagar cámara" : "Encender cámara"}
              className={`flex size-12 items-center justify-center rounded-full border text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                choices.videoEnabled
                  ? "border-white/20 bg-zinc-800/90 hover:bg-zinc-700"
                  : "border-red-400/50 bg-red-600 hover:bg-red-500"
              }`}
            >
              {choices.videoEnabled ? <Camera /> : <CameraOff />}
            </button>
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col justify-center gap-5 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
        <header>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Antes de entrar</p>
          <h1 className="truncate text-2xl font-bold">{meeting.title}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Revisa tu nombre, cámara y micrófono.
          </p>
        </header>

        <label className="grid gap-1.5 text-sm font-medium" htmlFor="meeting-display-name">
          Tu nombre
          <input
            id="meeting-display-name"
            autoComplete="name"
            autoFocus
            maxLength={80}
            required={nameRequired}
            value={choices.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Cómo quieres aparecer"
            className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </label>

        <div className="grid gap-3">
          <DeviceSelect
            id="meeting-microphone"
            label="Micrófono"
            value={choices.audioInputId}
            devices={devices.audioInputs}
            disabled={!choices.audioEnabled}
            onChange={(value) => {
              devices.setAudioInputId(value);
              update("audioInputId", value);
            }}
          />
          <DeviceSelect
            id="meeting-camera"
            label="Cámara"
            value={choices.videoInputId}
            devices={devices.videoInputs}
            disabled={!choices.videoEnabled}
            onChange={(value) => {
              devices.setVideoInputId(value);
              update("videoInputId", value);
            }}
          />
          {devices.audioOutputs.length > 0 && (
            <DeviceSelect
              id="meeting-speaker"
              label="Altavoz"
              value={choices.audioOutputId}
              devices={devices.audioOutputs}
              onChange={(value) => {
                devices.setAudioOutputId(value);
                update("audioOutputId", value);
              }}
            />
          )}
        </div>

        {meeting.recordingEnabled && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
            <input
              type="checkbox"
              checked={choices.recordingConsent}
              onChange={(event) => update("recordingConsent", event.target.checked)}
              className="mt-0.5 size-4 accent-indigo-600"
            />
            <span>
              <span className="block font-semibold">Aviso de grabación</span>
              Esta reunión permite grabación. Al marcarlo confirmas que viste el aviso; se te informará si comienza.
            </span>
          </label>
        )}

        {(preview.error || devices.error) && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
            <p className="font-semibold">
              {permissionDenied ? "No hay permiso para un dispositivo" : "No pudimos abrir un dispositivo"}
            </p>
            <p className="mt-1 text-xs opacity-80">Puedes entrar con cámara y micrófono apagados.</p>
            <button
              type="button"
              onClick={() => void preview.retry()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
            >
              <RotateCcw className="size-3.5" /> Reintentar
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
          {submitting ? "Preparando…" : submitLabel}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="size-4" /> Cámara y micrófono permanecen bajo tu control.
        </p>
      </section>
    </form>
  );
}
