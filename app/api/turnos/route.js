import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Devuelve el turno abierto actualmente (o null si la caja está cerrada).
export async function GET() {
  try {
    const [turno] = await sql`
      SELECT * FROM turnos WHERE estado = 'abierto' ORDER BY id DESC LIMIT 1
    `;
    return NextResponse.json({ ok: true, turno: turno || null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Abre un turno nuevo. No deja abrir dos al tiempo.
export async function POST(request) {
  try {
    const body = await request.json();
    const baseInicial = Number(body.base_inicial) || 0;

    const [existente] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (existente) {
      return NextResponse.json({ ok: false, error: 'Ya hay un turno abierto' }, { status: 409 });
    }

    const [turno] = await sql`
      INSERT INTO turnos (base_inicial, estado)
      VALUES (${baseInicial}, 'abierto')
      RETURNING *
    `;
    return NextResponse.json({ ok: true, turno });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
