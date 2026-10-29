import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { normalizarObligatorios, OBLIGATORIOS_POR_DEFECTO } from '../../../../lib/camposFactura';

export const dynamic = 'force-dynamic';

// Campos obligatorios de los productos nuevos en el asistente de Factura de
// compra (ver lib/camposFactura.js). Si nunca se han guardado, van todos.
export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'factura_campos_obligatorios'`;
    let campos = [...OBLIGATORIOS_POR_DEFECTO];
    try {
      if (fila?.valor) campos = normalizarObligatorios(JSON.parse(fila.valor));
    } catch {
      // valor dañado: se usan los de por defecto
    }
    return NextResponse.json({ ok: true, campos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT { campos: ['categoria', 'subcategoria', ...] }
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const campos = normalizarObligatorios(body.campos);
    const valor = JSON.stringify(campos);
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('factura_campos_obligatorios', ${valor}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
    `;
    return NextResponse.json({ ok: true, campos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
