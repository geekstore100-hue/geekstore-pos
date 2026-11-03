import { NextResponse } from 'next/server';
import { DATOS_SEDES } from '../../../lib/sedes';

export const dynamic = 'force-dynamic';

// Quién está usando el POS: el administrador (sede null) o una sede externa
// con sesión limitada (ver middleware.js y lib/sesionSede.js).
export async function GET(request) {
  const sede = request.headers.get('x-pos-sede') || null;
  return NextResponse.json({ ok: true, sede, nombreSede: sede ? DATOS_SEDES[sede]?.nombre || sede : null });
}
