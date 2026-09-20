import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { verificarClave } from '../../../../../lib/claveAdmin';

// Verifica una clave contra la de administrador guardada. Se usa para
// desbloquear pantallas restringidas (por ahora, Ajustes de inventario).
export async function POST(request) {
  try {
    const body = await request.json();
    const clave = body.clave || '';

    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;

    if (!fila?.valor) {
      // No hay clave configurada todavía: no se bloquea nada.
      return NextResponse.json({ ok: true, valida: true, configurada: false });
    }

    const valida = verificarClave(clave, fila.valor);
    return NextResponse.json({ ok: true, valida, configurada: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
