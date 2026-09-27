// Sesión del POS.
//
// Antes, la cookie de sesión ("pos_clave") guardaba la clave de acceso TAL
// CUAL: quien viera esa cookie (por ejemplo abriendo las herramientas del
// navegador en el PC del local) se llevaba la clave misma, y le servía para
// siempre. Ahora la cookie ("pos_sesion") lleva un "pase" firmado que no
// contiene la clave: solo dice hasta cuándo es válido, más una firma
// (HMAC-SHA256) que solo el servidor puede generar. Si alguien lo copia, no
// aprende la clave, y el pase se vence solo a los 30 días.
//
// La firma usa como llave la clave de acceso (ADMIN_CLAVE) + SESION_SECRETO
// (opcional pero recomendado, ver instrucciones del lote). Consecuencia
// útil: si cambias ADMIN_CLAVE en Netlify, todas las sesiones abiertas en
// cualquier computador o celular se cierran automáticamente.
//
// Solo usa APIs web estándar (crypto.subtle, TextEncoder, btoa/atob) porque
// este archivo lo usa también middleware.js, que corre en el "Edge" de
// Netlify, donde no existe el módulo crypto de Node.

export const COOKIE_SESION = 'pos_sesion';
export const DURACION_SESION_SEG = 60 * 60 * 24 * 30; // 30 días

export const OPCIONES_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

function secreto() {
  const clave = process.env.ADMIN_CLAVE;
  if (!clave) return null;
  return `${clave}|${process.env.SESION_SECRETO || ''}`;
}

function aBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function llaveHmac(secretoTexto, uso) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretoTexto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [uso]
  );
}

export async function crearTokenSesion() {
  const s = secreto();
  if (!s) throw new Error('ADMIN_CLAVE no está configurada');
  const expira = Math.floor(Date.now() / 1000) + DURACION_SESION_SEG;
  const cuerpo = `v1.${expira}`;
  const firma = await crypto.subtle.sign('HMAC', await llaveHmac(s, 'sign'), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${aBase64Url(new Uint8Array(firma))}`;
}

export async function tokenSesionValido(token) {
  try {
    const s = secreto();
    if (!s || !token) return false;
    const partes = String(token).split('.');
    if (partes.length !== 3 || partes[0] !== 'v1') return false;
    const expira = Number(partes[1]);
    if (!Number.isFinite(expira) || expira < Math.floor(Date.now() / 1000)) return false;
    // crypto.subtle.verify compara la firma en tiempo constante.
    return await crypto.subtle.verify(
      'HMAC',
      await llaveHmac(s, 'verify'),
      deBase64Url(partes[2]),
      new TextEncoder().encode(`v1.${partes[1]}`)
    );
  } catch {
    return false;
  }
}

// Compara la clave escrita con ADMIN_CLAVE sin filtrar pistas por el tiempo
// de respuesta (una comparación normal con === se demora distinto según
// cuántas letras del inicio coinciden, y eso se puede medir).
export async function claveAccesoCorrecta(clave) {
  const real = process.env.ADMIN_CLAVE;
  if (!real || typeof clave !== 'string' || !clave) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(clave)),
    crypto.subtle.digest('SHA-256', enc.encode(real)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x[i] ^ y[i];
  return diferencia === 0;
}
