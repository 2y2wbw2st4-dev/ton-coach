// Netlify Function — sauvegarde/restauration des données de l'app, liée au compte (email) via le jeton de session.

const { store: openStore } = require('./lib/blobs');

async function resolveEmail(token) {
  if (!token) return null;
  const sessions = openStore('sessions');
  const session = await sessions.get(token, { type: 'json' });
  if (!session || session.expires < Date.now()) return null;
  return session.email;
}

exports.handler = async function (event) {
  const store = openStore('coach-backups');

  if (event.httpMethod === 'GET') {
    const token = (event.queryStringParameters || {}).token;
    const email = await resolveEmail(token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    try {
      const data = await store.get(email, { type: 'json' });
      if (!data) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Aucune sauvegarde trouvée pour ce compte' }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
    }
    const email = await resolveEmail(payload.token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    if (!payload.data || typeof payload.data !== 'object') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Données manquantes' }) };
    }
    try {
      await store.setJSON(email, payload.data);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
};
