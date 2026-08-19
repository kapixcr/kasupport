const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.enabled = false;
    this.from = process.env.EMAIL_FROM || 'Kasupport Soporte <soporte@kapix.co.cr>';
    this.replyTo = process.env.EMAIL_REPLY_TO || 'soporte@kapix.co.cr';
    this.init();
  }


  init() {
    const host = process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.EMAIL_SMTP_PORT || 465);
    const secure = process.env.EMAIL_SMTP_SECURE !== 'false';
    const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || '';
    const pass = process.env.EMAIL_SMTP_PASSWORD || process.env.EMAIL_IMAP_PASSWORD || '';

    if (!user || !pass) {
      console.log('ℹ Correo saliente SMTP no configurado (falta EMAIL_SMTP_USER o EMAIL_SMTP_PASSWORD). Respuestas por correo desactivadas.');
      this.enabled = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.enabled = true;
      console.log(`✓ Servicio de correo saliente SMTP configurado para ${user} vía ${host}:${port}`);
    } catch (err) {
      console.error('× Error al inicializar SMTP:', err.message);
      this.enabled = false;
    }
  }

  /**
   * Envía la respuesta de un agente directamente al correo del cliente
   */
  async sendAgentReply({ to, subject, body, inReplyTo, references, ticketId, agentName }) {
    if (!this.enabled || !this.transporter) {
      return { sent: false, reason: 'SMTP no configurado' };
    }
    if (!to || !to.includes('@')) {
      return { sent: false, reason: 'Dirección de correo inválida' };
    }

    const cleanSubject = String(subject || 'Soporte').replace(/^Re:\s*/i, '');
    const fullSubject = `Re: [Ticket #${ticketId}] ${cleanSubject}`;

    const textBody = `${body}\n\n---\nRespuesta enviada por ${agentName || 'Equipo de Soporte'} a través de Kasupport.\nPuedes responder directamente a este correo para continuar la conversación.`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #191E29; line-height: 1.6; max-width: 600px; margin: 0 auto; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background-color: #191E29; padding: 20px 24px; border-bottom: 3px solid #01C38D; color: white; display: flex; align-items: center;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff;">Kapix Soporte</h2>
        </div>
        <div style="background-color: #ffffff; padding: 28px 24px;">
          <p style="margin-top: 0; font-size: 15px; color: #191E29; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(body)}</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 28px 0 16px;" />
          <div style="font-size: 12px; color: #64748b; margin: 0;">
            <p style="margin: 0 0 4px 0;">Respuesta de <strong>${escapeHtml(agentName || 'Equipo de Soporte')}</strong> • <strong>Ticket #${ticketId}</strong></p>
            <p style="margin: 0; color: #94a3b8;">Puedes responder directamente a este correo para continuar la conversación.</p>
          </div>
        </div>
      </div>
    `;

    let validInReplyTo = inReplyTo;
    if (validInReplyTo && (!validInReplyTo.includes('@') || validInReplyTo.startsWith('hash:') || validInReplyTo.length < 5)) {
      validInReplyTo = undefined;
    }

    const mailOptions = {
      from: this.from,
      replyTo: this.replyTo,
      to,
      subject: fullSubject,
      text: textBody,
      html: htmlBody,
    };

    if (validInReplyTo) {
      mailOptions.inReplyTo = validInReplyTo;
      mailOptions.references = validInReplyTo;
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✓ Correo de respuesta enviado a ${to} para Ticket #${ticketId} (Message-ID: ${info.messageId})`);
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error(`× Error al enviar correo a ${to}:`, err.message);
      return { sent: false, error: err.message };
    }

  }

  /**
   * Envía confirmación automática de recepción de ticket nuevo
   */
  async sendTicketCreatedConfirmation({ to, name, subject, ticketId }) {
    if (!this.enabled || !this.transporter) return;
    if (process.env.EMAIL_AUTO_REPLY === 'false') return;

    const fullSubject = `[Ticket #${ticketId}] Recibido: ${subject || 'Solicitud de soporte'}`;

    const textBody = `Hola ${name || 'Estimado(a)'},\n\nHemos recibido tu solicitud de soporte con el asunto "${subject || 'Sin asunto'}".\nTu número de ticket asignado es #${ticketId}.\n\nUno de nuestros agentes de soporte atenderá tu consulta a la brevedad.\nPuedes responder directamente a este correo si deseas añadir más detalles.\n\nSaludos,\nKapix Soporte`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #191E29; line-height: 1.6; max-width: 600px; margin: 0 auto; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background-color: #191E29; padding: 20px 24px; border-bottom: 3px solid #01C38D; color: white;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff;">Kapix Soporte</h2>
        </div>
        <div style="background-color: #ffffff; padding: 28px 24px;">
          <p style="margin-top: 0; font-size: 16px; color: #191E29; font-weight: 600;">
            Hola ${escapeHtml(name || 'Estimado(a)')},
          </p>
          <p style="font-size: 14px; color: #475569; margin: 8px 0 16px;">
            Hemos recibido tu mensaje con el asunto: <em>"${escapeHtml(subject || 'Sin asunto')}"</em>
          </p>
          <div style="background-color: #f0fdf4; border-left: 4px solid #01C38D; padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0; font-size: 14px; color: #191E29;"><strong>Número de Ticket:</strong> #${ticketId}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #01C38D; font-weight: 600;">Estado: Abierto y asignado a nuestro equipo</p>
          </div>
          <p style="font-size: 14px; color: #475569; line-height: 1.5;">
            Uno de nuestros agentes responderá a tu solicitud a la brevedad. Puedes responder directamente a este correo para agregar detalles adicionales.
          </p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 28px 0 16px;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            Kapix Soporte • <a href="https://kapix.co.cr" style="color: #01C38D; text-decoration: none;">kapix.co.cr</a>
          </p>
        </div>
      </div>
    `;

    try {

      await this.transporter.sendMail({
        from: this.from,
        replyTo: this.replyTo,
        to,
        subject: fullSubject,
        text: textBody,
        html: htmlBody,
      });
      console.log(`✓ Confirmación de Ticket #${ticketId} enviada a ${to}`);
    } catch (err) {

      console.error(`× No se pudo enviar confirmación a ${to}:`, err.message);
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = new EmailService();
