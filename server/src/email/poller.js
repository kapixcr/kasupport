const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const emailService = require('./service');

class EmailPoller {
  constructor() {
    this.intervalId = null;
    this.isPolling = false;
    this.config = null;
    this.db = null;
    this.io = null;
    this.uploadsDir = null;
    this.lastPollTime = null;
    this.lastError = null;
    this.processedCount = 0;
  }

  init({ db, io, uploadsDir }) {
    this.db = db;
    this.io = io;
    this.uploadsDir = uploadsDir;

    const user = process.env.EMAIL_IMAP_USER || '';
    const password = process.env.EMAIL_IMAP_PASSWORD || '';
    const host = process.env.EMAIL_IMAP_HOST || 'imap.gmail.com';
    const port = Number(process.env.EMAIL_IMAP_PORT || 993);
    const tls = process.env.EMAIL_IMAP_TLS !== 'false';
    const intervalSec = Math.max(10, Number(process.env.EMAIL_POLL_INTERVAL_SECONDS || 30));

    if (!user || !password) {
      console.log('ℹ Lector de correos IMAP no configurado (falta EMAIL_IMAP_USER o EMAIL_IMAP_PASSWORD).');
      return;
    }

    this.config = {
      imap: {
        user,
        password,
        host,
        port,
        tls,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false },
      },
    };

    console.log(`✓ Lector de correos IMAP activado para ${user} en ${host}:${port} (frecuencia: cada ${intervalSec}s)`);

    // Sondeo inicial tras 5 segundos de arranque
    setTimeout(() => {
      void this.poll();
    }, 5000);

    // Sondeo periódico continuo
    this.intervalId = setInterval(() => {
      void this.poll();
    }, intervalSec * 1000);
  }

  async poll() {
    if (!this.config || this.isPolling) return;
    this.isPolling = true;

    let connection = null;
    try {
      connection = await imaps.connect(this.config);
      await connection.openBox('INBOX');

      // Buscar correos no leídos
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = {
        bodies: [''],
        struct: true,
        markSeen: true, // Marca como leído para no re-procesar
      };

      console.log(`[IMAP] Sondeando INBOX (${new Date().toLocaleTimeString()})...`);
      const messages = await connection.search(searchCriteria, fetchOptions);
      this.lastPollTime = new Date().toISOString();
      this.lastError = null;

      if (messages.length === 0) {
        console.log(`[IMAP] Sin correos nuevos no leídos (UNSEEN). Esperando...`);
      } else {
        console.log(`[IMAP] 📩 Se encontraron ${messages.length} correos nuevos en la bandeja de entrada`);
      }

      for (const item of messages) {
        try {
          const rawPart = item.parts.find((p) => p.which === '');
          const rawBody = rawPart ? rawPart.body : '';
          if (!rawBody) continue;

          const parsed = await simpleParser(rawBody);
          await this.processIncomingEmail(parsed);
          this.processedCount++;
        } catch (msgErr) {
          console.error('× Error al procesar correo individual:', msgErr);
        }
      }
    } catch (err) {
      this.lastError = err.message;
      // Solo mostrar advertencia si no es timeout transitorio
      if (!err.message?.includes('Timed out')) {
        console.error('× Error de conexión en sondeo IMAP:', err.message);
      }
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch {}
      }
      this.isPolling = false;
    }
  }

  /**
   * Procesa un correo recibido, extrayendo datos y convirtiéndolo en ticket o respuesta
   */
  async processIncomingEmail(parsed) {
    const sender = parsed.from?.value?.[0];
    const senderEmail = (sender?.address || '').toLowerCase().trim();
    const senderName = (sender?.name || senderEmail.split('@')[0] || 'Cliente').trim();
    const subject = (parsed.subject || 'Sin Asunto').trim();
    const messageId = parsed.messageId || null;
    const inReplyTo = parsed.inReplyTo || null;
    const references = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references ? [parsed.references] : [];

    // Texto limpio del correo (preferir texto plano, si no HTML sanitizado)
    let body = (parsed.text || '').trim();
    if (!body && parsed.html) {
      body = parsed.html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    }
    if (!body) {
      body = '[Mensaje sin texto en el cuerpo]';
    }

    if (!senderEmail) {
      console.warn('× Correo ignorado: no tiene remitente válido');
      return;
    }

    // Evitar procesar correos enviados por el propio buzón del sistema (prevención de bucles)
    const supportEmail = (process.env.EMAIL_SUPPORT_ADDRESS || process.env.EMAIL_FROM || 'soporte@kapix.co.cr').toLowerCase();
    if (senderEmail === 'soporte@kapix.co.cr' || (supportEmail.includes('soporte@') && senderEmail === supportEmail)) {
      console.log(`ℹ Correo ignorado (remitente es el buzón del sistema): ${senderEmail}`);
      return;
    }

    // Si se especificó EMAIL_FILTER_TO (ej: soporte@kapix.co.cr), verificar que esté dirigido al buzón de soporte
    const filterTo = (process.env.EMAIL_FILTER_TO || '').toLowerCase().trim();
    if (filterTo) {
      const toAddresses = [];
      if (parsed.to?.value) {
        parsed.to.value.forEach((t) => t.address && toAddresses.push(t.address.toLowerCase()));
      }
      if (parsed.cc?.value) {
        parsed.cc.value.forEach((c) => c.address && toAddresses.push(c.address.toLowerCase()));
      }
      if (parsed.bcc?.value) {
        parsed.bcc.value.forEach((b) => b.address && toAddresses.push(b.address.toLowerCase()));
      }
      if (parsed.headers) {
        for (const [key, val] of parsed.headers.entries()) {
          const k = String(key).toLowerCase();
          if (k.includes('to') || k.includes('delivered') || k.includes('recipient') || k.includes('forward')) {
            const strVal = typeof val === 'object' && val?.value ? JSON.stringify(val.value) : String(val || '');
            toAddresses.push(strVal.toLowerCase());
          }
        }
      }

      const isTargeted = toAddresses.length === 0 || toAddresses.some((addr) => addr.includes(filterTo));
      if (!isTargeted) {
        console.log(`ℹ Correo ignorado (no coincide con EMAIL_FILTER_TO=${filterTo}): "${subject}" de ${senderEmail}. Destinatarios:`, toAddresses);
        return;
      }
    }

    console.log(`📨 Procesando correo entrante de: ${senderName} <${senderEmail}> | Asunto: "${subject}"`);




    // 1. Detectar si es respuesta a un ticket existente
    const existingConversation = await this.findExistingConversation({
      subject,
      inReplyTo,
      references,
      senderEmail,
    });

    if (existingConversation) {
      await this.appendMessageToConversation(existingConversation, {
        senderName,
        senderEmail,
        body,
        messageId,
        attachments: parsed.attachments || [],
      });
    } else {
      await this.createNewTicketConversation({
        senderName,
        senderEmail,
        subject,
        body,
        messageId,
        attachments: parsed.attachments || [],
      });
    }
  }

  /**
   * Intenta localizar una conversación existente por ID de ticket en asunto o Message-ID de cabeceras
   */
  async findExistingConversation({ subject, inReplyTo, references, senderEmail }) {
    // A) Buscar por patrón [Ticket #123] o [#123] en el asunto
    const ticketMatch = subject.match(/\[(?:Ticket\s*)?#(\d+)\]/i);
    if (ticketMatch && ticketMatch[1]) {
      const ticketId = Number(ticketMatch[1]);
      const { rows } = await this.db.query(
        `SELECT cv.id, cv.channel_id, cv.visitor_id, cv.status, cv.subject, v.name AS visitor_name, v.email AS visitor_email
           FROM conversations cv
           JOIN visitors v ON v.id = cv.visitor_id
          WHERE cv.id = $1 LIMIT 1`,
        [ticketId]
      );
      if (rows[0]) return rows[0];
    }

    // B) Buscar por In-Reply-To o References en mensajes previos
    const lookupIds = [inReplyTo, ...references].filter(Boolean);
    if (lookupIds.length > 0) {
      const { rows } = await this.db.query(
        `SELECT cv.id, cv.channel_id, cv.visitor_id, cv.status, cv.subject, v.name AS visitor_name, v.email AS visitor_email
           FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id
           JOIN visitors v ON v.id = cv.visitor_id
          WHERE m.email_message_id = ANY($1)
          ORDER BY m.id DESC LIMIT 1`,
        [lookupIds]
      );
      if (rows[0]) return rows[0];
    }

    // C) Buscar conversación abierta más reciente del mismo email si el asunto coincide
    const cleanSubject = subject.replace(/^(Re|Fwd):\s*/i, '').trim();
    if (cleanSubject) {
      const { rows } = await this.db.query(
        `SELECT cv.id, cv.channel_id, cv.visitor_id, cv.status, cv.subject, v.name AS visitor_name, v.email AS visitor_email
           FROM conversations cv
           JOIN visitors v ON v.id = cv.visitor_id
          WHERE LOWER(v.email) = $1 AND cv.status IN ('open', 'pending')
            AND (cv.subject ILIKE $2 OR $2 ILIKE '%' || cv.subject || '%')
          ORDER BY cv.id DESC LIMIT 1`,
        [senderEmail, `%${cleanSubject}%`]
      );
      if (rows[0]) return rows[0];
    }

    return null;
  }

  /**
   * Agrega un mensaje a una conversación existente
   */
  async appendMessageToConversation(conv, { senderName, body, messageId, attachments }) {
    console.log(`↳ Anexando mensaje al Ticket #${conv.id} (Canal ${conv.channel_id})`);

    // Reabrir si estaba cerrado
    if (conv.status === 'closed') {
      await this.db.query("UPDATE conversations SET status = 'open' WHERE id = $1", [conv.id]);
    }

    // Insertar mensaje de texto
    const { rows } = await this.db.query(
      `INSERT INTO messages (channel_id, conversation_id, author_type, author_id, author_name, body, kind, email_message_id)
       VALUES ($1, $2, 'visitor', $3, $4, $5, 'text', $6)
       RETURNING *`,
      [conv.channel_id, conv.id, conv.visitor_id, senderName, body, messageId]
    );

    const message = rows[0];
    this.io.to(`channel:${conv.channel_id}`).emit('message:new', message);
    this.io.to('agents').emit('conversation:update', { id: conv.id, status: 'open', last_message: message });

    // Guardar adjuntos si los hay
    await this.processAttachments(conv.channel_id, conv.id, conv.visitor_id, senderName, attachments);
  }

  /**
   * Crea un nuevo visitante, canal, conversación y mensaje inicial
   */
  async createNewTicketConversation({ senderName, senderEmail, subject, body, messageId, attachments }) {
    console.log(`↳ Creando NUEVO Ticket para: ${senderName} <${senderEmail}>`);

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Buscar o crear visitante
      let visitor;
      const existingVis = await client.query('SELECT * FROM visitors WHERE LOWER(email) = $1 LIMIT 1', [senderEmail]);
      if (existingVis.rows[0]) {
        visitor = existingVis.rows[0];
        // Actualizar nombre si era genérico
        if (senderName && visitor.name !== senderName) {
          await client.query('UPDATE visitors SET name = $1 WHERE id = $2', [senderName, visitor.id]);
          visitor.name = senderName;
        }
      } else {
        const newVis = await client.query(
          'INSERT INTO visitors (name, email) VALUES ($1, $2) RETURNING *',
          [senderName, senderEmail]
        );
        visitor = newVis.rows[0];
      }

      // 2. Obtener departamento por defecto
      const deptRow = await client.query('SELECT id, name FROM departments ORDER BY id ASC LIMIT 1');
      const deptId = deptRow.rows[0]?.id || null;
      const deptName = deptRow.rows[0]?.name || 'General';

      // 3. Crear canal de soporte
      const channel = (
        await client.query(
          `INSERT INTO channels (name, type, department_id) VALUES ($1, 'support', $2) RETURNING *`,
          [`soporte-${visitor.id}-email`, deptId]
        )
      ).rows[0];

      // 4. Crear conversación
      const conversation = (
        await client.query(
          `INSERT INTO conversations (visitor_id, department_id, channel_id, status, subject, source)
           VALUES ($1, $2, $3, 'open', $4, 'email')
           RETURNING *`,
          [visitor.id, deptId, channel.id, subject]
        )
      ).rows[0];

      // 5. Insertar mensaje inicial
      const initialMessage = (
        await client.query(
          `INSERT INTO messages (channel_id, conversation_id, author_type, author_id, author_name, body, kind, email_message_id)
           VALUES ($1, $2, 'visitor', $3, $4, $5, 'text', $6)
           RETURNING *`,
          [channel.id, conversation.id, visitor.id, senderName, body, messageId]
        )
      ).rows[0];

      await client.query('COMMIT');

      // Unir agentes al canal y notificar
      this.io.in('agents').socketsJoin(`channel:${channel.id}`);
      this.io.to('agents').emit('conversation:new', {
        id: conversation.id,
        channel_id: channel.id,
        visitor_id: visitor.id,
        visitor_name: visitor.name,
        visitor_email: visitor.email,
        department_id: deptId,
        department_name: deptName,
        status: 'open',
        subject: conversation.subject,
        source: 'email',
        created_at: conversation.created_at,
        last_message: initialMessage,
      });

      console.log(`✓ Ticket #${conversation.id} creado con éxito para ${senderEmail}`);

      // Procesar adjuntos
      await this.processAttachments(channel.id, conversation.id, visitor.id, senderName, attachments);

      // Enviar acuse de recibo automático al cliente
      await emailService.sendTicketCreatedConfirmation({
        to: senderEmail,
        name: senderName,
        subject,
        ticketId: conversation.id,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('× Error al crear ticket desde correo:', e);
    } finally {
      client.release();
    }
  }

  /**
   * Guarda archivos adjuntos recibidos por correo en el directorio de uploads
   */
  async processAttachments(channelId, conversationId, visitorId, senderName, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return;

    for (const att of attachments) {
      try {
        if (!att.content || !this.uploadsDir) continue;

        const ext = path.extname(att.filename || '').toLowerCase() || (att.contentType?.startsWith('image/') ? '.jpg' : '.bin');
        const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
        const filePath = path.join(this.uploadsDir, filename);

        fs.writeFileSync(filePath, att.content);
        const isImage = (att.contentType || '').startsWith('image/');
        const fileUrl = `/uploads/${filename}`;

        const { rows } = await this.db.query(
          `INSERT INTO messages (channel_id, conversation_id, author_type, author_id, author_name, body, kind)
           VALUES ($1, $2, 'visitor', $3, $4, $5, $6)
           RETURNING *`,
          [
            channelId,
            conversationId,
            visitorId,
            senderName,
            JSON.stringify({ url: fileUrl, name: att.filename || 'archivo_adjunto', size: att.size || att.content.length }),
            isImage ? 'image' : 'file',
          ]
        );

        this.io.to(`channel:${channelId}`).emit('message:new', rows[0]);
      } catch (attErr) {
        console.error('× Error al guardar archivo adjunto de correo:', attErr);
      }
    }
  }

  getStatus() {
    return {
      enabled: !!this.config,
      isPolling: this.isPolling,
      user: this.config?.imap?.user || null,
      host: this.config?.imap?.host || null,
      lastPollTime: this.lastPollTime,
      lastError: this.lastError,
      processedCount: this.processedCount,
    };
  }
}

module.exports = new EmailPoller();
