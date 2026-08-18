// Netlify Function — pont sécurisé entre l'app "Ton Coach" et l'API Anthropic (Claude).
// La clé API reste ici, côté serveur, jamais exposée au navigateur.

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

  const { message, context, history } = payload;
  if (!message || typeof message !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message manquant' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Clé API non configurée côté serveur (variable ANTHROPIC_API_KEY manquante)" }) };
  }

  const systemPrompt = buildSystemPrompt(context);

  const messages = (Array.isArray(history) ? history.slice(-10) : [])
    .filter(m => m && m.t)
    .map(m => ({ role: m.who === 'u' ? 'user' : 'assistant', content: String(m.t) }));
  messages.push({ role: 'user', content: message });

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
        max_tokens: 400,
        system: systemPrompt,
        messages,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Erreur API Claude', detail }) };
    }

    const data = await resp.json();
    const reply = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply || "Désolé, je n'ai pas pu générer de réponse." }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function buildSystemPrompt(ctx) {
  if (!ctx || !ctx.profile) {
    return `Tu es un coach sportif personnel, bienveillant, direct et motivant. Tu t'exprimes toujours en français, de façon concise (2 à 4 phrases). Tu ne donnes jamais de conseil médical précis — en cas de douleur persistante ou de problème de santé, tu orientes vers un professionnel de santé.`;
  }
  const p = ctx.profile;
  const sexeLabel = p.sex === 'H' ? 'homme' : 'femme';
  const goalLabels = { perte: 'perte de poids', muscle: 'prise de muscle', forme: 'remise en forme', reprise: 'reprise du sport' };
  const levelLabels = { deb: 'débutant', int: 'intermédiaire', conf: 'confirmé' };
  const placeLabels = { salle: 'en salle', halt: 'à la maison avec haltères', kb: 'à la maison avec kettlebell', elastique: 'à la maison avec élastiques de résistance', none: 'sans matériel' };

  return `Tu es le coach sportif personnel de ${p.name || "l'utilisateur"} dans l'app "Ton Coach".

PROFIL : ${p.age} ans, ${sexeLabel}, ${p.height} cm, ${ctx.currentWeight ? ctx.currentWeight + ' kg' : ''}. Objectif : ${goalLabels[p.goal] || p.goal}. Niveau : ${levelLabels[p.level] || p.level}. S'entraîne ${p.freq}x/semaine, ${p.time} min/séance, ${placeLabels[p.place] || p.place}.${p.injury ? ` Zone sensible signalée : ${p.injury}.` : ''}

NUTRITION : cible ${ctx.kcalTarget || '?'} kcal et ${ctx.protTarget || '?'} g de protéines par jour. Aujourd'hui : ${ctx.kcalToday ?? 0} kcal consommées, ${ctx.protToday ?? 0} g de protéines.

ENTRAÎNEMENT : ${ctx.sessionsCount ?? 0} séances complétées au total.

POIDS : dernière pesée ${ctx.lastWeight ?? 'inconnue'} kg${ctx.weightTrend ? ` (évolution : ${ctx.weightTrend})` : ''}.

DERNIÈRES DÉCISIONS DU COACH : ${(ctx.recentLog && ctx.recentLog.length) ? ctx.recentLog.join(' | ') : 'aucune pour l\'instant'}.

TON RÔLE :
- Réponds toujours en français, ton chaleureux, direct, motivant, jamais moralisateur ni culpabilisant.
- Reste concis : 2 à 4 phrases en général, jamais un pavé.
- Appuie-toi sur les données réelles ci-dessus, n'invente jamais de chiffres.
- Si on te demande "pourquoi", explique le raisonnement derrière les décisions passées.
- Si la personne signale une douleur ou blessure, prends-la au sérieux et rappelle qu'une douleur persistante nécessite un avis médical — tu n'es pas un professionnel de santé.
- Ne donne jamais de conseil médical, nutritionnel extrême ou de diagnostic.

MODIFIER LE PROGRAMME :
Si, et seulement si, la personne te demande explicitement de changer son matériel disponible, son objectif, son niveau, ou son nombre de séances par semaine, confirme le changement dans ta réponse en langage naturel, PUIS termine ta réponse par une ligne technique séparée, sur sa propre ligne, EXACTEMENT à ce format (elle est invisible pour la personne, l'application s'en sert pour appliquer le changement) :
<<ACTION:{"champ":"valeur"}>>
Champs et valeurs possibles UNIQUEMENT :
- "place" : "salle" | "halt" (haltères) | "kb" (kettlebell) | "elastique" | "none" (sans matériel)
- "goal" : "perte" | "muscle" | "forme" | "reprise"
- "level" : "deb" | "int" | "conf"
- "freq" : nombre entier de 1 à 7
Tu peux inclure plusieurs champs dans le même objet JSON si plusieurs changements sont demandés à la fois. N'ajoute JAMAIS cette ligne si aucun changement de ce type n'est demandé — une simple question ou discussion ne doit jamais déclencher d'action.

CHANGER LA SÉANCE DU JOUR UNIQUEMENT :
Si la personne te dit qu'elle ne veut pas faire la séance prévue aujourd'hui et demande de travailler une autre zone à la place (ex: "je ne veux pas faire le haut du corps aujourd'hui, je veux faire les jambes"), NE modifie PAS son profil général — cette demande concerne uniquement la séance du jour. Confirme le changement en langage naturel, PUIS termine par cette ligne technique :
<<ACTION:{"todayFocus":"lower"}>>
Valeurs possibles pour "todayFocus" : "upper" (haut du corps), "lower" (bas du corps / jambes), "full" (corps complet). N'utilise ce champ QUE pour un changement ponctuel de la séance du jour, jamais pour un changement permanent du programme.`;
}
