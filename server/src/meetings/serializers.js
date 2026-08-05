'use strict';

function parseJson(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function serializeMeeting(row, { appPublicUrl, includePrivate = true } = {}) {
  const meeting = {
    public_id: row.public_id,
    title: row.title,
    status: row.status,
    locked: !!row.locked,
    lobby_enabled: !!row.lobby_enabled,
    recording_enabled: !!row.recording_enabled,
    recording_status: row.recording_status || 'idle',
    max_participants: Number(row.max_participants),
    participant_count: Number(row.participant_count || row.active_participant_count || 0),
    starts_at: toIso(row.starts_at),
    started_at: toIso(row.started_at),
    ended_at: toIso(row.ended_at),
    created_at: toIso(row.created_at),
    invite_url: appPublicUrl ? `${appPublicUrl}/meet/${encodeURIComponent(row.public_id)}` : null,
  };
  if (includePrivate) {
    meeting.id = Number(row.id);
    meeting.created_by_agent_id = Number(row.created_by_agent_id);
    meeting.livekit_room_name = row.livekit_room_name;
    meeting.settings = parseJson(row.settings, {});
    meeting.updated_at = toIso(row.updated_at);
  }
  return meeting;
}

function serializeParticipant(row, { includePrivate = true } = {}) {
  const participant = {
    id: Number(row.id),
    participant_type: row.participant_type,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    hand_raised: !!row.hand_raised,
    admitted_at: toIso(row.admitted_at),
    joined_at: toIso(row.joined_at),
    left_at: toIso(row.left_at),
    created_at: toIso(row.created_at),
  };
  if (includePrivate) {
    participant.agent_id = row.agent_id === null || row.agent_id === undefined ? null : Number(row.agent_id);
    participant.livekit_identity = row.livekit_identity;
    participant.rejected_at = toIso(row.rejected_at);
    participant.kicked_at = toIso(row.kicked_at);
    participant.last_seen_at = toIso(row.last_seen_at);
  }
  return participant;
}

function serializeMessage(row) {
  return {
    id: Number(row.id),
    participant_id: Number(row.participant_id),
    client_id: row.idempotency_key || undefined,
    author_name: row.author_name,
    body: row.body,
    created_at: toIso(row.created_at),
  };
}

function serializeRecording(row) {
  return {
    id: Number(row.id),
    egress_id: row.egress_id,
    status: row.status,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    duration_seconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    started_at: toIso(row.started_at),
    ended_at: toIso(row.ended_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    error: row.error || null,
  };
}

function serializeEvent(row) {
  return {
    id: Number(row.id),
    event_type: row.event_type,
    actor_participant_id: row.actor_participant_id === null || row.actor_participant_id === undefined ? null : Number(row.actor_participant_id),
    payload: parseJson(row.payload, {}),
    created_at: toIso(row.created_at),
  };
}

module.exports = {
  parseJson,
  serializeEvent,
  serializeMeeting,
  serializeMessage,
  serializeParticipant,
  serializeRecording,
  toIso,
};
