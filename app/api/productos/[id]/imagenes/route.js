import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

function extensionDe(nombre, tipo) {
  const m = String(nombre || '').match(/\.([a-zA-Z0-9]+)$/);
  if (m) {
    const ext = m[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'jfif', 'webp', 'gif'].includes(ext)) return ext;
  }
  if (tipo === 'image/png') return 'png';
  if (tipo === 'image/webp') return 'webp';
  if (tipo === 'image/gif') return 'gif';
  return 'jpg';
}

// Lista las fotos de un producto (para mostrarlas al editarlo).
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const imagenes = await sql`
      SELECT id, imagen_key, orden
      FROM producto_imagenes
      WHERE producto_id = ${id}
      ORDER BY orden ASC, id ASC
    `;
    return NextResponse.json({ ok: true, imagenes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Sube una foto nueva para el producto. Si es la primera foto que tiene,
// pasa a ser la portada (productos.imagen_key) automáticamente.
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const [producto] = await sql`SELECT id, referencia, imagen_key FROM productos WHERE id = ${id}`;
    if (!producto) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }

    const formData = await request.formData();
    const archivo = formData.get('imagen');
    if (!archivo || typeof archivo === 'string') {
      return NextResponse.json({ ok: false, error: 'No se recibió ninguna imagen' }, { status: 400 });
    }

    const ext = extensionDe(archivo.name, archivo.type);
    const key = `${producto.referencia}-${Date.now()}.${ext}`;
    const buffer = await archivo.arrayBuffer();

    const store = getStore('productos-imagenes');
    await store.set(key, buffer, { metadata: { contentType: archivo.type || 'image/jpeg' } });

    const [{ max_orden }] = await sql`
      SELECT COALESCE(MAX(orden), -1) AS max_orden FROM producto_imagenes WHERE producto_id = ${id}
    `;
    const nuevoOrden = Number(max_orden) + 1;

    const [fila] = await sql`
      INSERT INTO producto_imagenes (producto_id, imagen_key, orden)
      VALUES (${id}, ${key}, ${nuevoOrden})
      RETURNING id, imagen_key, orden
    `;

    if (!producto.imagen_key) {
      await sql`UPDATE productos SET imagen_key = ${key} WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true, imagen: fila });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
