import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { asegurarTabla, prepararCotizacion, ErrorCotizacionCliente } from '../../../lib/cotizacionesCliente';

export const dynamic = 'force-dynamic';

// Cotizaciones para clientes (ver lib/cotizacionesCliente.js).
// GET  → lista (las 300 más recientes, opcional ?q= para buscar)
// POST → crea una
export async function GET(request) {
  try {
    await asegurarTabla();
    const q = String(new URL(request.url).searchParams.get('q') || '').trim();
    const patron = `%${q}%`;
    const cotizaciones = q
      ? await sql`
          SELECT id, cliente_nombre, cliente_telefono, vendedor, total, creado_en, jsonb_array_length(items) AS n_items
          FROM cotizaciones_cliente
          WHERE cliente_nombre ILIKE ${patron} OR cliente_documento ILIKE ${patron} OR cliente_telefono ILIKE ${patron}
             OR id::text = ${q.replace(/\D/g, '') || '0'} OR items::text ILIKE ${patron}
          ORDER BY id DESC LIMIT 300
        `
      : await sql`
          SELECT id, cliente_nombre, cliente_telefono, vendedor, total, creado_en, jsonb_array_length(items) AS n_items
          FROM cotizaciones_cliente
          ORDER BY id DESC LIMIT 300
        `;
    return NextResponse.json({ ok: true, cotizaciones });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await asegurarTabla();
    const c = await prepararCotizacion(await request.json());
    const [fila] = await sql`
      INSERT INTO cotizaciones_cliente
        (cliente_nombre, cliente_documento, cliente_telefono, cliente_email, vendedor, notas, validez_dias, items, subtotal, descuento, total)
      VALUES
        (${c.cliente_nombre}, ${c.cliente_documento}, ${c.cliente_telefono}, ${c.cliente_email}, ${c.vendedor}, ${c.notas},
         ${c.validez_dias}, ${JSON.stringify(c.items)}::jsonb, ${c.subtotal}, ${c.descuento}, ${c.total})
      RETURNING *
    `;
    return NextResponse.json({ ok: true, cotizacion: fila });
  } catch (error) {
    if (error instanceof ErrorCotizacionCliente) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
