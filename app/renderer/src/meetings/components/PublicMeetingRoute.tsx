import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, DoorClosed, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useParams } from "react-router";
import { MeetingPreJoin } from "./MeetingPreJoin";
import { MeetingRoom } from "./MeetingRoom";
import { meetingErrorCopy } from "../lib/errors";
import { MeetingsApiError, meetingsApi, normalizeJoinCredentials } from "../meetingsApi";
import type {
  MeetingJoinCredentials,
  MeetingLobbyRequest,
  MeetingPreJoinChoices,
  MeetingPublicInfo,
} from "../types";
import { MEETING_GUEST_TOKEN_PREFIX } from "../types";

const initialChoices = (): MeetingPreJoinChoices => ({
  name: sessionStorage.getItem("kasupport_meeting_display_name") || "",
  audioEnabled: true,
  videoEnabled: true,
  recordingConsent: false,
});

function guestStorageKey(publicId: string) {
  return `${MEETING_GUEST_TOKEN_PREFIX}${publicId}`;
}

function readGuestToken(publicId: string) {
  return sessionStorage.getItem(guestStorageKey(publicId)) || undefined;
}

function storeGuestToken(publicId: string, token: string) {
  sessionStorage.setItem(guestStorageKey(publicId), token);
}

function clearGuestToken(publicId: string) {
  sessionStorage.removeItem(guestStorageKey(publicId));
}

interface PublicMeetingRouteProps {
  publicId?: string;
  onExit?: () => void;
}

type GuestStep = "loading" | "prejoin" | "waiting" | "room" | "error" | "ended" | "rejected";

function publicInfoAsDetail(meeting: MeetingPublicInfo) {
  return {
    ...meeting,
    id: meeting.publicId,
  };
}

export function PublicMeetingRoute({ publicId: publicIdProp, onExit }: PublicMeetingRouteProps) {
  const routeParams = useParams<{ publicId: string }>();
  const publicId = (publicIdProp ?? routeParams.publicId ?? "").trim();
  const [step, setStep] = useState<GuestStep>("loading");
  const [meeting, setMeeting] = useState<MeetingPublicInfo | null>(null);
  const [choices, setChoices] = useState<MeetingPreJoinChoices>(initialChoices);
  const [guestToken, setGuestToken] = useState<string>();
  const [credentials, setCredentials] = useState<MeetingJoinCredentials>();
  const [lobbyRequest, setLobbyRequest] = useState<MeetingLobbyRequest>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>();

  const resolvePublicMeeting = useCallback(async () => {
    if (!publicId) {
      setError(new MeetingsApiError("El enlace de reunión está incompleto.", 400, "invalid_meeting"));
      setStep("error");
      return;
    }
    setStep("loading");
    setError(undefined);
    try {
      const resolved = await meetingsApi.getPublicMeeting(publicId);
      setMeeting(resolved);
      if (resolved.status === "ended" || resolved.status === "revoked") {
        setStep("ended");
        return;
      }
      if (resolved.status === "expired") {
        setError(new MeetingsApiError("El enlace expiró.", 410, "meeting_expired"));
        setStep("error");
        return;
      }
      const storedToken = readGuestToken(publicId);
      if (!storedToken) {
        if (resolved.locked) {
          setError(new MeetingsApiError("La reunión está bloqueada.", 423, "meeting_locked"));
          setStep("error");
        } else {
          setStep("prejoin");
        }
        return;
      }

      // A host can lock a meeting after admitting someone. An already admitted
      // guest keeps their scoped access; the lock only blocks new requests.
      setGuestToken(storedToken);
      try {
        const status = await meetingsApi.pollPublicLobby(publicId, storedToken);
        setLobbyRequest(status);
        if (status.status === "admitted" && status.livekitUrl && status.livekitToken) {
          const nextCredentials = normalizeJoinCredentials(
            {
              meeting: publicInfoAsDetail(resolved),
              livekit_url: status.livekitUrl,
              livekit_token: status.livekitToken,
              participant_id: status.participantId ?? status.id,
              role: "participant",
            },
            publicInfoAsDetail(resolved),
          );
          setCredentials(nextCredentials);
          setStep("room");
        } else if (status.status === "rejected") {
          setStep("rejected");
        } else if (status.status === "ended") {
          setStep("ended");
        } else if (status.status === "expired") {
          clearGuestToken(publicId);
          setGuestToken(undefined);
          setStep("prejoin");
        } else {
          setStep("waiting");
        }
      } catch (cause) {
        if (cause instanceof MeetingsApiError && (cause.status === 401 || cause.code === "INVALID_GUEST_TOKEN")) {
          clearGuestToken(publicId);
          setGuestToken(undefined);
          setStep("prejoin");
        } else {
          throw cause;
        }
      }
    } catch (cause) {
      setError(cause);
      setStep("error");
    }
  }, [publicId]);

  useEffect(() => {
    void resolvePublicMeeting();
  }, [resolvePublicMeeting]);

  useEffect(() => {
    if (step !== "waiting" || !guestToken || !meeting) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = 2_000;

    const poll = async () => {
      try {
        const status = await meetingsApi.pollPublicLobby(publicId, guestToken);
        if (cancelled) return;
        setLobbyRequest(status);
        delay = 2_000;
        if (status.status === "admitted") {
          if (!status.livekitUrl || !status.livekitToken) {
            throw new MeetingsApiError(
              "El servidor aprobó el acceso pero no devolvió las credenciales de la sala.",
              502,
              "missing_livekit_credentials",
            );
          }
          setCredentials(
            normalizeJoinCredentials(
              {
                meeting: publicInfoAsDetail(meeting),
                livekit_url: status.livekitUrl,
                livekit_token: status.livekitToken,
                participant_id: status.participantId ?? status.id,
                role: "participant",
              },
              publicInfoAsDetail(meeting),
            ),
          );
          setStep("room");
          return;
        }
        if (status.status === "rejected") {
          setStep("rejected");
          return;
        }
        if (status.status === "ended") {
          setStep("ended");
          return;
        }
        if (status.status === "expired") {
          clearGuestToken(publicId);
          setGuestToken(undefined);
          setError(new MeetingsApiError("La solicitud de acceso expiró.", 410, "token_expired"));
          setStep("error");
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof MeetingsApiError && (cause.status === 401 || cause.status === 403)) {
          clearGuestToken(publicId);
          setGuestToken(undefined);
          setError(cause);
          setStep("error");
          return;
        }
        // Temporary network/server errors keep polling with bounded backoff.
        setError(cause);
        delay = Math.min(delay * 2, 10_000);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    };

    timer = window.setTimeout(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [guestToken, meeting, publicId, step]);

  const submitLobby = async () => {
    const name = choices.name.replace(/\s+/g, " ").trim();
    if (!name) return;
    setSubmitting(true);
    setError(undefined);
    try {
      sessionStorage.setItem("kasupport_meeting_display_name", name);
      const ticket = await meetingsApi.requestLobby(publicId, name);
      storeGuestToken(publicId, ticket.guestToken);
      setGuestToken(ticket.guestToken);
      setLobbyRequest(ticket);
      if (ticket.status === "admitted" && ticket.livekitUrl && ticket.livekitToken && meeting) {
        setCredentials(
          normalizeJoinCredentials(
            {
              meeting: publicInfoAsDetail(meeting),
              livekit_url: ticket.livekitUrl,
              livekit_token: ticket.livekitToken,
              participant_id: ticket.participantId ?? ticket.id,
              role: "participant",
            },
            publicInfoAsDetail(meeting),
          ),
        );
        setStep("room");
      } else {
        setStep("waiting");
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  const errorCopy = useMemo(() => (error ? meetingErrorCopy(error) : undefined), [error]);

  if (step === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white" aria-busy="true">
        <div className="text-center" role="status">
          <Loader2 className="mx-auto size-10 animate-spin text-indigo-400" />
          <p className="mt-4 font-medium">Abriendo la reunión…</p>
          <p className="mt-1 text-sm text-zinc-500">No necesitas una cuenta de Kasupport.</p>
        </div>
      </main>
    );
  }

  if (step === "room" && credentials) {
    return (
      <main className="h-screen min-h-[520px] bg-zinc-950">
        <MeetingRoom
          credentials={credentials}
          choices={choices}
          guestToken={guestToken}
          onLeave={onExit ?? (() => setStep("ended"))}
          onEnded={() => setStep("ended")}
        />
      </main>
    );
  }

  if (step === "prejoin" && meeting) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 p-4 text-white sm:p-8">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col justify-center sm:min-h-[calc(100vh-4rem)]">
          <MeetingPreJoin
            meeting={meeting}
            choices={choices}
            onChange={setChoices}
            onSubmit={() => void submitLobby()}
            submitting={submitting}
            error={errorCopy?.description}
            submitLabel="Solicitar acceso"
          />
        </div>
      </main>
    );
  }

  if (step === "waiting" && meeting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 p-6 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-900/85 p-8 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
            <Clock3 className="size-8" />
          </div>
          <h1 className="mt-6 text-2xl font-bold">Esperando al anfitrión</h1>
          <p className="mt-2 text-zinc-400">
            Tu solicitud para <strong className="text-zinc-200">{meeting.title}</strong> fue enviada. Esta pantalla se actualizará automáticamente.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-500" role="status" aria-live="polite">
            <Loader2 className="size-4 animate-spin" /> Solicitud pendiente
          </div>
          {errorCopy && (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">
              <p>{errorCopy.description}</p>
              <button type="button" onClick={() => setError(undefined)} className="mt-1 underline">Ocultar</button>
            </div>
          )}
          <p className="mt-7 text-xs text-zinc-500">
            Puedes mantener esta pestaña en segundo plano; no envíes otra solicitud.
          </p>
          {lobbyRequest?.requestedAt && (
            <p className="mt-3 text-xs text-zinc-600">Solicitud enviada a las {new Date(lobbyRequest.requestedAt).toLocaleTimeString()}</p>
          )}
        </section>
      </main>
    );
  }

  if (step === "rejected") {
    return (
      <StateScreen
        icon={<XCircle className="size-12 text-red-400" />}
        title="No se aprobó tu acceso"
        description="El anfitrión rechazó esta solicitud de ingreso."
        action="Cerrar"
        onAction={onExit}
      />
    );
  }

  if (step === "ended") {
    return (
      <StateScreen
        icon={<DoorClosed className="size-12 text-zinc-400" />}
        title="La reunión terminó"
        description="El anfitrión finalizó esta reunión."
        action="Cerrar"
        onAction={onExit}
      />
    );
  }

  return (
    <StateScreen
      icon={<ShieldCheck className="size-12 text-amber-400" />}
      title={errorCopy?.title ?? "No se pudo abrir la reunión"}
      description={errorCopy?.description ?? "Comprueba el enlace y vuelve a intentarlo."}
      action="Reintentar"
      onAction={() => void resolvePublicMeeting()}
      secondaryAction={onExit ? "Cerrar" : undefined}
      onSecondaryAction={onExit}
    />
  );
}

function StateScreen({
  icon,
  title,
  description,
  action,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-white/5">{icon}</div>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-zinc-400">{description}</p>
        <div className="mt-7 flex justify-center gap-3">
          {action && onAction && (
            <button type="button" onClick={onAction} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-zinc-950 hover:bg-zinc-200">
              {action === "Reintentar" && <RefreshCw className="size-4" />}{action}
            </button>
          )}
          {secondaryAction && onSecondaryAction && (
            <button type="button" onClick={onSecondaryAction} className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold hover:bg-white/10">{secondaryAction}</button>
          )}
        </div>
      </section>
    </main>
  );
}

export const GuestMeetingRoute = PublicMeetingRoute;
