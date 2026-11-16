'use strict';
/** Outbound channels: email OTP (SMTP), SMS OTP (webhook), Telegram admin alerts. All optional. */
function createNotify(env = process.env) {
  let mailer = null;
  if (env.SMTP_URL) { try { mailer = require('nodemailer').createTransport(env.SMTP_URL); } catch { console.error('SMTP_URL set but nodemailer is not installed (npm i nodemailer)'); } }
  const smsUrl = env.SMS_WEBHOOK_URL || '';

  return {
    canSend: (type) => (type === 'email' ? !!mailer : !!smsUrl),
    async sendOtp(to, type, code) {
      const text = `Your VoiceCall verification code is ${code}. It expires in 10 minutes. Do not share it.`;
      if (type === 'email' && mailer) return mailer.sendMail({ from: env.MAIL_FROM || 'VoiceCall <no-reply@localhost>', to, subject: 'Your VoiceCall code', text });
      if (type === 'phone' && smsUrl) {
        const r = await fetch(smsUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, env.SMS_WEBHOOK_AUTH ? { Authorization: env.SMS_WEBHOOK_AUTH } : {}), body: JSON.stringify({ to, text }), signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('SMS gateway error ' + r.status);
        return;
      }
      throw new Error('no_channel');
    },
    async alert(text) {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
      try {
        await fetch(`${env.TELEGRAM_API || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: '🔔 VoiceCall: ' + text }), signal: AbortSignal.timeout(6000),
        });
      } catch { /* alerts are best-effort */ }
    },
  };
}
module.exports = { createNotify };
