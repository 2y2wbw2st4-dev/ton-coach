// Utilitaires d'authentification partagés — hachage de mot de passe (scrypt) et jetons de session.
// Aucun mot de passe n'est jamais stocké en clair : seul un sel + un hash le sont.

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (test.length !== stored.length) return false;
  return crypto.timingSafeEqual(test, stored);
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { hashPassword, verifyPassword, genToken };
