// Netlify Scheduled Function — envoie un rappel de séance une fois par jour
// aux appareils qui n'ont pas enregistré de séance récente.
// Programmée via `exports.config` ci-dessous (heure fixe, en UTC).

const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

exports.config = { schedule: '0 17 * * *' }; // ~18h-19h heure de Paris selon la saison

exports.handler = async function () {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:contact@example.com';

  if (!vapidPublic || !vapidPrivate) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Clés VAPID non configurées côté serveur' }) };
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const subsStore = getStore({ name: 'push-subs' });
  const backupsStore = getStore({ name: 'coach-backups' });

  const { blobs } = await subsStore.list();
  let sent = 0, cleaned = 0;

  for (const { key: email } of blobs) {
    try {
      const subscription = await subsStore.get(email, { type: 'json' });
      if (!subscription) continue;

      const data = await backupsStore.get(email, { type: 'json' });
      const name = data?.profile?.name || '';
      const lastSession = data?.sessions?.length ? data.sessions[data.sessions.length - 1].date : null;
      const daysSince = lastSession ? Math.floor((Date.now() - new Date(lastSession).getTime()) / 864e5) : 99;

      // On ne relance que si pas de séance depuis au moins 1 jour plein.
      if (daysSince < 1) continue;

      const body = daysSince >= 3
        ? `${name ? name + ', ça' : 'Ça'} fait ${daysSince} jours — une petite séance aujourd'hui te ferait du bien 💪`
        : `${name ? name + ', ta' : 'Ta'} séance du jour t'attend dans Ton Coach 🏋️`;

      await webpush.sendNotification(subscription, JSON.stringify({ title: 'Ton Coach', body }));
      sent++;
    } catch (err) {
      // Abonnement expiré ou invalide : on le supprime pour ne plus réessayer.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await subsStore.delete(email);
        cleaned++;
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ sent, cleaned }) };
};
