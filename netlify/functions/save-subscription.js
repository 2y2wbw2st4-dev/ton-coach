// Netlify Function — enregistre l'abonnement push d'un appareil, lié au compte (email) via le jeton de session.

const { getStore } = require('@netlify/blobs');

async function resolveEmail(token) {
  if (!token) return null;
  const sessions = getStore({ name: 'sessions' });
  const session = await sessions.get(token, { type: 'json' });
  if (!session || session.expires < Date.now()) return null;
  return session.email;
}

exports.handler = async function (event) {
  const store = getStore({ name: 'push-subs' });

  if (event.httpMethod === 'POST') {
    let payload;
    try { payload = JSON.parse(event.body || '{}'); }
    catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) }; }

    const email = await resolveEmail(payload.token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    const subscription = payload.subscription;
    if (!subscription || !subscription.endpoint) return { statusCode: 400, body: JSON.stringify({ error: 'Abonnement invalide' }) };

    try {
      await store.setJSON(email, subscription);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'DELETE') {
    const token = (event.queryStringParameters || {}).token;
    const email = await resolveEmail(token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    try {
      await store.delete(email);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
};
