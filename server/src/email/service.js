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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4f46e5; padding: 16px 20px; border-radius: 8px 8px 0 0; color: white;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Kasupport — Soporte</h2>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
          <p style="margin-top: 0; font-size: 15px; color: #374151; white-space: pre-wrap;">${escapeHtml(body)}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Respuesta de <strong>${escapeHtml(agentName || 'Equipo de Soporte')}</strong> sobre el <strong>Ticket #${ticketId}</strong>.<br />
            Puedes responder directamente a este correo para agregar más información.
          </p>
        </div>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        replyTo: this.replyTo,
        to,
        subject: fullSubject,
        text: textBody,
        html: htmlBody,
        inReplyTo: inReplyTo || undefined,
        references: references || inReplyTo || undefined,
      });

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

    const textBody = `Hola ${name || 'Estimado(a)'},\n\nHemos recibido tu solicitud de soporte con el asunto "${subject || 'Sin asunto'}".\nTu número de ticket asignado es #${ticketId}.\n\nUno de nuestros agentes de soporte atenderá tu consulta a la brevedad.\nPuedes responder directamente a este correo si deseas añadir más detalles.\n\nSaludos,\nEquipo de Soporte Kapix`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4f46e5; padding: 16px 20px; border-radius: 8px 8px 0 0; color: white;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Solicitud Recibida — Ticket #${ticketId}</h2>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
          <p style="margin-top: 0; font-size: 15px; color: #374151;">
            Hola <strong>${escapeHtml(name || 'Estimado(a)')}</strong>,
          </p>
          <p style="font-size: 14px; color: #4b5563;">
            Hemos recibido tu mensaje con el asunto <em>"${escapeHtml(subject || 'Sin asunto')}"</em>.
          </p>
          <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #1f2937;"><strong>Ticket #:</strong> ${ticketId}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #4b5563;"><strong>Estado:</strong> Abierto y asignado a nuestro equipo</p>
          </div>
          <p style="font-size: 14px; color: #4b5563;">
            Uno de nuestros agentes responderá a tu solicitud a la brevedad. Puedes responder directamente a este correo para enviar más detalles.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;" />
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            Kasupport • Kapix Soporte
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
