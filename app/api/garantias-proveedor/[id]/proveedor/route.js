import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Asigna (o cambia) el proveedor de un caso que se creó sin uno todavía —
// por ejemplo cuando al armar la garantía no se sabía a quién se le iba a
// llevar el producto. No mueve stock ni cambia el estado del caso: solo
// deja anotado el proveedor para poder seguirle la pista y, luego, marcarla
// como entregada.
export async function POST(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const body = await request.json();
    const proveedor_id = Number(body.proveedor_id);
    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona el proveedor' }, { status: 400 });
    }

    const [proveedor] = await sql`SELECT id, nombre, telefono FROM proveedores WHERE id = ${proveedor_id}`;
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: 'El proveedor ya no existe' }, { status: 404 });
    }

    const [garantia] = await sql`
      UPDATE garantias_proveedor SET proveedor_id = ${proveedor_id} WHERE id = ${id} RETURNING id
    `;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proveedor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
