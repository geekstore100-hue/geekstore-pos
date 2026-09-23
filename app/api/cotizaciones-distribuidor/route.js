import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Lista de cotizaciones de distribuidores (pedidos hechos desde el
// portal de mayoristas de la tienda), para la pantalla de revisión del
// admin. No incluye el detalle de artículos — eso se pide aparte, por
// id, al abrir/imprimir una cotización puntual.

export async function GET() {
  try {
    const cotizaciones = await sql`
      SELECT
        id, numero, distribuidor_nombre, distribuidor_cedula, total, estado,
        creado_en, facturada_en,
        (SELECT COUNT(*) FROM cotizacion_distribuidor_items WHERE cotizacion_id = cotizaciones_distribuidor.id) AS articulos
      FROM cotizaciones_distribuidor
      ORDER BY creado_en DESC
    `;
    return NextResponse.json({ ok: true, cotizaciones });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
