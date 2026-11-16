'use strict';
const crypto = require('crypto');

/** Email or mobile number -> normalised unique identifier. */
function normIdentifier(raw, defaultCc = '91') {
  raw = String(raw || '').trim();
  if (!raw) return { error: 'Enter your email or mobile number' };
  if (raw.includes('@')) {
    const e = raw.toLowerCase();
    if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { error: 'Enter a valid email address' };
    return { id: e, type: 'email' };
  }
  let d = raw.replace(/[\s\-().]/g, ''), plus = d.startsWith('+');
  if (d.startsWith('00')) { plus = true; d = d.slice(2); }
  d = d.replace(/^\+/, '');
  if (!/^\d{8,15}$/.test(d)) return { error: 'Enter a valid mobile number' };
  if (!plus && d.length === 10) d = defaultCc + d;
  return { id: '+' + d, type: 'phone' };
}
const maskIdentifier = (id, type) => (type === 'email' ? id.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : id.slice(0, 3) + '•••••' + id.slice(-2));

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
function verifyPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64), b = Buffer.from(hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}
const validPassword = (pw) => (String(pw || '').length < 8 ? 'Password must be at least 8 characters' : String(pw).length > 128 ? 'Password is too long' : '');
const newToken = () => crypto.randomBytes(32).toString('hex');

/** One-time codes (email / SMS). Kept in memory, 10 minute expiry, 5 tries. */
function createOtp() {
  const store = new Map();
  const hash = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');
  return {
    issue(identifier, purpose) {
      const code = String(crypto.randomInt(100000, 1000000));
      store.set(identifier + '|' + purpose, { h: hash(code), exp: Date.now() + 600_000, tries: 0, sent: Date.now() });
      return code;
    },
    lastSent: (identifier, purpose) => (store.get(identifier + '|' + purpose) || {}).sent || 0,
    check(identifier, purpose, code) {
      const k = identifier + '|' + purpose, e = store.get(k);
      if (!e || e.exp < Date.now() || e.tries >= 5) { store.delete(k); return false; }
      e.tries++;
      if (e.h === hash(code)) { store.delete(k); return true; }
      return false;
    },
  };
}
module.exports = { normIdentifier, maskIdentifier, hashPassword, verifyPassword, validPassword, newToken, createOtp };
