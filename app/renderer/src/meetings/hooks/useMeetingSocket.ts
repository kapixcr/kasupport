import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { meetingSocket } from "../meetingsApi";

export type MeetingSocketAuthState = "idle" | "connecting" | "authenticated" | "error";

interface MeetingSocketAck {
  ok?: boolean;
  error?: string;
  participant_id?: number;
  status?: string;
}

export interface UseMeetingSocketOptions {
  publicId: string;
  guestToken?: string;
  enabled?: boolean;
}

export interface MeetingSocketSession {
  socket: typeof meetingSocket;
  state: MeetingSocketAuthState;
  error: string | null;
  participantId?: number;
  reconnect: () => void;
}

export function useMeetingSocket({
  publicId,
  guestToken,
  enabled = true,
}: UseMeetingSocketOptions): MeetingSocketSession {
  const [state, setState] = useState<MeetingSocketAuthState>(enabled ? "connecting" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<number>();
  const generationRef = useRef(0);
  const authenticatingRef = useRef(false);
  const ownsGuestConnectionRef = useRef(false);

  const invalidatePendingAuthentication = useCallback(() => {
    generationRef.current += 1;
    authenticatingRef.current = false;
  }, []);

  const authenticate = useCallback(() => {
    if (!enabled || !publicId) {
      invalidatePendingAuthentication();
      setState("idle");
      setError(null);
      setParticipantId(undefined);
      return;
    }

    const staffToken = getToken();
    const token = guestToken ? `guest:${guestToken}` : staffToken;
    if (!token) {
      invalidatePendingAuthentication();
      setState("error");
      setError("No hay una credencial válida para el canal en tiempo real.");
      setParticipantId(undefined);
      return;
    }

    setState("connecting");
    setError(null);

    // Do not mark authentication as in flight until the transport is connected
    // and the event can actually be emitted. The connect listener below calls
    // this function again once Socket.IO establishes (or re-establishes) it.
    if (!meetingSocket.connected) {
      if (guestToken) {
        ownsGuestConnectionRef.current = true;
        // The shared socket's default auth callback reads the staff token. A
        // public guest must connect anonymously, then authenticate only to the
        // requested meeting with the scoped guest token.
        meetingSocket.auth = {};
      }
      meetingSocket.connect();
      return;
    }
    if (authenticatingRef.current) return;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    authenticatingRef.current = true;

    meetingSocket.timeout(8_000).emit(
      "meeting:authenticate",
      { public_id: publicId, token },
      (timeoutError: Error | null, ack?: MeetingSocketAck) => {
        if (generationRef.current !== generation) return;
        authenticatingRef.current = false;
        if (timeoutError) {
          setState("error");
          setError("No se pudo abrir el canal en tiempo real.");
          return;
        }
        if (!ack?.ok) {
          setState("error");
          setError(ack?.error || "No se pudo autenticar el canal en tiempo real.");
          return;
        }
        setParticipantId(ack.participant_id);
        setState("authenticated");
      },
    );
  }, [enabled, guestToken, invalidatePendingAuthentication, publicId]);

  useEffect(() => {
    const originalSocketAuth = meetingSocket.auth;
    const onConnect = () => {
      // A Socket.IO reconnect creates a new server-side socket, so meeting room
      // membership must be authenticated again even if it succeeded before.
      invalidatePendingAuthentication();
      authenticate();
    };
    const onDisconnect = () => {
      invalidatePendingAuthentication();
      if (enabled) setState("connecting");
    };
    const onConnectError = (cause: Error) => {
      invalidatePendingAuthentication();
      setState("error");
      setError(cause.message || "No se pudo conectar el canal en tiempo real.");
    };

    // Register first: calling connect() may complete quickly, and missing the
    // connect event would leave the meeting waiting without sending auth.
    meetingSocket.on("connect", onConnect);
    meetingSocket.on("disconnect", onDisconnect);
    meetingSocket.on("connect_error", onConnectError);
    const startTimer = window.setTimeout(authenticate, 0);

    return () => {
      window.clearTimeout(startTimer);
      invalidatePendingAuthentication();
      meetingSocket.off("connect", onConnect);
      meetingSocket.off("disconnect", onDisconnect);
      meetingSocket.off("connect_error", onConnectError);
      // Public meeting pages have no staff presence lifecycle to own the shared
      // socket. Close only a connection this hook opened for a guest; staff
      // connections remain managed by lib/api's presence coordinator.
      if (ownsGuestConnectionRef.current && meetingSocket.connected) {
        meetingSocket.disconnect();
      }
      if (ownsGuestConnectionRef.current) meetingSocket.auth = originalSocketAuth;
      ownsGuestConnectionRef.current = false;
    };
  }, [authenticate, enabled, invalidatePendingAuthentication]);

  return {
    socket: meetingSocket,
    state,
    error,
    participantId,
    reconnect: authenticate,
  };
}
