// Netlify Function — authentification par email/mot de passe.
// Stocke les comptes (email -> {salt, hash}) et les sessions (token -> email) dans Netlify Blobs.

const { store: openStore } = require('./lib/blobs');
const { hashPassword, verifyPassword, genToken } = require('./lib/auth-lib');

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  const usersStore = openStore('users');
  const sessionsStore = openStore('sessions');
  const action = payload.action;

  if (action === 'register') {
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';
    if (!isValidEmail(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Adresse email invalide' }) };
    }
    if (password.length < 8) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Le mot de passe doit faire au moins 8 caractères' }) };
    }
    const existing = await usersStore.get(email, { type: 'json' });
    if (existing) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Un compte existe déjà avec cet email' }) };
    }
    const { salt, hash } = hashPassword(password);
    await usersStore.setJSON(email, { salt, hash, createdAt: Date.now() });
    const token = genToken();
    await sessionsStore.setJSON(token, { email, expires: Date.now() + SESSION_TTL_MS });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email }) };
  }

  if (action === 'login') {
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';
    const user = await usersStore.get(email, { type: 'json' });
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Email ou mot de passe incorrect' }) };
    }
    const token = genToken();
    await sessionsStore.setJSON(token, { email, expires: Date.now() + SESSION_TTL_MS });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email }) };
  }

  if (action === 'session') {
    const token = payload.token;
    if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Jeton manquant' }) };
    const session = await sessionsStore.get(token, { type: 'json' });
    if (!session || session.expires < Date.now()) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expirée' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: session.email }) };
  }

  if (action === 'logout') {
    const token = payload.token;
    if (token) await sessionsStore.delete(token);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Action inconnue' }) };
};
