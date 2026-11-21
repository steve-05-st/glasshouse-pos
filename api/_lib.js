const crypto = require('crypto');
const E = process.env;

const b64u = (x) => Buffer.from(x).toString('base64url');
const hmac = (s) => crypto.createHmac('sha256', E.SESSION_SECRET || '').update(s).digest('base64url');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + hmac(body);
}
function verify(tok) {
  if (!tok || typeof tok !== 'string' || !E.SESSION_SECRET) return null;
  const parts = tok.split('.');
  if (parts.length !== 2) return null;
  const want = Buffer.from(hmac(parts[0]));
  const got = Buffer.from(parts[1]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  } catch (e) {
    return null;
  }
  if (!p || (p.role !== 'owner' && p.role !== 'staff') || !(p.exp > Date.now())) return null;
  return p;
}
const sameSecret = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/* Supabase REST (PostgREST) with the secret key. The key never leaves this server. */
async function sb(method, path, body, extra) {
  const key = E.SUPABASE_SERVICE_KEY || '';
  const headers = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, extra || {});
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(String(E.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) {
    const e = new Error('Database error ' + r.status + ': ' + t.slice(0, 200));
    e.status = r.status;
    throw e;
  }
  return t ? JSON.parse(t) : null;
}

/* The cafe's calendar day, in Myanmar time (UTC+6:30). */
const yangonDay = (ms) => new Date((ms == null ? Date.now() : ms) + 6.5 * 3600 * 1000).toISOString().slice(0, 10);
const shiftDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const DAY_PATH = /^days\/(\d{4}-\d{2}-\d{2})(\.p\d{1,3})?$/;
function staffWindow() {
  const t = yangonDay();
  return { lo: shiftDay(t, -1), hi: shiftDay(t, 1) }; // yesterday .. tomorrow
}
function canRead(role, path) {
  if (path === 'config/menu' || path === 'config/settings') return true;
  const m = DAY_PATH.exec(path);
  if (!m) return false;
  if (role === 'owner') return true;
  const w = staffWindow();
  return m[1] >= w.lo && m[1] <= w.hi;
}
function canWrite(role, path) {
  if (role === 'owner') return path === 'config/menu' || path === 'config/settings' || DAY_PATH.test(path);
  return canRead(role, path) && DAY_PATH.test(path);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch (e) {
    return {};
  }
}
const send = (res, code, obj) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
};
const configured = () => !!(E.SUPABASE_URL && E.SUPABASE_SERVICE_KEY && E.SESSION_SECRET && E.STAFF_PIN && E.OWNER_PIN);

module.exports = { sign, verify, sameSecret, sb, yangonDay, shiftDay, canRead, canWrite, staffWindow, readBody, send, configured, DAY_PATH };
