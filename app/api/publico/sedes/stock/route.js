import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { asegurarSedes, sedeDeClave, cabecerasCors, limpiarCodigo } from '../../../../../lib/sedes';

export const dynamic = 'force-dynamic';

// POS de la sede → aviso de stock / precio (nov 2026).
// Header x-sede-clave. POST { items: [{ codigo, stock, precio? }], completo?: true }
//   - Se manda cada vez que cambia el stock o el precio de un producto
//     publicado (venta, compra, ajuste, devolución...).
//   - completo: true = es la lista COMPLETA de sus productos publicados
//     (sincronización diaria): los que no vengan quedan en stock 0.
//   - Los códigos que no están publicados aquí se ignoran (vuelven en
//     "sinPublicar").
export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(request) });
}

export async function POST(request) {
  const cors = cabecerasCors(request);
  try {
    const sede = sedeDeClave(request);
    if (!sede) return NextResponse.json({ ok: false, error: 'Clave inválida' }, { status: 401, headers: cors });
    await asegurarSedes();
    const body = await request.json();
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 2000);
    const vistos = [];
    const sinPublicar = [];
    let actualizados = 0;
    for (const it of items) {
      const codigo = limpiarCodigo(it.codigo);
      if (!codigo) continue;
      vistos.push(codigo);
      const stock = Math.max(0, Math.floor(Number(it.stock) || 0));
      const precio = Math.round(Number(it.precio) || 0);
      const filas = await sql`
        UPDATE productos SET sede_stock = ${stock},
          precio_venta = CASE WHEN ${precio} > 0 THEN ${precio} ELSE precio_venta END,
          sede_sincronizado_en = now()
        WHERE sede = ${sede} AND sede_codigo = ${codigo}
        RETURNING id
      `;
      if (filas.length) actualizados++;
      else sinPublicar.push(codigo);
    }
    let enCero = 0;
    if (body.completo === true) {
      const r = await sql`
        UPDATE productos SET sede_stock = 0, sede_sincronizado_en = now()
        WHERE sede = ${sede} AND NOT (sede_codigo = ANY(${vistos})) AND sede_stock <> 0
        RETURNING id
      `;
      enCero = r.length;
    }
    return NextResponse.json({ ok: true, actualizados, sinPublicar, enCero }, { headers: cors });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
}
