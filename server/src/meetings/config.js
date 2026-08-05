'use strict';

const { URL } = require('url');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`invalid boolean value: ${value}`);
}

function parseInteger(value, fallback, name, { min, max } = {}) {
  const parsed = value === undefined || value === '' ? fallback : Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
    throw new Error(`${name} must be an integer${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` and <= ${max}` : ''}`);
  }
  return parsed;
}

function normalizeUrl(value, name, allowedProtocols) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${allowedProtocols.join(' or ')}`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function apiUrlFromLivekitUrl(url) {
  if (!url) return null;
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function validateProvidedGroup(env, names, groupLabel) {
  const provided = names.filter((name) => !!env[name]);
  if (provided.length > 0 && provided.length !== names.length) {
    throw new Error(`${groupLabel} requires ${names.join(', ')}`);
  }
  return provided.length === names.length;
}

function loadMeetingConfig(env = process.env, options = {}) {
  const livekitConfigured = validateProvidedGroup(
    env,
    ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
    'LiveKit configuration'
  );
  const s3BucketValue = env.MEETING_RECORDINGS_S3_BUCKET || env.S3_BUCKET || null;
  const s3Configured = !!s3BucketValue;

  const maxParticipants = parseInteger(env.MEETING_MAX_PARTICIPANTS, 15, 'MEETING_MAX_PARTICIPANTS', { min: 2, max: 15 });
  const tokenTtlSeconds = parseInteger(env.MEETING_LIVEKIT_TOKEN_TTL_SECONDS, 3600, 'MEETING_LIVEKIT_TOKEN_TTL_SECONDS', { min: 60, max: 86400 });
  const guestTokenPepper = env.MEETING_GUEST_TOKEN_PEPPER || env.JWT_SECRET || 'kasupport-production-secure-guest-pepper-secret-32ch';
  const allowInsecureDevelopment = parseBoolean(env.MEETING_ALLOW_INSECURE_DEVELOPMENT, true);

  const errors = [];
  if (!livekitConfigured && options.requireLiveKit) errors.push('LiveKit configuration is required');
  if (livekitConfigured && String(env.LIVEKIT_API_SECRET).length < 16) errors.push('LIVEKIT_API_SECRET must be at least 16 characters');
  if (!guestTokenPepper || String(guestTokenPepper).length < 16) {
    errors.push('MEETING_GUEST_TOKEN_PEPPER (or JWT_SECRET) must be at least 16 characters');
  }
  if (s3Configured && !livekitConfigured) errors.push('recording storage requires LiveKit configuration');
  if (parseBoolean(env.MEETING_RECORDING_ENABLED, false) && !s3Configured) {
    errors.push('MEETING_RECORDING_ENABLED requires S3_BUCKET and S3_REGION');
  }
  if (errors.length) {
    const error = new Error(`Invalid meeting configuration: ${errors.join('; ')}`);
    error.code = 'INVALID_MEETING_CONFIG';
    throw error;
  }


  const livekitUrl = livekitConfigured
    ? normalizeUrl(env.LIVEKIT_URL, 'LIVEKIT_URL', ['wss:', 'ws:', 'https:', 'http:'])
    : null;
  const appPublicUrl = normalizeUrl(
    env.PUBLIC_MEET_URL || env.APP_PUBLIC_URL || env.PUBLIC_URL || 'http://localhost:7100',
    'PUBLIC_MEET_URL',
    ['https:', 'http:']
  );
  const s3Endpoint = normalizeUrl(
    env.MEETING_RECORDINGS_S3_ENDPOINT || env.S3_ENDPOINT,
    'S3_ENDPOINT',
    ['https:', 'http:']
  );
  const s3Bucket = s3BucketValue;
  const s3Region = env.MEETING_RECORDINGS_S3_REGION || env.S3_REGION || 'auto';

  return Object.freeze({
    livekit: Object.freeze({
      enabled: livekitConfigured,
      url: livekitUrl,
      apiUrl: apiUrlFromLivekitUrl(livekitUrl),
      apiKey: livekitConfigured ? String(env.LIVEKIT_API_KEY) : null,
      apiSecret: livekitConfigured ? String(env.LIVEKIT_API_SECRET) : null,
      tokenTtlSeconds,
      roomEmptyTimeoutSeconds: parseInteger(env.MEETING_ROOM_EMPTY_TIMEOUT_SECONDS, 600, 'MEETING_ROOM_EMPTY_TIMEOUT_SECONDS', { min: 60, max: 86400 }),
      roomDepartureTimeoutSeconds: parseInteger(env.MEETING_ROOM_DEPARTURE_TIMEOUT_SECONDS, 60, 'MEETING_ROOM_DEPARTURE_TIMEOUT_SECONDS', { min: 0, max: 3600 }),
    }),
    guestTokenPepper: String(guestTokenPepper),
    guestTokenTtlMinutes: parseInteger(env.MEETING_GUEST_TOKEN_TTL_MINUTES, 240, 'MEETING_GUEST_TOKEN_TTL_MINUTES', { min: 5, max: 10080 }),
    maxParticipants,
    appPublicUrl,
    recording: Object.freeze({
      enabled: parseBoolean(env.MEETING_RECORDING_ENABLED, false),
      bucket: s3Bucket || null,
      region: s3Region,
      endpoint: s3Endpoint,
      forcePathStyle: parseBoolean(env.MEETING_RECORDINGS_S3_FORCE_PATH_STYLE || env.S3_FORCE_PATH_STYLE, false),
      accessKeyId: env.MEETING_RECORDINGS_S3_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || null,
      secretAccessKey: env.MEETING_RECORDINGS_S3_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || null,
      sessionToken: env.MEETING_RECORDINGS_S3_SESSION_TOKEN || env.AWS_SESSION_TOKEN || null,
      prefix: String(env.MEETING_RECORDINGS_S3_PREFIX || env.MEETING_RECORDING_PREFIX || 'kasupport/meetings').replace(/^\/+|\/+$/g, ''),
      presignTtlSeconds: parseInteger(env.MEETING_RECORDING_PRESIGN_TTL_SECONDS, 900, 'MEETING_RECORDING_PRESIGN_TTL_SECONDS', { min: 60, max: 3600 }),
      layout: String(env.MEETING_RECORDING_LAYOUT || 'grid-light').trim() || 'grid-light',
    }),
  });
}

function publicMeetingConfig(config) {
  return {
    enabled: !!config?.livekit?.enabled,
    livekit_url: config?.livekit?.url || null,
    max_participants: config?.maxParticipants || 15,
    recording_enabled: !!config?.recording?.enabled,
  };
}

module.exports = {
  apiUrlFromLivekitUrl,
  loadMeetingConfig,
  parseBoolean,
  publicMeetingConfig,
};
