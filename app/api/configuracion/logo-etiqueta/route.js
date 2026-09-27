import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../../lib/db';
import { leerImagenSubida } from '../../../../lib/validarImagen';

// Logo que se imprime en las etiquetas de producto (74mm x 45mm, ver
// /etiquetas/imprimir). Se guarda como una imagen más en el mismo store de
// Netlify Blobs que usan las fotos de producto ("productos-imagenes"), así
// que se sirve igual, por /api/imagenes/[key] — no hace falta una ruta
// aparte para mostrarlo. La única diferencia es que la KEY del logo actual
// se guarda en la tabla genérica "configuracion" (clave = 'logo_etiqueta'),
// para poder cambiarlo después desde Ajustes sin tocar código.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'logo_etiqueta'`;
    return NextResponse.json({ ok: true, imagen_key: fila?.valor || null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Sube (o reemplaza) el logo. No borra la imagen anterior del store — mismo
// criterio de no borrar datos que se usa en el resto del proyecto — solo
// deja de estar referenciada.
export async function POST(request) {
  try {
    const formData = await request.formData();
    // Se revisa que sea de verdad una imagen (ver lib/validarImagen.js).
    const imagen = await leerImagenSubida(formData.get('imagen'));
    if (!imagen.ok) {
      return NextResponse.json({ ok: false, error: imagen.error }, { status: 400 });
    }

    const key = `logo-etiqueta-${Date.now()}.${imagen.ext}`;

    const store = getStore('productos-imagenes');
    await store.set(key, imagen.buffer, { metadata: { contentType: imagen.contentType } });

    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('logo_etiqueta', ${key}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${key}, actualizado_en = now()
    `;

    return NextResponse.json({ ok: true, imagen_key: key });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Quita el logo (las etiquetas se imprimen sin logo hasta que se suba otro).
export async function DELETE() {
  try {
    await sql`DELETE FROM configuracion WHERE clave = 'logo_etiqueta'`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
