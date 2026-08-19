const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  getContentType,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.qrDataUrl = null;
    this.user = null; // { id, name, phone }
    this.db = null;
    this.io = null;
    this.uploadsDir = null;
    this.authDir = path.join(__dirname, '..', '..', 'data', 'baileys_auth');
    this.reconnectTimeout = null;
    this.isManualDisconnect = false;
  }

  init({ db, io, uploadsDir }) {
    this.db = db;
    this.io = io;
    this.uploadsDir = uploadsDir;

    // Asegurar directorio de autenticación
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    // Si ya existen credenciales previas guardadas, reconectar automáticamente
    const credsPath = path.join(this.authDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      console.log('✓ Sesión previa de WhatsApp encontrada. Iniciando reconexión automática...');
      this.connect().catch((err) => {
        console.error('× Error al reconectar WhatsApp:', err?.message || err);
      });
    } else {
      console.log('ℹ WhatsApp no conectado. Esperando vinculación desde Ajustes.');
    }
  }

  emitStatus() {
    if (!this.io) return;
    const payload = this.getStatus();
    this.io.to('agents').emit('whatsapp:status', payload);
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qrDataUrl,
      user: this.user,
    };
  }

  async connect() {
    if (this.sock && this.status === 'connected') {
      return this.getStatus();
    }

    this.isManualDisconnect = false;
    this.status = 'connecting';
    this.emitStatus();

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp] Usando Baileys v${version.join('.')} (isLatest: ${isLatest})`);

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['Kasupport', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });

      // Manejo de credenciales
      this.sock.ev.on('creds.update', saveCreds);

      // Manejo de eventos de conexión
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
            this.status = 'qr_ready';
            console.log('✓ Código QR de WhatsApp generado. Listo para escanear en Ajustes.');
            this.emitStatus();
          } catch (err) {
            console.error('× Error al convertir QR a DataURL:', err.message);
          }
        }

        if (connection === 'close') {
          this.qrDataUrl = null;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = !this.isManualDisconnect && statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Conexión cerrada. Razón: ${statusCode || 'desconocida'}. Reconectar: ${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            this.clearAuth();
            this.status = 'disconnected';
            this.user = null;
            this.sock = null;
            this.emitStatus();
          } else if (shouldReconnect) {
            this.status = 'connecting';
            this.emitStatus();
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch((e) => console.error('[WhatsApp] Fallo de reconexión:', e.message));
            }, 5000);
          } else {
            this.status = 'disconnected';
            this.emitStatus();
          }
        } else if (connection === 'open') {
          this.status = 'connected';
          this.qrDataUrl = null;
          const rawId = this.sock?.user?.id || '';
          const phone = rawId.split(':')[0] || rawId.split('@')[0];
          const name = this.sock?.user?.name || `+${phone}`;

          this.user = {
            id: rawId,
            phone,
            name,
          };

          console.log(`✓ WhatsApp conectado exitosamente como ${name} (+${phone})`);
          this.emitStatus();
        }
      });

      // Manejo de mensajes entrantes
      this.sock.ev.on('messages.upsert', async (upsert) => {
        try {
          await this.handleIncomingMessages(upsert);
        } catch (err) {
          console.error('× Error al procesar mensaje de WhatsApp:', err);
        }
      });

      return this.getStatus();
    } catch (err) {
      this.status = 'disconnected';
      this.emitStatus();
      throw err;
    }
  }

  async disconnect() {
    this.isManualDisconnect = true;
    clearTimeout(this.reconnectTimeout);

    try {
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch {
          this.sock.end(undefined);
        }
      }
    } catch (err) {
      console.warn('[WhatsApp] Advertencia al cerrar socket:', err.message);
    } finally {
      this.sock = null;
      this.user = null;
      this.qrDataUrl = null;
      this.status = 'disconnected';
      this.clearAuth();
      this.emitStatus();
      console.log('✓ WhatsApp desconectado y sesión cerrada.');
    }

    return this.getStatus();
  }

  clearAuth() {
    if (fs.existsSync(this.authDir)) {
      try {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
      } catch (err) {
        console.error('× Error al limpiar directorio de autenticación:', err.message);
      }
    }
  }

  /**
   * Procesa mensajes entrantes desde WhatsApp
   */
  async handleIncomingMessages(upsert) {
    if (upsert.type !== 'notify' || !Array.isArray(upsert.messages)) return;

    for (const msg of upsert.messages) {
      // Ignorar mensajes enviados por nosotros mismos para evitar duplicados
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      // Ignorar transmisiones de estado y grupos si solo atendemos chats individuales
      if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) {
        continue;
      }

      // Extraer número de teléfono y nombre
      const cleanPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      const formattedPhone = `+${cleanPhone}`;
      const senderName = msg.pushName || formattedPhone;

      // Extraer contenido y tipo de mensaje
      const messageContent = msg.message;
      if (!messageContent) continue;

      const messageType = getContentType(messageContent);
      if (!messageType) continue;

      let body = '';
      let kind = 'text';

      if (messageType === 'conversation') {
        body = messageContent.conversation;
      } else if (messageType === 'extendedTextMessage') {
        body = messageContent.extendedTextMessage?.text || '';
      } else if (messageType === 'imageMessage') {
        kind = 'image';
        const caption = messageContent.imageMessage?.caption || '';
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const ext = (messageContent.imageMessage?.mimetype || 'image/jpeg').split('/')[1]?.split(';')[0] || 'jpg';
          const filename = `${crypto.randomUUID()}.${ext}`;
          const filePath = path.join(this.uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          body = JSON.stringify({
            url: `/uploads/${filename}`,
            name: `Foto_${cleanPhone}.${ext}`,
            size: buffer.length,
            mime: messageContent.imageMessage?.mimetype || 'image/jpeg',
            caption: caption || undefined,
          });
        } catch (mediaErr) {
          console.error('[WhatsApp] Error descargando imagen:', mediaErr.message);
          body = caption || '[Imagen no disponible]';
          kind = 'text';
        }
      } else if (messageType === 'documentMessage') {
        kind = 'file';
        const docMsg = messageContent.documentMessage;
        const caption = docMsg?.caption || '';
        const originalName = docMsg?.fileName || `Documento_${cleanPhone}.dat`;
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const ext = path.extname(originalName) || '.dat';
          const filename = `${crypto.randomUUID()}${ext}`;
          const filePath = path.join(this.uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          body = JSON.stringify({
            url: `/uploads/${filename}`,
            name: originalName,
            size: buffer.length,
            mime: docMsg?.mimetype || 'application/octet-stream',
            caption: caption || undefined,
          });
        } catch (mediaErr) {
          console.error('[WhatsApp] Error descargando documento:', mediaErr.message);
          body = `[Documento: ${originalName}]`;
          kind = 'text';
        }
      } else if (messageType === 'audioMessage') {
        kind = 'file';
        const audioMsg = messageContent.audioMessage;
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const ext = audioMsg?.mimetype?.includes('ogg') ? 'ogg' : 'mp3';
          const filename = `${crypto.randomUUID()}.${ext}`;
          const filePath = path.join(this.uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          body = JSON.stringify({
            url: `/uploads/${filename}`,
            name: `Audio_${cleanPhone}.${ext}`,
            size: buffer.length,
            mime: audioMsg?.mimetype || 'audio/ogg',
          });
        } catch (mediaErr) {
          console.error('[WhatsApp] Error descargando audio:', mediaErr.message);
          body = '[Mensaje de voz]';
          kind = 'text';
        }
      } else if (messageType === 'videoMessage') {
        kind = 'file';
        const videoMsg = messageContent.videoMessage;
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const filename = `${crypto.randomUUID()}.mp4`;
          const filePath = path.join(this.uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          body = JSON.stringify({
            url: `/uploads/${filename}`,
            name: `Video_${cleanPhone}.mp4`,
            size: buffer.length,
            mime: videoMsg?.mimetype || 'video/mp4',
            caption: videoMsg?.caption || undefined,
          });
        } catch (mediaErr) {
          console.error('[WhatsApp] Error descargando video:', mediaErr.message);
          body = '[Video]';
          kind = 'text';
        }
      } else if (messageType === 'stickerMessage') {
        kind = 'image';
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const filename = `${crypto.randomUUID()}.webp`;
          const filePath = path.join(this.uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          body = JSON.stringify({
            url: `/uploads/${filename}`,
            name: `Sticker_${cleanPhone}.webp`,
            size: buffer.length,
            mime: 'image/webp',
          });
        } catch {
          body = '[Sticker]';
          kind = 'text';
        }
      } else {
        // Otros tipos de mensajes no interactivos
        body = `[Mensaje de WhatsApp (${messageType})]`;
      }

      if (!body.trim()) continue;

      // Procesar en la base de datos (crear/asociar visitante y ticket)
      await this.saveIncomingMessageToTicket({
        phone: formattedPhone,
        cleanPhone,
        senderName,
        body,
        kind,
        rawMessage: msg,
      });
    }
  }

  /**
   * Guarda el mensaje en la base de datos de Kasupport
   */
  async saveIncomingMessageToTicket({ phone, cleanPhone, senderName, body, kind, rawMessage }) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // 1. Buscar o crear visitante por teléfono
      let { rows: visitorRows } = await client.query(
        'SELECT id, name, phone, email FROM visitors WHERE phone = $1 OR phone = $2 LIMIT 1',
        [phone, cleanPhone]
      );

      let visitor = visitorRows[0];
      if (!visitor) {
        const { rows: newVisitorRows } = await client.query(
          'INSERT INTO visitors (name, phone) VALUES ($1, $2) RETURNING *',
          [senderName, phone]
        );
        visitor = newVisitorRows[0];
      } else if (senderName && visitor.name === visitor.phone && senderName !== visitor.phone) {
        // Actualizar nombre si antes solo teníamos el número
        await client.query('UPDATE visitors SET name = $1 WHERE id = $2', [senderName, visitor.id]);
        visitor.name = senderName;
      }

      // 2. Buscar conversación/ticket activo (open o pending) con origen WhatsApp
      const { rows: convRows } = await client.query(
        `SELECT cv.id, cv.channel_id, cv.status, cv.department_id
           FROM conversations cv
          WHERE cv.visitor_id = $1 AND cv.status IN ('open', 'pending')
          ORDER BY cv.id DESC LIMIT 1`,
        [visitor.id]
      );

      let conversation = convRows[0];
      let channelId = null;
      let isNewConversation = false;

      if (conversation) {
        channelId = conversation.channel_id;
      } else {
        // Crear nuevo canal y conversación de ticket de WhatsApp
        isNewConversation = true;
        const channelName = `wa-${visitor.id}-${cleanPhone.slice(-4)}`;

        const { rows: channelRows } = await client.query(
          `INSERT INTO channels (name, type) VALUES ($1, 'support') RETURNING *`,
          [channelName]
        );
        channelId = channelRows[0].id;

        const subject = `WhatsApp: ${visitor.name || phone}`;
        const { rows: newConvRows } = await client.query(
          `INSERT INTO conversations (visitor_id, channel_id, source, subject, status)
           VALUES ($1, $2, 'whatsapp', $3, 'open')
           RETURNING *`,
          [visitor.id, channelId, subject]
        );
        conversation = newConvRows[0];
      }

      // 3. Insertar el mensaje
      const { rows: msgRows } = await client.query(
        `INSERT INTO messages (channel_id, conversation_id, author_type, author_id, author_name, body, kind)
         VALUES ($1, $2, 'visitor', $3, $4, $5, $6)
         RETURNING *`,
        [channelId, conversation.id, visitor.id, visitor.name || phone, body, kind]
      );
      const insertedMessage = msgRows[0];

      await client.query('COMMIT');

      // 4. Notificar a los agentes en tiempo real vía Socket.IO
      if (isNewConversation) {
        this.io.in('agents').socketsJoin(`channel:${channelId}`);
        this.io.to('agents').emit('conversation:new', {
          conversationId: conversation.id,
          channelId,
          source: 'whatsapp',
          subject: conversation.subject,
          status: 'open',
          visitor: {
            id: visitor.id,
            name: visitor.name || phone,
            phone: visitor.phone,
          },
        });
      }

      this.io.to(`channel:${channelId}`).emit('message:new', insertedMessage);

      // Notificación sonora / push a los agentes
      this.io.to('agents').emit('notification:sound', {
        title: `WhatsApp de ${visitor.name || phone}`,
        body: kind === 'text' ? body : `[${kind.toUpperCase()}]`,
        channelId,
        conversationId: conversation.id,
      });

      console.log(`✓ Mensaje de WhatsApp recibido de ${visitor.name} (+${cleanPhone}) asignado al Ticket #${conversation.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Envía la respuesta de un agente directamente al WhatsApp del cliente
   */
  async sendAgentReply({ phone, body, kind = 'text', fileData = null }) {
    if (this.status !== 'connected' || !this.sock) {
      console.warn('[WhatsApp] No se puede enviar respuesta: WhatsApp no está conectado.');
      return { sent: false, reason: 'WhatsApp desconectado' };
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    if (!cleanPhone) {
      return { sent: false, reason: 'Número de teléfono inválido' };
    }

    const targetJid = `${cleanPhone}@s.whatsapp.net`;

    try {
      if (kind === 'text') {
        await this.sock.sendMessage(targetJid, { text: String(body).trim() });
        console.log(`✓ Respuesta de agente enviada a WhatsApp (+${cleanPhone})`);
        return { sent: true };
      }

      if (kind === 'image' && fileData?.url) {
        const filePath = path.join(this.uploadsDir, path.basename(fileData.url));
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          await this.sock.sendMessage(targetJid, {
            image: buffer,
            caption: fileData.caption || (typeof body === 'string' && !body.startsWith('{') ? body : undefined),
          });
          console.log(`✓ Imagen enviada a WhatsApp (+${cleanPhone})`);
          return { sent: true };
        }
      }

      if (kind === 'file' && fileData?.url) {
        const filePath = path.join(this.uploadsDir, path.basename(fileData.url));
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          await this.sock.sendMessage(targetJid, {
            document: buffer,
            mimetype: fileData.mime || 'application/octet-stream',
            fileName: fileData.name || path.basename(filePath),
            caption: fileData.caption || (typeof body === 'string' && !body.startsWith('{') ? body : undefined),
          });
          console.log(`✓ Archivo enviado a WhatsApp (+${cleanPhone})`);
          return { sent: true };
        }
      }

      // Fallback a texto si no se pudo procesar archivo
      await this.sock.sendMessage(targetJid, { text: String(body).trim() });
      return { sent: true };
    } catch (err) {
      console.error(`× Error al enviar mensaje a WhatsApp (+${cleanPhone}):`, err.message);
      return { sent: false, error: err.message };
    }
  }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;
