'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeEq } = require('./util');

const file = (dir) => path.join(dir, 'admin.json');
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = ''; for (let i = 0; i < len; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}
function write(dir, rec) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(file(dir), JSON.stringify(rec), { mode: 0o600 }); }

/** Returns { cred, created } — created holds the plaintext password only on first run. */
function ensure(dir, envPassword) {
  if (envPassword) return { cred: Object.assign({ user: process.env.ADMIN_USER || 'admin', env: true }, hashPw(envPassword)), created: null };
  try { return { cred: JSON.parse(fs.readFileSync(file(dir), 'utf8')), created: null }; } catch { /* first run */ }
  const pw = randomPassword();
  const cred = Object.assign({ user: process.env.ADMIN_USER || 'admin' }, hashPw(pw));
  write(dir, cred);
  return { cred, created: pw };
}
function setPassword(dir, pw) {
  let cur = {}; try { cur = JSON.parse(fs.readFileSync(file(dir), 'utf8')); } catch {}
  const cred = Object.assign({ user: cur.user || 'admin' }, hashPw(pw));
  write(dir, cred); return cred;
}
function verify(cred, user, pw) {
  const h = crypto.scryptSync(String(pw), Buffer.from(cred.salt, 'hex'), 64);
  const okPw = crypto.timingSafeEqual(h, Buffer.from(cred.hash, 'hex'));
  return safeEq(String(user), cred.user) && okPw;
}
const totpFile = (dir) => path.join(dir, 'admin-2fa.json');
const getTotp = (dir) => { try { return JSON.parse(fs.readFileSync(totpFile(dir), 'utf8')); } catch { return null; } };
const setTotp = (dir, rec) => { if (!rec) { try { fs.unlinkSync(totpFile(dir)); } catch {} return; } fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(totpFile(dir), JSON.stringify(rec), { mode: 0o600 }); };
module.exports = { ensure, setPassword, verify, randomPassword, getTotp, setTotp };
