import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { leerConfigArqueo, horaValida } from '../../../../lib/configArqueo';

// Hora del arqueo de caja programado (Configuraciones > Caja).
export async function GET() {
  try {
    const config = await leerConfigArqueo();
    return NextResponse.json({ ok: true, ...config });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const activo = Boolean(body.activo);
    const hora = String(body.hora || '');
    if (!horaValida(hora)) {
      return NextResponse.json({ ok: false, error: 'Escribe una hora válida' }, { status: 400 });
    }
    const valor = JSON.stringify({ activo, hora });
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('hora_arqueo', ${valor}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
    `;
    return NextResponse.json({ ok: true, activo, hora });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
