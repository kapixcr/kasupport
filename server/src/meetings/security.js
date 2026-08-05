'use strict';

const crypto = require('crypto');
const { HttpError } = require('./errors');

const PUBLIC_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomString(length, alphabet = PUBLIC_ID_ALPHABET) {
  if (!Number.isInteger(length) || length < 1) throw new TypeError('length must be a positive integer');
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return output;
}

function createPublicId() {
  return `${randomString(4)}-${randomString(4)}-${randomString(4)}`;
}

function createGuestToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashOpaqueToken(token, pepper) {
  if (typeof token !== 'string' || !token) throw new TypeError('token is required');
  if (typeof pepper !== 'string' || pepper.length < 16) throw new TypeError('token pepper is invalid');
  return crypto.createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}

function safeEqualString(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readBearerToken(req) {
  const header = String(req?.headers?.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function normalizePublicId(value) {
  const publicId = String(value || '').trim();
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{4}){2}$/.test(publicId)) {
    throw new HttpError(404, 'MEETING_NOT_FOUND', 'reunión no encontrada');
  }
  return publicId;
}

function normalizeDisplayName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new HttpError(400, 'NAME_REQUIRED', 'name requerido');
  if (name.length > 80) throw new HttpError(400, 'NAME_TOO_LONG', 'name supera 80 caracteres');
  return name;
}

function normalizeTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title) throw new HttpError(400, 'TITLE_REQUIRED', 'title requerido');
  if (title.length > 160) throw new HttpError(400, 'TITLE_TOO_LONG', 'title supera 160 caracteres');
  return title;
}

function normalizeMessage(value) {
  const body = String(value || '').trim();
  if (!body) throw new HttpError(400, 'MESSAGE_REQUIRED', 'body requerido');
  if (body.length > 4000) throw new HttpError(400, 'MESSAGE_TOO_LONG', 'body supera 4000 caracteres');
  return body;
}

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === '') return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotency_key inválido');
  }
  return key;
}

function normalizeReaction(value) {
  const reaction = String(value || '').trim();
  if (!reaction) throw new HttpError(400, 'REACTION_REQUIRED', 'reaction requerido');
  if (Array.from(reaction).length > 8 || reaction.length > 32) {
    throw new HttpError(400, 'INVALID_REACTION', 'reaction inválida');
  }
  return reaction;
}

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, 'INVALID_PAGINATION', 'parámetro de paginación inválido');
  }
  return parsed;
}

function sanitizeFileName(value) {
  const name = String(value || 'recording.mp4')
    .replace(/[\r\n"]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '-')
    .trim();
  return (name || 'recording.mp4').slice(0, 180);
}

module.exports = {
  createGuestToken,
  createPublicId,
  hashOpaqueToken,
  normalizeDisplayName,
  normalizeIdempotencyKey,
  normalizeMessage,
  normalizePublicId,
  normalizeReaction,
  normalizeTitle,
  parsePositiveInt,
  readBearerToken,
  safeEqualString,
  sanitizeFileName,
};
