import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Analíticas → Tienda online. Trae de la tienda (geekstore.com.co) sus
// estadísticas propias — visitas, productos vistos, carrito, pagos, compras,
// búsquedas y el chat — y les agrega desde el POS la referencia y el stock
// actual de cada producto (una sola consulta pequeña a Neon).
//
// Variables de entorno del POS (Netlify):
//   ESTADISTICAS_CLAVE — la MISMA que se puso en la tienda.
//   TIENDA_URL         — opcional (por defecto https://geekstore.com.co).
export const dynamic = 'force-dynamic';

const DIAS_VALIDOS = [1, 7, 30, 90];

export async function GET(request) {
  const clave = process.env.ESTADISTICAS_CLAVE;
  if (!clave) {
    return NextResponse.json({ ok: false, error: 'Falta la variable ESTADISTICAS_CLAVE en Netlify del POS (la misma que en la tienda).' }, { status: 500 });
  }
  const pedido = Number(new URL(request.url).searchParams.get('dias'));
  const dias = DIAS_VALIDOS.includes(pedido) ? pedido : 7;
  const base = (process.env.TIENDA_URL || 'https://geekstore.com.co').replace(/\/+$/, '');

  let datos;
  try {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), 20000);
    const res = await fetch(`${base}/api/estadisticas?dias=${dias}`, {
      headers: { 'x-estadisticas-clave': clave },
      cache: 'no-store',
      signal: control.signal,
    }).finally(() => clearTimeout(t));
    datos = await res.json().catch(() => ({}));
    if (!res.ok || !datos.ok) {
      const motivo =
        res.status === 401
          ? 'La clave no coincide: ESTADISTICAS_CLAVE debe ser igual en la tienda y en el POS.'
          : res.status === 404
            ? 'La tienda todavía no tiene las estadísticas (falta subir la actualización de la tienda).'
            : datos.error || `La tienda respondió ${res.status}`;
      return NextResponse.json({ ok: false, error: motivo }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: `No se pudo conectar con la tienda: ${e.message}` }, { status: 502 });
  }

  // Referencia y stock actual de los productos que aparecen.
  const listas = ['masVistos', 'masAlCarrito', 'masVendidos', 'vistosSinVenta'];
  const ids = [...new Set(listas.flatMap((l) => (datos[l] || []).map((p) => String(p.id))))].slice(0, 200);
  if (ids.length) {
    try {
      const filas = await sql`
        SELECT p.referencia, p.alegra_id, COALESCE(SUM(s.cantidad), 0) AS stock
        FROM productos p
        LEFT JOIN stock s ON s.producto_id = p.id
        WHERE p.referencia = ANY(${ids}) OR p.alegra_id = ANY(${ids})
        GROUP BY p.id
      `;
      const porId = new Map();
      for (const f of filas) {
        if (f.alegra_id) porId.set(String(f.alegra_id), f);
        if (f.referencia && !porId.has(String(f.referencia))) porId.set(String(f.referencia), f);
      }
      for (const l of listas) {
        datos[l] = (datos[l] || []).map((p) => {
          const f = porId.get(String(p.id));
          return f ? { ...p, referencia: f.referencia, stock: Number(f.stock) } : p;
        });
      }
    } catch (e) {
      console.error('[analiticas/tienda] no se pudo leer el stock:', e.message);
    }
  }
  return NextResponse.json(datos);
}
