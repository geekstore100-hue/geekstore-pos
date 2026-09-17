import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const bodegas = await sql`SELECT id, nombre FROM bodegas ORDER BY id ASC`;
    return NextResponse.json({ ok: true, bodegas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
