'use strict';
/**
 * VoiceCall server v4
 *  - Accounts: sign up / sign in with email or mobile + password (stable 6-digit ID), optional OTP verification.
 *  - Profiles with DP, unique names, server-side contacts, block/report, privacy (last seen).
 *  - Direct chat (store-and-forward, ticks, images) and calls (ring / accept / busy / DND) over WebSocket
 *    with automatic HTTP long-polling fallback. Web Push rings & notifies users when the app is closed.
 *  - Presence (online / last seen) pushed live to the people watching you.
 *  - Admin console at /admin (accounts, sign-in log, live map, reports, 2FA, alerts, backups).
 *  - Call audio/video and in-call chat stay peer-to-peer.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { openDb } = require('./lib/db');
const names = require('./lib/names');
const auth = require('./lib/auth');
const { createGeo } = require('./lib/geo');
const { createNotify } = require('./lib/notify');
const { createPush } = require('./lib/push');
const { clientIp, hashToken, safeEq, limiter } = require('./lib/util');
const { createAdmin } = require('./lib/admin');
let compression = null; try { compression = require('compression'); } catch { /* optional */ }

const RING_MS = 45_000, ONLINE_WINDOW_MS = 35_000, ACTIVE_GRACE_MS = 60_000, RINGING_GRACE_MS = 8_000, QUEUE_TTL_MS = 30_000;
const isNum = (s) => /^\d{6}$/.test(String(s));
const now = () => Date.now();
const convKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function createServer(opts = {}) {
  const env = Object.assign({}, process.env, opts.env || {});
  const dataDir = opts.dataDir || env.DATA_DIR || path.join(__dirname, 'data');
  const db = openDb(dataDir);
  const geo = createGeo({ url: opts.geoUrl || env.GEOIP_URL, enabled: env.GEOIP !== 'off' });
  const notify = createNotify(env);
  const push = createPush({ db, env, sender: opts.pushSender });
  const otp = auth.createOtp();
  const DEFAULT_CC = env.DEFAULT_COUNTRY_CODE || '91';
  const mediaDir = path.join(dataDir, 'media'), avatarDir = path.join(dataDir, 'avatars'), backupDir = path.join(dataDir, 'backups');
  [mediaDir, avatarDir, backupDir].forEach((d) => fs.mkdirSync(d, { recursive: true, mode: 0o700 }));
  const startedAt = now();
  const rl = (max, win) => (env.RATE_LIMIT_OFF ? (_q, _s, next) => next() : limiter(max, win));   // per-IP limits (disabled only in tests)

  const users = new Map(), byIdent = new Map(), nameIndex = new Map(), sessions = new Map(), calls = new Map(), watchers = new Map();
  const samples = [], dirty = new Set(), fails = new Map();

  /* ---------------- accounts ---------------- */
  function hydrate(rec) {
    const u = Object.assign({ avatar: '', about: '', ipHistory: [], geo: null, gps: null, ua: '', banned: false, banReason: '', callCount: 0, settings: { showLastSeen: true }, push: [], verified: false, lastActive: 0 }, rec);
    Object.assign(u, { ws: null, poll: null, queue: [], lastSeen: 0, callId: null, dnd: false, win: 0, cnt: 0, wasOnline: false, savedAt: 0, watch: new Set(),
      contacts: new Map(db.contactsOf(u.num).map((c) => [c.num, c.name])), blocks: new Set(db.blocksOf(u.num)) });
    return u;
  }
  for (const rec of db.loadAccounts()) { const u = hydrate(rec); users.set(u.num, u); byIdent.set(u.identifier, u.num); nameIndex.set(u.nameKey, u.num); }
  for (const s of db.loadSessions()) sessions.set(s.token_hash, { num: s.num });

  const markUser = (u) => dirty.add(u);
  function flush() { if (!dirty.size) return; const list = [...dirty]; dirty.clear(); try { db.tx(() => list.forEach((u) => users.get(u.num) === u && db.saveAccount(u))); } catch (e) { console.error('save failed:', e.message); } }

  function logEvent(type, msg, num, alert) { db.addEvent(type, msg, num); if (alert) notify.alert(msg); }
  const online = (u) => !!(u.ws && u.ws.readyState === 1) || now() - u.lastSeen < ONLINE_WINDOW_MS;
  const live = (u) => !!(u.ws && u.ws.readyState === 1) || !!u.poll;        // has a connection right now (push is only needed otherwise)
  function touch(u) { u.lastSeen = now(); u.lastActive = now(); if (now() - u.savedAt > 30_000) { u.savedAt = now(); markUser(u); } }

  function setMeta(u, meta) {
    if (meta && meta.ua) u.ua = meta.ua;
    const ip = meta && meta.ip; if (!ip) return;
    if (u.ip !== ip) { u.ip = ip; u.ipHistory = [{ ip, at: now() }, ...u.ipHistory.filter((h) => h.ip !== ip)].slice(0, 10); u.geo = null; }
    if (!u.geo) geo.lookup(ip).then((g) => { if (g && u.ip === ip) { u.geo = g; markUser(u); } });
    markUser(u);
  }
  function claimName(u, raw) {
    const v = names.validate(raw);
    if (!v.ok) return { error: 'name_invalid', message: v.message };
    const owner = nameIndex.get(v.key);
    if (owner && owner !== u.num) return { error: 'name_taken', message: 'That name is already taken' };
    if (u.nameKey && nameIndex.get(u.nameKey) === u.num) nameIndex.delete(u.nameKey);
    u.name = v.name; u.nameKey = v.key; nameIndex.set(v.key, u.num); markUser(u);
    return { ok: true, name: u.name };
  }
  function uniqueNum() { for (let i = 0; i < 50; i++) { const n = String(100000 + crypto.randomInt(900000)); if (!users.has(n)) return n; } throw new Error('no free IDs'); }

  const avatarUrl = (u) => (u.avatar ? '/a/' + u.avatar : '');
  function pubProfile(u, viewer) {
    const hidden = u.blocks.has(viewer.num), on = !hidden && online(u);
    return { num: u.num, name: u.name, avatar: hidden ? '' : avatarUrl(u), about: hidden ? '' : u.about, online: on, lastSeen: !hidden && !on && u.settings.showLastSeen ? u.lastActive : null };
  }
  const selfProfile = (u) => ({ num: u.num, name: u.name, avatar: avatarUrl(u), about: u.about, identifier: u.identifier, idType: u.idType, verified: u.verified, settings: u.settings, dnd: u.dnd,
    contacts: [...u.contacts].map(([num, name]) => ({ num, name })), blocks: [...u.blocks] });
  const pubMsg = (m) => ({ id: m.id, from: m.from_num ?? m.from, to: m.to_num ?? m.to, kind: m.kind, body: m.body, url: m.url, ts: m.ts, status: m.status });
  const profilesFor = (nums, viewer) => Object.fromEntries([...new Set(nums)].map((n) => users.get(n)).filter(Boolean).map((p) => [p.num, pubProfile(p, viewer)]));

  /* ---------------- sessions & sign-in ---------------- */
  function issueSession(u, meta) { const token = auth.newToken(), h = hashToken(token); sessions.set(h, { num: u.num }); db.addSession(h, u.num, meta.ip, meta.ua); return token; }
  function revokeSessions(u, exceptHash) { for (const [h, s] of sessions) if (s.num === u.num && h !== exceptHash) sessions.delete(h); db.run('DELETE FROM sessions WHERE num=?' + (exceptHash ? ' AND token_hash<>?' : ''), ...(exceptHash ? [u.num, exceptHash] : [u.num])); }
  const userByToken = (token) => { const s = token && sessions.get(hashToken(token)); return s ? users.get(s.num) || null : null; };
  const needsVerification = (type) => env.REQUIRE_VERIFICATION !== 'off' && notify.canSend(type);
  function logSignin(u, identifier, method, ok, reason, meta) {
    geo.lookup(meta.ip).then((g) => db.addSignin({ num: u ? u.num : null, identifier, method, ok, reason, ip: meta.ip, ua: meta.ua, geo: g })).catch(() => {});
  }
  async function sendCode(u, purpose) {
    const code = otp.issue(u.identifier, purpose);
    await notify.sendOtp(u.identifier, u.idType, code);
  }

  /* ---------------- delivery ---------------- */
  function drain(u) { const t = now(); const out = u.queue.filter((q) => q.exp > t).map((q) => q.msg); u.queue = []; return out; }
  function flushPoll(u) { if (!u.poll || !u.queue.length) return; const { res, timer } = u.poll; clearTimeout(timer); u.poll = null; res.json({ msgs: drain(u) }); }
  function deliver(u, msg, ttl = QUEUE_TTL_MS) {
    if (!u) return;
    if (u.ws && u.ws.readyState === 1) { u.ws.send(JSON.stringify(msg)); return; }
    u.queue.push({ msg, exp: now() + ttl }); if (u.queue.length > 200) u.queue.shift();
    flushPoll(u);
  }
  function attachWs(u, ws) {
    if (u.ws && u.ws !== ws && u.ws.readyState === 1) { try { u.ws.send(JSON.stringify({ type: 'replaced' })); u.ws.close(); } catch {} }
    u.ws = ws; ws.user = u; touch(u);
    ws.send(JSON.stringify({ type: 'registered', profile: selfProfile(u), vapid: push.publicKey }));
    onRegistered(u, (m) => ws.send(JSON.stringify(m)));
    checkPresence(u);
  }
  function onRegistered(u, out) {
    drain(u).forEach(out);
    db.undelivered(u.num).forEach((m) => out({ type: 'msg', msg: pubMsg(m) }));
  }

  /* ---------------- presence ---------------- */
  function checkPresence(u) {
    const on = online(u);
    if (on === u.wasOnline) return;
    u.wasOnline = on;
    const set = watchers.get(u.num); if (!set) return;
    for (const wn of set) { const w = users.get(wn); if (w && online(w)) deliver(w, { type: 'presence_update', profile: pubProfile(u, w) }); }
  }
  function setWatch(u, nums) {
    for (const n of u.watch) { const s = watchers.get(n); if (s) { s.delete(u.num); if (!s.size) watchers.delete(n); } }
    u.watch = new Set(nums.filter(isNum).slice(0, 300));
    for (const n of u.watch) { if (!watchers.has(n)) watchers.set(n, new Set()); watchers.get(n).add(u.num); }
  }

  /* ---------------- calls ---------------- */
  const peerOf = (c, u) => users.get(c.caller === u.num ? c.callee : c.caller);
  const callView = (r) => ({ id: r.id, caller: r.caller, callee: r.callee, callerName: r.callerName, calleeName: r.calleeName, video: r.video, startedAt: r.startedAt, answeredAt: r.answeredAt, endedAt: r.endedAt, reason: r.reason, duration: r.duration });

  function endCall(id, reason, exceptNum) {
    const c = calls.get(id); if (!c) return;
    clearTimeout(c.timer); calls.delete(id);
    const r = c.rec; r.endedAt = now(); r.reason = reason; r.duration = r.answeredAt ? Math.round((r.endedAt - r.answeredAt) / 1000) : 0; db.saveCall(r);
    for (const n of [c.caller, c.callee]) {
      const x = users.get(n); if (!x) continue;
      if (x.callId === id) x.callId = null;
      if (n !== exceptNum) deliver(x, { type: 'ended', callId: id, reason });
      deliver(x, { type: 'call_rec', rec: callView(r) });
    }
  }
  function startCall(u, m) {
    const to = String(m.to || '');
    if (!isNum(to) || to === u.num) return deliver(u, { type: 'unavailable', reason: 'invalid' });
    if (u.callId && calls.has(u.callId)) return deliver(u, { type: 'busy', reason: 'self' });
    const t = users.get(to);
    if (!t || t.banned || t.blocks.has(u.num) || (!online(t) && !t.push.length)) return deliver(u, { type: 'unavailable', reason: 'offline' });
    if (u.blocks.has(t.num)) return deliver(u, { type: 'unavailable', reason: 'blocked' });
    if (t.dnd) return deliver(u, { type: 'busy', reason: 'dnd' });
    if (t.callId && calls.has(t.callId)) return deliver(u, { type: 'busy', reason: 'busy' });
    const id = crypto.randomBytes(6).toString('hex'), key = crypto.randomBytes(8).toString('hex');
    const rec = { id, caller: u.num, callee: t.num, callerName: u.name, calleeName: t.name, video: !!m.video, startedAt: now(), answeredAt: null, endedAt: null, reason: null, duration: 0 };
    db.saveCall(rec); u.callCount++; t.callCount++; markUser(u); markUser(t);
    const c = { id, caller: u.num, callee: t.num, state: 'ringing', video: !!m.video, off: {}, rec, key, timer: setTimeout(() => endCall(id, 'timeout'), RING_MS) };
    calls.set(id, c); u.callId = id; t.callId = id;
    deliver(t, { type: 'incoming', callId: id, from: u.num, name: u.name, avatar: avatarUrl(u), video: c.video }, RING_MS);
    if (!live(t)) push.send(t, { type: 'call', callId: id, from: u.num, name: u.name, avatar: avatarUrl(u), video: c.video, declineKey: key }, { ttl: 45, urgency: 'high' });
    deliver(u, { type: 'ringing', callId: id });
  }

  /* ---------------- direct chat ---------------- */
  function sendDirect(u, m) {
    const to = String(m.to || ''), t = users.get(to), id = String(m.id || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!t || !id || to === u.num) return deliver(u, { type: 'msg_fail', id, reason: 'not_found' });
    if (u.blocks.has(to)) return deliver(u, { type: 'msg_fail', id, reason: 'blocked' });
    const kind = m.kind === 'image' ? 'image' : 'text';
    let body = String(m.body || '').slice(0, kind === 'image' ? 500 : 2000), url = null;
    if (kind === 'text' && !body.trim()) return;
    if (kind === 'image') { url = String(m.url || ''); if (!/^\/m\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(url)) return deliver(u, { type: 'msg_fail', id, reason: 'bad_media' }); }
    const existing = db.getMsg(id);
    const rec = existing || { id, conv: convKey(u.num, to), from: u.num, to, kind, body, url, ts: now(), status: 0 };
    if (!existing) db.addMsg(rec);
    deliver(u, { type: 'msg_sent', id, ts: rec.ts });
    if (existing || t.blocks.has(u.num)) return;               // duplicate retry, or silently blocked by recipient
    deliver(t, { type: 'msg', msg: pubMsg(rec), profile: pubProfile(u, t) });
    if (!live(t)) push.send(t, { type: 'msg', from: u.num, name: u.name, avatar: avatarUrl(u), body: kind === 'image' ? '📷 Photo' : body.slice(0, 120), tag: 'msg-' + u.num }, { ttl: 3600 });
  }

  /* ---------------- admin actions ---------------- */
  function kick(u, reason) {
    if (u.callId) endCall(u.callId, 'hangup', u.num);
    deliver(u, { type: 'kicked', reason });
    if (u.ws) { try { u.ws.close(); } catch {} }
  }
  function ban(u, reason) { u.banned = true; u.banReason = reason || ''; markUser(u); logEvent('admin', `Admin banned ${u.name} (${u.num})${reason ? ': ' + reason : ''}`, u.num, true); kick(u, 'banned'); }
  function unban(u) { u.banned = false; u.banReason = ''; markUser(u); logEvent('admin', `Admin unbanned ${u.name} (${u.num})`, u.num); }
  function removeAccount(u, by) {
    kick(u, 'deleted');
    setWatch(u, []);
    for (const h of [...sessions.keys()]) if (sessions.get(h).num === u.num) sessions.delete(h);
    if (nameIndex.get(u.nameKey) === u.num) nameIndex.delete(u.nameKey);
    if (byIdent.get(u.identifier) === u.num) byIdent.delete(u.identifier);
    users.delete(u.num); dirty.delete(u);
    if (u.avatar) fs.unlink(path.join(avatarDir, u.avatar), () => {});
    db.deleteAccount(u.num);
    logEvent(by === 'admin' ? 'admin' : 'account', `${by === 'admin' ? 'Admin deleted' : 'User deleted account'} ${u.name} (${u.num})`);
  }
  function adminRename(u, raw) { const old = u.name, r = claimName(u, raw); if (r.error) return r; logEvent('admin', `Admin renamed ${old} → ${u.name}`, u.num); deliver(u, { type: 'profile', profile: selfProfile(u) }); return r; }
  function broadcast(text) { let n = 0; for (const u of users.values()) if (online(u)) { deliver(u, { type: 'announcement', text }); n++; } logEvent('admin', `Broadcast to ${n} online users: ${text.slice(0, 80)}`); return n; }
  function resetPassword(u) {
    const temp = crypto.randomBytes(9).toString('base64url');
    const h = auth.hashPassword(temp); u.passSalt = h.salt; u.passHash = h.hash; markUser(u); revokeSessions(u); kick(u, 'signed_out');
    logEvent('admin', `Admin reset password for ${u.name} (${u.num})`, u.num); return temp;
  }
  function verifyUser(u) { u.verified = true; markUser(u); logEvent('admin', `Admin verified ${u.name} (${u.num})`, u.num); }
  function signOutEverywhere(u) { revokeSessions(u); kick(u, 'signed_out'); logEvent('admin', `Admin signed out ${u.name} everywhere`, u.num); }

  const accountView = (u, full = true) => {
    const ls = full ? db.lastSignin(u.num) : null;
    return { num: u.num, name: u.name, avatar: avatarUrl(u), identifier: u.identifier, idType: u.idType, verified: u.verified, online: online(u), inCall: !!(u.callId && calls.has(u.callId)),
      transport: u.ws && u.ws.readyState === 1 ? 'WebSocket' : online(u) ? 'Polling' : null, ip: u.ip || '', ipHistory: u.ipHistory, geo: u.geo, gps: u.gps, ua: u.ua || '',
      firstSeen: u.createdAt, lastActive: online(u) ? now() : u.lastActive, lastSignin: ls ? { t: ls.t, ip: ls.ip, method: ls.method } : null, banned: u.banned, banReason: u.banReason,
      calls: u.callCount, dnd: u.dnd, contacts: u.contacts.size, messages: full ? db.msgCount(u.num) : 0, pushDevices: u.push.length, reports: full ? db.reportCount(u.num) : 0, about: u.about };
  };
  const activeCalls = () => [...calls.values()].map((c) => ({ id: c.id, caller: c.caller, callee: c.callee, callerName: (users.get(c.caller) || {}).name, calleeName: (users.get(c.callee) || {}).name, state: c.state, video: c.video, startedAt: c.rec.startedAt, answeredAt: c.rec.answeredAt }));
  function overview() {
    const list = [...users.values()], t0 = new Date(); t0.setHours(0, 0, 0, 0); const countries = {};
    list.forEach((u) => { const g = u.geo; if (g && g.country) (countries[g.country] = countries[g.country] || { name: g.country, code: g.countryCode, count: 0 }).count++; });
    return {
      totals: { users: list.length, online: list.filter(online).length, inCall: list.filter((u) => u.callId && calls.has(u.callId)).length, activeCalls: calls.size, callsToday: db.callsSince(t0.getTime()), callsTotal: db.totalCalls(),
        gps: list.filter((u) => u.gps).length, banned: list.filter((u) => u.banned).length, newToday: list.filter((u) => u.createdAt >= t0.getTime()).length, verified: list.filter((u) => u.verified).length,
        messages: db.totalMsgs(), reportsOpen: db.reports(500).filter((r) => r.status === 'open').length },
      countries: Object.values(countries).sort((a, b) => b.count - a.count).slice(0, 8), samples,
      server: { uptime: Math.round((now() - startedAt) / 1000), node: process.version, memoryMB: Math.round(process.memoryUsage().rss / 1048576), dataFile: db.path, geoip: env.GEOIP !== 'off', push: push.enabled, otpEmail: notify.canSend('email'), otpSms: notify.canSend('phone'), telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) },
    };
  }
  function runMaintenance() {
    try {
      const f = path.join(backupDir, `voicecall-${new Date().toISOString().slice(0, 10)}.db`); db.backup(f);
      fs.readdirSync(backupDir).filter((n) => n.endsWith('.db')).sort().slice(0, -7).forEach((n) => fs.unlinkSync(path.join(backupDir, n)));
      const r = db.purge({ messageDays: Number(env.MESSAGE_RETENTION_DAYS) || 0, eventDays: Number(env.EVENT_RETENTION_DAYS) || 90 });
      logEvent('system', `Backup saved; purged ${r.messages} messages, ${r.events} old events`); return { file: f, ...r };
    } catch (e) { console.error('maintenance failed:', e.message); return { error: e.message }; }
  }

  /* ---------------- message handling ---------------- */
  function handle(u, m) {
    touch(u);
    const t = now(); if (t - u.win > 5000) { u.win = t; u.cnt = 0; }
    if (++u.cnt > 200) return;
    const reply = (x) => deliver(u, x);

    switch (m.type) {
      case 'ping': return reply({ type: 'pong' });
      case 'dnd': u.dnd = !!m.on; return;
      case 'settings': if (typeof m.showLastSeen === 'boolean') u.settings.showLastSeen = m.showLastSeen; markUser(u); return reply({ type: 'profile', profile: selfProfile(u) });
      case 'profile_update': {
        if (typeof m.about === 'string') u.about = m.about.slice(0, 120);
        if (m.name != null && String(m.name).trim() !== u.name) { const r = claimName(u, m.name); if (r.error) return reply({ type: 'name_error', code: r.error, message: r.message }); logEvent('rename', `Renamed to ${u.name}`, u.num); }
        markUser(u); return reply({ type: 'profile', profile: selfProfile(u) });
      }
      case 'location': {
        if (m.off) { u.gps = null; markUser(u); return; }
        const lat = Number(m.lat), lon = Number(m.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { u.gps = { lat: +lat.toFixed(5), lon: +lon.toFixed(5), acc: Number.isFinite(Number(m.acc)) ? Math.round(Number(m.acc)) : null, at: now() }; markUser(u); }
        return;
      }
      case 'delete_me': return removeAccount(u, 'self');
      case 'watch': { const nums = (Array.isArray(m.nums) ? m.nums : []).map(String); setWatch(u, nums); return reply({ type: 'presence', profiles: profilesFor(nums.filter(isNum), u) }); }
      case 'profiles': return reply({ type: 'profiles', profiles: profilesFor((Array.isArray(m.nums) ? m.nums : []).map(String).filter(isNum).slice(0, 100), u) });
      case 'lookup': {
        const q = String(m.q || '').trim(); let p = null;
        if (isNum(q)) p = users.get(q); else { const v = names.validate(q); if (v.ok) p = users.get(nameIndex.get(v.key)); }
        return reply({ type: 'lookup_result', q, profile: p && !p.banned && p.num !== u.num ? pubProfile(p, u) : null });
      }
      case 'contact_add': {
        const p = users.get(String(m.num)); if (!p || p.num === u.num) return reply({ type: 'toast', text: 'No user found with that ID' });
        const name = String(m.name || p.name).trim().slice(0, 24) || p.name; u.contacts.set(p.num, name); db.putContact(u.num, p.num, name);
        return reply({ type: 'contacts', list: [...u.contacts].map(([num, n]) => ({ num, name: n })), profiles: profilesFor([p.num], u) });
      }
      case 'contact_del': u.contacts.delete(String(m.num)); db.delContact(u.num, String(m.num)); return reply({ type: 'contacts', list: [...u.contacts].map(([num, n]) => ({ num, name: n })) });
      case 'block': { const n = String(m.num); if (users.has(n) && n !== u.num) { u.blocks.add(n); db.putBlock(u.num, n); } return reply({ type: 'blocks', list: [...u.blocks] }); }
      case 'unblock': u.blocks.delete(String(m.num)); db.delBlock(u.num, String(m.num)); return reply({ type: 'blocks', list: [...u.blocks] });
      case 'report': {
        const n = String(m.num); if (!users.has(n)) return;
        db.addReport(u.num, n, String(m.reason || '').slice(0, 200)); logEvent('report', `${u.name} reported ${users.get(n).name}: ${String(m.reason || '').slice(0, 80)}`, n, true);
        return reply({ type: 'toast', text: 'Report sent to the administrator' });
      }
      case 'chats': { const { last, unread } = db.chatsOf(u.num); const chats = last.map((r) => ({ num: r.from_num === u.num ? r.to_num : r.from_num, last: pubMsg(r), unread: unread[r.from_num === u.num ? r.to_num : r.from_num] || 0 })); return reply({ type: 'chats', chats, profiles: profilesFor(chats.map((c) => c.num), u) }); }
      case 'history': {
        const w = String(m.with || ''); if (!isNum(w)) return;
        const lim = Math.min(Number(m.limit) || 40, 100), rows = db.msgsBetween(convKey(u.num, w), Number(m.before) || 0, lim + 1);
        const more = rows.length > lim; if (more) rows.shift();
        return reply({ type: 'history', with: w, msgs: rows.map(pubMsg), more, before: Number(m.before) || 0, profile: users.get(w) ? pubProfile(users.get(w), u) : null });
      }
      case 'msg_send': return sendDirect(u, m);
      case 'msg_ack': {
        const ids = (Array.isArray(m.ids) ? m.ids : []).map(String), changed = db.markDelivered(u.num, ids), by = {};
        changed.forEach((c) => (by[c.from] = by[c.from] || []).push(c.id));
        for (const [from, list] of Object.entries(by)) deliver(users.get(from), { type: 'msg_status', ids: list, status: 1, by: u.num });
        return;
      }
      case 'msg_read': { const from = String(m.from), ids = db.markRead(u.num, from); if (ids.length) deliver(users.get(from), { type: 'msg_status', ids, status: 2, by: u.num }); return; }
      case 'typing_to': { const t2 = users.get(String(m.to)); if (t2 && !t2.blocks.has(u.num)) deliver(t2, { type: 'typing_from', from: u.num }, 4000); return; }
      case 'call_history': { const list = db.callsOf(u.num); return reply({ type: 'call_history', list, profiles: profilesFor(list.map((c) => (c.caller === u.num ? c.callee : c.caller)), u) }); }
      case 'call': return startCall(u, m);
      default: break;
    }

    const c = calls.get(u.callId); if (!c) return;
    switch (m.type) {
      case 'accept': if (c.callee !== u.num || c.state !== 'ringing') return; c.state = 'active'; clearTimeout(c.timer); c.rec.answeredAt = now(); db.saveCall(c.rec); return deliver(peerOf(c, u), { type: 'accepted', callId: c.id });
      case 'decline': if (c.callee === u.num && c.state === 'ringing') endCall(c.id, 'declined', u.num); return;
      case 'cancel': if (c.caller === u.num && c.state === 'ringing') endCall(c.id, 'cancelled', u.num); return;
      case 'bye': return endCall(c.id, 'hangup', u.num);
      case 'signal': if (c.state !== 'active' || JSON.stringify(m.data || '').length > 60_000) return; return deliver(peerOf(c, u), { type: 'signal', callId: c.id, data: m.data });
      default: return;
    }
  }

  /* ---------------- ICE config ---------------- */
  let cfCache = { at: 0, servers: [] };
  async function iceServers() {
    const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
    if (env.TURN_URL) ice.push({ urls: env.TURN_URL.split(','), username: env.TURN_USER, credential: env.TURN_PASS });
    if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
      try {
        if (now() - cfCache.at > 3_600_000) {
          const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }) });
          const s = (await r.json()).iceServers; cfCache = { at: now(), servers: Array.isArray(s) ? s : [s] };
        }
        ice.push(...cfCache.servers);
      } catch (e) { console.error('Cloudflare TURN error:', e.message); }
    }
    return ice;
  }

  /* ---------------- HTTP ---------------- */
  const app = express();
  app.disable('x-powered-by');
  if (compression) app.use(compression());
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(express.json({ limit: '128kb' }));

  const adminCtx = { dataDir, db, notify, adminPassword: opts.adminPassword, quiet: opts.quiet, users, logEvent, accountView, activeCalls, overview, kick, ban, unban, remove: removeAccount, adminRename, broadcast, resetPassword, verifyUser, signOutEverywhere, runMaintenance, revokeSessions };
  app.use('/admin', createAdmin(adminCtx));
  app.use(express.static(path.join(__dirname, 'public'), { etag: true, setHeaders: (res, p) => { if (/\.(html|js|css|webmanifest)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); else res.setHeader('Cache-Control', 'public, max-age=86400'); } }));

  app.get('/health', (_req, res) => res.json({ ok: true, users: users.size, calls: calls.size, time: now() }));
  app.get('/config', async (_req, res) => res.json({ iceServers: await iceServers(), vapid: push.publicKey, verification: { email: notify.canSend('email'), phone: notify.canSend('phone') } }));

  const meta = (req) => ({ ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 300) });
  const tokenOf = (req) => req.get('x-vc-token') || '';
  const authed = (req, res, next) => { const u = userByToken(tokenOf(req)); if (!u || u.banned) return res.status(401).json({ error: 'auth' }); req.user = u; const m = meta(req); if (m.ip && m.ip !== u.ip) setMeta(u, m); next(); };
  const lockKey = (id) => 'l:' + id;
  const locked = (id) => { const f = fails.get(lockKey(id)); return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0; };
  function recordFail(id) { const k = lockKey(id), f = fails.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = now() + 600_000; f.n = 0; } fails.set(k, f); if (fails.size > 5000) fails.clear(); }
  const profileResponse = (u, token) => ({ ok: true, token, profile: selfProfile(u) });

  app.get('/api/name-available', rl(40, 60_000), (req, res) => {          // live "name is free" check on the sign-up form
    const v = names.validate(req.query.name);
    if (!v.ok) return res.json({ available: false, reason: v.message });
    const owner = nameIndex.get(v.key), me = userByToken(tokenOf(req));
    const own = !!(owner && me && me.num === owner);
    res.json({ available: !owner || own, name: v.name, reason: owner && !own ? 'That name is already taken' : '' });
  });

  // --- sign up / verify / sign in / sign out / password reset
  app.post('/api/auth/signup', rl(12, 60_000), async (req, res) => {
    const { identifier, password, name } = req.body || {};
    const idn = auth.normIdentifier(identifier, DEFAULT_CC); if (idn.error) return res.status(400).json({ error: idn.error });
    const pe = auth.validPassword(password); if (pe) return res.status(400).json({ error: pe });
    const v = names.validate(name); if (!v.ok) return res.status(400).json({ error: v.message });
    const m = meta(req), need = needsVerification(idn.type);
    let u = users.get(byIdent.get(idn.id));
    if (u && (u.verified || !need)) return res.status(409).json({ error: 'An account with this ' + (idn.type === 'email' ? 'email' : 'mobile number') + ' already exists. Please sign in.' });
    const owner = nameIndex.get(v.key); if (owner && (!u || owner !== u.num)) return res.status(409).json({ error: 'That name is already taken' });
    if (u) { const h = auth.hashPassword(password); u.passSalt = h.salt; u.passHash = h.hash; claimName(u, name); }      // retry of an unverified signup
    else {
      const h = auth.hashPassword(password), num = uniqueNum();
      u = hydrate({ num, name: v.name, nameKey: v.key, identifier: idn.id, idType: idn.type, passSalt: h.salt, passHash: h.hash, verified: false, createdAt: now() });
      users.set(num, u); byIdent.set(idn.id, num); nameIndex.set(v.key, num);
      logEvent('signup', `New account ${u.name} (${num}) — ${auth.maskIdentifier(idn.id, idn.type)} from ${m.ip}`, num, true);
    }
    setMeta(u, m); markUser(u);
    if (need) { try { await sendCode(u, 'verify'); } catch { return res.status(502).json({ error: 'Could not send the verification code. Try again shortly.' }); } return res.json({ ok: true, needsVerification: true, identifier: idn.id, masked: auth.maskIdentifier(idn.id, idn.type) }); }
    const token = issueSession(u, m); logSignin(u, idn.id, 'signup', 1, '', m); flush();
    res.json(profileResponse(u, token));
  });

  app.post('/api/auth/verify', rl(20, 60_000), (req, res) => {
    const idn = auth.normIdentifier((req.body || {}).identifier, DEFAULT_CC), u = idn.id && users.get(byIdent.get(idn.id));
    if (!u || !otp.check(u.identifier, 'verify', String((req.body || {}).code || '').trim())) return res.status(400).json({ error: 'Incorrect or expired code' });
    u.verified = true; markUser(u); const m = meta(req), token = issueSession(u, m); logSignin(u, u.identifier, 'verify', 1, '', m); flush();
    res.json(profileResponse(u, token));
  });

  app.post('/api/auth/resend', rl(8, 60_000), async (req, res) => {
    const idn = auth.normIdentifier((req.body || {}).identifier, DEFAULT_CC), u = idn.id && users.get(byIdent.get(idn.id)), purpose = (req.body || {}).purpose === 'reset' ? 'reset' : 'verify';
    if (!u || (purpose === 'verify' && u.verified)) return res.json({ ok: true });
    if (now() - otp.lastSent(u.identifier, purpose) < 30_000) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code' });
    try { await sendCode(u, purpose); res.json({ ok: true }); } catch { res.status(502).json({ error: 'Could not send the code' }); }
  });

  app.post('/api/auth/signin', rl(20, 60_000), async (req, res) => {
    const { identifier, password } = req.body || {}, m = meta(req);
    const idn = auth.normIdentifier(identifier, DEFAULT_CC); if (idn.error) return res.status(400).json({ error: idn.error });
    const wait = locked(idn.id); if (wait) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` });
    const u = users.get(byIdent.get(idn.id));
    const ok = u ? auth.verifyPassword(password, u.passSalt, u.passHash) : (auth.verifyPassword(password, '00', '00'), false);
    if (!ok) { recordFail(idn.id); logSignin(u, idn.id, 'password', 0, 'bad credentials', m); return res.status(401).json({ error: 'Incorrect email / mobile or password' }); }
    if (u.banned) { logSignin(u, idn.id, 'password', 0, 'banned', m); return res.status(403).json({ error: 'banned', message: u.banReason || 'Your account has been blocked by the administrator.' }); }
    if (!u.verified && needsVerification(u.idType)) { try { await sendCode(u, 'verify'); } catch {} return res.json({ ok: true, needsVerification: true, identifier: u.identifier, masked: auth.maskIdentifier(u.identifier, u.idType) }); }
    fails.delete(lockKey(idn.id)); setMeta(u, m); const token = issueSession(u, m); logSignin(u, idn.id, 'password', 1, '', m); logEvent('signin', `${u.name} (${u.num}) signed in from ${m.ip}`, u.num); flush();
    res.json(profileResponse(u, token));
  });

  app.post('/api/auth/signout', (req, res) => { const h = tokenOf(req) && hashToken(tokenOf(req)); if (h && sessions.has(h)) { sessions.delete(h); db.delSession(h); } res.json({ ok: true }); });

  app.post('/api/auth/forgot', rl(6, 60_000), async (req, res) => {
    const idn = auth.normIdentifier((req.body || {}).identifier, DEFAULT_CC); if (idn.error) return res.status(400).json({ error: idn.error });
    if (!notify.canSend(idn.type)) return res.status(400).json({ error: 'Password reset by code is not set up on this server. Please ask the administrator to reset your password.' });
    const u = users.get(byIdent.get(idn.id)); if (u && now() - otp.lastSent(u.identifier, 'reset') > 30_000) { try { await sendCode(u, 'reset'); } catch {} }
    res.json({ ok: true });
  });
  app.post('/api/auth/reset', rl(10, 60_000), (req, res) => {
    const { identifier, code, password } = req.body || {}, idn = auth.normIdentifier(identifier, DEFAULT_CC), u = idn.id && users.get(byIdent.get(idn.id));
    const pe = auth.validPassword(password); if (pe) return res.status(400).json({ error: pe });
    if (!u || !otp.check(u.identifier, 'reset', String(code || '').trim())) return res.status(400).json({ error: 'Incorrect or expired code' });
    const h = auth.hashPassword(password); u.passSalt = h.salt; u.passHash = h.hash; u.verified = true; markUser(u); revokeSessions(u); kick(u, 'signed_out'); logEvent('account', `${u.name} reset password`, u.num); flush();
    res.json({ ok: true });
  });

  // --- profile
  app.get('/api/me', authed, (req, res) => res.json({ ok: true, profile: selfProfile(req.user) }));
  app.post('/api/me/password', authed, (req, res) => {
    const u = req.user, { current, next } = req.body || {};
    if (!auth.verifyPassword(current, u.passSalt, u.passHash)) return res.status(400).json({ error: 'Current password is incorrect' });
    const pe = auth.validPassword(next); if (pe) return res.status(400).json({ error: pe });
    const h = auth.hashPassword(next); u.passSalt = h.salt; u.passHash = h.hash; markUser(u); revokeSessions(u, hashToken(tokenOf(req))); flush(); res.json({ ok: true });
  });
  const imageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '800kb' });
  function saveImage(dir, bytes, max, req, res) {   // returns the stored file name, or null after sending an error response
    const fail = (code, error) => { res.status(code).json({ error }); return null; };
    if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(400, 'No image received');
    if (req.body.length > max) return fail(413, 'Image is too large');
    const ext = sniff(req.body); if (!ext) return fail(400, 'Unsupported image');
    const file = crypto.randomBytes(bytes).toString('hex') + '.' + ext; fs.writeFileSync(path.join(dir, file), req.body, { mode: 0o600 }); return file;
  }
  app.post('/api/me/avatar', authed, imageBody, (req, res) => {
    const file = saveImage(avatarDir, 8, 300 * 1024, req, res); if (!file) return;
    const u = req.user; if (u.avatar) fs.unlink(path.join(avatarDir, u.avatar), () => {});
    u.avatar = file; markUser(u); flush(); deliver(u, { type: 'profile', profile: selfProfile(u) }); res.json({ ok: true, avatar: '/a/' + file });
  });
  app.delete('/api/me/avatar', authed, (req, res) => { const u = req.user; if (u.avatar) fs.unlink(path.join(avatarDir, u.avatar), () => {}); u.avatar = ''; markUser(u); flush(); res.json({ ok: true }); });
  app.post('/api/media', authed, rl(30, 60_000), imageBody, (req, res) => {
    const file = saveImage(mediaDir, 12, 700 * 1024, req, res); if (file) res.json({ ok: true, url: '/m/' + file });
  });
  const serveFile = (dir, re) => (req, res) => {
    if (!re.test(req.params.file)) return res.status(404).end();
    res.set({ 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.sendFile(path.join(dir, req.params.file), (e) => { if (e && !res.headersSent) res.status(404).end(); });
  };
  app.get('/a/:file', serveFile(avatarDir, /^[a-f0-9]{16}\.(jpg|png|webp)$/));
  app.get('/m/:file', serveFile(mediaDir, /^[a-f0-9]{24}\.(jpg|png|webp)$/));

  // --- web push
  app.post('/api/push/subscribe', authed, (req, res) => {
    const sub = (req.body || {}).subscription; if (!sub || !/^https:\/\//.test(sub.endpoint || '') || !sub.keys) return res.status(400).json({ error: 'Invalid subscription' });
    const u = req.user; u.push = [{ endpoint: sub.endpoint, keys: sub.keys }, ...u.push.filter((s) => s.endpoint !== sub.endpoint)].slice(0, 5); markUser(u); flush(); res.json({ ok: true });
  });
  app.post('/api/push/unsubscribe', authed, (req, res) => { const u = req.user; u.push = u.push.filter((s) => s.endpoint !== (req.body || {}).endpoint); markUser(u); res.json({ ok: true }); });
  app.post('/api/call/decline', rl(30, 60_000), (req, res) => {       // "Decline" button on the call notification
    const { callId, key } = req.body || {}, c = calls.get(String(callId));
    if (c && c.state === 'ringing' && safeEq(c.key, String(key || ''))) endCall(c.id, 'declined', c.callee);
    res.json({ ok: true });
  });

  // --- polling transport
  app.post('/api/register', rl(60, 60_000), (req, res) => {
    const u = userByToken((req.body || {}).token); if (!u) return res.json({ type: 'error', code: 'auth', message: 'Please sign in again' });
    if (u.banned) return res.json({ type: 'error', code: 'banned', message: u.banReason || 'Your account has been blocked by the administrator.' });
    setMeta(u, meta(req)); touch(u); res.json({ type: 'registered', profile: selfProfile(u), vapid: push.publicKey });
    setImmediate(() => { onRegistered(u, (m) => deliver(u, m)); checkPresence(u); });
  });
  app.post('/api/send', authed, (req, res) => { const msg = (req.body || {}).msg; if (msg && typeof msg === 'object') handle(req.user, msg); res.json({ ok: true }); });
  app.get('/api/poll', authed, (req, res) => {
    const u = req.user; touch(u);
    if (u.poll) { clearTimeout(u.poll.timer); u.poll.res.json({ msgs: [] }); u.poll = null; }
    const msgs = drain(u); if (msgs.length) return res.json({ msgs });
    const timer = setTimeout(() => { if (u.poll && u.poll.res === res) { u.poll = null; touch(u); res.json({ msgs: [] }); } }, 25_000);
    u.poll = { res, timer };
    res.on('close', () => { if (u.poll && u.poll.res === res) { clearTimeout(timer); u.poll = null; } });
  });

  /* ---------------- WebSocket ---------------- */
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
  wss.on('connection', (ws, req) => {
    ws.isAlive = true; ws.meta = meta(req);
    ws.on('pong', () => { ws.isAlive = true; if (ws.user) touch(ws.user); });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'register') {
        const u = userByToken(m.token);
        if (!u) return ws.send(JSON.stringify({ type: 'error', code: 'auth', message: 'Please sign in again' }));
        if (u.banned) return ws.send(JSON.stringify({ type: 'error', code: 'banned', message: u.banReason || 'Your account has been blocked by the administrator.' }));
        setMeta(u, ws.meta); return attachWs(u, ws);
      }
      if (ws.user) handle(ws.user, m);
    });
    ws.on('close', () => { const u = ws.user; if (u && u.ws === ws) { u.ws = null; u.lastSeen = Math.min(u.lastSeen, now() - (ONLINE_WINDOW_MS - 10_000)); } });
    ws.on('error', () => {});
  });

  /* ---------------- timers & lifecycle ---------------- */
  const timers = [];
  const sample = () => { samples.push({ t: now(), online: [...users.values()].filter(online).length, calls: calls.size }); if (samples.length > 180) samples.shift(); };
  function startTimers() {
    sample();
    timers.push(setInterval(() => wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch {} }), 20_000));
    timers.push(setInterval(() => {
      const t = now();
      for (const c of calls.values()) for (const n of [c.caller, c.callee]) {
        const x = users.get(n); if (x && online(x)) { delete c.off[n]; continue; }
        c.off[n] = c.off[n] || t;
        if (t - c.off[n] > (c.state === 'ringing' && online(users.get(c.callee) || {}) ? RINGING_GRACE_MS : c.state === 'ringing' ? RING_MS : ACTIVE_GRACE_MS)) { endCall(c.id, 'lost'); break; }
      }
      for (const u of users.values()) checkPresence(u);
    }, 3000));
    timers.push(setInterval(sample, 60_000), setInterval(flush, 1500), setInterval(runMaintenance, 24 * 3600_000));
    timers.forEach((x) => x.unref && x.unref());
  }
  function start(port = env.PORT || 3000) { startTimers(); return new Promise((resolve) => server.listen(port, () => resolve(server))); }
  function stop() {
    timers.forEach(clearInterval); flush();
    wss.clients.forEach((c) => c.terminate()); calls.forEach((c) => clearTimeout(c.timer));
    for (const u of users.values()) if (u.poll) { clearTimeout(u.poll.timer); try { u.poll.res.json({ msgs: [] }); } catch {} }
    return new Promise((resolve) => server.close(() => { db.close(); resolve(); }));
  }
  return { start, stop, server, users, flush, runMaintenance, push };
}

if (require.main === module) {
  const s = createServer();
  s.start().then(() => console.log('VoiceCall running on port ' + s.server.address().port));
  const bye = () => { s.flush(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
module.exports = { createServer };
