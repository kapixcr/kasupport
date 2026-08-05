export const MEETING_MAX_PARTICIPANTS = 15;
export const MEETING_GUEST_TOKEN_PREFIX = "kasupport_meeting_guest:";

export type MeetingStatus = "waiting" | "active" | "ended" | "expired" | "revoked";
export type MeetingRole = "host" | "moderator" | "participant";
export type MeetingParticipantKind = "agent" | "guest";
export type MeetingLobbyStatus = "pending" | "admitted" | "rejected" | "expired" | "ended";
export type MeetingRecordingStatus = "idle" | "starting" | "recording" | "stopping" | "complete" | "failed";

export interface MeetingSummary {
  id: string | number;
  publicId: string;
  title: string;
  status: MeetingStatus;
  locked: boolean;
  lobbyEnabled: boolean;
  maxParticipants: number;
  participantCount: number;
  hostName?: string;
  inviteUrl?: string;
  createdAt?: string;
  endedAt?: string | null;
  expiresAt?: string | null;
  recordingStatus?: MeetingRecordingStatus;
}

export interface MeetingDetail extends MeetingSummary {
  recordingEnabled?: boolean;
  role?: MeetingRole;
  participantId?: string | number;
  livekitUrl?: string;
  livekitToken?: string;
}

export interface MeetingJoinCredentials {
  meeting: MeetingDetail;
  livekitUrl: string;
  livekitToken: string;
  participantId?: string | number;
  role: MeetingRole;
}

export interface MeetingLobbyRequest {
  id: string | number;
  meetingPublicId: string;
  name: string;
  status: MeetingLobbyStatus;
  requestedAt?: string;
  participantId?: string | number;
  guestToken?: string;
  livekitUrl?: string;
  livekitToken?: string;
  reason?: string;
}

export interface MeetingLobbyTicket extends MeetingLobbyRequest {
  guestToken: string;
}

export interface MeetingParticipantRecord {
  id: string | number;
  identity: string;
  name: string;
  kind: MeetingParticipantKind;
  role: MeetingRole;
  state?: "lobby" | "joined" | "left" | "kicked";
  joinedAt?: string;
  handRaised?: boolean;
}

export interface MeetingChatMessage {
  id: string | number;
  clientId?: string;
  body: string;
  authorId?: string | number;
  authorIdentity?: string;
  authorName: string;
  createdAt: string;
}

export interface MeetingChatPage {
  messages: MeetingChatMessage[];
  nextCursor?: string | null;
}

export interface MeetingRecording {
  id: string | number;
  status: MeetingRecordingStatus;
  startedAt?: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  downloadUrl?: string;
  playbackUrl?: string;
  error?: string | null;
}

export interface MeetingRecordingState {
  status: MeetingRecordingStatus;
  recordingId?: string | number;
  startedAt?: string;
  error?: string;
}

export type MeetingReactionEmoji = "👍" | "👏" | "❤️" | "😂" | "🎉" | "😮";

export interface MeetingReactionEvent {
  id: string;
  emoji: MeetingReactionEmoji;
  participantIdentity: string;
  participantName: string;
  createdAt: number;
}

export interface MeetingPreJoinChoices {
  name: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
  recordingConsent: boolean;
}

export interface MeetingPublicInfo {
  publicId: string;
  title: string;
  status: MeetingStatus;
  locked: boolean;
  lobbyEnabled: boolean;
  maxParticipants: number;
  participantCount: number;
  hostName?: string;
  recordingStatus?: MeetingRecordingStatus;
  recordingEnabled?: boolean;
  expiresAt?: string | null;
}

export interface CreateMeetingInput {
  title?: string;
  lobbyEnabled?: boolean;
}

export interface MeetingApiErrorShape {
  error?: string;
  message?: string;
  code?: string;
  status?: string;
}

export interface MeetingRouteSession {
  publicId: string;
  guestToken?: string;
  credentials?: MeetingJoinCredentials;
}

export interface MeetingErrorCopy {
  title: string;
  description: string;
}
