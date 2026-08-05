import { API, getToken, socket } from "@/lib/api";
import type {
  CreateMeetingInput,
  MeetingApiErrorShape,
  MeetingChatMessage,
  MeetingChatPage,
  MeetingDetail,
  MeetingJoinCredentials,
  MeetingLobbyRequest,
  MeetingLobbyStatus,
  MeetingLobbyTicket,
  MeetingParticipantRecord,
  MeetingPublicInfo,
  MeetingRecording,
  MeetingRecordingState,
  MeetingRecordingStatus,
  MeetingRole,
  MeetingStatus,
  MeetingSummary,
} from "./types";


export class MeetingsApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "MeetingsApiError";
    this.status = status;
    this.code = code?.toLowerCase();
    this.details = details;
  }
}

export interface MeetingsApiConfig {
  baseUrl?: string;
  getStaffToken?: () => string | null;
  fetcher?: typeof fetch;
}

export type MeetingSocket = typeof socket;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
  publicRequest?: boolean;
}

interface UnknownRecord {
  [key: string]: unknown;
}

const record = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? (value as UnknownRecord) : {};

const stringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

const booleanValue = (fallback: boolean, ...values: unknown[]): boolean => {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
  }
  return fallback;
};

const numberValue = (fallback: number, ...values: unknown[]): number => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeStatus = (value: unknown): MeetingStatus => {
  switch (value) {
    case "ended":
    case "expired":
    case "revoked":
    case "waiting":
    case "active":
      return value;
    default:
      return "active";
  }
};

const normalizeRecordingStatus = (value: unknown): MeetingRecordingStatus => {
  switch (value) {
    case "starting":
      return "starting";
    case "recording":
    case "active":
      return "recording";
    case "stopping":
    case "ending":
      return "stopping";
    case "complete":
      return "complete";
    case "failed":
    case "aborted":
      return "failed";
    default:
      return "idle";
  }
};

const normalizeLobbyStatus = (value: unknown): MeetingLobbyStatus => {
  switch (value) {
    case "admitted":
    case "rejected":
    case "expired":
    case "ended":
      return value;
    default:
      return "pending";
  }
};

const normalizeRole = (value: unknown, fallback: MeetingRole = "participant"): MeetingRole => {
  if (value === "host" || value === "moderator" || value === "participant") return value;
  return fallback;
};

const unwrap = (payload: unknown, ...keys: string[]): UnknownRecord => {
  const outer = record(payload);
  for (const key of keys) {
    const inner = outer[key];
    if (inner && typeof inner === "object") return record(inner);
  }
  return outer;
};

const asArray = (payload: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const outer = record(payload);
  for (const key of keys) {
    if (Array.isArray(outer[key])) return outer[key] as unknown[];
  }
  return [];
};

export function normalizeMeeting(payload: unknown): MeetingDetail {
  const outer = record(payload);
  const raw = unwrap(payload, "meeting", "data");
  const publicId = stringValue(raw.publicId, raw.public_id, outer.publicId, outer.public_id) ?? "";
  return {
    id: stringValue(raw.id, raw.meeting_id, publicId) ?? publicId,
    publicId,
    title: stringValue(raw.title, raw.name) ?? "Reunión de Kasupport",
    status: normalizeStatus(raw.status),
    locked: booleanValue(false, raw.locked, raw.is_locked),
    lobbyEnabled: booleanValue(true, raw.lobbyEnabled, raw.lobby_enabled, raw.require_lobby),
    maxParticipants: numberValue(15, raw.maxParticipants, raw.max_participants, raw.capacity),
    participantCount: numberValue(0, raw.participantCount, raw.participant_count, raw.active_participants),
    hostName: stringValue(raw.hostName, raw.host_name, outer.hostName, outer.host_name),
    inviteUrl: stringValue(raw.inviteUrl, raw.invite_url, outer.inviteUrl, outer.invite_url),
    createdAt: stringValue(raw.createdAt, raw.created_at),
    endedAt: stringValue(raw.endedAt, raw.ended_at) ?? null,
    expiresAt: stringValue(raw.expiresAt, raw.expires_at) ?? null,
    recordingStatus: normalizeRecordingStatus(
      raw.recordingStatus ?? raw.recording_status ?? outer.recordingStatus ?? outer.recording_status,
    ),
    recordingEnabled: booleanValue(false, raw.recordingEnabled, raw.recording_enabled),
    role: normalizeRole(raw.role ?? outer.role),
    participantId: stringValue(
      raw.participantId,
      raw.participant_id,
      outer.participantId,
      outer.participant_id,
      record(outer.participant).id,
    ),
    livekitUrl: stringValue(
      raw.livekitUrl,
      raw.livekit_url,
      outer.livekitUrl,
      outer.livekit_url,
      outer.url,
    ),
    livekitToken: stringValue(
      raw.livekitToken,
      raw.livekit_token,
      outer.livekitToken,
      outer.livekit_token,
      outer.token,
    ),
  };
}

export function normalizePublicMeeting(payload: unknown): MeetingPublicInfo {
  const meeting = normalizeMeeting(payload);
  return {
    publicId: meeting.publicId,
    title: meeting.title,
    status: meeting.status,
    locked: meeting.locked,
    lobbyEnabled: meeting.lobbyEnabled,
    maxParticipants: meeting.maxParticipants,
    participantCount: meeting.participantCount,
    hostName: meeting.hostName,
    recordingStatus: meeting.recordingStatus,
    recordingEnabled: meeting.recordingEnabled,
    expiresAt: meeting.expiresAt,
  };
}

export function normalizeJoinCredentials(
  payload: unknown,
  fallbackMeeting?: MeetingDetail,
): MeetingJoinCredentials {
  const meeting = normalizeMeeting(payload);
  const resolvedMeeting = fallbackMeeting
    ? {
        ...meeting,
        ...fallbackMeeting,
        id: meeting.id || fallbackMeeting.id,
        publicId: meeting.publicId || fallbackMeeting.publicId,
        title: meeting.publicId ? meeting.title : fallbackMeeting.title,
        livekitUrl: meeting.livekitUrl ?? fallbackMeeting.livekitUrl,
        livekitToken: meeting.livekitToken ?? fallbackMeeting.livekitToken,
        participantId: meeting.participantId ?? fallbackMeeting.participantId,
        role: meeting.role ?? fallbackMeeting.role,
      }
    : meeting;
  const livekitUrl = resolvedMeeting.livekitUrl;
  const livekitToken = resolvedMeeting.livekitToken;
  if (!livekitUrl || !livekitToken) {
    throw new MeetingsApiError(
      "El servidor no devolvió las credenciales de LiveKit.",
      502,
      "missing_livekit_credentials",
      payload,
    );
  }
  return {
    meeting: resolvedMeeting,
    livekitUrl,
    livekitToken,
    participantId: resolvedMeeting.participantId,
    role: normalizeRole(resolvedMeeting.role),
  };
}

function normalizeLobbyRequest(payload: unknown, publicId: string): MeetingLobbyRequest {
  const outer = record(payload);
  const raw = unwrap(payload, "lobby", "request", "participant", "data");
  const participantId = stringValue(
    raw.participantId,
    raw.participant_id,
    raw.id,
    outer.participantId,
    outer.participant_id,
    outer.id,
  );
  return {
    id: participantId ?? "",
    participantId,
    meetingPublicId: stringValue(raw.meetingPublicId, raw.meeting_public_id, publicId) ?? publicId,
    name: stringValue(raw.name, raw.display_name, raw.participant_name) ?? "Invitado",
    status: normalizeLobbyStatus(raw.status ?? outer.status),
    requestedAt: stringValue(raw.requestedAt, raw.requested_at, raw.created_at, raw.createdAt),
    guestToken: stringValue(raw.guestToken, raw.guest_token, outer.guestToken, outer.guest_token, outer.token),
    livekitUrl: stringValue(raw.livekitUrl, raw.livekit_url, outer.livekitUrl, outer.livekit_url),
    livekitToken: stringValue(raw.livekitToken, raw.livekit_token, outer.livekitToken, outer.livekit_token),
    reason: stringValue(raw.reason, raw.message, outer.reason, outer.message),
  };
}

function normalizeParticipant(payload: unknown): MeetingParticipantRecord {
  const raw = record(payload);
  return {
    id: stringValue(raw.id, raw.participant_id, raw.identity) ?? "",
    identity: stringValue(raw.identity, raw.livekit_identity, raw.id) ?? "",
    name: stringValue(raw.name, raw.display_name) ?? "Participante",
    kind: raw.kind === "agent" || raw.participant_type === "agent" ? "agent" : "guest",
    role: normalizeRole(raw.role),
    state:
      raw.state === "lobby" || raw.status === "pending"
        ? "lobby"
        : raw.state === "left" || raw.status === "left"
          ? "left"
          : raw.state === "kicked" || raw.status === "kicked"
            ? "kicked"
            : "joined",
    joinedAt: stringValue(raw.joinedAt, raw.joined_at),
    handRaised: booleanValue(false, raw.handRaised, raw.hand_raised),
  };
}

function normalizeChatMessage(payload: unknown): MeetingChatMessage {
  const raw = record(payload);
  return {
    id: stringValue(raw.id, raw.message_id, raw.client_id) ?? crypto.randomUUID(),
    clientId: stringValue(raw.clientId, raw.client_id),
    body: stringValue(raw.body, raw.message, raw.text) ?? "",
    authorId: stringValue(raw.authorId, raw.author_id, raw.participant_id),
    authorIdentity: stringValue(raw.authorIdentity, raw.author_identity, raw.identity),
    authorName: stringValue(raw.authorName, raw.author_name, raw.name) ?? "Participante",
    createdAt: stringValue(raw.createdAt, raw.created_at) ?? new Date().toISOString(),
  };
}

export class MeetingsApiClient {
  private readonly baseUrl: string;
  private readonly getStaffToken: () => string | null;
  private readonly fetcher: typeof fetch;

  constructor(config: MeetingsApiConfig = {}) {
    this.baseUrl = (config.baseUrl ?? API).replace(/\/$/, "");
    this.getStaffToken = config.getStaffToken ?? getToken;
    this.fetcher = config.fetcher ?? fetch.bind(globalThis);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const token = options.publicRequest ? options.token : options.token ?? this.getStaffToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new MeetingsApiError(
        "No se pudo conectar con el servicio de reuniones.",
        0,
        "network_error",
        error,
      );
    }

    const text = await response.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const details = record(data) as MeetingApiErrorShape;
      const message = details.error || details.message || response.statusText || "No se pudo completar la solicitud.";
      const code = typeof details.code === "string" ? details.code : undefined;
      throw new MeetingsApiError(message, response.status, code, data);
    }
    return data as T;
  }

  async createMeeting(input: CreateMeetingInput = {}): Promise<MeetingDetail> {
    const payload = await this.request<unknown>("/api/meetings", {
      method: "POST",
      body: { title: input.title?.trim() || undefined, lobby_enabled: input.lobbyEnabled ?? true },
    });
    return normalizeMeeting(payload);
  }

  async listMeetings(): Promise<MeetingSummary[]> {
    const payload = await this.request<unknown>("/api/meetings");
    return asArray(payload, "meetings", "data").map(normalizeMeeting);
  }

  async getMeeting(publicId: string): Promise<MeetingDetail> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}`);
    return normalizeMeeting(payload);
  }

  async joinMeeting(publicId: string, choices?: { audioEnabled?: boolean; videoEnabled?: boolean }): Promise<MeetingJoinCredentials> {
    const existing = await this.getMeeting(publicId).catch(() => undefined);
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/join`, {
      method: "POST",
      body: choices
        ? { audio_enabled: choices.audioEnabled, video_enabled: choices.videoEnabled }
        : {},
    });
    return normalizeJoinCredentials(payload, existing);
  }

  async setLocked(publicId: string, locked: boolean): Promise<MeetingDetail> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}`, {
      method: "PATCH",
      body: { locked },
    });
    return normalizeMeeting(payload);
  }

  async endMeeting(publicId: string): Promise<MeetingDetail> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/end`, {
      method: "POST",
    });
    return normalizeMeeting(payload);
  }

  async getLobby(publicId: string): Promise<MeetingLobbyRequest[]> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/lobby`);
    return asArray(payload, "lobby", "requests", "participants", "data").map((item) =>
      normalizeLobbyRequest(item, publicId),
    );
  }

  async admitLobby(publicId: string, participantId: string | number): Promise<MeetingLobbyRequest> {
    const payload = await this.request<unknown>(
      `/api/meetings/${encodeURIComponent(publicId)}/lobby/${encodeURIComponent(participantId)}/admit`,
      { method: "POST" },
    );
    return normalizeLobbyRequest(payload, publicId);
  }

  async rejectLobby(publicId: string, participantId: string | number): Promise<MeetingLobbyRequest> {
    const payload = await this.request<unknown>(
      `/api/meetings/${encodeURIComponent(publicId)}/lobby/${encodeURIComponent(participantId)}/reject`,
      { method: "POST" },
    );
    return normalizeLobbyRequest(payload, publicId);
  }

  async kickParticipant(publicId: string, participantId: string | number): Promise<void> {
    await this.request<unknown>(
      `/api/meetings/${encodeURIComponent(publicId)}/participants/${encodeURIComponent(participantId)}/kick`,
      { method: "POST" },
    );
  }

  async getPublicMeeting(publicId: string): Promise<MeetingPublicInfo> {
    const payload = await this.request<unknown>(`/api/public/meetings/${encodeURIComponent(publicId)}`, {
      publicRequest: true,
    });
    return normalizePublicMeeting(payload);
  }

  async requestLobby(publicId: string, name: string): Promise<MeetingLobbyTicket> {
    const payload = await this.request<unknown>(`/api/public/meetings/${encodeURIComponent(publicId)}/lobby`, {
      method: "POST",
      publicRequest: true,
      body: { name: name.trim() },
    });
    const lobby = normalizeLobbyRequest(payload, publicId);
    const guestToken = lobby.guestToken;
    if (!guestToken) {
      throw new MeetingsApiError(
        "El servidor no devolvió el token de la sala de espera.",
        502,
        "missing_guest_token",
        payload,
      );
    }
    return { ...lobby, guestToken };
  }

  async pollPublicLobby(publicId: string, guestToken: string): Promise<MeetingLobbyRequest> {
    const payload = await this.request<unknown>(`/api/public/meetings/${encodeURIComponent(publicId)}/lobby`, {
      publicRequest: true,
      token: guestToken,
    });
    return normalizeLobbyRequest(payload, publicId);
  }

  async listParticipants(publicId: string): Promise<MeetingParticipantRecord[]> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/participants`);
    return asArray(payload, "participants", "data").map(normalizeParticipant);
  }

  async getChat(publicId: string, cursor?: string, guestToken?: string): Promise<MeetingChatPage> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const isGuest = Boolean(guestToken);
    const prefix = isGuest ? "/api/public/meetings" : "/api/meetings";
    const payload = await this.request<unknown>(`${prefix}/${encodeURIComponent(publicId)}/messages${query}`, {
      publicRequest: isGuest,
      token: guestToken,
    });
    const outer = record(payload);
    return {
      messages: asArray(payload, "messages", "data").map(normalizeChatMessage),
      nextCursor: stringValue(outer.nextCursor, outer.next_cursor) ?? null,
    };
  }

  async sendChat(
    publicId: string,
    body: string,
    clientId: string,
    guestToken?: string,
  ): Promise<MeetingChatMessage> {
    const isGuest = Boolean(guestToken);
    const prefix = isGuest ? "/api/public/meetings" : "/api/meetings";
    const payload = await this.request<unknown>(`${prefix}/${encodeURIComponent(publicId)}/messages`, {
      method: "POST",
      publicRequest: isGuest,
      token: guestToken,
      body: { body, client_id: clientId },
    });
    return normalizeChatMessage(unwrap(payload, "message", "data"));
  }

  async getRecordingState(publicId: string): Promise<MeetingRecordingState> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/recording`);
    const raw = unwrap(payload, "recording", "data");
    return {
      status: normalizeRecordingStatus(raw.status),
      recordingId: stringValue(raw.id, raw.recording_id),
      startedAt: stringValue(raw.startedAt, raw.started_at),
      error: stringValue(raw.error, raw.message),
    };
  }

  async startRecording(publicId: string): Promise<MeetingRecordingState> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/recording/start`, {
      method: "POST",
    });
    const raw = unwrap(payload, "recording", "data");
    return {
      status: normalizeRecordingStatus(raw.status ?? "starting"),
      recordingId: stringValue(raw.id, raw.recording_id),
      startedAt: stringValue(raw.startedAt, raw.started_at),
      error: stringValue(raw.error, raw.message),
    };
  }

  async stopRecording(publicId: string): Promise<MeetingRecordingState> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/recording/stop`, {
      method: "POST",
    });
    const raw = unwrap(payload, "recording", "data");
    return {
      status: normalizeRecordingStatus(raw.status ?? "stopping"),
      recordingId: stringValue(raw.id, raw.recording_id),
      startedAt: stringValue(raw.startedAt, raw.started_at),
      error: stringValue(raw.error, raw.message),
    };
  }

  async listRecordings(publicId: string): Promise<MeetingRecording[]> {
    const payload = await this.request<unknown>(`/api/meetings/${encodeURIComponent(publicId)}/recordings`);
    return asArray(payload, "recordings", "data").map((value) => {
      const raw = record(value);
      return {
        id: stringValue(raw.id, raw.recording_id) ?? "",
        status: normalizeRecordingStatus(raw.status),
        startedAt: stringValue(raw.startedAt, raw.started_at),
        endedAt: stringValue(raw.endedAt, raw.ended_at) ?? null,
        durationSeconds: numberValue(0, raw.durationSeconds, raw.duration_seconds) || null,
        downloadUrl: stringValue(raw.downloadUrl, raw.download_url),
        playbackUrl: stringValue(raw.playbackUrl, raw.playback_url),
        error: stringValue(raw.error, raw.message) ?? null,
      };
    });
  }
}

export const meetingsApi = new MeetingsApiClient();
export const meetingSocket = socket;
