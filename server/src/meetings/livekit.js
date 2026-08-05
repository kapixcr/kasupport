'use strict';

const {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  RoomServiceClient,
  S3Upload,
  WebhookReceiver,
} = require('livekit-server-sdk');
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { HttpError } = require('./errors');
const { sanitizeFileName } = require('./security');

function ensureLiveKit(config) {
  if (!config?.livekit?.enabled) {
    throw new HttpError(503, 'LIVEKIT_NOT_CONFIGURED', 'servicio de reuniones no configurado');
  }
}

function ensureRecording(config) {
  ensureLiveKit(config);
  if (!config?.recording?.enabled || !config.recording.bucket || !config.recording.region) {
    throw new HttpError(503, 'RECORDING_NOT_CONFIGURED', 'grabación no configurada');
  }
}

function participantPermissions(role) {
  const isHost = role === 'host';
  return {
    roomJoin: true,
    roomAdmin: isHost,
    roomRecord: isHost,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  };
}

function createLiveKitServices(config) {
  if (!config?.livekit?.enabled) {
    return Object.freeze({ room: null, egress: null, webhook: null });
  }
  return Object.freeze({
    room: new RoomServiceClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret),
    egress: new EgressClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret),
    webhook: new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret),
  });
}

async function createRoom(services, config, meeting) {
  ensureLiveKit(config);
  return services.room.createRoom({
    name: meeting.livekit_room_name,
    maxParticipants: Number(meeting.max_participants),
    emptyTimeout: config.livekit.roomEmptyTimeoutSeconds,
    departureTimeout: config.livekit.roomDepartureTimeoutSeconds,
    metadata: JSON.stringify({
      kasupport_meeting_id: Number(meeting.id),
      public_id: meeting.public_id,
    }),
  });
}

async function deleteRoom(services, config, roomName) {
  ensureLiveKit(config);
  try {
    await services.room.deleteRoom(roomName);
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 0);
    if (status !== 404) throw error;
  }
}

async function removeParticipant(services, config, roomName, identity) {
  ensureLiveKit(config);
  try {
    await services.room.removeParticipant(roomName, identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 0);
    if (status !== 404) throw error;
  }
}

async function issueJoinToken(config, meeting, participant) {
  ensureLiveKit(config);
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: participant.livekit_identity,
    name: participant.display_name,
    ttl: config.livekit.tokenTtlSeconds,
    metadata: JSON.stringify({
      kasupport_participant_id: Number(participant.id),
      participant_type: participant.participant_type,
      role: participant.role,
      public_id: meeting.public_id,
    }),
    attributes: {
      'kasupport.participant_id': String(participant.id),
      'kasupport.participant_type': participant.participant_type,
      'kasupport.role': participant.role,
    },
  });
  token.addGrant({
    ...participantPermissions(participant.role),
    room: meeting.livekit_room_name,
  });
  return token.toJwt();
}

function buildS3Upload(config) {
  const recording = config.recording;
  return new S3Upload({
    accessKey: recording.accessKeyId || '',
    secret: recording.secretAccessKey || '',
    sessionToken: recording.sessionToken || '',
    region: recording.region,
    endpoint: recording.endpoint || '',
    bucket: recording.bucket,
    forcePathStyle: !!recording.forcePathStyle,
  });
}

function buildRecordingObjectKey(config, meeting, recordingId) {
  return `${config.recording.prefix}/${meeting.public_id}/${recordingId}-{time}.mp4`;
}

async function startRoomRecording(services, config, meeting, objectKey) {
  ensureRecording(config);
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: objectKey,
    output: { case: 's3', value: buildS3Upload(config) },
  });
  return services.egress.startRoomCompositeEgress(
    meeting.livekit_room_name,
    output,
    { layout: config.recording.layout }
  );
}

async function stopRoomRecording(services, config, egressId) {
  ensureRecording(config);
  return services.egress.stopEgress(egressId);
}

function getS3Client(config) {
  ensureRecording(config);
  const credentials = config.recording.accessKeyId && config.recording.secretAccessKey
    ? {
        accessKeyId: config.recording.accessKeyId,
        secretAccessKey: config.recording.secretAccessKey,
        sessionToken: config.recording.sessionToken || undefined,
      }
    : undefined;
  return new S3Client({
    region: config.recording.region,
    endpoint: config.recording.endpoint || undefined,
    forcePathStyle: !!config.recording.forcePathStyle,
    credentials,
  });
}

async function presignRecording(config, objectKey, title) {
  const client = getS3Client(config);
  const fileName = sanitizeFileName(`${title || 'meeting'}-${objectKey.split('/').pop() || 'recording.mp4'}`);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.recording.bucket,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }),
    { expiresIn: config.recording.presignTtlSeconds }
  );
}

async function receiveWebhook(services, config, body, authorization) {
  ensureLiveKit(config);
  if (typeof body !== 'string' || !body.length) {
    throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'webhook body requerido');
  }
  try {
    return await services.webhook.receive(body, authorization);
  } catch {
    throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'firma de webhook inválida');
  }
}

function egressStatusName(status) {
  const names = {
    [EgressStatus.EGRESS_STARTING]: 'starting',
    [EgressStatus.EGRESS_ACTIVE]: 'recording',
    [EgressStatus.EGRESS_ENDING]: 'stopping',
    [EgressStatus.EGRESS_COMPLETE]: 'complete',
    [EgressStatus.EGRESS_FAILED]: 'failed',
    [EgressStatus.EGRESS_ABORTED]: 'aborted',
    [EgressStatus.EGRESS_LIMIT_REACHED]: 'failed',
  };
  return names[status] || 'unknown';
}

function nanosecondsToSeconds(value) {
  if (value === undefined || value === null) return null;
  try {
    return Number(BigInt(value)) / 1_000_000_000;
  } catch {
    return null;
  }
}

module.exports = {
  buildRecordingObjectKey,
  createLiveKitServices,
  createRoom,
  deleteRoom,
  egressStatusName,
  ensureLiveKit,
  ensureRecording,
  issueJoinToken,
  nanosecondsToSeconds,
  participantPermissions,
  presignRecording,
  receiveWebhook,
  removeParticipant,
  startRoomRecording,
  stopRoomRecording,
};
