import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { hashClave, verificarClave } from '../../../../lib/claveAdmin';

// Dice si ya hay una clave de administrador configurada (nunca devuelve la
// clave ni su hash).
export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;
    return NextResponse.json({ ok: true, configurada: Boolean(fila?.valor) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Crea o cambia la clave de administrador. Si ya había una, hay que dar la
// clave actual correcta para poder cambiarla.
export async function POST(request) {
  try {
    const body = await request.json();
    const claveActual = body.clave_actual || '';
    const claveNueva = body.clave_nueva || '';

    if (!claveNueva || claveNueva.trim().length < 4) {
      return NextResponse.json({ ok: false, error: 'La clave nueva debe tener al menos 4 caracteres' }, { status: 400 });
    }

    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;

    if (fila?.valor && !verificarClave(claveActual, fila.valor)) {
      return NextResponse.json({ ok: false, error: 'La clave actual no es correcta' }, { status: 403 });
    }

    const nuevoValor = hashClave(claveNueva.trim());
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('clave_administrador', ${nuevoValor}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${nuevoValor}, actualizado_en = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
