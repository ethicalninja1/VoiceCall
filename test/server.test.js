'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const { createServer } = require('../server');
const totp = require('../lib/totp');

const ADMIN_PW = 'CorrectHorse-Battery9', PW = 'Passw0rd!x';
const csrf = { 'X-Requested-With': 'VoiceCallAdmin' };
let srv, base, wsUrl, dataDir, mock, smsLog = [], tgLog = [], pushLog = [], opts;
const jpeg = (n = 600) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n)]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  srv = createServer(opts); await srv.start(0);
  const p = srv.server.address().port; base = `http://127.0.0.1:${p}`; wsUrl = `ws://127.0.0.1:${p}/ws`;
}
test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc4-test-'));
  mock = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/sms')) { smsLog.push(JSON.parse(body)); return res.end('{}'); }
      if (req.url.includes('/sendMessage')) { tgLog.push(JSON.parse(body)); return res.end('{"ok":true}'); }
      res.end(JSON.stringify({ success: true, country: 'India', country_code: 'IN', region: 'Delhi', city: 'New Delhi', latitude: 28.61, longitude: 77.2, connection: { isp: 'TestNet' }, timezone: { id: 'Asia/Kolkata' } }));
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const mp = mock.address().port;
  opts = { dataDir, adminPassword: ADMIN_PW, quiet: true, geoUrl: `http://127.0.0.1:${mp}/geo/{ip}`,
    env: { RATE_LIMIT_OFF: '1', SMS_WEBHOOK_URL: `http://127.0.0.1:${mp}/sms`, TELEGRAM_BOT_TOKEN: 't0k', TELEGRAM_CHAT_ID: '42', TELEGRAM_API: `http://127.0.0.1:${mp}` },
    pushSender: async (sub, payload, o) => { pushLog.push({ sub, payload, o }); } };
  await boot();
});
test.after(async () => { await srv.stop(); mock.close(); });

/* ---------- helpers ---------- */
const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (url, token) => fetch(base + url, { headers: token ? { 'X-VC-Token': token } : {} });
async function signup(identifier, name, password = PW, headers = {}) {
  const r = await post('/api/auth/signup', { identifier, password, name }, headers); const d = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(d)); return d;
}
function ws(token, headers = {}) {
  const w = new WebSocket(wsUrl, { headers }), inbox = [], waiters = [];
  w.on('message', (raw) => { const m = JSON.parse(raw); const i = waiters.findIndex((x) => x.type === m.type); if (i >= 0) waiters.splice(i, 1)[0].res(m); else inbox.push(m); });
  const c = {
    w, send: (m) => w.send(JSON.stringify(m)),
    next: (type, ms = 2500) => new Promise((res, rej) => { const i = inbox.findIndex((m) => m.type === type); if (i >= 0) return res(inbox.splice(i, 1)[0]); waiters.push({ type, res }); setTimeout(() => rej(new Error('timeout waiting for ' + type)), ms); }),
    none: async (type, ms = 300) => { await sleep(ms); assert.ok(!inbox.some((m) => m.type === type), 'unexpected ' + type); },
    close: () => w.close(),
    ready: new Promise((res) => w.on('open', () => { w.send(JSON.stringify({ type: 'register', token })); res(); })),
  };
  return c;
}
async function online(token, headers) { const c = ws(token, headers); await c.ready; const r = await c.next('registered'); c.profile = r.profile; return c; }
async function mkUser(tag, headers) { const s = await signup(`${tag}@example.com`, `User ${tag}`, PW, headers); return { token: s.token, num: s.profile.num, name: s.profile.name }; }
async function adminLogin(extra = {}) {
  const r = await post('/admin/api/login', { username: 'admin', password: ADMIN_PW, ...extra }, csrf);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { r, cookie, call: (method, url, body) => fetch(base + '/admin/api' + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...csrf }, body: body ? JSON.stringify(body) : undefined }) };
}

/* ---------- accounts ---------- */
test('health + config', async () => {
  assert.strictEqual((await (await fetch(base + '/health')).json()).ok, true);
  const c = await (await fetch(base + '/config')).json(); assert.ok(c.iceServers.length >= 1 && c.vapid.length > 40); assert.strictEqual(c.verification.phone, true);
});

test('sign-up validates input; names and email/mobile are unique', async () => {
  const bad = async (body, re) => { const r = await post('/api/auth/signup', body); assert.strictEqual(r.status, 400); assert.match((await r.json()).error, re); };
  await bad({ identifier: 'nope', password: PW, name: 'Valid Name' }, /valid/i);
  await bad({ identifier: 'a@b.com', password: 'short', name: 'Valid Name' }, /8 characters/);
  await bad({ identifier: 'a@b.com', password: PW, name: 'x' }, /3–24/);
  await bad({ identifier: 'a@b.com', password: PW, name: 'Admin' }, /reserved/);
  await signup('asha@example.com', 'Asha Kumar');
  const dupName = await post('/api/auth/signup', { identifier: 'other@example.com', password: PW, name: 'asha_kumar' }); assert.strictEqual(dupName.status, 409);
  const dupMail = await post('/api/auth/signup', { identifier: 'ASHA@Example.com', password: PW, name: 'Someone Else' }); assert.strictEqual(dupMail.status, 409);
  const free = await (await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'free@example.com', password: PW, name: 'Free Name' }) })).json();
  assert.ok(free.token);
});

test('name-available endpoint', async () => {
  await signup('avail@example.com', 'Taken Name');
  const q = async (n) => (await (await fetch(base + '/api/name-available?name=' + encodeURIComponent(n))).json());
  assert.strictEqual((await q('taken_name')).available, false); assert.strictEqual((await q('Free Name 9')).available, true); assert.strictEqual((await q('x')).available, false);
});

test('sign-in keeps the same ID everywhere; sign-out revokes the session; lockout after failures', async () => {
  const s = await signup('stable@example.com', 'Stable Soul'); const id = s.profile.num;
  const a = await (await post('/api/auth/signin', { identifier: 'STABLE@example.com', password: PW })).json();
  const b = await (await post('/api/auth/signin', { identifier: 'stable@example.com', password: PW })).json();
  assert.strictEqual(a.profile.num, id); assert.strictEqual(b.profile.num, id); assert.notStrictEqual(a.token, b.token);
  const c = await online(a.token); assert.strictEqual(c.profile.num, id); c.close();
  await post('/api/auth/signout', {}, { 'X-VC-Token': a.token });
  const dead = ws(a.token); await dead.ready; assert.strictEqual((await dead.next('error')).code, 'auth'); dead.close();
  const still = await online(b.token); still.close();                        // other device still signed in
  assert.strictEqual((await post('/api/auth/signin', { identifier: 'stable@example.com', password: 'wrong-pass-1' })).status, 401);
  let last; for (let i = 0; i < 5; i++) last = await post('/api/auth/signin', { identifier: 'stable@example.com', password: 'wrong-pass-' + i });
  assert.strictEqual(last.status, 429);
  assert.strictEqual((await post('/api/auth/signin', { identifier: 'stable@example.com', password: PW })).status, 429);   // locked even with the right password
});

test('mobile numbers: formats normalise to one account; OTP verification + password reset via SMS', async () => {
  smsLog.length = 0;
  const r = await (await post('/api/auth/signup', { identifier: '98765 43210', password: PW, name: 'Mobile Mia' })).json();
  assert.strictEqual(r.needsVerification, true); assert.strictEqual(r.identifier, '+919876543210');
  const code1 = /(\d{6})/.exec(smsLog.at(-1).text)[1]; assert.strictEqual(smsLog.at(-1).to, '+919876543210');
  const noLogin = await post('/api/auth/signin', { identifier: '+91 98765-43210', password: PW }); assert.strictEqual((await noLogin.json()).needsVerification, true);
  assert.strictEqual((await post('/api/auth/verify', { identifier: '9876543210', code: '000000' })).status, 400);
  const code = /(\d{6})/.exec(smsLog.at(-1).text)[1];                         // the sign-in attempt re-issued a code
  const ok = await (await post('/api/auth/verify', { identifier: '9876543210', code })).json(); assert.ok(ok.token); assert.strictEqual(ok.profile.verified, true);
  assert.strictEqual((await post('/api/auth/signup', { identifier: '+919876543210', password: PW, name: 'Another One' })).status, 409);
  // forgot / reset
  await post('/api/auth/forgot', { identifier: '+919876543210' }); const rc = /(\d{6})/.exec(smsLog.at(-1).text)[1];
  assert.strictEqual((await post('/api/auth/reset', { identifier: '+919876543210', code: '111111', password: 'NewPassw0rd!' })).status, 400);
  assert.strictEqual((await post('/api/auth/reset', { identifier: '+919876543210', code: rc, password: 'NewPassw0rd!' })).status, 200);
  assert.strictEqual((await post('/api/auth/signin', { identifier: '+919876543210', password: 'NewPassw0rd!' })).status, 200);
  const old = ws(ok.token); await old.ready; assert.strictEqual((await old.next('error')).code, 'auth'); old.close();   // old sessions revoked
});

/* ---------- profile, DP, contacts, privacy ---------- */
test('profile: rename is unique; DP upload/serve/replace; bad images rejected', async () => {
  const a = await mkUser('dp1'), b = await mkUser('dp2');
  const c = await online(a.token);
  c.send({ type: 'profile_update', name: 'User dp2' }); assert.strictEqual((await c.next('name_error')).code, 'name_taken');
  c.send({ type: 'profile_update', name: 'Renamed Dp', about: 'Hey there' }); const p = await c.next('profile'); assert.deepStrictEqual([p.profile.name, p.profile.about], ['Renamed Dp', 'Hey there']);
  const img = jpeg();
  const up = await fetch(base + '/api/me/avatar', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: img }); const u1 = await up.json(); assert.strictEqual(up.status, 200);
  const served = await fetch(base + u1.avatar); assert.strictEqual(served.status, 200); assert.strictEqual(served.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await served.arrayBuffer()).equals(img));
  assert.strictEqual((await fetch(base + '/api/me/avatar', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: Buffer.from('<script>alert(1)</script>') })).status, 400);
  assert.strictEqual((await fetch(base + '/api/me/avatar', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: jpeg(400 * 1024) })).status, 413);
  assert.strictEqual((await fetch(base + '/api/me/avatar', { method: 'POST', body: img, headers: { 'Content-Type': 'image/jpeg' } })).status, 401);
  const u2 = await (await fetch(base + '/api/me/avatar', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: jpeg() })).json();
  await sleep(100); assert.strictEqual((await fetch(base + u1.avatar)).status, 404); assert.strictEqual((await fetch(base + u2.avatar)).status, 200);   // old DP deleted
  const other = await online(b.token); other.send({ type: 'profiles', nums: [a.num] });
  assert.strictEqual((await other.next('profiles')).profiles[a.num].avatar, u2.avatar);
  c.close(); other.close();
});

test('contacts sync, lookup by ID/name, block + report', async () => {
  const a = await mkUser('ct1'), b = await mkUser('ct2'); const ca = await online(a.token);
  ca.send({ type: 'lookup', q: b.num }); assert.strictEqual((await ca.next('lookup_result')).profile.name, b.name);
  ca.send({ type: 'lookup', q: 'user ct2' }); assert.strictEqual((await ca.next('lookup_result')).profile.num, b.num);
  ca.send({ type: 'lookup', q: '999998' }); assert.strictEqual((await ca.next('lookup_result')).profile, null);
  ca.send({ type: 'contact_add', num: b.num, name: 'Bestie' }); assert.deepStrictEqual((await ca.next('contacts')).list, [{ num: b.num, name: 'Bestie' }]);
  ca.close(); const again = await online(a.token); assert.deepStrictEqual(again.profile.contacts, [{ num: b.num, name: 'Bestie' }]);   // restored on any device
  again.send({ type: 'block', num: b.num }); assert.deepStrictEqual((await again.next('blocks')).list, [b.num]);
  again.send({ type: 'report', num: b.num, reason: 'Spam' }); assert.match((await again.next('toast')).text, /Report/);
  again.close();
});

test('presence: live online/offline + last seen with privacy switch', async () => {
  const a = await mkUser('pr1'), b = await mkUser('pr2'); const ca = await online(a.token);
  ca.send({ type: 'watch', nums: [b.num] }); assert.strictEqual((await ca.next('presence')).profiles[b.num].online, false);
  const cb = await online(b.token);
  const up = await ca.next('presence_update'); assert.deepStrictEqual([up.profile.num, up.profile.online], [b.num, true]);
  cb.close();
  const down = await ca.next('presence_update', 20000); assert.strictEqual(down.profile.online, false); assert.ok(down.profile.lastSeen > Date.now() - 60000);
  const cb2 = await online(b.token); cb2.send({ type: 'settings', showLastSeen: false }); await cb2.next('profile'); cb2.close();
  await ca.next('presence_update'); await sleep(50);
  ca.send({ type: 'profiles', nums: [b.num] }); const hid = await ca.next('profiles'); assert.strictEqual(hid.profiles[b.num].lastSeen, null);
  ca.close();
}); 

/* ---------- direct chat ---------- */
test('direct chat: send, delivered, read, history, chat list, offline delivery', async () => {
  const a = await mkUser('ch1'), b = await mkUser('ch2'); const ca = await online(a.token), cb = await online(b.token);
  ca.send({ type: 'msg_send', to: b.num, id: 'm1', kind: 'text', body: 'Hello 😀' });
  assert.strictEqual((await ca.next('msg_sent')).id, 'm1');
  const got = await cb.next('msg'); assert.deepStrictEqual([got.msg.body, got.msg.from, got.profile.name], ['Hello 😀', a.num, a.name]);
  cb.send({ type: 'msg_ack', ids: ['m1'] }); assert.deepStrictEqual((await ca.next('msg_status')).status, 1);
  cb.send({ type: 'msg_read', from: a.num }); assert.strictEqual((await ca.next('msg_status')).status, 2);
  ca.send({ type: 'msg_send', to: b.num, id: 'm1', kind: 'text', body: 'Hello 😀' }); await ca.next('msg_sent'); await cb.none('msg');        // retry is idempotent
  cb.close(); await sleep(50);
  ca.send({ type: 'msg_send', to: b.num, id: 'm2', kind: 'text', body: 'Are you there?' }); await ca.next('msg_sent');
  const cb2 = await online(b.token); const off = await cb2.next('msg'); assert.strictEqual(off.msg.id, 'm2');       // delivered on next connect
  cb2.send({ type: 'chats' }); const chats = await cb2.next('chats'); assert.deepStrictEqual([chats.chats[0].num, chats.chats[0].unread, chats.chats[0].last.body], [a.num, 1, 'Are you there?']);
  cb2.send({ type: 'history', with: a.num }); const h = await cb2.next('history'); assert.deepStrictEqual(h.msgs.map((m) => m.id), ['m1', 'm2']);
  ca.close(); cb2.close();
});

test('direct chat: images, blocking, limits', async () => {
  const a = await mkUser('im1'), b = await mkUser('im2'); const ca = await online(a.token), cb = await online(b.token);
  const up = await (await fetch(base + '/api/media', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: jpeg(2000) })).json(); assert.match(up.url, /^\/m\/[a-f0-9]{24}\.jpg$/);
  ca.send({ type: 'msg_send', to: b.num, id: 'i1', kind: 'image', url: up.url, body: 'look' }); await ca.next('msg_sent');
  assert.strictEqual((await cb.next('msg')).msg.url, up.url); assert.strictEqual((await fetch(base + up.url)).status, 200);
  ca.send({ type: 'msg_send', to: b.num, id: 'i2', kind: 'image', url: 'https://evil.example/x.jpg' }); assert.strictEqual((await ca.next('msg_fail')).reason, 'bad_media');
  cb.send({ type: 'block', num: a.num }); await cb.next('blocks');
  ca.send({ type: 'msg_send', to: b.num, id: 'b1', kind: 'text', body: 'hello?' }); await ca.next('msg_sent'); await cb.none('msg');        // silently dropped
  ca.send({ type: 'block', num: b.num }); await ca.next('blocks');
  ca.send({ type: 'msg_send', to: b.num, id: 'b2', kind: 'text', body: 'x' }); assert.strictEqual((await ca.next('msg_fail')).reason, 'blocked');
  ca.close(); cb.close();
});

/* ---------- calls & push ---------- */
test('calls: ring, accept, signal, hangup; call history for both; busy/decline/DND', async () => {
  const a = await mkUser('cl1'), b = await mkUser('cl2'), c = await mkUser('cl3'); const ca = await online(a.token), cb = await online(b.token), cc = await online(c.token);
  ca.send({ type: 'call', to: b.num, video: true }); await ca.next('ringing'); const inc = await cb.next('incoming'); assert.deepStrictEqual([inc.from, inc.name, inc.video], [a.num, a.name, true]);
  cc.send({ type: 'call', to: b.num }); assert.strictEqual((await cc.next('busy')).reason, 'busy');
  cb.send({ type: 'accept' }); await ca.next('accepted');
  ca.send({ type: 'signal', data: { k: 'offer' } }); assert.strictEqual((await cb.next('signal')).data.k, 'offer');
  ca.send({ type: 'bye' }); assert.strictEqual((await cb.next('ended')).reason, 'hangup');
  const rec = await cb.next('call_rec'); assert.ok(rec.rec.answeredAt && rec.rec.reason === 'hangup');
  cb.send({ type: 'call_history' }); assert.strictEqual((await cb.next('call_history')).list[0].callerName, a.name);
  ca.send({ type: 'call', to: b.num }); await cb.next('incoming'); cb.send({ type: 'decline' }); assert.strictEqual((await ca.next('ended')).reason, 'declined');
  cb.send({ type: 'dnd', on: true }); await sleep(50); ca.send({ type: 'call', to: b.num }); assert.strictEqual((await ca.next('busy')).reason, 'dnd');
  ca.send({ type: 'call', to: '999997' }); assert.strictEqual((await ca.next('unavailable')).reason, 'offline');
  [ca, cb, cc].forEach((x) => x.close());
});

test('web push: offline user with a subscription is rung via push and can answer after opening the app', async () => {
  const a = await mkUser('pu1'), b = await mkUser('pu2'); const ca = await online(a.token);
  assert.strictEqual((await post('/api/push/subscribe', { subscription: { endpoint: 'http://insecure.example', keys: {} } }, { 'X-VC-Token': b.token })).status, 400);
  assert.strictEqual((await post('/api/push/subscribe', { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } } }, { 'X-VC-Token': b.token })).status, 200);
  pushLog.length = 0; ca.send({ type: 'call', to: b.num, video: false }); await ca.next('ringing'); await sleep(100);
  const p = pushLog.find((x) => x.payload.type === 'call'); assert.ok(p, 'push sent'); assert.deepStrictEqual([p.payload.name, p.o.urgency], [a.name, 'high']);
  const cb = await online(b.token); const inc = await cb.next('incoming'); assert.strictEqual(inc.callId, p.payload.callId);       // queued ring delivered after the user opens the app
  cb.send({ type: 'accept' }); await ca.next('accepted');
  ca.send({ type: 'bye' }); await cb.next('ended');
  // "Decline" button on the call notification (works without opening the app)
  cb.close(); await sleep(50); pushLog.length = 0;
  ca.send({ type: 'call', to: b.num }); await ca.next('ringing'); await sleep(100);
  const q = pushLog.find((x) => x.payload.type === 'call').payload;
  assert.strictEqual((await post('/api/call/decline', { callId: q.callId, key: 'wrong' })).status, 200); await ca.none('ended', 200);
  await post('/api/call/decline', { callId: q.callId, key: q.declineKey }); assert.strictEqual((await ca.next('ended')).reason, 'declined');
  ca.close();
});

test('push: chat message to an offline user triggers a notification', async () => {
  const a = await mkUser('pm1'), b = await mkUser('pm2'); await post('/api/push/subscribe', { subscription: { endpoint: 'https://push.example/xyz', keys: { p256dh: 'x', auth: 'y' } } }, { 'X-VC-Token': b.token });
  const ca = await online(a.token); pushLog.length = 0;
  ca.send({ type: 'msg_send', to: b.num, id: 'p1', kind: 'text', body: 'ping while closed' }); await ca.next('msg_sent'); await sleep(100);
  assert.strictEqual(pushLog.find((x) => x.payload.type === 'msg').payload.body, 'ping while closed'); ca.close();
});

test('long-polling fallback works for sign-in sessions', async () => {
  const a = await mkUser('lp1'), b = await mkUser('lp2'); const cb = await online(b.token);
  const H = { 'X-VC-Token': a.token };
  const reg = await (await post('/api/register', { token: a.token })).json(); assert.strictEqual(reg.type, 'registered');
  const poll = async () => (await (await fetch(base + '/api/poll', { headers: H })).json()).msgs;
  await post('/api/send', { msg: { type: 'call', to: b.num } }, H); assert.strictEqual((await cb.next('incoming')).from, a.num);
  assert.ok((await poll()).some((m) => m.type === 'ringing')); cb.send({ type: 'accept' }); assert.ok((await poll()).some((m) => m.type === 'accepted'));
  await post('/api/send', { msg: { type: 'bye' } }, H); assert.strictEqual((await cb.next('ended')).reason, 'hangup'); cb.close();
  assert.strictEqual((await fetch(base + '/api/poll', { headers: { 'X-VC-Token': 'x'.repeat(64) } })).status, 401);
});

/* ---------- admin ---------- */
test('admin: auth, CSRF, CSP; accounts list shows ID, email/mobile, IP, location, GPS, sign-in log', async () => {
  assert.strictEqual((await fetch(base + '/admin/api/users')).status, 401);
  assert.strictEqual((await post('/admin/api/login', { username: 'admin', password: ADMIN_PW })).status, 403);
  const page = await fetch(base + '/admin'); assert.match(page.headers.get('content-security-policy'), /script-src 'self'/); assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
  const s = await signup('track@example.com', 'Track Me', PW, { 'cf-connecting-ip': '8.8.8.8', 'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-A546E) Chrome/120' });
  const c = await online(s.token, { 'cf-connecting-ip': '8.8.8.8', 'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-A546E) Chrome/120' }); c.send({ type: 'location', lat: 28.6139, lon: 77.209, acc: 25 });
  await sleep(500);
  const { call } = await adminLogin(); const list = await (await call('GET', '/users?q=track@')).json(); const row = list.users.find((x) => x.name === 'Track Me');
  assert.ok(row); assert.deepStrictEqual([row.identifier, row.ip, row.online, row.verified], ['track@example.com', '8.8.8.8', true, false]);
  assert.deepStrictEqual([row.geo.city, row.geo.countryCode, row.gps.lat], ['New Delhi', 'IN', 28.6139]);
  const det = await (await call('GET', '/users/' + row.num)).json(); assert.ok(det.signins.some((x) => x.method === 'signup' && x.ip === '8.8.8.8' && x.ok)); assert.strictEqual(det.sessions.length >= 1, true);
  const sg = await (await call('GET', '/signins')).json(); assert.ok(sg.signins.some((x) => x.identifier === 'track@example.com' && x.name === 'Track Me'));
  const map = await (await call('GET', '/map')).json(); assert.ok(map.points.some((p) => p.num === row.num && p.src === 'gps'));
  const csv = await (await call('GET', '/export.csv')).text(); assert.match(csv, /track@example\.com/); assert.match(csv, /New Delhi/);
  c.close();
});

test('admin: ban, unban, reset password, verify, sign-out, rename, delete, reports, broadcast, backup', async () => {
  const { call } = await adminLogin(); const u = await mkUser('mod1'); const c = await online(u.token); await sleep(30);
  assert.ok((await (await call('POST', '/broadcast', { text: 'Maintenance at 10pm' })).json()).delivered >= 1); assert.strictEqual((await c.next('announcement')).text, 'Maintenance at 10pm');
  assert.strictEqual((await call('POST', `/users/${u.num}/rename`, { name: 'Track Me' })).status, 400);
  assert.strictEqual((await call('POST', `/users/${u.num}/verify`)).status, 200);
  await call('POST', `/users/${u.num}/ban`, { reason: 'Spam' }); assert.strictEqual((await c.next('kicked')).reason, 'banned');
  const bad = await post('/api/auth/signin', { identifier: 'mod1@example.com', password: PW }); assert.strictEqual(bad.status, 403); assert.strictEqual((await bad.json()).message, 'Spam');
  const again = ws(u.token); await again.ready; assert.strictEqual((await again.next('error')).code, 'banned'); again.close();
  await call('POST', `/users/${u.num}/unban`);
  const rp = await (await call('POST', `/users/${u.num}/reset-password`)).json();
  assert.strictEqual((await post('/api/auth/signin', { identifier: 'mod1@example.com', password: PW })).status, 401);
  const inn = await (await post('/api/auth/signin', { identifier: 'mod1@example.com', password: rp.temporaryPassword })).json(); assert.strictEqual(inn.profile.num, u.num);
  await call('POST', `/users/${u.num}/signout`); const dead = ws(inn.token); await dead.ready; assert.strictEqual((await dead.next('error')).code, 'auth'); dead.close();
  const v = await online((await (await post('/api/auth/signin', { identifier: 'mod1@example.com', password: rp.temporaryPassword })).json()).token);
  v.send({ type: 'report', num: (await mkUser('mod2')).num, reason: 'Abusive' }); await v.next('toast');
  const reps = await (await call('GET', '/reports')).json(); assert.ok(reps.reports.some((r) => r.reason === 'Abusive' && r.reporterName === u.name)); await call('POST', `/reports/${reps.reports[0].id}/resolve`);
  const bk = await (await call('POST', '/backup')).json(); assert.ok(bk.ok && /\.db$/.test(bk.file)); assert.ok(fs.existsSync(path.join(dataDir, 'backups', bk.file)));
  await call('DELETE', `/users/${u.num}`); assert.strictEqual((await call('GET', '/users/' + u.num)).status, 404);
  assert.strictEqual((await post('/api/auth/signup', { identifier: 'mod1@example.com', password: PW, name: u.name })).status, 200);   // email + name are free again
  v.close();
});

test('admin: two-factor authentication and Telegram alerts', async () => {
  tgLog.length = 0; await signup('alert@example.com', 'Alert Me'); await sleep(200);
  assert.ok(tgLog.some((m) => /New account Alert Me/.test(m.text)), 'telegram signup alert');
  const { call } = await adminLogin(); const setup = await (await call('POST', '/2fa/setup')).json();
  assert.strictEqual((await call('POST', '/2fa/enable', { code: '000000' })).status, 400);
  assert.strictEqual((await call('POST', '/2fa/enable', { code: totp.code(setup.secret) })).status, 200);
  const step1 = await adminLogin(); assert.strictEqual((await step1.r.json()).need2fa, true);
  assert.strictEqual((await adminLogin({ code: '123456' })).r.status, 401);
  const ok = await adminLogin({ code: totp.code(setup.secret) }); assert.strictEqual(ok.r.status, 200); assert.strictEqual((await ok.call('GET', '/overview')).status, 200);
  assert.strictEqual((await ok.call('POST', '/2fa/disable', { password: ADMIN_PW, code: totp.code(setup.secret) })).status, 200);
  assert.strictEqual((await adminLogin()).r.status, 200);
});

test('data persists across restarts (accounts, sessions, messages, contacts, DP)', async () => {
  const a = await mkUser('ps1'), b = await mkUser('ps2'); const ca = await online(a.token);
  ca.send({ type: 'contact_add', num: b.num, name: 'Persisted' }); await ca.next('contacts');
  ca.send({ type: 'msg_send', to: b.num, id: 'ps-1', kind: 'text', body: 'survive restart' }); await ca.next('msg_sent'); ca.close();
  const dp = await (await fetch(base + '/api/me/avatar', { method: 'POST', headers: { 'X-VC-Token': a.token, 'Content-Type': 'image/jpeg' }, body: jpeg() })).json();
  await srv.stop(); await boot();
  const a2 = await online(a.token); assert.strictEqual(a2.profile.num, a.num); assert.deepStrictEqual(a2.profile.contacts, [{ num: b.num, name: 'Persisted' }]); assert.strictEqual(a2.profile.avatar, dp.avatar);
  a2.send({ type: 'history', with: b.num }); assert.strictEqual((await a2.next('history')).msgs[0].body, 'survive restart'); a2.close();
  assert.strictEqual((await post('/api/auth/signup', { identifier: 'thief@example.com', password: PW, name: a.name })).status, 409);       // names stay reserved
  const t = await (await post('/api/auth/signin', { identifier: 'ps1@example.com', password: PW })).json(); assert.strictEqual(t.profile.num, a.num);
});
