import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { normalizarRegla } from '../../../../../lib/borradorFactura';

export const dynamic = 'force-dynamic';

// Regla de precios de cada proveedor para "Importar borrador" de Facturas
// de compra (oct 2026). Ej. Innovall: el IVA no se tiene en cuenta y el
// precio de venta es costo × 2; los demás: costo = precio + IVA y el precio
// de venta lo pone Nelson. Se guarda en la tabla "configuracion" con la
// clave regla_precio_proveedor_<id> (no hay que correr nada en Neon).

function clave(id) {
  return `regla_precio_proveedor_${Number(id)}`;
}

// GET → { regla: {iva, multiplicador} | null }  (null = nunca se ha guardado)
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!Number(id)) return NextResponse.json({ ok: true, regla: null });
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = ${clave(id)}`;
    let regla = null;
    try {
      regla = fila?.valor ? normalizarRegla(JSON.parse(fila.valor)) : null;
    } catch {
      regla = null;
    }
    return NextResponse.json({ ok: true, regla });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT { iva: 'sumar'|'ignorar', multiplicador: número|null }
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    if (!Number(id)) return NextResponse.json({ ok: false, error: 'Proveedor inválido' }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const regla = normalizarRegla(body);
    const valor = JSON.stringify(regla);
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES (${clave(id)}, ${valor}, NOW())
      ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = NOW()
    `;
    return NextResponse.json({ ok: true, regla });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
