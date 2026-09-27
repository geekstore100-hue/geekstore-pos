import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../../../lib/db';
import { leerDocumentoSubido } from '../../../../../lib/validarDocumento';

export const dynamic = 'force-dynamic';

// Lista los manifiestos de importación adjuntos a una factura de compra.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const manifiestos = await sql`
      SELECT id, archivo_key, nombre_original, tipo_archivo, tamano_bytes, subido_en
      FROM factura_compra_manifiestos
      WHERE factura_compra_id = ${id}
      ORDER BY subido_en ASC, id ASC
    `;
    return NextResponse.json({ ok: true, manifiestos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Sube un manifiesto (PDF o foto/escaneo) para esta factura de compra. Una
// factura puede tener varios (a veces la importación viene repartida en más
// de un documento).
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const [factura] = await sql`SELECT id, numero FROM facturas_compra WHERE id = ${id}`;
    if (!factura) {
      return NextResponse.json({ ok: false, error: 'Factura de compra no encontrada' }, { status: 404 });
    }

    const formData = await request.formData();
    const documento = await leerDocumentoSubido(formData.get('archivo'));
    if (!documento.ok) {
      return NextResponse.json({ ok: false, error: documento.error }, { status: 400 });
    }

    const key = `${factura.numero || `FC-${factura.id}`}-${Date.now()}.${documento.ext}`;

    const store = getStore('manifiestos-importacion');
    await store.set(key, documento.buffer, { metadata: { contentType: documento.contentType } });

    const [fila] = await sql`
      INSERT INTO factura_compra_manifiestos (factura_compra_id, archivo_key, nombre_original, tipo_archivo, tamano_bytes)
      VALUES (${id}, ${key}, ${documento.nombreOriginal}, ${documento.contentType}, ${documento.buffer.byteLength})
      RETURNING id, archivo_key, nombre_original, tipo_archivo, tamano_bytes, subido_en
    `;

    return NextResponse.json({ ok: true, manifiesto: fila });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
