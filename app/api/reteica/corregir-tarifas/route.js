import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { existeTablaRetenciones, asegurarDecimalesTarifa } from '../../../../lib/retencionesReteica';
import { TARIFAS_VIEJAS } from '../../../../lib/tarifasReteica';

export const dynamic = 'force-dynamic';

// Corrige las retenciones de ReteICA guardadas con las tarifas viejas del
// POS (0,41 % y 1,1 %) a las de verdad (0,414 % y 1,104 %: 4,14 y 11,04
// por mil). Ver lib/tarifasReteica.js.
//   GET  → lista de lo que se corregiría (no cambia nada).
//   POST → corrige todo de una vez.
// Si el valor retenido se había calculado solo (base × tarifa), se vuelve a
// calcular con la tarifa nueva. Si se escribió a mano distinto, solo se
// cambia la tarifa y el valor se deja como estaba (sale marcado para
// revisarlo).

const VIEJAS = Object.keys(TARIFAS_VIEJAS).map(Number);
const r2 = (n) => Math.round(n * 100) / 100;

async function pendientes() {
  const filas = [];
  const facturas = await sql`
    SELECT f.id, f.numero, f.fecha_creacion AS fecha, f.retencion_porcentaje AS porcentaje,
           COALESCE(f.retencion_base, f.subtotal) AS base, f.retencion_valor AS valor, f.estado_pago, p.nombre AS proveedor
    FROM facturas_compra f JOIN proveedores p ON p.id = f.proveedor_id
    WHERE f.retencion_porcentaje = ANY(${VIEJAS}) AND COALESCE(f.retencion_valor, 0) > 0
    ORDER BY f.fecha_creacion, f.id
  `;
  for (const f of facturas) filas.push({ ...f, origen: 'factura', negocio: 'Geek Store' });
  if (await existeTablaRetenciones()) {
    const otras = await sql`
      SELECT r.id, r.numero_factura AS numero, r.fecha, r.porcentaje, r.base, r.valor, r.negocio, p.nombre AS proveedor
      FROM retenciones_reteica r JOIN proveedores p ON p.id = r.proveedor_id
      WHERE r.porcentaje = ANY(${VIEJAS})
      ORDER BY r.fecha, r.id
    `;
    for (const r of otras) filas.push({ ...r, origen: 'retencion' });
  }
  return filas.map((x) => {
    const viejo = Number(x.porcentaje);
    const nuevo = TARIFAS_VIEJAS[viejo];
    const base = Number(x.base) || 0;
    const valor = Number(x.valor) || 0;
    const calculado = Math.abs(valor - (base * viejo) / 100) <= 1;
    // Facturas: con centavos (como la del proveedor). Sin factura: en pesos.
    const valorNuevo = calculado ? (x.origen === 'factura' ? r2((base * nuevo) / 100) : Math.round((base * nuevo) / 100)) : valor;
    const fecha = x.fecha instanceof Date ? x.fecha.toISOString().slice(0, 10) : String(x.fecha).slice(0, 10);
    return {
      clave: `${x.origen === 'factura' ? 'f' : 'r'}-${x.id}`,
      origen: x.origen,
      id: Number(x.id),
      fecha,
      numero: x.numero || null,
      proveedor: x.proveedor,
      negocio: x.negocio,
      base,
      tarifa_antes: viejo,
      tarifa_despues: nuevo,
      valor_antes: valor,
      valor_despues: valorNuevo,
      valor_a_mano: !calculado,
      pagada: x.estado_pago === 'pagada',
    };
  });
}

export async function GET() {
  try {
    const lista = await pendientes();
    return NextResponse.json({
      ok: true,
      pendientes: lista,
      diferencia: lista.reduce((a, l) => a + (l.valor_despues - l.valor_antes), 0),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    await asegurarDecimalesTarifa();
    const lista = await pendientes();
    if (!lista.length) return NextResponse.json({ ok: true, corregidas: 0, diferencia: 0 });
    const q = [];
    for (const l of lista) {
      if (l.origen === 'factura') {
        q.push(sql`
          UPDATE facturas_compra SET retencion_porcentaje = ${l.tarifa_despues}, retencion_valor = ${l.valor_despues}
          WHERE id = ${l.id} AND retencion_porcentaje = ${l.tarifa_antes}
        `);
      } else {
        q.push(sql`
          UPDATE retenciones_reteica SET porcentaje = ${l.tarifa_despues}, valor = ${l.valor_despues}
          WHERE id = ${l.id} AND porcentaje = ${l.tarifa_antes}
        `);
      }
    }
    await sql.transaction(q);
    return NextResponse.json({
      ok: true,
      corregidas: lista.length,
      a_mano: lista.filter((l) => l.valor_a_mano).length,
      diferencia: lista.reduce((a, l) => a + (l.valor_despues - l.valor_antes), 0),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
