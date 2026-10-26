import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Códigos del proveedor aprendidos (oct 2026, "Importar borrador" de
// Facturas de compra): cuando Nelson aprueba un borrador, cada código que
// trae la factura del proveedor (ej. "CHB2") queda unido al producto del POS
// que se usó. La próxima factura de ese proveedor se empareja sola.
// La tabla se crea sola la primera vez (no hay que correr nada en Neon).

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await sql`
    CREATE TABLE IF NOT EXISTS proveedor_alias (
      id SERIAL PRIMARY KEY,
      proveedor_id INT NOT NULL,
      codigo TEXT NOT NULL,
      producto_id INT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (proveedor_id, codigo)
    )
  `;
  tablaLista = true;
}

function normalizar(c) {
  return String(c || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 80);
}

// GET → { alias: [{codigo, producto_id}], comprados: [producto_id] }
// "comprados": productos que ya llegaron en facturas de este proveedor
// (ayuda a elegir cuando hay varios productos con el mismo modelo).
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const proveedorId = Number(id);
    if (!proveedorId) return NextResponse.json({ ok: true, alias: [], comprados: [] });
    await asegurarTabla();
    const [alias, comprados] = await Promise.all([
      sql`SELECT codigo, producto_id FROM proveedor_alias WHERE proveedor_id = ${proveedorId}`,
      sql`
        SELECT DISTINCT m.producto_id
        FROM movimientos_stock m
        JOIN facturas_compra f ON f.id = m.factura_compra_id
        WHERE m.tipo = 'factura_compra' AND f.proveedor_id = ${proveedorId}
      `,
    ]);
    return NextResponse.json({ ok: true, alias, comprados: comprados.map((c) => Number(c.producto_id)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST { pares: [{ codigo, producto_id }] } → guarda o actualiza.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const proveedorId = Number(id);
    if (!proveedorId) return NextResponse.json({ ok: false, error: 'Proveedor inválido' }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const pares = (Array.isArray(body.pares) ? body.pares : [])
      .map((p) => ({ codigo: normalizar(p?.codigo), producto_id: Number(p?.producto_id) }))
      .filter((p) => p.codigo.length >= 2 && p.producto_id > 0)
      .slice(0, 300);
    if (!pares.length) return NextResponse.json({ ok: true, guardados: 0 });
    await asegurarTabla();
    await sql.transaction(
      pares.map(
        (p) => sql`
          INSERT INTO proveedor_alias (proveedor_id, codigo, producto_id)
          VALUES (${proveedorId}, ${p.codigo}, ${p.producto_id})
          ON CONFLICT (proveedor_id, codigo) DO UPDATE SET producto_id = EXCLUDED.producto_id, creado_en = now()
        `
      )
    );
    return NextResponse.json({ ok: true, guardados: pares.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
