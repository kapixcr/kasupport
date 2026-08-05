'use strict';

const { HttpError } = require('./errors');
const { hashOpaqueToken, normalizePublicId } = require('./security');

const MEETING_SELECT = `
  SELECT mt.*,
         (SELECT a.name FROM agents a WHERE a.id = mt.created_by_agent_id) AS created_by_agent_name,
         (SELECT mr.status FROM meeting_recordings mr
            WHERE mr.meeting_id = mt.id ORDER BY mr.id DESC LIMIT 1) AS recording_status,
         (SELECT COUNT(*)::int
            FROM meeting_participants mp
           WHERE mp.meeting_id = mt.id
             AND mp.status IN ('admitted', 'joined')) AS participant_count
    FROM meetings mt`;

async function withTransaction(db, callback) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getMeetingByPublicId(queryable, publicId, { forUpdate = false } = {}) {
  const normalizedPublicId = normalizePublicId(publicId);
  const { rows } = await queryable.query(
    `${MEETING_SELECT} WHERE mt.public_id = $1${forUpdate ? ' FOR UPDATE OF mt' : ''}`,
    [normalizedPublicId]
  );
  return rows[0] || null;
}

async function requireMeeting(queryable, publicId, options) {
  const meeting = await getMeetingByPublicId(queryable, publicId, options);
  if (!meeting) throw new HttpError(404, 'MEETING_NOT_FOUND', 'reunión no encontrada');
  return meeting;
}

async function listMeetings(db, agentId, { status = null, limit = 50, beforeId = null } = {}) {
  const params = [agentId, limit];
  const conditions = ['(mt.created_by_agent_id = $1 OR EXISTS (SELECT 1 FROM meeting_participants mine WHERE mine.meeting_id = mt.id AND mine.agent_id = $1))'];
  if (status) {
    params.push(status);
    conditions.push(`mt.status = $${params.length}`);
  }
  if (beforeId) {
    params.push(beforeId);
    conditions.push(`mt.id < $${params.length}`);
  }
  const { rows } = await db.query(
    `${MEETING_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY mt.id DESC
      LIMIT $2`,
    params
  );
  return rows;
}

async function insertEvent(queryable, meetingId, eventType, { actorParticipantId = null, payload = {}, externalEventId = null } = {}) {
  const { rows } = await queryable.query(
    `INSERT INTO meeting_events (meeting_id, actor_participant_id, event_type, payload, external_event_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (external_event_id) DO NOTHING
     RETURNING *`,
    [meetingId, actorParticipantId, eventType, JSON.stringify(payload || {}), externalEventId]
  );
  return rows[0] || null;
}

async function getParticipantById(queryable, meetingId, participantId, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM meeting_participants
      WHERE meeting_id = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [meetingId, participantId]
  );
  return rows[0] || null;
}

async function getParticipantByAgent(queryable, meetingId, agentId, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM meeting_participants
      WHERE meeting_id = $1 AND agent_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [meetingId, agentId]
  );
  return rows[0] || null;
}

async function getParticipantByToken(queryable, meetingId, token, pepper, { forUpdate = false } = {}) {
  if (!token) return null;
  const digest = hashOpaqueToken(token, pepper);
  const { rows } = await queryable.query(
    `SELECT * FROM meeting_participants
      WHERE meeting_id = $1 AND guest_token_hash = $2
        AND guest_token_revoked_at IS NULL
        AND (guest_token_expires_at IS NULL OR guest_token_expires_at > now())${forUpdate ? ' FOR UPDATE' : ''}`,
    [meetingId, digest]
  );
  return rows[0] || null;
}

async function getParticipantByLiveKitIdentity(queryable, meetingId, identity) {
  const { rows } = await queryable.query(
    'SELECT * FROM meeting_participants WHERE meeting_id = $1 AND livekit_identity = $2',
    [meetingId, identity]
  );
  return rows[0] || null;
}

async function requireParticipant(queryable, meetingId, participantId, options) {
  const participant = await getParticipantById(queryable, meetingId, participantId, options);
  if (!participant) throw new HttpError(404, 'PARTICIPANT_NOT_FOUND', 'participante no encontrado');
  return participant;
}

async function countCapacityParticipants(queryable, meetingId) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS count
       FROM meeting_participants
      WHERE meeting_id = $1 AND status IN ('admitted', 'joined')`,
    [meetingId]
  );
  return Number(rows[0]?.count || 0);
}

async function assertCapacity(queryable, meeting) {
  const count = await countCapacityParticipants(queryable, meeting.id);
  if (count >= Number(meeting.max_participants)) {
    throw new HttpError(409, 'MEETING_FULL', 'la reunión alcanzó el máximo de participantes');
  }
  return count;
}

async function authorizeAgent(queryable, meeting, agent, { allowCreate = false } = {}) {
  let participant = await getParticipantByAgent(queryable, meeting.id, agent.id);
  if (participant) {
    if (participant.status === 'left' && allowCreate) {
      const { rows } = await queryable.query(
        "UPDATE meeting_participants SET status = 'pending', left_at = NULL, hand_raised = false, display_name = $1 WHERE id = $2 RETURNING *",
        [agent.name, participant.id]
      );
      return rows[0];
    }
    return participant;
  }

  const isCreator = Number(meeting.created_by_agent_id) === Number(agent.id);
  if (!isCreator && !allowCreate) return null;
  const role = isCreator ? 'host' : 'participant';
  const status = isCreator ? 'admitted' : 'pending';
  const { rows } = await queryable.query(
    `INSERT INTO meeting_participants
       (meeting_id, participant_type, agent_id, display_name, role, status, admitted_at, livekit_identity)
     VALUES ($1, 'agent', $2, $3, $4, $5,
             CASE WHEN $5 = 'admitted' THEN now() ELSE NULL END, $6)
     ON CONFLICT (meeting_id, agent_id) WHERE agent_id IS NOT NULL
     DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [meeting.id, agent.id, agent.name, role, status, `agent-${agent.id}`]
  );
  return rows[0];
}

async function authorizeMeetingActor(queryable, meeting, { agent = null, guestToken = null, pepper, allowAgentCreate = false }) {
  if (agent) {
    const participant = await authorizeAgent(queryable, meeting, agent, { allowCreate: allowAgentCreate });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    return participant;
  }
  const participant = await getParticipantByToken(queryable, meeting.id, guestToken, pepper);
  if (!participant) throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'token de invitado inválido');
  return participant;
}

async function requireHost(queryable, meeting, agent) {
  const participant = await authorizeAgent(queryable, meeting, agent);
  if (!participant || participant.role !== 'host') {
    throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión');
  }
  return participant;
}

async function listParticipants(queryable, meetingId, { statuses = null } = {}) {
  const params = [meetingId];
  let statusFilter = '';
  if (statuses?.length) {
    params.push(statuses);
    statusFilter = ` AND status = ANY($${params.length}::text[])`;
  }
  const { rows } = await queryable.query(
    `SELECT * FROM meeting_participants
      WHERE meeting_id = $1${statusFilter}
      ORDER BY created_at ASC, id ASC`,
    params
  );
  return rows;
}

async function listMessages(queryable, meetingId, { limit = 50, beforeId = null } = {}) {
  const params = [meetingId, limit];
  let before = '';
  if (beforeId) {
    params.push(beforeId);
    before = ` AND mm.id < $${params.length}`;
  }
  const { rows } = await queryable.query(
    `SELECT mm.*, mp.display_name AS author_name
       FROM meeting_messages mm
       JOIN meeting_participants mp ON mp.id = mm.participant_id
      WHERE mm.meeting_id = $1${before}
      ORDER BY mm.id DESC
      LIMIT $2`,
    params
  );
  rows.reverse();
  return rows;
}

async function insertMessage(queryable, meetingId, participantId, body, idempotencyKey) {
  if (idempotencyKey) {
    const { rows } = await queryable.query(
      `INSERT INTO meeting_messages (meeting_id, participant_id, body, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (meeting_id, participant_id, idempotency_key)
       WHERE idempotency_key IS NOT NULL
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING *, (xmax <> 0) AS deduplicated`,
      [meetingId, participantId, body, idempotencyKey]
    );
    return rows[0];
  }
  const { rows } = await queryable.query(
    `INSERT INTO meeting_messages (meeting_id, participant_id, body)
     VALUES ($1, $2, $3) RETURNING *, false AS deduplicated`,
    [meetingId, participantId, body]
  );
  return rows[0];
}

module.exports = {
  MEETING_SELECT,
  assertCapacity,
  authorizeAgent,
  authorizeMeetingActor,
  countCapacityParticipants,
  getMeetingByPublicId,
  getParticipantByAgent,
  getParticipantById,
  getParticipantByLiveKitIdentity,
  getParticipantByToken,
  insertEvent,
  insertMessage,
  listMeetings,
  listMessages,
  listParticipants,
  requireHost,
  requireMeeting,
  requireParticipant,
  withTransaction,
};
