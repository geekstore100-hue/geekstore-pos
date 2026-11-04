import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { atenderSede, cabecerasCors, cuerpoJson, limpiarCodigo } from '../../../../../lib/sedes';

export const dynamic = 'force-dynamic';

// POS de la sede → aviso de stock / precio (nov 2026).
// Header x-sede-clave. POST { items: [{ codigo, stock, precio? }], completo?: true }
//   - Se manda cada vez que cambia el stock o el precio de un producto
//     publicado (venta, compra, ajuste, devolución...).
//   - completo: true = es la lista COMPLETA de sus productos publicados
//     (sincronización diaria): los que no vengan quedan en stock 0.
//   - Los códigos que no están publicados aquí se ignoran (vuelven en
//     "sinPublicar").
// Todo va en UNA sola consulta (antes era una por producto: con cientos de
// productos la sincronización completa se pasaba del tiempo de Netlify).
export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(request) });
}

export async function POST(request) {
  return atenderSede(request, 'stock', async ({ sede, paso, responder }) => {
    const body = await cuerpoJson(request);
    if (!body || typeof body !== 'object') return responder(400, { ok: false, codigo: 'datos', error: 'Datos inválidos' });
    const lista = (Array.isArray(body.items) ? body.items : []).slice(0, 5000);
    // Un código repetido: vale el último.
    const porCodigo = new Map();
    for (const it of lista) {
      const codigo = limpiarCodigo(it?.codigo);
      if (!codigo) continue;
      porCodigo.set(codigo, {
        stock: Math.max(0, Math.floor(Number(it.stock) || 0)),
        precio: Math.max(0, Math.round(Number(it.precio) || 0)),
      });
    }
    const codigos = [...porCodigo.keys()];
    const stocks = codigos.map((c) => porCodigo.get(c).stock);
    const precios = codigos.map((c) => porCodigo.get(c).precio);

    paso('actualizando el stock');
    let hechos = [];
    if (codigos.length) {
      hechos = await sql`
        UPDATE productos p SET
          sede_stock = v.stock,
          precio_venta = CASE WHEN v.precio > 0 THEN v.precio ELSE p.precio_venta END,
          sede_sincronizado_en = now()
        FROM unnest(${codigos}::text[], ${stocks}::numeric[], ${precios}::numeric[]) AS v(codigo, stock, precio)
        WHERE p.sede = ${sede} AND p.sede_codigo = v.codigo
        RETURNING p.sede_codigo
      `;
    }
    const hechosSet = new Set(hechos.map((h) => h.sede_codigo));
    const sinPublicar = codigos.filter((c) => !hechosSet.has(c));

    let enCero = 0;
    if (body.completo === true) {
      paso('poniendo en cero los que no llegaron');
      const r = await sql`
        UPDATE productos SET sede_stock = 0, sede_sincronizado_en = now()
        WHERE sede = ${sede} AND NOT (sede_codigo = ANY(${codigos}::text[])) AND sede_stock <> 0
        RETURNING id
      `;
      enCero = r.length;
    }
    return responder(200, { ok: true, actualizados: hechosSet.size, sinPublicar, enCero });
  });
}
