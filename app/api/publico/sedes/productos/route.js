import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { atenderSede, cabecerasCors, filaParaSede } from '../../../../../lib/sedes';

export const dynamic = 'force-dynamic';

// POS de la sede → sus productos con ficha web aquí (nov 2026): si están
// publicados, si la ficha está completa (y qué le falta), si ya salen en la
// página, stock y precio que tenemos. Header x-sede-clave.
export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(request) });
}

export async function GET(request) {
  return atenderSede(request, 'productos', async ({ sede, paso, responder }) => {
    paso('leyendo los productos');
    const filas = await sql`SELECT * FROM productos WHERE sede = ${sede} ORDER BY nombre`;
    const origen = new URL(request.url).origin;
    return responder(200, { ok: true, productos: filas.map((p) => filaParaSede(p, origen)) });
  });
}
