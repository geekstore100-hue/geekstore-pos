import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { preguntarIA } from '../../../../lib/iaTexto';
import { construirPrompt, interpretarSugerencias, TAMANO_LOTE } from '../../../../lib/revisionNombres';

// Revisión de nombres con IA, por lotes de 40 productos (para que cada
// llamada a la IA sea corta y no se pase del tiempo máximo de Netlify).
// La pantalla (app/productos/revisar-nombres) va pidiendo lote por lote.
// NO cambia nada en la base de datos: solo devuelve sugerencias.

export const dynamic = 'force-dynamic';

async function leerPalabrasCorrectas() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombres_palabras_ok'`;
    const lista = fila?.valor ? JSON.parse(fila.valor) : [];
    return Array.isArray(lista) ? lista.filter((w) => typeof w === 'string' && w.trim()) : [];
  } catch {
    return [];
  }
}

export async function POST(request) {
  try {
    const { desde = 0, proveedor } = await request.json().catch(() => ({}));
    const inicio = Math.max(0, Math.floor(Number(desde) || 0));

    const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM productos WHERE activo = true`;
    const lote = await sql`
      SELECT id, referencia, nombre FROM productos
      WHERE activo = true
      ORDER BY id ASC
      LIMIT ${TAMANO_LOTE} OFFSET ${inicio}
    `;
    if (lote.length === 0) {
      return NextResponse.json({ ok: true, sugerencias: [], siguiente: null, total, revisados: total });
    }

    const palabrasCorrectas = await leerPalabrasCorrectas();
    const { proveedor: proveedorUsado, texto } = await preguntarIA(construirPrompt(lote, palabrasCorrectas), proveedor);
    const sugerencias = interpretarSugerencias(texto, lote, palabrasCorrectas);
    const revisados = inicio + lote.length;

    return NextResponse.json({
      ok: true,
      proveedorUsado,
      sugerencias,
      revisados,
      total,
      siguiente: revisados < total ? revisados : null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
