'use strict';
// RFC 6238 TOTP (Google Authenticator / Authy compatible) — no dependencies.
const crypto = require('crypto');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (buf) => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const unb32 = (s) => { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const newSecret = () => b32(crypto.randomBytes(20));
function code(secret, t = Date.now(), step = 30) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / step)));
  const h = crypto.createHmac('sha1', unb32(secret)).update(ctr).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
const verify = (secret, c, t = Date.now()) => /^\d{6}$/.test(String(c)) && [-1, 0, 1].some((w) => code(secret, t + w * 30000) === String(c));
const uri = (label, secret, issuer = 'VoiceCall Admin') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
module.exports = { newSecret, code, verify, uri };
