// Netlify Function — analyse une photo de repas et estime kcal/protéines via Claude (vision).

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

  const { image, mimeType } = payload;
  if (!image || typeof image !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Image manquante' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Clé API non configurée côté serveur (variable ANTHROPIC_API_KEY manquante)" }) };
  }

  const prompt = `Regarde cette photo de repas et estime son contenu nutritionnel. Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, exactement au format :
{"name":"nom court du plat en français","kcal":nombre entier,"prot":nombre entier en grammes}
Si tu ne reconnais aucune nourriture sur l'image, réponds : {"name":"","kcal":0,"prot":0}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Erreur API Claude', detail }) };
    }

    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const cleaned = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Réponse IA non exploitable' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: parsed.name || '',
        kcal: Math.round(parsed.kcal) || 0,
        prot: Math.round(parsed.prot) || 0,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
