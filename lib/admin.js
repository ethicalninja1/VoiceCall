'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const creds = require('./admin-creds');
const totp = require('./totp');
const { clientIp } = require('./util');

const IDLE_MS = 2 * 3600_000, MAX_MS = 12 * 3600_000, MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
const ADMIN_DIR = path.join(__dirname, '..', 'admin');

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // spreadsheet formula-injection guard
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/**
 * Admin console: password + optional TOTP 2FA, session cookie, lockout, CSRF header on writes,
 * strict CSP (maps may load tiles from OpenStreetMap), no-store caching.
 */
function createAdmin(ctx) {
  const router = express.Router();
  const envPw = ctx.adminPassword || process.env.ADMIN_PASSWORD || '';
  const { cred: firstCred, created } = creds.ensure(ctx.dataDir, envPw);
  const envCred = envPw ? firstCred : null;
  const currentCred = () => { if (envCred) return envCred; try { return JSON.parse(fs.readFileSync(path.join(ctx.dataDir, 'admin.json'), 'utf8')); } catch { return firstCred; } };
  if (created && !ctx.quiet) {
    console.log('\n==================== ADMIN PANEL ====================');
    console.log('  URL:       /admin');
    console.log(`  Username:  ${firstCred.user}`);
    console.log(`  ADMIN PASSWORD (shown once): ${created}`);
    console.log('  Reset later with: node admin-password.js');
    console.log('=====================================================\n');
  }

  const sessions = new Map(), attempts = new Map();
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  router.get('/', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
  router.use('/assets', express.static(path.join(ADMIN_DIR, 'assets'), { maxAge: 0 }));

  const api = express.Router();
  router.use('/api', api);
  api.use(express.json({ limit: '32kb' }));

  const getCookie = (req, name) => { const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; };
  const isHttps = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-visitor'];
  function sessionOf(req) {
    const sid = getCookie(req, 'vc_admin'), s = sid && sessions.get(sid); if (!s) return null;
    const t = Date.now(); if (t - s.last > IDLE_MS || t - s.created > MAX_MS) { sessions.delete(sid); return null; }
    s.last = t; return { sid, s };
  }
  const requireAuth = (req, res, next) => {
    if (!sessionOf(req)) return res.status(401).json({ error: 'unauthorized' });
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'VoiceCallAdmin') return res.status(403).json({ error: 'csrf' });
    next();
  };
  setInterval(() => { const t = Date.now(); for (const [k, s] of sessions) if (t - s.last > IDLE_MS || t - s.created > MAX_MS) sessions.delete(k); }, 60_000).unref();

  /* ---------- auth ---------- */
  api.post('/login', async (req, res) => {
    if (req.headers['x-requested-with'] !== 'VoiceCallAdmin') return res.status(403).json({ error: 'csrf' });
    const ip = clientIp(req), a = attempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) return res.status(429).json({ error: 'locked', retryAfter: Math.ceil((a.until - Date.now()) / 1000) });
    const { username, password, code } = req.body || {};
    let ok = false; try { ok = creds.verify(currentCred(), username || '', password || ''); } catch { ok = false; }
    const tf = creds.getTotp(ctx.dataDir);
    if (ok && tf && tf.enabled && !code) return res.json({ need2fa: true });
    if (ok && tf && tf.enabled && !totp.verify(tf.secret, code)) ok = false;
    if (!ok) {
      a.n++; if (a.n >= MAX_FAILS) { a.until = Date.now() + LOCK_MS; a.n = 0; ctx.logEvent('admin', `Admin sign-in locked after repeated failures from ${ip}`, null, true); }
      attempts.set(ip, a); ctx.logEvent('admin', `Failed admin login from ${ip}`);
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ error: 'invalid', locked: a.until > Date.now() });
    }
    attempts.delete(ip);
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { created: Date.now(), last: Date.now(), ip });
    res.set('Set-Cookie', `vc_admin=${sid}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${MAX_MS / 1000}${isHttps(req) ? '; Secure' : ''}`);
    ctx.logEvent('admin', `Admin signed in from ${ip}`, null, true);
    res.json({ ok: true, user: currentCred().user });
  });
  api.get('/session', (req, res) => { const s = sessionOf(req); const tf = creds.getTotp(ctx.dataDir); res.json({ authenticated: !!s, user: s ? currentCred().user : null, twoFactor: !!(tf && tf.enabled) }); });
  api.post('/logout', requireAuth, (req, res) => { const s = sessionOf(req); if (s) sessions.delete(s.sid); res.set('Set-Cookie', 'vc_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0'); res.json({ ok: true }); });
  api.post('/password', requireAuth, (req, res) => {
    const { current, next } = req.body || {};
    if (envCred) return res.status(400).json({ error: 'Password is managed by the ADMIN_PASSWORD environment variable' });
    if (!creds.verify(currentCred(), currentCred().user, current || '')) return res.status(400).json({ error: 'Current password is incorrect' });
    if (String(next || '').length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });
    creds.setPassword(ctx.dataDir, next);
    const keep = sessionOf(req).sid; for (const k of sessions.keys()) if (k !== keep) sessions.delete(k);
    ctx.logEvent('admin', 'Admin password changed'); res.json({ ok: true });
  });

  // two-factor authentication (authenticator app)
  api.post('/2fa/setup', requireAuth, (_req, res) => {
    const secret = totp.newSecret(); creds.setTotp(ctx.dataDir, { secret, enabled: false });
    res.json({ secret, uri: totp.uri(currentCred().user, secret) });
  });
  api.post('/2fa/enable', requireAuth, (req, res) => {
    const tf = creds.getTotp(ctx.dataDir); if (!tf) return res.status(400).json({ error: 'Start setup first' });
    if (!totp.verify(tf.secret, (req.body || {}).code)) return res.status(400).json({ error: 'Incorrect code' });
    creds.setTotp(ctx.dataDir, { secret: tf.secret, enabled: true }); ctx.logEvent('admin', 'Admin enabled two-factor authentication', null, true); res.json({ ok: true });
  });
  api.post('/2fa/disable', requireAuth, (req, res) => {
    const tf = creds.getTotp(ctx.dataDir), { password, code } = req.body || {};
    if (!creds.verify(currentCred(), currentCred().user, password || '')) return res.status(400).json({ error: 'Password is incorrect' });
    if (tf && tf.enabled && !totp.verify(tf.secret, code)) return res.status(400).json({ error: 'Incorrect code' });
    creds.setTotp(ctx.dataDir, null); ctx.logEvent('admin', 'Admin disabled two-factor authentication', null, true); res.json({ ok: true });
  });

  /* ---------- data ---------- */
  const view = (u) => ctx.accountView(u, false);
  api.get('/overview', requireAuth, (_req, res) => res.json(ctx.overview()));

  api.get('/users', requireAuth, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase(), f = String(req.query.filter || 'all'), sort = String(req.query.sort || 'last');
    let list = [...ctx.users.values()].map(view);
    if (q) list = list.filter((u) => [u.name, u.num, u.identifier, u.ip, u.geo && u.geo.city, u.geo && u.geo.country, u.geo && u.geo.isp, u.ua].some((x) => String(x || '').toLowerCase().includes(q)));
    if (f === 'online') list = list.filter((u) => u.online); else if (f === 'offline') list = list.filter((u) => !u.online); else if (f === 'incall') list = list.filter((u) => u.inCall);
    else if (f === 'banned') list = list.filter((u) => u.banned); else if (f === 'gps') list = list.filter((u) => u.gps); else if (f === 'unverified') list = list.filter((u) => !u.verified);
    const by = { last: (a, b) => (b.online - a.online) || (b.lastActive || 0) - (a.lastActive || 0), name: (a, b) => a.name.localeCompare(b.name), id: (a, b) => a.num.localeCompare(b.num), first: (a, b) => (b.firstSeen || 0) - (a.firstSeen || 0) };
    list.sort(by[sort] || by.last);
    res.json({ total: ctx.users.size, count: list.length, users: list.slice(0, 1000) });
  });
  api.get('/users/:num', requireAuth, (req, res) => {
    const u = ctx.users.get(req.params.num); if (!u) return res.status(404).json({ error: 'not_found' });
    res.json({
      user: ctx.accountView(u, true), calls: ctx.db.callsOf(u.num, 30), events: ctx.db.events(30, '', u.num), signins: ctx.db.signins(30, u.num),
      sessions: ctx.db.sessionsOf(u.num).map((s) => ({ created: s.created_at, last: s.last_used, ip: s.ip, ua: s.ua })),
    });
  });
  const withUser = (fn) => (req, res) => { const u = ctx.users.get(req.params.num); if (!u) return res.status(404).json({ error: 'not_found' }); fn(u, req, res); };
  api.post('/users/:num/kick', requireAuth, withUser((u, _r, res) => { ctx.kick(u, 'kicked'); ctx.logEvent('admin', `Admin disconnected ${u.name} (${u.num})`, u.num); res.json({ ok: true }); }));
  api.post('/users/:num/ban', requireAuth, withUser((u, req, res) => { ctx.ban(u, String((req.body || {}).reason || '').slice(0, 120)); res.json({ ok: true }); }));
  api.post('/users/:num/unban', requireAuth, withUser((u, _r, res) => { ctx.unban(u); res.json({ ok: true }); }));
  api.post('/users/:num/rename', requireAuth, withUser((u, req, res) => { const r = ctx.adminRename(u, (req.body || {}).name); r.error ? res.status(400).json({ error: r.message }) : res.json({ ok: true, name: r.name }); }));
  api.post('/users/:num/reset-password', requireAuth, withUser((u, _r, res) => res.json({ ok: true, temporaryPassword: ctx.resetPassword(u) })));
  api.post('/users/:num/verify', requireAuth, withUser((u, _r, res) => { ctx.verifyUser(u); res.json({ ok: true }); }));
  api.post('/users/:num/signout', requireAuth, withUser((u, _r, res) => { ctx.signOutEverywhere(u); res.json({ ok: true }); }));
  api.delete('/users/:num', requireAuth, withUser((u, _r, res) => { ctx.remove(u, 'admin'); res.json({ ok: true }); }));

  api.get('/signins', requireAuth, (req, res) => {
    const q = String(req.query.q || '').toLowerCase(); let list = ctx.db.signins(300);
    if (q) list = list.filter((s) => [s.identifier, s.ip, s.method, s.reason, (ctx.users.get(s.num) || {}).name].some((x) => String(x || '').toLowerCase().includes(q)));
    res.json({ signins: list.slice(0, 200).map((s) => Object.assign(s, { name: (ctx.users.get(s.num) || {}).name || null })) });
  });
  api.get('/calls', requireAuth, (_req, res) => res.json({ active: ctx.activeCalls(), history: ctx.db.recentCalls(150) }));
  api.get('/events', requireAuth, (req, res) => res.json({ events: ctx.db.events(Math.min(Number(req.query.limit) || 200, 400), String(req.query.q || '')) }));
  api.get('/reports', requireAuth, (_req, res) => res.json({ reports: ctx.db.reports(200).map((r) => Object.assign(r, { reporterName: (ctx.users.get(r.reporter) || {}).name, targetName: (ctx.users.get(r.target) || {}).name })) }));
  api.post('/reports/:id/resolve', requireAuth, (req, res) => { ctx.db.setReport(Number(req.params.id), 'resolved'); res.json({ ok: true }); });
  api.get('/map', requireAuth, (_req, res) => {
    const pts = [];
    for (const u of ctx.users.values()) {
      const v = view(u), g = u.gps ? { lat: u.gps.lat, lon: u.gps.lon, src: 'gps', acc: u.gps.acc } : u.geo && u.geo.lat != null ? { lat: u.geo.lat, lon: u.geo.lon, src: 'ip' } : null;
      if (g) pts.push({ num: u.num, name: u.name, avatar: v.avatar, online: v.online, city: u.geo && u.geo.city, country: u.geo && u.geo.country, ...g });
    }
    res.json({ points: pts });
  });
  api.post('/broadcast', requireAuth, (req, res) => {
    const text = String((req.body || {}).text || '').trim().slice(0, 240); if (!text) return res.status(400).json({ error: 'Message is empty' });
    res.json({ ok: true, delivered: ctx.broadcast(text) });
  });
  api.post('/backup', requireAuth, (_req, res) => { const r = ctx.runMaintenance(); r.error ? res.status(500).json({ error: r.error }) : res.json({ ok: true, file: path.basename(r.file), messages: r.messages, events: r.events }); });
  api.get('/export.csv', requireAuth, (_req, res) => {
    const iso = (t) => (t ? new Date(t).toISOString() : '');
    const head = ['ID', 'Name', 'Email / Mobile', 'Verified', 'Online', 'IP', 'Country', 'Region', 'City', 'ISP', 'IP lat', 'IP lon', 'GPS lat', 'GPS lon', 'GPS accuracy (m)', 'GPS updated', 'Device', 'Created', 'Last active', 'Last sign-in', 'Calls', 'Banned'];
    const rows = [...ctx.users.values()].map((u) => ctx.accountView(u, true)).map((u) => [u.num, u.name, u.identifier, u.verified, u.online, u.ip, u.geo && u.geo.country, u.geo && u.geo.region, u.geo && u.geo.city, u.geo && u.geo.isp, u.geo && u.geo.lat, u.geo && u.geo.lon, u.gps && u.gps.lat, u.gps && u.gps.lon, u.gps && u.gps.acc, u.gps && iso(u.gps.at), u.ua, iso(u.firstSeen), iso(u.lastActive), u.lastSignin && iso(u.lastSignin.t), u.calls, u.banned]);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="voicecall-users.csv"' });
    res.send([head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
  });
  return router;
}
module.exports = { createAdmin };
