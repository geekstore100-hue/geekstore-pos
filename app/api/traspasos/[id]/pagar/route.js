import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Marca un traspaso como pagado (Principal ya le pagó a Bodega Distribuidor
// por esa mercancía, o viceversa según el sentido del traspaso).
export async function POST(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Traspaso inválido' }, { status: 400 });
    }

    const [traspaso] = await sql`
      UPDATE traspasos_inventario
      SET estado_pago = 'pagado', pagado_en = now()
      WHERE id = ${id} AND estado_pago = 'pendiente'
      RETURNING id
    `;
    if (!traspaso) {
      return NextResponse.json({ ok: false, error: 'El traspaso no existe o ya estaba marcado como pagado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
