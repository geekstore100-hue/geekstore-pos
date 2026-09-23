import { NextResponse } from 'next/server';
import { claveValida, buscarDistribuidor } from '../../../../../lib/distribuidores';

// Valida si una cédula corresponde a un distribuidor activo. Lo usa el
// login del portal de distribuidores de la tienda (antes buscaba un
// contacto con lista de precios "Distribuidor" en Alegra Cuenta 1).
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!claveValida(request)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }
    const { cedula } = await request.json();
    const distribuidor = await buscarDistribuidor(cedula);
    if (!distribuidor) {
      return NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, nombre: distribuidor.nombre, cedula: distribuidor.cedula });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
