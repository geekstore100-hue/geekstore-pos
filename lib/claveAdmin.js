import crypto from 'crypto';

// Hashea la clave de administrador con sal aleatoria (scrypt), para no
// guardarla nunca en texto plano en la base de datos.
export function hashClave(clave) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarClave(clave, valorGuardado) {
  if (!valorGuardado) return false;
  const [salt, hashGuardado] = String(valorGuardado).split(':');
  if (!salt || !hashGuardado) return false;
  const hash = crypto.scryptSync(clave || '', salt, 64).toString('hex');
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(hashGuardado, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
