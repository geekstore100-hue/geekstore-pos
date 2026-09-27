import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../../../../lib/db';

// Borra un manifiesto adjunto (el archivo en Blobs y la fila en BD).
export async function DELETE(request, { params }) {
  try {
    const { id, manifiestoId } = await params;
    const [manifiesto] = await sql`
      SELECT id, archivo_key FROM factura_compra_manifiestos
      WHERE id = ${manifiestoId} AND factura_compra_id = ${id}
    `;
    if (!manifiesto) {
      return NextResponse.json({ ok: false, error: 'Manifiesto no encontrado' }, { status: 404 });
    }

    const store = getStore('manifiestos-importacion');
    await store.delete(manifiesto.archivo_key).catch(() => {});

    await sql`DELETE FROM factura_compra_manifiestos WHERE id = ${manifiestoId}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
