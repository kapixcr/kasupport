import { MeetingsApiError } from "../meetingsApi";
import type { MeetingErrorCopy } from "../types";

const CODE_COPY: Record<string, MeetingErrorCopy> = {
  invalid_meeting: {
    title: "Este enlace no es válido",
    description: "Comprueba el enlace o solicita uno nuevo al anfitrión.",
  },
  meeting_not_found: {
    title: "No encontramos la reunión",
    description: "Es posible que el enlace haya sido revocado o escrito incorrectamente.",
  },
  meeting_ended: {
    title: "La reunión terminó",
    description: "El anfitrión finalizó esta reunión.",
  },
  meeting_expired: {
    title: "El enlace expiró",
    description: "Solicita al anfitrión un enlace nuevo.",
  },
  meeting_locked: {
    title: "La reunión está bloqueada",
    description: "El anfitrión no está admitiendo nuevas personas en este momento.",
  },
  participant_limit: {
    title: "La reunión está llena",
    description: "Se alcanzó el límite de 15 participantes. Inténtalo nuevamente más tarde.",
  },
  meeting_full: {
    title: "La reunión está llena",
    description: "Se alcanzó el límite de 15 participantes. Inténtalo nuevamente más tarde.",
  },
  meeting_denied: {
    title: "No se aprobó tu acceso",
    description: "El anfitrión no permite que vuelvas a entrar a esta reunión.",
  },
  lobby_pending: {
    title: "Esperando al anfitrión",
    description: "Tu solicitud sigue en la sala de espera. Esta pantalla se actualizará automáticamente.",
  },
  invalid_guest_token: {
    title: "Tu acceso expiró",
    description: "Vuelve a abrir el enlace para solicitar acceso otra vez.",
  },
  livekit_not_configured: {
    title: "Las videollamadas no están disponibles",
    description: "El servicio de reuniones aún no está configurado. Contacta al administrador.",
  },
  recording_not_configured: {
    title: "La grabación no está disponible",
    description: "El almacenamiento de grabaciones aún no está configurado.",
  },
  rejected: {
    title: "No se aprobó tu acceso",
    description: "El anfitrión rechazó esta solicitud de ingreso.",
  },
  token_expired: {
    title: "Tu acceso expiró",
    description: "Vuelve a abrir el enlace para solicitar acceso otra vez.",
  },
  network_error: {
    title: "Sin conexión con Kasupport",
    description: "Comprueba tu conexión a internet y vuelve a intentarlo.",
  },
};

export function meetingErrorCopy(error: unknown): MeetingErrorCopy {
  if (error instanceof MeetingsApiError) {
    if (error.code && CODE_COPY[error.code]) return CODE_COPY[error.code];
    if (error.status === 404) return CODE_COPY.meeting_not_found;
    if (error.status === 410) return CODE_COPY.meeting_ended;
    if (error.status === 409 && error.code === "meeting_full") return CODE_COPY.meeting_full;
    if (error.status === 423) return CODE_COPY.meeting_locked;
    if (error.status === 429) {
      return {
        title: "Demasiados intentos",
        description: "Espera un momento antes de volver a intentarlo.",
      };
    }
    return { title: "No pudimos completar la acción", description: error.message };
  }
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return {
        title: "Permiso de cámara o micrófono denegado",
        description: "Puedes entrar con ambos apagados o habilitarlos desde la configuración del navegador.",
      };
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return {
        title: "No encontramos dispositivos multimedia",
        description: "Conecta una cámara o un micrófono, o entra con ambos apagados.",
      };
    }
    return { title: "Ocurrió un problema", description: error.message };
  }
  return {
    title: "Ocurrió un problema",
    description: "Vuelve a intentarlo. Si continúa, pide ayuda al anfitrión.",
  };
}
