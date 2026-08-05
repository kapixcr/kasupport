/**
 * Kasupport Server — Slack-like + widget de soporte embebible
 * Express + Socket.IO + PostgreSQL + Auth (JWT)
 */
const path = require('path');
const express = require('express');
require('express-async-errors');
const cors = require('cors');

const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('./db');
const { loadMeetingConfig } = require('./meetings/config');
const { createMeetingRouter, registerMeetingSocketHandlers } = require('./meetings/router');

const PORT = process.env.PORT || 4100;
const JWT_SECRET = process.env.JWT_SECRET || 'kasupport-production-secure-default-jwt-secret-key-32ch';
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const meetingConfig = loadMeetingConfig(process.env, { requireLiveKit: false });

const allowOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(null, true);
};


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowOrigin, credentials: true },
  maxHttpBufferSize: 1e6,
});

app.use(cors({ origin: allowOrigin, credentials: true }));
app.use(express.json({
  limit: '25mb',
  verify: (req, _res, buffer) => { req.rawBody = buffer; },
})); // 25mb para subidas en base64 y body original para webhooks firmados
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/healthcheck', (_req, res) => {
  res.json({ status: 'ok', version: '2026-08-04-v2-meetings-fix', time: new Date().toISOString() });
});


/* ---------------------------------- helpers ---------------------------------- */

const REACTIONS_SQL = `COALESCE((
    SELECT json_agg(json_build_object('emoji', e.emoji, 'count', e.count, 'agent_ids', e.agent_ids))
    FROM (
      SELECT r.emoji, COUNT(*)::int AS count, json_agg(r.agent_id) AS agent_ids
      FROM reactions r WHERE r.message_id = m.id GROUP BY r.emoji
    ) e
  ), '[]'::json)`;

const AUTHOR_AVATAR_SQL = `(SELECT a.avatar FROM agents a WHERE a.id = m.author_id AND m.author_type = 'agent') AS author_avatar`;

async function getChannelMessages(channelId, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const { rows } = await db.query(
    `SELECT recent.* FROM (
       SELECT m.id, m.channel_id, m.conversation_id, m.author_type, m.author_id, m.author_name,
              m.body, m.kind, m.parent_id, m.created_at, ${AUTHOR_AVATAR_SQL},
              (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) AS reply_count,
              ${REACTIONS_SQL} AS reactions
         FROM messages m
        WHERE m.channel_id = $1 AND m.parent_id IS NULL
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2
     ) recent
     ORDER BY recent.created_at ASC, recent.id ASC`,
    [channelId, safeLimit]
  );
  return rows;
}

async function insertMessage({ channelId, conversationId = null, authorType, authorId = null, authorName, body, kind = 'text', parentId = null }) {
  const { rows } = await db.query(
    `INSERT INTO messages (channel_id, conversation_id, author_type, author_id, author_name, body, kind, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [channelId, conversationId, authorType, authorId, authorName, body, kind, parentId]
  );
  return rows[0];
}

async function broadcastMessage(message) {
  // Adjuntar avatar del autor para que el tiempo real lo muestre sin recargar.
  if (message.author_type === 'agent' && message.author_id) {
    try {
      const { rows } = await db.query('SELECT avatar FROM agents WHERE id = $1', [message.author_id]);
      message.author_avatar = rows[0]?.avatar || null;
    } catch { /* sin avatar */ }
  }
  // Agentes e invitados solo reciben mensajes de las salas autorizadas a las que se unieron.
  io.to(`channel:${message.channel_id}`).emit('message:new', message);
}

const parseTheme = (t) => {
  if (!t) return null;
  if (typeof t === 'object') return t;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

const publicAgent = (a) => ({
  id: a.id, name: a.name, email: a.email, color: a.color, role: a.role, avatar: a.avatar || null,
  status_emoji: a.status_emoji || null,
  status_text: a.status_text || null,
  theme: parseTheme(a.theme),
  dark_mode: !!a.dark_mode,
  bg_image: a.bg_image || null,
  notif_enabled: !!a.notif_enabled,
  notif_sound: !!a.notif_sound,
});


/* ------------------------------- autenticación -------------------------------- */

function signToken(agent) {
  return jwt.sign({ id: agent.id, role: agent.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function verifyAgentToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query('SELECT * FROM agents WHERE id = $1', [payload.id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const agent = await verifyAgentToken(token);
  if (!agent) return res.status(401).json({ error: 'token inválido, expirado o ausente' });
  req.agent = agent;
  next();
}

function requireAdmin(req, res, next) {
  if (req.agent.role !== 'admin') return res.status(403).json({ error: 'requiere rol admin' });
  next();
}

async function agentCanAccessChannel(agent, channelId) {
  const { rows } = await db.query(
    `SELECT c.id, c.type, c.is_private,
            EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.agent_id = $2) AS is_member
       FROM channels c
      WHERE c.id = $1 AND (c.archived = false OR c.archived IS NULL)`,
    [channelId, agent.id]
  );
  const channel = rows[0];
  if (!channel) return false;
  if (channel.type === 'support') return true;
  if (channel.type === 'dm') return !!channel.is_member;
  return !channel.is_private || agent.role === 'admin' || !!channel.is_member;
}

async function requireChannelAccess(req, res, next) {
  const channelId = req.params.id || req.params.channelId;
  if (!(await agentCanAccessChannel(req.agent, channelId))) {
    return res.status(403).json({ error: 'sin acceso a este canal' });
  }
  next();
}

app.post('/api/auth/register', async (req, res) => {
  if (isProduction && process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
    return res.status(403).json({ error: 'registro público deshabilitado' });
  }
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'name, email y password requeridos' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'password mínimo 6 caracteres' });

  const exists = await db.query('SELECT 1 FROM agents WHERE email = $1', [email.trim().toLowerCase()]);
  if (exists.rows.length) return res.status(409).json({ error: 'ese email ya está registrado' });

  // El primer agente registrado con password se vuelve admin
  const count = await db.query("SELECT COUNT(*) FROM agents WHERE password_hash IS NOT NULL");
  const role = Number(count.rows[0].count) === 0 ? 'admin' : 'agent';

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO agents (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name.trim(), email.trim().toLowerCase(), hash, role]
  );
  res.status(201).json({ token: signToken(rows[0]), agent: publicAgent(rows[0]) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  const { rows } = await db.query('SELECT * FROM agents WHERE email = $1', [email.trim().toLowerCase()]);
  const agent = rows[0];
  if (!agent || !agent.password_hash || !(await bcrypt.compare(password, agent.password_hash))) {
    return res.status(401).json({ error: 'credenciales incorrectas' });
  }
  res.json({ token: signToken(agent), agent: publicAgent(agent) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicAgent(req.agent)));

app.get('/api/agents', requireAuth, async (_req, res) => {
  const { rows } = await db.query('SELECT id, name, email, color, role, avatar, status_emoji, status_text, created_at FROM agents ORDER BY id');
  res.json(rows);
});

// Cambiar foto de perfil, nombre o tema de colores personal
app.patch('/api/agents/me', requireAuth, async (req, res) => {
  const { avatar, name, theme, dark_mode, bg_image, notif_enabled, notif_sound, status_emoji, status_text } = req.body || {};
  if (avatar && String(avatar).length > 550_000) {
    return res.status(413).json({ error: 'imagen demasiado grande' });
  }
  if (bg_image && String(bg_image).length > 3_500_000) {
    return res.status(413).json({ error: 'fondo demasiado grande (máx ~2.5 MB)' });
  }
  if (status_text !== undefined && status_text !== null && String(status_text).length > 100) {
    return res.status(400).json({ error: 'estado demasiado largo (máx 100 caracteres)' });
  }
  let themeJson = null;
  if (theme !== undefined) {
    if (theme === null) {
      themeJson = null; // reset
    } else {
      const valid = typeof theme === 'object' && !Array.isArray(theme) &&
        Object.entries(theme).every(([k, v]) =>
          ['sidebar', 'accent', 'bubble'].includes(k)
            ? typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)
            : k === 'glow'
              ? v === null || (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v))
              : false);
      if (!valid) return res.status(400).json({ error: 'theme inválido (colores hex: sidebar, accent, bubble, glow)' });
      themeJson = JSON.stringify(theme);
    }
  }
  const { rows } = await db.query(
    `UPDATE agents SET
       avatar = COALESCE($1, avatar),
       name = COALESCE($2, name),
       theme = CASE WHEN $4 THEN $3 ELSE theme END,
       dark_mode = COALESCE($6, dark_mode),
       bg_image = CASE WHEN $7 THEN $8 ELSE bg_image END,
       notif_enabled = COALESCE($9, notif_enabled),
       notif_sound = COALESCE($10, notif_sound),
       status_emoji = CASE WHEN $11 THEN $12 ELSE status_emoji END,
       status_text = CASE WHEN $11 THEN $13 ELSE status_text END
     WHERE id = $5 RETURNING *`,
    [avatar ?? null, name?.trim() || null, themeJson, theme !== undefined, req.agent.id,
     typeof dark_mode === 'boolean' ? dark_mode : null,
     bg_image !== undefined, bg_image ?? null,
     typeof notif_enabled === 'boolean' ? notif_enabled : null,
     typeof notif_sound === 'boolean' ? notif_sound : null,
     status_emoji !== undefined || status_text !== undefined,
     status_emoji ?? null, status_text?.trim() || null]
  );
  const agent = publicAgent(rows[0]);
  io.to('agents').emit('agent:update', agent);
  res.json(agent);
});

app.patch('/api/agents/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'agent'].includes(role)) return res.status(400).json({ error: 'rol inválido' });
  const { rows } = await db.query(
    'UPDATE agents SET role = $1 WHERE id = $2 RETURNING id, name, email, color, role',
    [role, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'agente no encontrado' });
  if (role === 'admin') io.in(`agent:${rows[0].id}`).socketsJoin('admins');
  else io.in(`agent:${rows[0].id}`).socketsLeave('admins');
  res.json(rows[0]);
});

app.patch('/api/agents/:id/password', requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  const isSelf = req.agent.id === targetId;
  const isAdmin = req.agent.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'requiere rol admin para cambiar contraseñas de otros usuarios' });
  }

  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'la contraseña debe tener al menos 6 caracteres' });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    'UPDATE agents SET password_hash = $1 WHERE id = $2 RETURNING id, name, email',
    [hash, targetId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'agente no encontrado' });
  res.json({ ok: true, agent: rows[0] });
});


/* ----------------------------------- salud ----------------------------------- */

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, service: 'kasupport', database: 'up' });
  } catch {
    res.status(503).json({ ok: false, service: 'kasupport', database: 'down' });
  }
});

/* -------------------------------- reuniones ---------------------------------- */

app.use('/api', createMeetingRouter({
  db,
  requireAuth,
  verifyAgentToken,
  io,
  config: meetingConfig,
}));

/* ------------------------- departamentos (público GET) ------------------------ */

app.get('/api/departments', async (_req, res) => {
  const { rows } = await db.query('SELECT id, name, slug FROM departments ORDER BY id');
  res.json(rows);
});

app.post('/api/departments', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name requerido' });
  const slug = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  const { rows } = await db.query(
    'INSERT INTO departments (name, slug) VALUES ($1, $2) RETURNING *',
    [name.trim(), slug]
  );
  io.to('agents').emit('department:new', rows[0]);
  res.status(201).json(rows[0]);
});

app.patch('/api/departments/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name requerido' });
  const { rows } = await db.query(
    'UPDATE departments SET name = $1 WHERE id = $2 RETURNING *',
    [name.trim(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'departamento no existe' });
  io.to('agents').emit('department:update', rows[0]);
  res.json(rows[0]);
});

app.delete('/api/departments/:id', requireAuth, requireAdmin, async (req, res) => {
  const inUse = await db.query('SELECT COUNT(*) FROM conversations WHERE department_id = $1', [req.params.id]);
  if (Number(inUse.rows[0].count) > 0) {
    return res.status(409).json({ error: 'tiene conversaciones; no se puede eliminar' });
  }
  await db.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
  io.to('agents').emit('department:delete', { id: Number(req.params.id) });
  res.json({ ok: true });
});

/* ---------------------------------- canales ----------------------------------- */

app.get('/api/channels', requireAuth, async (req, res) => {
  const isAdmin = req.agent.role === 'admin';
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.type, c.department_id, c.is_private, c.post_policy,
            d.name AS department_name,
            EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.agent_id = $1) AS is_member
       FROM channels c LEFT JOIN departments d ON d.id = c.department_id
      WHERE c.type = 'channel' AND (c.archived = false OR c.archived IS NULL)
        AND (c.is_private = false OR $2::boolean OR
             EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.agent_id = $1))
      ORDER BY c.type, c.name`,
    [req.agent.id, isAdmin]
  );
  res.json(rows);
});

app.post('/api/channels', requireAuth, async (req, res) => {
  const { name, is_private = false, post_policy = 'all' } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });
  if (!['all', 'admin'].includes(post_policy)) return res.status(400).json({ error: 'post_policy inválido' });
  if (is_private && req.agent.role !== 'admin') return res.status(403).json({ error: 'solo admin crea canales privados' });

  const { rows } = await db.query(
    `INSERT INTO channels (name, type, is_private, post_policy, archived) VALUES ($1, 'channel', $2, $3, false) RETURNING *`,
    [name.trim().toLowerCase().replace(/\s+/g, '-'), !!is_private, post_policy]
  );

  const channel = rows[0];
  if (channel.is_private) {
    await db.query('INSERT INTO channel_members (channel_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [channel.id, req.agent.id]);
    io.in(`agent:${req.agent.id}`).socketsJoin(`channel:${channel.id}`);
  } else {
    io.in('agents').socketsJoin(`channel:${channel.id}`);
  }
  io.to('agents').emit('channel:new', channel);
  res.status(201).json(channel);
});

/* ------------------------------ mensajes directos ------------------------------ */

// Lista los DMs del agente con los datos del otro participante
app.get('/api/dms', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.type, c.created_at,
            a.id AS other_id, a.name AS other_name, a.avatar AS other_avatar,
            a.status_emoji AS other_status_emoji, a.status_text AS other_status_text
       FROM channels c
       JOIN channel_members me ON me.channel_id = c.id AND me.agent_id = $1
       JOIN channel_members om ON om.channel_id = c.id AND om.agent_id != $1
       JOIN agents a ON a.id = om.agent_id
      WHERE c.type = 'dm' AND c.archived = false
      ORDER BY c.id DESC`,
    [req.agent.id]
  );
  res.json(rows);
});

// Crea (o reutiliza) el DM entre el agente actual y otro
app.post('/api/dms', requireAuth, async (req, res) => {
  const otherId = Number(req.body?.agentId);
  if (!otherId) return res.status(400).json({ error: 'agentId requerido' });
  if (otherId === req.agent.id) return res.status(400).json({ error: 'no puedes crear DM contigo mismo' });
  const other = await db.query('SELECT id FROM agents WHERE id = $1', [otherId]);
  if (!other.rows[0]) return res.status(404).json({ error: 'agente no existe' });

  let channelId;
  const existing = await db.query(
    `SELECT c.id FROM channels c
      WHERE c.type = 'dm'
        AND EXISTS(SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.agent_id = $1)
        AND EXISTS(SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.agent_id = $2)
      LIMIT 1`,
    [req.agent.id, otherId]
  );
  if (existing.rows[0]) {
    channelId = existing.rows[0].id;
  } else {
    const [a, b] = [req.agent.id, otherId].sort((x, y) => x - y);
    const { rows } = await db.query(
      `INSERT INTO channels (name, type, is_private, post_policy) VALUES ($1, 'dm', true, 'all') RETURNING id`,
      [`dm-${a}-${b}`]
    );
    channelId = rows[0].id;
    await db.query(
      `INSERT INTO channel_members (channel_id, agent_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
      [channelId, a, b]
    );
    io.in(`agent:${a}`).socketsJoin(`channel:${channelId}`);
    io.in(`agent:${b}`).socketsJoin(`channel:${channelId}`);
    // Avisar a ambos para que recarguen sus DMs
    io.to('agents').emit('dm:new', { member_ids: [a, b] });
  }
  res.status(201).json({ channel_id: channelId });
});

app.patch('/api/channels/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, is_private, post_policy } = req.body || {};
  if (post_policy && !['all', 'admin'].includes(post_policy)) {
    return res.status(400).json({ error: 'post_policy inválido' });
  }
  const before = await db.query('SELECT is_private FROM channels WHERE id = $1', [req.params.id]);
  const { rows } = await db.query(
    `UPDATE channels SET
       name = COALESCE($1, name),
       is_private = COALESCE($2, is_private),
       post_policy = COALESCE($3, post_policy)
     WHERE id = $4 AND type != 'support' RETURNING *`,
    [name ? name.trim().toLowerCase().replace(/\s+/g, '-') : null,
     typeof is_private === 'boolean' ? is_private : null,
     post_policy || null,
     req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'canal no existe' });
  if (before.rows[0] && before.rows[0].is_private !== rows[0].is_private) {
    if (rows[0].is_private) {
      const members = await db.query('SELECT agent_id FROM channel_members WHERE channel_id = $1', [rows[0].id]);
      io.in('agents').socketsLeave(`channel:${rows[0].id}`);
      members.rows.forEach((member) => io.in(`agent:${member.agent_id}`).socketsJoin(`channel:${rows[0].id}`));
    } else {
      io.in('agents').socketsJoin(`channel:${rows[0].id}`);
    }
  }
  io.to('agents').emit('channel:update', rows[0]);
  res.json(rows[0]);
});

// Miembros de canales privados
app.get('/api/channels/:id/members', requireAuth, requireChannelAccess, async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id, a.name, a.email, a.role, a.avatar
       FROM channel_members cm JOIN agents a ON a.id = cm.agent_id
      WHERE cm.channel_id = $1 ORDER BY a.name`,
    [req.params.id]
  );
  res.json(rows);
});

app.post('/api/channels/:id/members', requireAuth, requireAdmin, async (req, res) => {
  const { agentId } = req.body || {};
  if (!agentId) return res.status(400).json({ error: 'agentId requerido' });
  await db.query('INSERT INTO channel_members (channel_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, agentId]);
  io.in(`agent:${Number(agentId)}`).socketsJoin(`channel:${Number(req.params.id)}`);
  io.to('agents').emit('channel:update', { id: Number(req.params.id) });
  res.status(201).json({ ok: true });
});

app.delete('/api/channels/:id/members/:agentId', requireAuth, requireAdmin, async (req, res) => {
  await db.query('DELETE FROM channel_members WHERE channel_id = $1 AND agent_id = $2',
    [req.params.id, req.params.agentId]);
  io.in(`agent:${Number(req.params.agentId)}`).socketsLeave(`channel:${Number(req.params.id)}`);
  io.to('agents').emit('channel:update', { id: Number(req.params.id) });
  res.json({ ok: true });
});


app.delete('/api/channels/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `UPDATE channels SET archived = true WHERE id = $1 AND type != 'support' RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'canal no existe' });
  io.to('agents').emit('channel:delete', { id: Number(req.params.id) });
  res.json({ ok: true });
});

app.get('/api/channels/:id/messages', requireAuth, requireChannelAccess, async (req, res) => {
  res.json(await getChannelMessages(req.params.id));
});

/* --------------------------- búsqueda global de mensajes --------------------------- */

app.get('/api/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  // Escapar comodines de ILIKE
  const pattern = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const isAdmin = req.agent.role === 'admin';
  const { rows } = await db.query(
    `SELECT m.id, m.channel_id, m.conversation_id, m.author_type, m.author_name,
            m.body, m.kind, m.parent_id, m.created_at,
            c.name AS channel_name, c.type AS channel_type,
            v.name AS visitor_name,
            (SELECT a.name FROM channel_members om JOIN agents a ON a.id = om.agent_id
              WHERE om.channel_id = c.id AND om.agent_id != $1 LIMIT 1) AS dm_other_name
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       LEFT JOIN conversations cv ON cv.id = m.conversation_id
       LEFT JOIN visitors v ON v.id = cv.visitor_id
      WHERE m.body ILIKE $2 ESCAPE '\\'
        AND c.archived = false
        AND (c.is_private = false OR $3::boolean OR
             EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.agent_id = $1))
      ORDER BY m.created_at DESC
      LIMIT 50`,
    [req.agent.id, pattern, isAdmin]
  );
  res.json(rows);
});

app.post('/api/channels/:id/messages', requireAuth, async (req, res) => {
  const { body, kind = 'text', parent_id } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'body requerido' });
  if (!['text', 'sticker', 'image', 'file'].includes(kind)) return res.status(400).json({ error: 'kind inválido' });

  // Si es respuesta en hilo, el padre debe existir en el mismo canal
  if (parent_id) {
    const parent = await db.query('SELECT id FROM messages WHERE id = $1 AND channel_id = $2',
      [parent_id, req.params.id]);
    if (!parent.rows[0]) return res.status(404).json({ error: 'mensaje padre no existe' });
  }

  // Reglas del canal: privado (solo miembros) y solo-admin escriben
  const ch = await db.query(
    `SELECT type, is_private, post_policy FROM channels WHERE id = $1`,
    [req.params.id]
  );
  const channel = ch.rows[0];
  if (!channel) return res.status(404).json({ error: 'canal no existe' });
  if (channel.type !== 'support') {
    if (channel.post_policy === 'admin' && req.agent.role !== 'admin') {
      return res.status(403).json({ error: 'solo los administradores pueden escribir aquí' });
    }
    if (channel.is_private && req.agent.role !== 'admin') {
      const member = await db.query(
        'SELECT 1 FROM channel_members WHERE channel_id = $1 AND agent_id = $2',
        [req.params.id, req.agent.id]
      );
      if (!member.rows.length) return res.status(403).json({ error: 'canal privado: no eres miembro' });
    }
  }

  const conv = await db.query(
    'SELECT id FROM conversations WHERE channel_id = $1 ORDER BY id DESC LIMIT 1',
    [req.params.id]
  );
  const message = await insertMessage({
    channelId: req.params.id,
    conversationId: conv.rows[0]?.id || null,
    authorType: 'agent',
    authorId: req.agent.id,
    authorName: req.agent.name,
    body: String(body).trim(),
    kind,
    parentId: parent_id || null,
  });
  broadcastMessage(message);
  res.status(201).json(message);
});

// Hilo: padre + respuestas
app.get('/api/messages/:id/replies', requireAuth, async (req, res) => {
  const access = await db.query('SELECT channel_id FROM messages WHERE id = $1', [req.params.id]);
  if (!access.rows[0]) return res.status(404).json({ error: 'mensaje no existe' });
  if (!(await agentCanAccessChannel(req.agent, access.rows[0].channel_id))) {
    return res.status(403).json({ error: 'sin acceso a este canal' });
  }
  const parent = await db.query(
    `SELECT m.id, m.channel_id, m.conversation_id, m.author_type, m.author_name, m.body, m.kind,
            m.parent_id, m.created_at, ${AUTHOR_AVATAR_SQL}, ${REACTIONS_SQL} AS reactions
       FROM messages m WHERE m.id = $1`,
    [req.params.id]
  );
  if (!parent.rows[0]) return res.status(404).json({ error: 'mensaje no existe' });
  const { rows } = await db.query(
    `SELECT m.id, m.channel_id, m.conversation_id, m.author_type, m.author_name, m.body, m.kind,
            m.parent_id, m.created_at, ${AUTHOR_AVATAR_SQL}, ${REACTIONS_SQL} AS reactions
       FROM messages m WHERE m.parent_id = $1 ORDER BY m.created_at ASC`,
    [req.params.id]
  );
  res.json({ parent: parent.rows[0], replies: rows });
});

// Reacciones: toggle (si ya la tienes, se quita; si no, se agrega)
app.post('/api/messages/:id/reactions', requireAuth, async (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
    return res.status(400).json({ error: 'emoji requerido' });
  }
  const msg = await db.query('SELECT id, channel_id FROM messages WHERE id = $1', [req.params.id]);
  if (!msg.rows[0]) return res.status(404).json({ error: 'mensaje no existe' });
  if (!(await agentCanAccessChannel(req.agent, msg.rows[0].channel_id))) {
    return res.status(403).json({ error: 'sin acceso a este canal' });
  }

  const existing = await db.query(
    'SELECT id FROM reactions WHERE message_id = $1 AND agent_id = $2 AND emoji = $3',
    [req.params.id, req.agent.id, emoji]
  );
  if (existing.rows[0]) {
    await db.query('DELETE FROM reactions WHERE id = $1', [existing.rows[0].id]);
  } else {
    await db.query(
      'INSERT INTO reactions (message_id, agent_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.params.id, req.agent.id, emoji]
    );
    // Avisar al autor del mensaje (solo si es otro agente)
    const author = await db.query(
      'SELECT author_type, author_id FROM messages WHERE id = $1',
      [req.params.id]
    );
    const am = author.rows[0];
    if (am && am.author_type === 'agent' && am.author_id && am.author_id !== req.agent.id) {
      io.to(`agent:${am.author_id}`).emit('reaction:added', {
        message_id: Number(req.params.id),
        channel_id: msg.rows[0].channel_id,
        emoji,
        reactor_id: req.agent.id,
        reactor_name: req.agent.name,
        author_id: am.author_id,
      });
    }
  }

  const agg = await db.query(
    `SELECT m.id, ${REACTIONS_SQL} AS reactions FROM messages m WHERE m.id = $1`,
    [req.params.id]
  );
  const payload = {
    message_id: Number(req.params.id),
    channel_id: msg.rows[0].channel_id,
    reactions: agg.rows[0].reactions,
  };
  io.to(`channel:${payload.channel_id}`).emit('reaction:update', payload);
  res.json(payload);
});

/* ----------------------------- inbox de soporte ------------------------------- */

app.get('/api/conversations', requireAuth, async (_req, res) => {
  const { rows } = await db.query(
    `SELECT cv.id, cv.status, cv.created_at, cv.channel_id,
            v.name AS visitor_name, v.email AS visitor_email, v.phone AS visitor_phone,
            d.name AS department_name, d.id AS department_id,
            (SELECT COUNT(*) FROM messages m WHERE m.channel_id = cv.channel_id) AS message_count,
            (SELECT body FROM messages m WHERE m.channel_id = cv.channel_id
              ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations cv
       JOIN visitors v   ON v.id = cv.visitor_id
       LEFT JOIN departments d ON d.id = cv.department_id
      ORDER BY cv.created_at DESC`
  );
  res.json(rows);
});

app.patch('/api/conversations/:id', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'pending', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status inválido' });
  }
  const { rows } = await db.query(
    'UPDATE conversations SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  io.to('agents').emit('conversation:update', rows[0]);
  res.json(rows[0]);
});

/* ------------------------------ widget de soporte ----------------------------- */
/* Estas rutas son PÚBLICAS: las usa el visitante desde la página del cliente.  */

app.post('/api/widget/session', async (req, res) => {
  const { name, email, phone, departmentId } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });
  if (!departmentId) return res.status(400).json({ error: 'departmentId requerido' });

  const dept = await db.query('SELECT id, name FROM departments WHERE id = $1', [departmentId]);
  if (!dept.rows[0]) return res.status(404).json({ error: 'departamento no existe' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const visitor = (
      await client.query(
        'INSERT INTO visitors (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
        [name.trim(), email || null, phone || null]
      )
    ).rows[0];

    const channel = (
      await client.query(
        `INSERT INTO channels (name, type, department_id) VALUES ($1, 'support', $2) RETURNING *`,
        [`soporte-${visitor.id}-${dept.rows[0].name}`, departmentId]
      )
    ).rows[0];

    const conversation = (
      await client.query(
        'INSERT INTO conversations (visitor_id, department_id, channel_id) VALUES ($1, $2, $3) RETURNING *',
        [visitor.id, departmentId, channel.id]
      )
    ).rows[0];
    await client.query('COMMIT');

    const payload = {
      token: visitor.token,
      conversationId: conversation.id,
      channelId: channel.id,
      visitor: { id: visitor.id, name: visitor.name },
      department: dept.rows[0],
    };
    io.in('agents').socketsJoin(`channel:${channel.id}`);
    io.to('agents').emit('conversation:new', { ...payload, visitor: { ...payload.visitor, email, phone } });
    res.status(201).json(payload);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

async function conversationByToken(token) {
  const { rows } = await db.query(
    `SELECT cv.id AS conversation_id, cv.channel_id, cv.status,
            v.id AS visitor_id, v.name AS visitor_name
       FROM conversations cv JOIN visitors v ON v.id = cv.visitor_id
      WHERE v.token = $1
      ORDER BY cv.id DESC LIMIT 1`,
    [token]
  );
  return rows[0];
}

app.get('/api/widget/messages', async (req, res) => {
  const conv = await conversationByToken(req.query.token);
  if (!conv) return res.status(404).json({ error: 'sesión no encontrada' });
  res.json({ status: conv.status, messages: await getChannelMessages(conv.channel_id) });
});

app.post('/api/widget/messages', async (req, res) => {
  const { token, body, kind = 'text' } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'body requerido' });
  if (!['text', 'image', 'file'].includes(kind)) return res.status(400).json({ error: 'kind inválido' });
  const conv = await conversationByToken(token);
  if (!conv) return res.status(404).json({ error: 'sesión no encontrada' });

  const message = await insertMessage({
    channelId: conv.channel_id,
    conversationId: conv.conversation_id,
    authorType: 'visitor',
    authorId: conv.visitor_id,
    authorName: conv.visitor_name,
    body: String(body).trim(),
    kind,
  });
  broadcastMessage(message);
  res.status(201).json(message);
});

// Subida de archivos del visitante (requiere token de sesión del widget)
app.post('/api/widget/upload', async (req, res) => {
  const { token, name, mime, data } = req.body || {};
  const conv = await conversationByToken(token);
  if (!conv) return res.status(404).json({ error: 'sesión no encontrada' });
  if (!data || !mime) return res.status(400).json({ error: 'data y mime requeridos' });
  if (!String(mime).startsWith('image/')) return res.status(400).json({ error: 'solo imágenes' });
  try {
    const { filename, size } = saveBase64({
      data, mime, dir: UPLOADS_DIR, baseName: crypto.randomUUID(),
    });
    res.status(201).json({
      url: `/uploads/${filename}`,
      name: String(name || 'imagen').slice(0, 120),
      mime,
      size,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ------------------------------ subida de archivos ---------------------------- */

const fs = require('fs');
const crypto = require('crypto');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const STICKERS_DIR = path.join(PUBLIC_DIR, 'stickers');

[PUBLIC_DIR, UPLOADS_DIR, STICKERS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const EXT_BY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/zip': 'zip', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
};

function saveBase64({ data, mime, dir, baseName }) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length) throw Object.assign(new Error('archivo vacío'), { status: 400 });
  if (buf.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error('archivo supera 15 MB'), { status: 413 });
  
  let ext = EXT_BY_MIME[mime];
  if (!ext) {
    if (String(mime).includes('png')) ext = 'png';
    else if (String(mime).includes('jpeg') || String(mime).includes('jpg')) ext = 'jpg';
    else if (String(mime).includes('gif')) ext = 'gif';
    else if (String(mime).includes('webp')) ext = 'webp';
    else if (String(mime).includes('svg')) ext = 'svg';
    else ext = 'png';
  }

  const filename = `${baseName}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return { filename, size: buf.length };
}

app.post('/api/upload', requireAuth, (req, res) => {
  const { name, mime, data } = req.body || {};
  if (!data || !mime) return res.status(400).json({ error: 'data y mime requeridos' });
  try {
    const { filename, size } = saveBase64({
      data, mime, dir: UPLOADS_DIR, baseName: crypto.randomUUID(),
    });
    res.status(201).json({
      url: `/uploads/${filename}`,
      name: String(name || filename).slice(0, 120),
      mime,
      size,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* --------------------------- stickers personalizados -------------------------- */

app.get('/api/stickers', requireAuth, (_req, res) => {
  if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });
  const files = fs.readdirSync(STICKERS_DIR).filter((f) => /\.(svg|png|gif|webp|jpg|jpeg)$/i.test(f));
  res.json(files.map((f) => ({
    name: f.replace(/\.[^.]+$/, ''),
    url: `/stickers/${f}`,
  })));
});

app.post('/api/stickers', requireAuth, (req, res) => {
  const { name, mime, data } = req.body || {};
  if (!name?.trim() || !data || !mime) return res.status(400).json({ error: 'name, mime y data requeridos' });
  if (!String(mime).startsWith('image/')) return res.status(400).json({ error: 'solo imágenes' });
  const baseName = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sticker';
  try {
    const { filename } = saveBase64({ data, mime, dir: STICKERS_DIR, baseName });
    io.to('agents').emit('sticker:new', { name: baseName, url: `/stickers/${filename}` });
    res.status(201).json({ name: baseName, url: `/stickers/${filename}` });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});


app.delete('/api/stickers/:name', requireAuth, requireAdmin, (req, res) => {
  const safe = String(req.params.name).replace(/[^a-z0-9-]/gi, '');
  const files = fs.readdirSync(STICKERS_DIR).filter((f) => f.replace(/\.[^.]+$/, '') === safe);
  files.forEach((f) => fs.unlinkSync(path.join(STICKERS_DIR, f)));
  io.to('agents').emit('sticker:delete', { name: safe });
  res.json({ ok: true, deleted: files.length });
});

/* --------------------------------- Socket.IO ---------------------------------- */


// Presencia: agentId -> número de sockets conectados
const onlineAgents = new Map();

// Reuniones independientes tipo Google Meet: meetingCode -> Map(participantId -> { id, name, avatar, isGuest, handRaised, sockets:Set })
const meetingRooms = new Map();
const meetingWaitingRooms = new Map();

function getMeetingParticipants(code) {
  const room = meetingRooms.get(code);
  if (!room) return [];
  return [...room.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isGuest: !!p.isGuest,
    handRaised: !!p.handRaised,
    audioActive: !!p.audioActive,
  }));
}

function getMeetingWaitingList(code) {
  const room = meetingWaitingRooms.get(code);
  if (!room) return [];
  return [...room.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    socketId: p.socketId,
  }));
}

function broadcastMeetingState(code) {
  io.to(`meeting:${code}`).emit('meeting:state', {
    code,
    participants: getMeetingParticipants(code),
    waitingList: getMeetingWaitingList(code),
  });
}

function leaveMeetingRoom(socket) {
  const code = socket.data.meetingCode;
  const pId = socket.data.meetingParticipantId;
  if (!code || !pId) return;

  const room = meetingRooms.get(code);
  if (room && room.has(pId)) {
    const p = room.get(pId);
    p.sockets.delete(socket.id);
    if (p.sockets.size === 0) {
      room.delete(pId);
    }
    if (room.size === 0) {
      meetingRooms.delete(code);
    }
    broadcastMeetingState(code);
  }

  const waiting = meetingWaitingRooms.get(code);
  if (waiting && waiting.has(socket.id)) {
    waiting.delete(socket.id);
    if (waiting.size === 0) meetingWaitingRooms.delete(code);
    broadcastMeetingState(code);
  }

  socket.leave(`meeting:${code}`);
  socket.data.meetingCode = null;
  socket.data.meetingParticipantId = null;
}

// Huddles activos: channelId -> Map(agentId -> { name, avatar, sockets:Set })
const huddles = new Map();


function huddleParticipants(channelId) {
  const room = huddles.get(channelId);
  if (!room) return [];
  return [...room.entries()].map(([id, p]) => ({ id, name: p.name, avatar: p.avatar }));
}

function broadcastHuddleState(channelId) {
  io.to(`channel:${channelId}`).emit('huddle:state', {
    channel_id: channelId,
    participants: huddleParticipants(channelId),
  });
}

function leaveHuddles(socket, onlyChannel = null) {
  const set = socket.data.huddles;
  if (!set) return;
  for (const ch of [...set]) {
    if (onlyChannel && ch !== onlyChannel) continue;
    const room = huddles.get(ch);
    if (room) {
      for (const [agentId, p] of room) {
        if (p.sockets.has(socket.id)) {
          p.sockets.delete(socket.id);
          if (p.sockets.size === 0) room.delete(agentId);
        }
      }
      if (room.size === 0) huddles.delete(ch);
      broadcastHuddleState(ch);
    }
    socket.leave(`huddle:${ch}`);
    set.delete(ch);
  }
}

io.use(async (socket, next) => {
  const staffToken = socket.handshake.auth?.token;
  const widgetToken = socket.handshake.auth?.widgetToken;
  if (staffToken) {
    const agent = await verifyAgentToken(staffToken);
    if (!agent) return next(new Error('no autenticado'));
    socket.data.agent = agent;
    socket.data.agentId = agent.id;
    return next();
  }
  if (widgetToken) {
    const conversation = await conversationByToken(widgetToken);
    if (!conversation) return next(new Error('sesión de widget inválida'));
    socket.data.widget = conversation;
    return next();
  }
  next(); // Los invitados Meet se autentican después con su token acotado a la sala.
});

registerMeetingSocketHandlers(io, { db, config: meetingConfig, verifyAgentToken });

io.on('connection', (socket) => {
  socket.on('agents:join', () => {
    const id = socket.data.agentId;
    if (!id || socket.data.presenceJoined) return;
    socket.data.presenceJoined = true;
    socket.join('agents');
    socket.join(`agent:${id}`);
    if (socket.data.agent.role === 'admin') socket.join('admins');
    void db.query(
      `SELECT c.id FROM channels c
        WHERE (c.archived = false OR c.archived IS NULL)
          AND (c.type = 'support' OR c.is_private = false OR $2::boolean OR
               EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.agent_id = $1))`,
      [id, socket.data.agent.role === 'admin']
    ).then(({ rows }) => rows.forEach((row) => socket.join(`channel:${row.id}`))).catch(() => {});
    // Enviar solo huddles de canales que el agente puede ver.
    for (const ch of huddles.keys()) {
      void agentCanAccessChannel(socket.data.agent, ch).then((allowed) => {
        if (allowed) socket.emit('huddle:state', { channel_id: ch, participants: huddleParticipants(ch) });
      });
    }
    const count = (onlineAgents.get(id) || 0) + 1;
    onlineAgents.set(id, count);
    socket.emit('presence:list', [...onlineAgents.keys()]);
    if (count === 1) {
      socket.to('agents').emit('presence:update', { agent_id: id, online: true });
    }
  });

  socket.on('disconnect', () => {
    leaveHuddles(socket); // sacar de cualquier huddle al desconectarse
    const id = socket.data.agentId;
    if (!id || !socket.data.presenceJoined) return;
    const count = (onlineAgents.get(id) || 1) - 1;
    if (count <= 0) {
      onlineAgents.delete(id);
      io.to('agents').emit('presence:update', { agent_id: id, online: false });
    } else {
      onlineAgents.set(id, count);
    }
  });

  // "Está escribiendo...": identidad y canal salen de la sesión autenticada.
  socket.on('typing', async (data) => {
    const channelId = Number(data?.channelId);
    if (!channelId) return;
    let payload;
    if (socket.data.agent && await agentCanAccessChannel(socket.data.agent, channelId)) {
      payload = { channel_id: channelId, name: socket.data.agent.name, author_type: 'agent' };
    } else if (socket.data.widget?.channel_id === channelId) {
      payload = { channel_id: channelId, name: socket.data.widget.visitor_name, author_type: 'visitor' };
    } else {
      return;
    }
    socket.to(`channel:${channelId}`).emit('typing', payload);
  });

  // Señalización 1:1 dirigida; el servidor deriva el remitente y exige identidad staff.
  for (const ev of ['call:invite', 'call:accept', 'call:decline', 'call:signal', 'call:end']) {
    socket.on(ev, (data) => {
      if (!socket.data.agent || !Number(data?.to)) return;
      const payload = { ...data, from: publicAgent(socket.data.agent) };
      io.to(`agent:${Number(data.to)}`).emit(ev, payload);
    });
  }

  /* -------------------- Huddles: salas de voz/video por canal -------------------- */
  // channelId -> Map(agentId -> { name, avatar, sockets:Set<socketId> })
  socket.on('huddle:join', async (data) => {
    const channelId = Number(data?.channelId);
    const a = socket.data.agent;
    if (!channelId || !a || !(await agentCanAccessChannel(a, channelId))) return;
    if (!huddles.has(channelId)) huddles.set(channelId, new Map());
    const room = huddles.get(channelId);
    const existing = huddleParticipants(channelId).filter((p) => p.id !== a.id);
    if (!room.has(a.id)) room.set(a.id, { name: a.name, avatar: a.avatar || null, sockets: new Set() });
    room.get(a.id).sockets.add(socket.id);
    socket.data.huddles = socket.data.huddles || new Set();
    socket.data.huddles.add(channelId);
    socket.join(`huddle:${channelId}`);
    socket.emit('huddle:joined', { channel_id: channelId, participants: existing });
    broadcastHuddleState(channelId);
  });

  socket.on('huddle:leave', (data) => leaveHuddles(socket, Number(data?.channelId)));

  // Señalización grupal acotada a la sala y con remitente derivado.
  socket.on('huddle:signal', (data) => {
    const channelId = Number(data?.channelId);
    const to = Number(data?.to);
    const from = socket.data.agentId;
    if (!channelId || !to || !from || !socket.data.huddles?.has(channelId)) return;
    socket.to(`huddle:${channelId}`).emit('huddle:signal', { ...data, channelId, to, from });
  });

  socket.on('channel:join', async (value) => {
    const channelId = Number(value?.channelId ?? value);
    if (!channelId) return;
    if (socket.data.agent && await agentCanAccessChannel(socket.data.agent, channelId)) {
      socket.join(`channel:${channelId}`);
    } else if (socket.data.widget?.channel_id === channelId) {
      socket.join(`channel:${channelId}`);
    }
  });
  socket.on('channel:leave', (value) => {
    const channelId = Number(value?.channelId ?? value);
    if (channelId) socket.leave(`channel:${channelId}`);
  });

  /* ------------------ Reuniones WebRTC y Chat en Tiempo Real ------------------ */
  const activeMeetings = new Map();

  function broadcastMeetingState(code) {
    const room = activeMeetings.get(code);
    if (!room) return;
    const participants = Array.from(room.values()).map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isGuest: p.isGuest,
      handRaised: !!p.handRaised,
    }));
    io.to(`meeting:${code}`).emit('meeting:state', { code, participants });
  }

  socket.on('meeting:join', (data) => {
    const code = String(data?.code || '').trim();
    if (!code) return;
    const name = String(data?.name || 'Invitado').trim().slice(0, 60);
    const avatar = data?.avatar || null;
    const isGuest = !!data?.isGuest;

    let room = activeMeetings.get(code);
    if (!room) {
      room = new Map();
      activeMeetings.set(code, room);
    }

    const participantId = socket.data.agent?.id || socket.id;
    const participant = { id: participantId, name, avatar, isGuest, handRaised: false, socketId: socket.id };
    room.set(socket.id, participant);
    socket.data.meetingCode = code;
    socket.join(`meeting:${code}`);

    broadcastMeetingState(code);
  });

  socket.on('meeting:leave', (data) => {
    const code = String(data?.code || socket.data.meetingCode || '').trim();
    if (!code) return;
    const room = activeMeetings.get(code);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) activeMeetings.delete(code);
      else broadcastMeetingState(code);
    }
    socket.leave(`meeting:${code}`);
    socket.data.meetingCode = null;
  });

  socket.on('meeting:signal', (data) => {
    const code = String(data?.code || '').trim();
    const to = data?.to;
    if (!code || !to) return;
    const room = activeMeetings.get(code);
    if (!room) return;

    let targetSocketId = null;
    for (const [sId, p] of room.entries()) {
      if (String(p.id) === String(to) || sId === String(to)) {
        targetSocketId = sId;
        break;
      }
    }

    const fromId = socket.data.agent?.id || socket.id;
    if (targetSocketId) {
      io.to(targetSocketId).emit('meeting:signal', {
        code,
        from: fromId,
        to,
        data: data.data,
      });
    }
  });

  socket.on('meeting:chat_message', (data) => {
    const code = String(data?.code || '').trim();
    const text = String(data?.text || '').trim().slice(0, 1000);
    if (!code || !text) return;

    const senderName = String(data?.name || socket.data.agent?.name || 'Invitado').slice(0, 60);
    const senderId = socket.data.agent?.id || socket.id;
    const msg = {
      id: crypto.randomUUID(),
      senderId,
      senderName,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    io.to(`meeting:${code}`).emit('meeting:chat_message', msg);
  });

  socket.on('meeting:hand_raise', (data) => {
    const code = String(data?.code || '').trim();
    const raised = !!data?.raised;
    if (!code) return;
    const room = activeMeetings.get(code);
    if (room && room.has(socket.id)) {
      room.get(socket.id).handRaised = raised;
      broadcastMeetingState(code);
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.meetingCode) {
      const code = socket.data.meetingCode;
      const room = activeMeetings.get(code);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) activeMeetings.delete(code);
        else broadcastMeetingState(code);
      }
    }
  });

  // La escritura persistente se realiza por REST, donde se validan membresía y autor.
  socket.on('message:send', (_data, ack) => {
    ack?.({ error: 'usa los endpoints REST autenticados para enviar mensajes' });
  });
/* -------------------------- SPA Fallback para Web -------------------------- */

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/stickers')) {
    return next();
  }
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.sendFile(path.join(PUBLIC_DIR, 'demo.html'));
  }
});

/* ----------------------------------- errores ----------------------------------- */


app.use((err, _req, res, _next) => {
  console.error(err);
  const payload = {
    error: err.message || 'error interno',
    detail: err.message || 'error interno',
  };
  res.status(err.status || 500).json(payload);
});


db.initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Kasupport server en http://localhost:${PORT}`);
    console.log(`Widget embed: http://localhost:${PORT}/widget.js`);
  });
}).catch((err) => {
  console.error('No se pudo inicializar Kasupport:', err);
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`${signal}: cerrando Kasupport`);
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

