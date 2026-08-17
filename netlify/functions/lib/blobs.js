// Utilitaire partagé — ouvre un store Netlify Blobs, avec configuration explicite
// (siteID + token) en repli si l'injection automatique de l'environnement échoue.

const { getStore } = require('@netlify/blobs');

const SITE_ID = '35076228-9459-46a5-8ad5-3e9967ecb653';

function store(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (token) {
    return getStore({ name, siteID: SITE_ID, token });
  }
  return getStore({ name });
}

module.exports = { store };
