// Netlify Function — stocke les photos de progression corporelle d'un utilisateur
// et génère un commentaire du coach (toujours constructif, jamais de jugement sur l'apparence,
// jamais de fausse mesure scientifique comme un % de graisse corporelle).

const { store: openStore } = require('./lib/blobs');

async function resolveEmail(token) {
  if (!token) return null;
  const sessions = openStore('sessions');
  const session = await sessions.get(token, { type: 'json' });
  if (!session || session.expires < Date.now()) return null;
  return session.email;
}

exports.handler = async function (event) {
  const store = openStore('progress-photos');

  if (event.httpMethod === 'GET') {
    const token = (event.queryStringParameters || {}).token;
    const email = await resolveEmail(token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    try {
      const photos = (await store.get(email, { type: 'json' })) || [];
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try { payload = JSON.parse(event.body || '{}'); }
    catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) }; }

    const email = await resolveEmail(payload.token);
    if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    const { image, mimeType, goal } = payload;
    if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'Image manquante' }) };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Clé API non configurée' }) };

    try {
      const existing = (await store.get(email, { type: 'json' })) || [];
      const previous = existing.length ? existing[existing.length - 1] : null;

      const goalLabels = { perte: 'perte de poids', muscle: 'prise de muscle', forme: 'remise en forme', reprise: 'reprise du sport' };
      const goalText = goalLabels[goal] || 'sa progression physique';

      const systemPrompt = `Tu es un coach sportif bienveillant qui commente une photo de progression physique envoyée par la personne que tu coaches. Son objectif : ${goalText}.

RÈGLES STRICTES :
- Ton toujours positif, encourageant, centré sur l'effort et la régularité — jamais de jugement sur le physique ou l'apparence.
- N'invente JAMAIS de mesure précise (pourcentage de graisse corporelle, mensurations, etc.) — une IA ne peut pas mesurer ça fiablement sur une photo, ne prétends jamais le contraire.
- Reste bref : 2-3 phrases maximum.
- Si tu compares à une photo précédente, note des évolutions générales et positives si tu en vois (posture, tonus général) sans détails intrusifs, et rappelle que les vraies preuves de progrès sont la régularité et la force qui augmente, pas juste le miroir.
- Si aucune comparaison n'est possible (première photo), accueille-le simplement comme point de départ, sans aucun commentaire sur son physique actuel.
- Ne décris jamais le corps de la personne en détail.`;

      const content = [];
      if (previous) {
        content.push({ type: 'text', text: "Voici la photo précédente (point de comparaison) :" });
        content.push({ type: 'image', source: { type: 'base64', media_type: previous.mimeType || 'image/jpeg', data: previous.image } });
        content.push({ type: 'text', text: "Et voici la nouvelle photo d'aujourd'hui. Un mot d'encouragement bref, sans jugement sur l'apparence :" });
      } else {
        content.push({ type: 'text', text: "Voici ma première photo de progression. Accueille-moi simplement comme point de départ, sans commenter mon physique." });
      }
      content.push({ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } });

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        }),
      });

      let comment = "Photo enregistrée. Continue comme ça, c'est la régularité qui compte le plus.";
      if (resp.ok) {
        const data = await resp.json();
        const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (text) comment = text;
      }

      existing.push({ date: new Date().toISOString().slice(0, 10), image, mimeType: mimeType || 'image/jpeg' });
      await store.setJSON(email, existing);

      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment, count: existing.length }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
};
