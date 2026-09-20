import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../lib/db';
import mapa from './mapa-fotos.json';

// Endpoint temporal de un solo uso: descarga las fotos de producto desde las
// URLs de Alegra (ya extraídas de tu export de items en mapa-fotos.json) y las
// guarda en Netlify Blobs, dejando en productos.imagen_key la referencia a
// esa foto. A diferencia de las demás migraciones, ESTE endpoint sí escribe
// directamente en Neon (no hay forma de pasar bytes de imagen por SQL pegado
// a mano), así que asegúrate de haber corrido antes la migración de
// productos y la que agrega la columna imagen_key.
//
// IMPORTANTE: las URLs de las fotos en mapa-fotos.json son firmadas por
// Alegra y expiran (vencen alrededor del 27 de septiembre de 2026 según el
// lote exportado) — hay que correr este import antes de esa fecha, o pedir
// un nuevo export de items para regenerar el mapa.

export const dynamic = 'force-dynamic';

function extensionDe(url) {
  const limpio = url.split('?')[0];
  const m = limpio.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (m ? m[1] : 'jpg').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'jfif', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
}

function contentTypeDe(ext) {
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      jfif: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    }[ext] || 'application/octet-stream'
  );
}

async function procesarUno(store, item) {
  const ext = extensionDe(item.url);
  const key = `${item.referencia}.${ext}`;

  const res = await fetch(item.url);
  if (!res.ok) {
    return { referencia: item.referencia, ok: false, error: `HTTP ${res.status}` };
  }
  const buffer = await res.arrayBuffer();

  await store.set(key, buffer, { metadata: { contentType: contentTypeDe(ext) } });

  const filas = await sql`
    UPDATE productos SET imagen_key = ${key}
    WHERE referencia = ${item.referencia}
    RETURNING id
  `;

  if (filas.length === 0) {
    return { referencia: item.referencia, ok: false, error: 'no existe un producto con esa referencia' };
  }

  return { referencia: item.referencia, ok: true };
}

async function procesarEnLotes(items, tamanoLote, store) {
  const resultados = [];
  for (let i = 0; i < items.length; i += tamanoLote) {
    const lote = items.slice(i, i + tamanoLote);
    const lotesResueltos = await Promise.all(lote.map((item) => procesarUno(store, item)));
    resultados.push(...lotesResueltos);
  }
  return resultados;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = Number(searchParams.get('start') || 0);
    const limite = Math.min(Number(searchParams.get('limite') || 150), 300);
    const concurrencia = 20;

    const lote = mapa.slice(start, start + limite);
    if (lote.length === 0) {
      return NextResponse.json({ ok: true, procesados: 0, siguienteStart: null, mensaje: 'No hay más fotos por procesar.' });
    }

    const store = getStore('productos-imagenes');
    const resultados = await procesarEnLotes(lote, concurrencia, store);

    const exitosos = resultados.filter((r) => r.ok).length;
    const fallidos = resultados.filter((r) => !r.ok);
    const siguienteStart = start + limite < mapa.length ? start + limite : null;

    return NextResponse.json({
      ok: true,
      totalFotos: mapa.length,
      procesadosEnEsteLote: resultados.length,
      exitosos,
      fallidos: fallidos.length,
      detalleFallidos: fallidos.slice(0, 20),
      siguienteStart,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
