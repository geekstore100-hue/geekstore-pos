// SESIÓN DE SEDE (nov 2026, fase 0 de Venecia).
//
// Geek Store Venecia (otro NIT, su propio POS en Firebase) publica sus
// coleccionables en geekstore.com.co usando el EDITOR de productos de este
// POS. Su gente no entra con la clave de administrador: su POS les abre un
// enlace firmado que vale 15 minutos (ver /api/publico/sedes/entrar) y eso
// les deja una sesión LIMITADA de 12 horas que solo sirve para editar los
// productos de su sede (ver middleware.js).
//
// Solo usa Web Crypto (crypto.subtle) porque lo usa también middleware.js,
// que corre en el "Edge" de Netlify.

export const COOKIE_SEDE = 'pos_sede';
export const DURACION_SEDE_SEG = 60 * 60 * 12; // 12 horas
const DURACION_ENLACE_SEG = 60 * 15; // el enlace del POS de la sede: 15 min

// Sedes externas que pueden publicar en la página.
export const SEDES = ['venecia'];

function secreto() {
  const clave = process.env.ADMIN_CLAVE;
  if (!clave) return null;
  return `${clave}|${process.env.SESION_SECRETO || ''}|sedes`;
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

async function llave(uso) {
  const s = secreto();
  if (!s) throw new Error('ADMIN_CLAVE no está configurada');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, [uso]);
}

async function firmar(cuerpo) {
  const f = await crypto.subtle.sign('HMAC', await llave('sign'), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${aBase64Url(new Uint8Array(f))}`;
}

// Devuelve las partes del cuerpo si la firma es válida y no venció.
async function verificar(token, prefijo, nPartes) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== nPartes + 1 || partes[0] !== prefijo) return null;
    const cuerpo = partes.slice(0, nPartes).join('.');
    const ok = await crypto.subtle.verify('HMAC', await llave('verify'), deBase64Url(partes[nPartes]), new TextEncoder().encode(cuerpo));
    if (!ok) return null;
    const expira = Number(partes[nPartes - 1]);
    if (!Number.isFinite(expira) || expira < Math.floor(Date.now() / 1000)) return null;
    return partes.slice(0, nPartes);
  } catch {
    return null;
  }
}

// Enlace corto para abrir el editor desde el POS de la sede.
export async function crearEnlaceSede(sede, productoId) {
  const expira = Math.floor(Date.now() / 1000) + DURACION_ENLACE_SEG;
  return firmar(`e1.${sede}.${Number(productoId) || 0}.${expira}`);
}
export async function leerEnlaceSede(token) {
  const p = await verificar(token, 'e1', 4);
  if (!p || !SEDES.includes(p[1])) return null;
  return { sede: p[1], productoId: Number(p[2]) || 0 };
}

// Sesión limitada (cookie) de la sede.
export async function crearSesionSede(sede) {
  const expira = Math.floor(Date.now() / 1000) + DURACION_SEDE_SEG;
  return firmar(`s1.${sede}.${expira}`);
}
export async function sedeDeSesion(token) {
  const p = await verificar(token, 's1', 3);
  return p && SEDES.includes(p[1]) ? p[1] : null;
}
