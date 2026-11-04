import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { atenderSede, cabecerasCors, clavesIADeSede, whatsappSede, DATOS_SEDES } from '../../../../../lib/sedes';
import { origenesPermitidos } from '../../../../../lib/corsSedes';

export const dynamic = 'force-dynamic';

// Diagnóstico de la conexión (nov 2026). GET con x-sede-clave. Sirve para
// el botón "Probar conexión" del POS de la sede: dice si la clave sirve,
// cuánto tarda la base de datos, si el origen está permitido (CORS) y qué
// está configurado. Nunca devuelve claves, solo sí/no.
export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(request) });
}

export async function GET(request) {
  return atenderSede(request, 'estado', async ({ sede, paso, responder }) => {
    paso('probando la base de datos');
    const t0 = Date.now();
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM productos WHERE sede = ${sede}`;
    const ms = Date.now() - t0;
    const origen = request.headers.get('origin') || '';
    const ia = clavesIADeSede(sede);
    return responder(200, {
      ok: true,
      sede,
      nombre: DATOS_SEDES[sede].nombre,
      baseDeDatosMs: ms,
      productos: total,
      origen: origen || null,
      origenPermitido: origen ? origenesPermitidos().includes(origen) : null,
      whatsapp: Boolean(whatsappSede(sede)),
      ia: Object.fromEntries(Object.entries(ia).map(([k, v]) => [k, Boolean(v)])),
      quitarFondo: Boolean(process.env[`${sede.toUpperCase()}_REMOVEBG_API_KEY`]),
      hora: new Date().toISOString(),
    });
  });
}
