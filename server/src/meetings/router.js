'use strict';

const crypto = require('crypto');
const { asyncRoute, HttpError } = require('./errors');
const { createMeetingAuth } = require('./auth');
const {
  assertCapacity,
  authorizeAgent,
  getMeetingByPublicId,
  getParticipantByAgent,
  getParticipantByToken,
  insertEvent,
  insertMessage,
  listMeetings,
  listMessages,
  listParticipants,
  requireMeeting,
  requireParticipant,
  withTransaction,
} = require('./store');
const {
  buildRecordingObjectKey,
  createLiveKitServices,
  createRoom,
  deleteRoom,
  egressStatusName,
  ensureLiveKit,
  issueJoinToken,
  nanosecondsToSeconds,
  presignRecording,
  receiveWebhook,
  removeParticipant,
  startRoomRecording,
  stopRoomRecording,
} = require('./livekit');
const {
  createGuestToken,
  createPublicId,
  hashOpaqueToken,
  normalizeDisplayName,
  normalizeIdempotencyKey,
  normalizeMessage,
  normalizeTitle,
  parsePositiveInt,
  readBearerToken,
} = require('./security');
const {
  serializeMeeting,
  serializeMessage,
  serializeParticipant,
  serializeRecording,
} = require('./serializers');

function publicMeetingSerializer(row, config) {
  const data = serializeMeeting(row, { appPublicUrl: config.appPublicUrl, includePrivate: false });
  return {
    public_id: data.public_id,
    title: data.title,
    status: data.status,
    locked: data.locked,
    lobby_enabled: data.lobby_enabled,
    max_participants: data.max_participants,
    participant_count: data.participant_count,
    recording_enabled: data.recording_enabled,
    recording_status: data.recording_status,
    host_name: row.created_by_agent_name || null,
  };
}

async function reserveSeat(db, meeting, participant) {
  if (['admitted', 'joined'].includes(participant.status)) return { meeting, participant };
  return withTransaction(db, async (client) => {
    const lockedMeeting = await requireMeeting(client, meeting.public_id, { forUpdate: true });
    const lockedParticipant = await requireParticipant(client, lockedMeeting.id, participant.id, { forUpdate: true });
    if (['ended', 'expired', 'revoked'].includes(lockedMeeting.status)) {
      throw new HttpError(410, 'MEETING_ENDED', 'la reunión finalizó');
    }
    if (['rejected', 'kicked', 'ended'].includes(lockedParticipant.status)) {
      throw new HttpError(403, 'MEETING_DENIED', 'no puedes unirte a esta reunión');
    }
    if (!['admitted', 'joined'].includes(lockedParticipant.status)) {
      await assertCapacity(client, lockedMeeting);
      await client.query(
        "UPDATE meeting_participants SET status = 'admitted', admitted_at = COALESCE(admitted_at, now()), last_seen_at = now() WHERE id = $1",
        [lockedParticipant.id]
      );
      lockedParticipant.status = 'admitted';
      lockedParticipant.admitted_at ||= new Date();
    }
    return { meeting: lockedMeeting, participant: lockedParticipant };
  });
}

async function joinResponse(db, config, services, meeting, participant) {
  const nextStatus = participant.status === 'joined' ? 'joined' : 'admitted';
  await db.query(
    `UPDATE meeting_participants SET status = $1, last_seen_at = now()
     WHERE id = $2`,
    [nextStatus, participant.id]
  );
  participant = { ...participant, status: nextStatus };
  if (config.livekit.enabled && participant.status !== 'rejected' && participant.status !== 'kicked') {
    try { await createRoom(services, config, meeting); } catch { /* la sala puede existir */ }
    const livekitToken = await issueJoinToken(config, meeting, participant);
    return {
      meeting: serializeMeeting(meeting, { appPublicUrl: config.appPublicUrl, includePrivate: false }),
      participant: serializeParticipant(participant),
      livekit_url: config.livekit.url,
      livekit_token: livekitToken,
      role: participant.role,
      participant_id: Number(participant.id),
    };
  }
  return {
    meeting: serializeMeeting(meeting, { appPublicUrl: config.appPublicUrl, includePrivate: false }),
    participant: serializeParticipant(participant),
    livekit_url: null,
    livekit_token: null,
    role: participant.role,
    participant_id: Number(participant.id),
  };
}

function createMeetingRouter({ db, requireAuth, verifyAgentToken, io, config }) {
  requireAuth = requireAuth || (async (req, _res, next) => { next(); });
  const services = createLiveKitServices(config);
  const { authenticate } = createMeetingAuth({ db, requireAuth, verifyAgentToken, config });
  const router = require('express').Router();

  async function authenticateHost(req, res) {
    const auth = await authenticate(req, res, { publicId: req.params.publicId });
    if (!auth.participant || !['host', 'moderator'].includes(auth.participant.role)) {
      throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión o moderador');
    }
    return auth;
  }

  /* ----------------------------- Staff endpoints ----------------------------- */

  router.post('/meetings', requireAuth, asyncRoute(async (req, res) => {
    if (config?.livekit?.enabled) {
      ensureLiveKit(config);
    }
    const title = normalizeTitle(req.body?.title || 'Reunión de Kasupport');
    const lobbyEnabled = req.body?.lobby_enabled !== false;
    const livekitRoomName = `ks-${crypto.randomBytes(6).toString('hex')}`;
    const publicId = createPublicId();
    const startsAt = req.body?.starts_at ? new Date(req.body.starts_at) : new Date();
    const isFuture = req.body?.starts_at && new Date(req.body.starts_at) > new Date();
    const status = isFuture ? 'waiting' : 'active';

    let meeting;
    try {
      const { rows } = await db.query(
        `INSERT INTO meetings (public_id, code, title, livekit_room_name, created_by_agent_id, host_agent_id, status, lobby_enabled, max_participants, starts_at)
         VALUES ($1, $1, $2, $3, $4, $4, $5, $6, $7, $8)
         RETURNING *`,
        [publicId, title, livekitRoomName, req.agent.id, status, lobbyEnabled, config.maxParticipants, startsAt]
      );
      meeting = rows[0];
    } catch {
      const { rows } = await db.query(
        `INSERT INTO meetings (public_id, title, livekit_room_name, created_by_agent_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [publicId, title, livekitRoomName, req.agent.id]
      );
      meeting = rows[0];
    }

    const participant = await authorizeAgent(db, meeting, req.agent);
    try {
      await insertEvent(db, meeting.id, 'meeting.created', { actorParticipantId: participant.id });
    } catch {
      // Ignorar evento si la tabla no esta disponible
    }


    // Invitar participantes adicionales si se especificaron
    if (Array.isArray(req.body?.participant_agent_ids)) {
      for (const agentId of req.body.participant_agent_ids) {
        if (Number(agentId) !== Number(req.agent.id)) {
          await db.query(
            `INSERT INTO meeting_participants (meeting_id, participant_type, agent_id, display_name, role, status, livekit_identity)
             SELECT $1, 'agent', a.id, a.name, 'participant', 'admitted', 'agent_' || a.id
               FROM agents a WHERE a.id = $2
             ON CONFLICT DO NOTHING`,
            [meeting.id, Number(agentId)]
          );
        }
      }
    }

    let payload;
    try {
      payload = await joinResponse(db, config, services, meeting, participant);
    } catch (error) {
      await db.query('DELETE FROM meetings WHERE id = $1', [meeting.id]);
      throw error;
    }
    res.status(201).json(payload);
  }));

  router.get('/meetings/calendar', requireAuth, asyncRoute(async (req, res) => {
    const { rows } = await db.query(
      `SELECT m.id, m.public_id, m.title, m.status, m.starts_at, m.started_at, m.ended_at, m.created_at,
              m.created_by_agent_id, a.name AS host_name, a.avatar AS host_avatar,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', mp.agent_id,
                    'name', mp.display_name,
                    'role', mp.role,
                    'status', mp.status
                  )
                ) FILTER (WHERE mp.id IS NOT NULL), '[]'::json
              ) AS participants
         FROM meetings m
         LEFT JOIN agents a ON a.id = m.created_by_agent_id
         LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
        WHERE m.status IN ('active', 'waiting', 'scheduled') OR m.created_at > (now() - interval '30 days')
        GROUP BY m.id, a.name, a.avatar
        ORDER BY COALESCE(m.starts_at, m.created_at) ASC`
    );
    res.json({ meetings: rows });
  }));

  router.get('/meetings/availability', requireAuth, asyncRoute(async (req, res) => {
    const agentId = Number(req.query.agent_id);
    const dateStr = String(req.query.date || new Date().toISOString().split('T')[0]);

    if (!agentId) return res.status(400).json({ error: 'agent_id es requerido' });

    const { rows } = await db.query(
      `SELECT m.id, m.public_id, m.title, m.status, m.starts_at, m.started_at, m.ended_at, m.created_at
         FROM meetings m
         JOIN meeting_participants mp ON mp.meeting_id = m.id
        WHERE mp.agent_id = $1
          AND m.status IN ('active', 'waiting', 'scheduled')
          AND (DATE(COALESCE(m.starts_at, m.created_at)) = $2::date)
        ORDER BY COALESCE(m.starts_at, m.created_at) ASC`,
      [agentId, dateStr]
    );

    res.json({
      agent_id: agentId,
      date: dateStr,
      is_occupied: rows.some((r) => r.status === 'active'),
      scheduled_count: rows.length,
      meetings: rows,
    });
  }));

  router.get('/meetings', requireAuth, asyncRoute(async (req, res) => {
    const limit = parsePositiveInt(req.query.limit, 50, { max: 100 });
    const rows = await listMeetings(db, req.agent.id, { limit });
    res.json({ meetings: rows.map((row) => serializeMeeting(row, { appPublicUrl: config.appPublicUrl })) });
  }));


  router.post('/meetings/livekit/webhook', asyncRoute(async (req, res) => {
    const event = await receiveWebhook(services, config, String(req.rawBody || ''), req.headers.authorization || '');
    await withTransaction(db, async (client) => {
      const roomName = event.room?.name || event.egressInfo?.roomName;
      if (!roomName) return;
      const meetingRow = await client.query('SELECT id, public_id FROM meetings WHERE livekit_room_name = $1', [roomName]);
      const meeting = meetingRow.rows[0];
      if (!meeting) return;

      const identity = event.participant?.identity;
      let participant = null;
      if (identity) {
        const participantRow = await client.query(
          'SELECT id FROM meeting_participants WHERE meeting_id = $1 AND livekit_identity = $2',
          [meeting.id, identity]
        );
        participant = participantRow.rows[0] || null;
      }

      if (event.event === 'participant_joined' && participant) {
        await client.query("UPDATE meeting_participants SET status = 'joined', joined_at = COALESCE(joined_at, now()), last_seen_at = now() WHERE id = $1", [participant.id]);
      } else if ((event.event === 'participant_left' || event.event === 'participant_connection_aborted') && participant) {
        await client.query("UPDATE meeting_participants SET status = CASE WHEN status = 'kicked' THEN status ELSE 'left' END, left_at = COALESCE(left_at, now()) WHERE id = $1", [participant.id]);
      } else if (event.event === 'room_finished') {
        await client.query("UPDATE meetings SET status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now() WHERE id = $1 AND status != 'ended'", [meeting.id]);
      }

      if (event.egressInfo?.egressId) {
        const info = event.egressInfo;
        const file = info.fileResults?.[0];
        await client.query(
          `UPDATE meeting_recordings SET status = $1,
             storage_key = COALESCE($2, storage_key), size_bytes = COALESCE($3, size_bytes),
             duration_seconds = COALESCE($4, duration_seconds), error = NULLIF($5, ''),
             ended_at = CASE WHEN $1 IN ('complete','failed','aborted') THEN COALESCE(ended_at, now()) ELSE ended_at END,
             updated_at = now()
           WHERE egress_id = $6`,
          [egressStatusName(info.status), file?.filename || null,
           file?.size === undefined ? null : String(file.size),
           file?.duration === undefined ? null : nanosecondsToSeconds(file.duration),
           info.error || null, info.egressId]
        );
      }
      await insertEvent(client, meeting.id, `livekit.${event.event}`, { externalEventId: String(event.id || crypto.randomUUID()) });
    });
    res.json({ ok: true });
  }));

  router.get('/meetings/:publicId', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const participant = await authorizeAgent(db, meeting, req.agent);
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    res.json(serializeMeeting(meeting, { appPublicUrl: config.appPublicUrl }));
  }));

  router.post('/meetings/:publicId/join', asyncRoute(async (req, res) => {
    ensureLiveKit(config);
    const meeting = await requireMeeting(db, req.params.publicId);
    if (['ended', 'expired', 'revoked'].includes(meeting.status)) {
      throw new HttpError(410, 'MEETING_ENDED', 'la reunión finalizó');
    }
    const { meeting: resolved, participant } = await authenticate(req, res, {
      publicId: req.params.publicId,
      allowAgentCreate: true,
    });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    if (participant.status === 'rejected' || participant.status === 'kicked') {
      throw new HttpError(403, 'MEETING_DENIED', 'no puedes unirte a esta reunión');
    }
    if (meeting.locked && participant.role !== 'host' && !['admitted', 'joined'].includes(participant.status)) {
      throw new HttpError(423, 'MEETING_LOCKED', 'la reunión está bloqueada');
    }
    if (participant.status === 'pending') {
      throw new HttpError(403, 'LOBBY_PENDING', 'esperando admisión del anfitrión');
    }
    const reservation = await reserveSeat(db, resolved, participant);
    const payload = await joinResponse(db, config, services, reservation.meeting, reservation.participant);
    res.json(payload);
  }));

  router.patch('/meetings/:publicId', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    if (!participant) throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión');
    const locked = req.body?.locked;
    const title = req.body?.title;
    if (locked !== undefined && typeof locked !== 'boolean') {
      throw new HttpError(400, 'INVALID_LOCKED_VALUE', 'locked debe ser booleano');
    }
    const updates = [];
    const params = [];
    let idx = 1;
    if (typeof locked === 'boolean') { params.push(locked); updates.push(`locked = $${idx++}`); }
    if (title) { params.push(normalizeTitle(title)); updates.push(`title = $${idx++}`); }
    if (!updates.length) return res.json(serializeMeeting(meeting, { appPublicUrl: config.appPublicUrl }));
    params.push(req.params.publicId);
    const { rows } = await db.query(
      `UPDATE meetings SET ${updates.join(', ')}, updated_at = now() WHERE public_id = $${idx} RETURNING *`,
      params
    );
    await insertEvent(db, meeting.id, 'meeting.locked', { actorParticipantId: participant.id, payload: { locked } });
    res.json(serializeMeeting(rows[0], { appPublicUrl: config.appPublicUrl }));
  }));

  router.post('/meetings/:publicId/end', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    if (meeting.status === 'ended') return res.json(serializeMeeting(meeting, { appPublicUrl: config.appPublicUrl }));
    await db.query("UPDATE meetings SET status = 'ended', ended_at = now(), updated_at = now() WHERE id = $1", [meeting.id]);
    await db.query("UPDATE meeting_participants SET status = 'ended', left_at = COALESCE(left_at, now()) WHERE meeting_id = $1 AND status IN ('admitted','joined','pending')", [meeting.id]);
    await insertEvent(db, meeting.id, 'meeting.ended', { actorParticipantId: participant?.id });
    if (config.livekit.enabled) { try { await deleteRoom(services, config, meeting.livekit_room_name); } catch { /* ignora */ } }
    io.to(`meeting:${meeting.id}`).emit('meeting:ended', { public_id: meeting.public_id });
    const updated = await getMeetingByPublicId(db, meeting.public_id);
    res.json(serializeMeeting(updated, { appPublicUrl: config.appPublicUrl }));
  }));

  router.get('/meetings/:publicId/lobby', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    if (!participant) throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión');
    const rows = await listParticipants(db, meeting.id, { statuses: ['pending'] });
    res.json({ lobby: rows.map((row) => serializeParticipant(row, { includePrivate: false })) });
  }));

  router.post('/meetings/:publicId/lobby/:participantId/admit', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant: host } = await authenticateHost(req, res);
    const participant = await requireParticipant(db, meeting.id, req.params.participantId);
    if (participant.status !== 'pending') throw new HttpError(409, 'LOBBY_ALREADY_PROCESSED', 'solicitud ya procesada');
    const reservation = await reserveSeat(db, meeting, participant);
    Object.assign(participant, reservation.participant);
    await insertEvent(db, meeting.id, 'lobby.admitted', { actorParticipantId: host.id });
    const admittedPayload = {
      meeting_id: meeting.id,
      public_id: meeting.public_id,
      participant: serializeParticipant({ ...participant, status: 'admitted', admitted_at: new Date() }, { includePrivate: false }),
    };
    io.to(`meeting-lobby:${meeting.id}`).emit('meeting:lobby_update', admittedPayload);
    io.to(`meeting-lobby:${meeting.id}:participant:${participant.id}`).emit('meeting:lobby_update', admittedPayload);
    res.json({ participant: serializeParticipant({ ...participant, status: 'admitted', admitted_at: new Date() }, { includePrivate: false }) });
  }));

  router.post('/meetings/:publicId/lobby/:participantId/reject', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant: host } = await authenticateHost(req, res);
    const participant = await requireParticipant(db, meeting.id, req.params.participantId);
    if (participant.status !== 'pending') throw new HttpError(409, 'LOBBY_ALREADY_PROCESSED', 'solicitud ya procesada');
    await db.query("UPDATE meeting_participants SET status = 'rejected', rejected_at = now() WHERE id = $1", [participant.id]);
    await insertEvent(db, meeting.id, 'lobby.rejected', { actorParticipantId: host.id });
    const rejectedPayload = {
      meeting_id: meeting.id,
      public_id: meeting.public_id,
      participant: serializeParticipant({ ...participant, status: 'rejected', rejected_at: new Date() }, { includePrivate: false }),
    };
    io.to(`meeting-lobby:${meeting.id}`).emit('meeting:lobby_update', rejectedPayload);
    io.to(`meeting-lobby:${meeting.id}:participant:${participant.id}`).emit('meeting:lobby_update', rejectedPayload);
    res.json({ participant: serializeParticipant({ ...participant, status: 'rejected', rejected_at: new Date() }, { includePrivate: false }) });
  }));

  router.post('/meetings/:publicId/participants/:participantId/kick', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant: host } = await authenticateHost(req, res);
    const participant = await requireParticipant(db, meeting.id, req.params.participantId);
    if (participant.role === 'host') throw new HttpError(409, 'CANNOT_KICK_HOST', 'no se puede expulsar al anfitrión');
    if (participant.status === 'kicked') return res.json({ ok: true });
    await db.query("UPDATE meeting_participants SET status = 'kicked', kicked_at = now(), left_at = now(), guest_token_revoked_at = CASE WHEN participant_type = 'guest' THEN now() ELSE guest_token_revoked_at END WHERE id = $1", [participant.id]);
    await insertEvent(db, meeting.id, 'participant.kicked', { actorParticipantId: host.id });
    if (config.livekit.enabled) { try { await removeParticipant(services, config, meeting.livekit_room_name, participant.livekit_identity); } catch { /* ignora */ } }
    io.to(`meeting:${meeting.id}`).emit('meeting:participant_removed', { public_id: meeting.public_id, participant_id: Number(participant.id) });
    res.json({ ok: true });
  }));

  router.get('/meetings/:publicId/participants', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticate(req, res, { publicId: req.params.publicId });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    const rows = await listParticipants(db, meeting.id, { statuses: ['admitted', 'joined'] });
    res.json({ participants: rows.map((row) => serializeParticipant(row, { includePrivate: false })) });
  }));

  router.get('/meetings/:publicId/messages', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticate(req, res, { publicId: req.params.publicId });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    const limit = parsePositiveInt(req.query.limit, 50, { max: 200 });
    const beforeId = req.query.cursor ? Number(req.query.cursor) || null : null;
    const rows = await listMessages(db, meeting.id, { limit, beforeId });
    res.json({
      messages: rows.map(serializeMessage),
      next_cursor: rows.length === limit ? String(rows[0].id) : null,
    });
  }));

  router.post('/meetings/:publicId/messages', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticate(req, res, { publicId: req.params.publicId });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    if (participant.status !== 'admitted' && participant.status !== 'joined' && participant.role !== 'host') {
      throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    }
    const body = normalizeMessage(req.body?.body);
    const idempotencyKey = normalizeIdempotencyKey(req.body?.client_id || req.body?.idempotency_key);
    const message = await insertMessage(db, meeting.id, participant.id, body, idempotencyKey);
    const serialized = serializeMessage({ ...message, author_name: participant.display_name });
    if (!message.deduplicated) {
      io.to(`meeting:${meeting.id}`).emit('meeting:chat', {
        public_id: meeting.public_id,
        message: serialized,
      });
    }
    res.status(message.deduplicated ? 200 : 201).json({ message: serialized });
  }));

  /* ------------------------------- Recording -------------------------------- */

  router.get('/meetings/:publicId/recording', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    if (!participant) throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión');
    const { rows } = await db.query('SELECT * FROM meeting_recordings WHERE meeting_id = $1 ORDER BY id DESC LIMIT 1', [meeting.id]);
    res.json({ recording: rows[0] ? serializeRecording(rows[0]) : { status: 'idle' } });
  }));

  router.post('/meetings/:publicId/recording/start', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    const active = await db.query("SELECT id FROM meeting_recordings WHERE meeting_id = $1 AND status IN ('starting','recording') LIMIT 1", [meeting.id]);
    if (active.rows[0]) throw new HttpError(409, 'RECORDING_ACTIVE', 'ya hay una grabación activa');
    const objectKey = buildRecordingObjectKey(config, meeting, crypto.randomUUID());
    const egress = await startRoomRecording(services, config, meeting, objectKey);
    const { rows } = await db.query(
      `INSERT INTO meeting_recordings (meeting_id, started_by_agent_id, egress_id, status, storage_key, started_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [meeting.id, req.agent.id, egress.egressId || egress.id, egressStatusName(egress.status) || 'starting', objectKey]
    );
    await insertEvent(db, meeting.id, 'recording.started', { actorParticipantId: participant.id });
    io.to(`meeting:${meeting.id}`).emit('meeting:recording', { public_id: meeting.public_id, status: 'recording' });
    res.json({ recording: serializeRecording(rows[0]) });
  }));

  router.post('/meetings/:publicId/recording/stop', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticateHost(req, res);
    const active = await db.query("SELECT * FROM meeting_recordings WHERE meeting_id = $1 AND status IN ('starting','recording') ORDER BY id DESC LIMIT 1", [meeting.id]);
    if (!active.rows[0]) throw new HttpError(409, 'NO_ACTIVE_RECORDING', 'no hay grabación activa');
    const result = await stopRoomRecording(services, config, active.rows[0].egress_id);
    await db.query("UPDATE meeting_recordings SET status = $1, updated_at = now() WHERE id = $2", [egressStatusName(result?.status) || 'stopping', active.rows[0].id]);
    await insertEvent(db, meeting.id, 'recording.stopped', { actorParticipantId: participant.id });
    io.to(`meeting:${meeting.id}`).emit('meeting:recording', { public_id: meeting.public_id, status: 'stopping' });
    res.json({ recording: serializeRecording({ ...active.rows[0], status: 'stopping' }) });
  }));

  router.get('/meetings/:publicId/recordings', requireAuth, asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const { participant } = await authenticate(req, res, { publicId: req.params.publicId });
    if (!participant) throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    const { rows } = await db.query('SELECT * FROM meeting_recordings WHERE meeting_id = $1 ORDER BY id DESC', [meeting.id]);
    const recordings = [];
    for (const row of rows) {
      const serialized = serializeRecording(row);
      if (row.storage_key && (row.status === 'complete')) {
        try { serialized.download_url = await presignRecording(config, row.storage_key, meeting.title); } catch { /* sin url */ }
      }
      recordings.push(serialized);
    }
    res.json({ recordings });
  }));

  /* ------------------------------ Public routes ------------------------------ */

  router.get('/public/meetings/:publicId', asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    if (meeting.status === 'revoked') throw new HttpError(404, 'MEETING_NOT_FOUND', 'reunión no encontrada');
    res.json(publicMeetingSerializer(meeting, config));
  }));

  router.post('/public/meetings/:publicId/lobby', asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    if (['ended', 'expired', 'revoked'].includes(meeting.status)) {
      throw new HttpError(410, 'MEETING_ENDED', 'la reunión finalizó');
    }
    if (meeting.locked) throw new HttpError(423, 'MEETING_LOCKED', 'la reunión está bloqueada');
    const name = normalizeDisplayName(req.body?.name);
    const token = createGuestToken();
    const digest = hashOpaqueToken(token, config.guestTokenPepper);
    const identity = `guest-${crypto.randomBytes(6).toString('hex')}`;
    const { rows } = await db.query(
      `INSERT INTO meeting_participants
         (meeting_id, participant_type, guest_token_hash, guest_token_expires_at, display_name, role, status, livekit_identity)
       VALUES ($1, 'guest', $2, now() + ($3 * interval '1 minute'), $4, 'participant', 'pending', $5)
       RETURNING *`,
      [meeting.id, digest, config.guestTokenTtlMinutes, name, identity]
    );
    const participant = rows[0];
    await insertEvent(db, meeting.id, 'lobby.requested', { actorParticipantId: participant.id });
    io.to(`meeting-lobby:${meeting.id}`).emit('meeting:lobby_request', {
      public_id: meeting.public_id, participant: serializeParticipant(participant, { includePrivate: false }),
    });
    res.status(201).json({ guest_token: token, participant: serializeParticipant(participant, { includePrivate: false }) });
  }));

  router.get('/public/meetings/:publicId/lobby', asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const token = readBearerToken(req);
    const participant = await getParticipantByToken(db, meeting.id, token, config.guestTokenPepper);
    if (!participant) throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'token de invitado inválido');
    if (participant.status === 'admitted' || participant.status === 'joined') {
      ensureLiveKit(config);
      if (['ended', 'expired', 'revoked'].includes(meeting.status)) {
        throw new HttpError(410, 'MEETING_ENDED', 'la reunión finalizó');
      }
      const tokenJwt = await issueJoinToken(config, meeting, participant);
      return res.json({
        participant: serializeParticipant(participant, { includePrivate: false }),
        livekit_url: config.livekit.url,
        livekit_token: tokenJwt,
      });
    }
    res.json({ participant: serializeParticipant(participant, { includePrivate: false }) });
  }));

  router.get('/public/meetings/:publicId/messages', asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const token = readBearerToken(req);
    const participant = await getParticipantByToken(db, meeting.id, token, config.guestTokenPepper);
    if (!participant || (participant.status !== 'admitted' && participant.status !== 'joined')) {
      throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    }
    const limit = parsePositiveInt(req.query.limit, 50, { max: 200 });
    const beforeId = req.query.cursor ? Number(req.query.cursor) || null : null;
    const rows = await listMessages(db, meeting.id, { limit, beforeId });
    res.json({
      messages: rows.map(serializeMessage),
      next_cursor: rows.length === limit ? String(rows[0].id) : null,
    });
  }));

  router.post('/public/meetings/:publicId/messages', asyncRoute(async (req, res) => {
    const meeting = await requireMeeting(db, req.params.publicId);
    const token = readBearerToken(req);
    const participant = await getParticipantByToken(db, meeting.id, token, config.guestTokenPepper);
    if (!participant || (participant.status !== 'admitted' && participant.status !== 'joined')) {
      throw new HttpError(403, 'MEETING_FORBIDDEN', 'sin acceso a esta reunión');
    }
    const body = normalizeMessage(req.body?.body);
    const idempotencyKey = normalizeIdempotencyKey(req.body?.client_id || req.body?.idempotency_key);
    const message = await insertMessage(db, meeting.id, participant.id, body, idempotencyKey);
    const serialized = serializeMessage({ ...message, author_name: participant.display_name });
    if (!message.deduplicated) {
      io.to(`meeting:${meeting.id}`).emit('meeting:chat', {
        public_id: meeting.public_id,
        message: serialized,
      });
    }
    res.status(message.deduplicated ? 200 : 201).json({ message: serialized });
  }));

  return router;
}

function registerMeetingSocketHandlers(io, { db, config, verifyAgentToken }) {
  const reactionWindow = new Map();

  io.on('connection', (socket) => {
    socket.on('meeting:authenticate', async (payload, ack) => {
      try {
        const publicId = String(payload?.public_id || '');
        const token = String(payload?.token || '');
        const meeting = await requireMeeting(db, publicId);
        let participant = null;
        if (token.startsWith('guest:')) {
          participant = await getParticipantByToken(db, meeting.id, token.slice(6), config.guestTokenPepper);
        } else if (verifyAgentToken) {
          const agent = await verifyAgentToken(token);
          if (agent) participant = await getParticipantByAgent(db, meeting.id, agent.id);
        }
        if (!participant) return ack?.({ error: 'no autenticado' });
        socket.data.meetingId = meeting.id;
        socket.data.meetingPublicId = meeting.public_id;
        socket.data.meetingParticipantId = participant.id;
        socket.data.meetingParticipantName = participant.display_name;
        socket.data.meetingParticipantRole = participant.role;
        if (participant.status === 'admitted' || participant.status === 'joined' || participant.role === 'host') {
          socket.join(`meeting:${meeting.id}`);
          if (participant.role === 'host' || participant.role === 'moderator') {
            socket.join(`meeting-lobby:${meeting.id}`);
          }
        } else if (participant.status === 'pending') {
          socket.join(`meeting-lobby:${meeting.id}:participant:${participant.id}`);
        }
        ack?.({ ok: true, participant_id: Number(participant.id), status: participant.status });
      } catch (error) {
        ack?.({ error: error.message || 'error' });
      }
    });

    socket.on('meeting:reaction', (payload) => {
      if (!socket.data.meetingId) return;
      const allowed = new Set(['👍', '👏', '❤️', '😂', '🎉', '😮']);
      const emoji = String(payload?.emoji || '');
      if (!allowed.has(emoji)) return;
      const now = Date.now();
      const key = `${socket.data.meetingId}:${socket.data.meetingParticipantId}`;
      const recent = (reactionWindow.get(key) || []).filter((time) => now - time < 10_000);
      if (recent.length >= 12) return;
      recent.push(now);
      reactionWindow.set(key, recent);
      io.to(`meeting:${socket.data.meetingId}`).emit('meeting:reaction', {
        id: crypto.randomUUID(),
        public_id: socket.data.meetingPublicId,
        emoji,
        participant_id: Number(socket.data.meetingParticipantId),
        participant_name: socket.data.meetingParticipantName || 'Participante',
        ts: now,
      });
    });

    socket.on('meeting:hand_raise', async (payload) => {
      if (!socket.data.meetingId) return;
      const raised = Boolean(payload?.raised);
      await db.query(
        'UPDATE meeting_participants SET hand_raised = $1 WHERE id = $2 AND meeting_id = $3',
        [raised, socket.data.meetingParticipantId, socket.data.meetingId]
      );
      io.to(`meeting:${socket.data.meetingId}`).emit('meeting:hand_raise', {
        public_id: socket.data.meetingPublicId,
        participant_id: Number(socket.data.meetingParticipantId),
        participant_name: socket.data.meetingParticipantName || 'Participante',
        raised,
      });
    });

    socket.on('disconnect', () => {
      if (socket.data.meetingId && socket.data.meetingParticipantId) {
        reactionWindow.delete(`${socket.data.meetingId}:${socket.data.meetingParticipantId}`);
      }
    });
  });
}

module.exports = { createMeetingRouter, registerMeetingSocketHandlers };
