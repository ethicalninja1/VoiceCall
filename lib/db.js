'use strict';
/** SQLite persistence (built-in node:sqlite — no native build needed). */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts(
  num TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE, identifier TEXT UNIQUE, id_type TEXT,
  pass_salt TEXT, pass_hash TEXT, verified INTEGER DEFAULT 0, avatar TEXT, about TEXT DEFAULT '',
  created_at INTEGER, last_active INTEGER, ip TEXT, ip_history TEXT, geo TEXT, gps TEXT, ua TEXT,
  banned INTEGER DEFAULT 0, ban_reason TEXT, call_count INTEGER DEFAULT 0, settings TEXT, push TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, num TEXT, created_at INTEGER, last_used INTEGER, ip TEXT, ua TEXT);
CREATE INDEX IF NOT EXISTS ix_sessions_num ON sessions(num);
CREATE TABLE IF NOT EXISTS contacts(owner TEXT, num TEXT, name TEXT, PRIMARY KEY(owner,num));
CREATE TABLE IF NOT EXISTS blocks(owner TEXT, num TEXT, PRIMARY KEY(owner,num));
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT, target TEXT, reason TEXT, ts INTEGER, status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conv TEXT, from_num TEXT, to_num TEXT, kind TEXT, body TEXT, url TEXT, ts INTEGER, status INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_msg_conv ON messages(conv, ts);
CREATE INDEX IF NOT EXISTS ix_msg_to ON messages(to_num, status);
CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, caller TEXT, callee TEXT, caller_name TEXT, callee_name TEXT, video INTEGER, started_at INTEGER, answered_at INTEGER, ended_at INTEGER, reason TEXT, duration INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_calls_start ON calls(started_at);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, type TEXT, msg TEXT, num TEXT);
CREATE TABLE IF NOT EXISTS signins(id INTEGER PRIMARY KEY AUTOINCREMENT, num TEXT, identifier TEXT, method TEXT, ok INTEGER, reason TEXT, ip TEXT, ua TEXT, geo TEXT, t INTEGER);
CREATE INDEX IF NOT EXISTS ix_signins_num ON signins(num, t);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
`;

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const arg = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

function openDb(dir, file = 'voicecall.db') {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = path.join(dir, file);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;');
  db.exec(SCHEMA);
  try { fs.chmodSync(dbPath, 0o600); } catch {}

  const cache = new Map();
  const st = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const run = (sql, ...p) => st(sql).run(...p.map(arg));
  const get = (sql, ...p) => st(sql).get(...p.map(arg));
  const all = (sql, ...p) => st(sql).all(...p.map(arg));
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  return {
    path: dbPath, run, get, all, tx,
    close() { try { db.close(); } catch {} },

    /* ---- accounts ---- */
    loadAccounts() {
      return all('SELECT * FROM accounts').map((r) => ({
        num: r.num, name: r.name, nameKey: r.name_key, identifier: r.identifier, idType: r.id_type, passSalt: r.pass_salt, passHash: r.pass_hash,
        verified: !!r.verified, avatar: r.avatar || '', about: r.about || '', createdAt: r.created_at, lastActive: r.last_active || 0, ip: r.ip || '',
        ipHistory: P(r.ip_history, []), geo: P(r.geo, null), gps: P(r.gps, null), ua: r.ua || '', banned: !!r.banned, banReason: r.ban_reason || '',
        callCount: r.call_count || 0, settings: Object.assign({ showLastSeen: true }, P(r.settings, {})), push: P(r.push, []),
      }));
    },
    saveAccount(u) {
      run(`INSERT INTO accounts(num,name,name_key,identifier,id_type,pass_salt,pass_hash,verified,avatar,about,created_at,last_active,ip,ip_history,geo,gps,ua,banned,ban_reason,call_count,settings,push)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(num) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,identifier=excluded.identifier,id_type=excluded.id_type,pass_salt=excluded.pass_salt,pass_hash=excluded.pass_hash,
             verified=excluded.verified,avatar=excluded.avatar,about=excluded.about,last_active=excluded.last_active,ip=excluded.ip,ip_history=excluded.ip_history,geo=excluded.geo,gps=excluded.gps,
             ua=excluded.ua,banned=excluded.banned,ban_reason=excluded.ban_reason,call_count=excluded.call_count,settings=excluded.settings,push=excluded.push`,
      u.num, u.name, u.nameKey, u.identifier, u.idType, u.passSalt, u.passHash, u.verified, u.avatar, u.about, u.createdAt, u.lastActive, u.ip, J(u.ipHistory), J(u.geo), J(u.gps), u.ua, u.banned, u.banReason, u.callCount, J(u.settings), J(u.push));
    },
    deleteAccount(num) {
      tx(() => {
        ['DELETE FROM accounts WHERE num=?', 'DELETE FROM sessions WHERE num=?', 'DELETE FROM contacts WHERE owner=?', 'DELETE FROM contacts WHERE num=?',
          'DELETE FROM blocks WHERE owner=?', 'DELETE FROM blocks WHERE num=?'].forEach((q) => run(q, num));
        run('DELETE FROM messages WHERE from_num=? OR to_num=?', num, num);
      });
    },

    /* ---- sessions ---- */
    loadSessions: () => all('SELECT * FROM sessions'),
    addSession: (h, num, ip, ua) => run('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?,?)', h, num, Date.now(), Date.now(), ip, ua),
    touchSession: (h) => run('UPDATE sessions SET last_used=? WHERE token_hash=?', Date.now(), h),
    delSession: (h) => run('DELETE FROM sessions WHERE token_hash=?', h),
    delSessionsOf: (num) => run('DELETE FROM sessions WHERE num=?', num),
    sessionsOf: (num) => all('SELECT token_hash,created_at,last_used,ip,ua FROM sessions WHERE num=? ORDER BY last_used DESC', num),

    /* ---- contacts & blocks ---- */
    contactsOf: (owner) => all('SELECT num,name FROM contacts WHERE owner=?', owner),
    putContact: (owner, num, name) => run('INSERT OR REPLACE INTO contacts VALUES(?,?,?)', owner, num, name),
    delContact: (owner, num) => run('DELETE FROM contacts WHERE owner=? AND num=?', owner, num),
    blocksOf: (owner) => all('SELECT num FROM blocks WHERE owner=?', owner).map((r) => r.num),
    putBlock: (owner, num) => run('INSERT OR IGNORE INTO blocks VALUES(?,?)', owner, num),
    delBlock: (owner, num) => run('DELETE FROM blocks WHERE owner=? AND num=?', owner, num),
    addReport: (reporter, target, reason) => run('INSERT INTO reports(reporter,target,reason,ts) VALUES(?,?,?,?)', reporter, target, reason, Date.now()),
    reports: (limit = 100) => all('SELECT * FROM reports ORDER BY id DESC LIMIT ?', limit),
    setReport: (id, status) => run('UPDATE reports SET status=? WHERE id=?', status, id),
    reportCount: (target) => get('SELECT COUNT(*) c FROM reports WHERE target=?', target).c,

    /* ---- messages ---- */
    addMsg: (m) => run('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?,?)', m.id, m.conv, m.from, m.to, m.kind, m.body, m.url, m.ts, m.status || 0),
    getMsg: (id) => get('SELECT * FROM messages WHERE id=?', id),
    msgsBetween(conv, before, limit) {
      const rows = before ? all('SELECT * FROM messages WHERE conv=? AND ts<? ORDER BY ts DESC LIMIT ?', conv, before, limit) : all('SELECT * FROM messages WHERE conv=? ORDER BY ts DESC LIMIT ?', conv, limit);
      return rows.reverse();
    },
    undelivered: (to, limit = 300) => all('SELECT * FROM messages WHERE to_num=? AND status=0 ORDER BY ts LIMIT ?', to, limit),
    markDelivered(to, ids) {
      const changed = [];
      tx(() => ids.slice(0, 200).forEach((id) => { const r = get('SELECT from_num,status FROM messages WHERE id=? AND to_num=?', id, to); if (r && r.status < 1) { run('UPDATE messages SET status=1 WHERE id=?', id); changed.push({ id, from: r.from_num }); } }));
      return changed;
    },
    markRead(to, from) {
      const rows = all('SELECT id FROM messages WHERE to_num=? AND from_num=? AND status<2', to, from);
      if (rows.length) run('UPDATE messages SET status=2 WHERE to_num=? AND from_num=? AND status<2', to, from);
      return rows.map((r) => r.id);
    },
    chatsOf(num) {
      const last = all(`SELECT m.* FROM messages m JOIN (SELECT conv, MAX(ts) mts FROM messages WHERE from_num=? OR to_num=? GROUP BY conv) x ON m.conv=x.conv AND m.ts=x.mts GROUP BY m.conv ORDER BY m.ts DESC LIMIT 300`, num, num);
      const unread = Object.fromEntries(all('SELECT from_num f, COUNT(*) c FROM messages WHERE to_num=? AND status<2 GROUP BY from_num', num).map((r) => [r.f, r.c]));
      return { last, unread };
    },
    msgCount: (num) => get('SELECT COUNT(*) c FROM messages WHERE from_num=? OR to_num=?', num, num).c,
    totalMsgs: () => get('SELECT COUNT(*) c FROM messages').c,

    /* ---- calls ---- */
    saveCall: (c) => run('INSERT OR REPLACE INTO calls VALUES(?,?,?,?,?,?,?,?,?,?,?)', c.id, c.caller, c.callee, c.callerName, c.calleeName, c.video, c.startedAt, c.answeredAt, c.endedAt, c.reason, c.duration),
    callsOf: (num, limit = 60) => all('SELECT * FROM calls WHERE caller=? OR callee=? ORDER BY started_at DESC LIMIT ?', num, num, limit).map(callRow),
    recentCalls: (limit = 150) => all('SELECT * FROM calls ORDER BY started_at DESC LIMIT ?', limit).map(callRow),
    callsSince: (t) => get('SELECT COUNT(*) c FROM calls WHERE started_at>=?', t).c,
    totalCalls: () => get('SELECT COUNT(*) c FROM calls').c,

    /* ---- events, sign-ins ---- */
    addEvent: (type, msg, num) => run('INSERT INTO events(t,type,msg,num) VALUES(?,?,?,?)', Date.now(), type, msg, num || null),
    events(limit, q, num) {
      let sql = 'SELECT t,type,msg,num FROM events'; const w = [], p = [];
      if (q) { w.push('(type LIKE ? OR msg LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
      if (num) { w.push('num=?'); p.push(num); }
      if (w.length) sql += ' WHERE ' + w.join(' AND ');
      return all(sql + ' ORDER BY id DESC LIMIT ?', ...p, limit);
    },
    addSignin: (s) => run('INSERT INTO signins(num,identifier,method,ok,reason,ip,ua,geo,t) VALUES(?,?,?,?,?,?,?,?,?)', s.num, s.identifier, s.method, s.ok, s.reason || '', s.ip, s.ua, J(s.geo), Date.now()),
    signins(limit = 200, num) {
      const rows = num ? all('SELECT * FROM signins WHERE num=? ORDER BY id DESC LIMIT ?', num, limit) : all('SELECT * FROM signins ORDER BY id DESC LIMIT ?', limit);
      return rows.map((r) => ({ id: r.id, num: r.num, identifier: r.identifier, method: r.method, ok: !!r.ok, reason: r.reason, ip: r.ip, ua: r.ua, geo: P(r.geo, null), t: r.t }));
    },
    lastSignin: (num) => get('SELECT t,ip,method FROM signins WHERE num=? AND ok=1 ORDER BY id DESC LIMIT 1', num),

    /* ---- meta, maintenance ---- */
    getMeta: (k) => (get('SELECT v FROM meta WHERE k=?', k) || {}).v,
    setMeta: (k, v) => run('INSERT OR REPLACE INTO meta VALUES(?,?)', k, v),
    backup(file) { try { fs.unlinkSync(file); } catch {} db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); },
    purge({ messageDays = 0, eventDays = 90 } = {}) {
      let m = 0; if (messageDays > 0) m = run('DELETE FROM messages WHERE ts<?', Date.now() - messageDays * 86400000).changes;
      const e = run('DELETE FROM events WHERE t<?', Date.now() - eventDays * 86400000).changes;
      run('DELETE FROM signins WHERE t<?', Date.now() - 180 * 86400000);
      return { messages: m, events: e };
    },
  };
}
const callRow = (r) => ({ id: r.id, caller: r.caller, callee: r.callee, callerName: r.caller_name, calleeName: r.callee_name, video: !!r.video, startedAt: r.started_at, answeredAt: r.answered_at, endedAt: r.ended_at, reason: r.reason, duration: r.duration });
module.exports = { openDb };
