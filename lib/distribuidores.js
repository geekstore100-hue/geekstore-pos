// lib/distribuidores.js
// Funciones compartidas por las rutas públicas /api/publico/distribuidores/*
// que usa el portal de mayoristas de la tienda online (geekstore-tienda).
//
// Seguridad: estas rutas viven bajo /api/publico (por eso el middleware.js
// las deja pasar sin la sesión de administrador — igual que el catálogo y
// las imágenes), PERO a diferencia del catálogo, acá sí hay datos
// sensibles (precios de mayorista) y una acción que escribe (crear un
// pedido). Por eso, además de la cédula, exigen un secreto compartido
// (DISTRIBUIDOR_CLAVE) que solo conocen el servidor del POS y el
// servidor de la tienda — nunca llega al navegador del distribuidor ni
// al del público en general.

import sql from './db';

export function claveValida(request) {
  const clave = request.headers.get('x-distribuidor-clave');
  return Boolean(clave) && clave === process.env.DISTRIBUIDOR_CLAVE;
}

export async function buscarDistribuidor(cedula) {
  const limpia = String(cedula || '').trim();
  if (!limpia) return null;
  const [fila] = await sql`
    SELECT id, cedula, nombre
    FROM distribuidores
    WHERE cedula = ${limpia} AND activo = true
  `;
  return fila || null;
}
