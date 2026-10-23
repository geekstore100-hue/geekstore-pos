import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { activarVentaNegativa, productosEnlazados } from '../../../../lib/alegraFacturacion';

export const dynamic = 'force-dynamic';

// "Venta en negativo" en Alegra para los productos del POS enlazados.
// GET  → lista de productos enlazados con Alegra (los que tienen inventario).
// POST { productoId } → la activa en ese producto (ver lib/alegraFacturacion.js).
export async function GET() {
  try {
    const productos = await productosEnlazados();
    return NextResponse.json({ ok: true, productos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { productoId } = await request.json();
    const [p] = await sql`SELECT alegra2_id FROM productos WHERE id = ${Number(productoId) || 0}`;
    if (!p?.alegra2_id) return NextResponse.json({ ok: false, error: 'Ese producto no está enlazado con Alegra' }, { status: 404 });
    const r = await activarVentaNegativa(p.alegra2_id);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
