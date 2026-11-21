const { sign, sameSecret, sb, readBody, send, configured } = require('./_lib');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 500, { error: 'Server is not set up yet (missing environment variables).' });
  const pin = String(readBody(req).pin || '').trim();
  if (!/^\d{4,8}$/.test(pin)) return send(res, 400, { error: 'Enter your PIN (4 to 8 digits).' });

  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim().replace(/[^\w.:-]/g, '').slice(0, 45) || 'x';
  const key = 'auth/fail-' + ip;
  let rec = { n: 0, until: 0 };
  try {
    const rows = await sb('GET', 'docs?select=data&path=eq.' + encodeURIComponent(key));
    if (rows && rows[0] && rows[0].data) rec = rows[0].data;
  } catch (e) {
    return send(res, 502, { error: 'Cannot reach the database. Check the Supabase settings in Vercel.' });
  }
  if (rec.until > Date.now()) return send(res, 429, { error: 'Too many wrong PINs. Try again in ' + Math.ceil((rec.until - Date.now()) / 60000) + ' minutes.' });

  let role = null;
  if (sameSecret(pin, process.env.OWNER_PIN)) role = 'owner';
  else if (sameSecret(pin, process.env.STAFF_PIN)) role = 'staff';

  if (!role) {
    const n = (rec.n || 0) + 1;
    const next = n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 };
    try {
      await sb('POST', 'docs?on_conflict=path', { path: key, data: next }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    return send(res, 401, { error: 'Wrong PIN.' });
  }
  if (rec.n || rec.until) {
    try {
      await sb('DELETE', 'docs?path=eq.' + encodeURIComponent(key));
    } catch (e) {}
  }
  const exp = Date.now() + (role === 'owner' ? 3 : 30) * 86400000;
  send(res, 200, { token: sign({ role, exp }), role, exp });
};
