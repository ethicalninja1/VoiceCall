'use strict';
// Display-name rules. Names are unique (case-insensitive, ignoring spaces/punctuation).
const RESERVED = new Set(['admin', 'administrator', 'voicecall', 'support', 'system', 'root', 'moderator', 'staff', 'official', 'guest', 'null', 'undefined', 'server']);

const clean = (raw) => String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const keyOf = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function validate(raw) {
  const name = clean(raw);
  if (name.length < 3 || name.length > 24) return { ok: false, message: 'Name must be 3–24 characters' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*[\p{L}\p{N}]$/u.test(name)) return { ok: false, message: 'Use letters, numbers, spaces and . _ - only' };
  const key = keyOf(name);
  if (key.length < 3) return { ok: false, message: 'Name must contain at least 3 letters or numbers' };
  if (RESERVED.has(key)) return { ok: false, message: 'That name is reserved' };
  return { ok: true, name, key };
}
module.exports = { validate, clean, keyOf };
