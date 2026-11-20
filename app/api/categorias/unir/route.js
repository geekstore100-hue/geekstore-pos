import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { claveNombre } from '../../../../lib/nombresCategoria';
import { esCategoriaColeccionable } from '../../../../lib/figuras';

export const dynamic = 'force-dynamic';

// UNIR una categoría con otra (nov 2026), para limpiar categorías repetidas
// (ej. la categoría suelta "Juegos PS4" → "Video Juegos" › "Juegos PS4").
//
// POST { origen_id, destino_id, destino_subcategoria_id?, aplicar }
//   aplicar: false → solo dice qué pasaría (no guarda nada).
//   aplicar: true  → lo hace todo en una sola transacción.
//
// Qué hace:
//   - Con subcategoría de destino: TODOS los productos de la categoría vieja
//     quedan en destino › esa subcategoría.
//   - Sin subcategoría de destino: cada producto conserva su subcategoría.
//     Las subcategorías de la vieja pasan a la categoría destino (si allá ya
//     hay una con el mismo nombre, se juntan en esa).
//   - Al final la categoría vieja (y sus subcategorías que quedaron vacías)
//     se borra, y deja de salir en las listas.
// Solo toca la categoría y la subcategoría de los productos: nada de precios,
// stock ni Alegra.

class ErrorUnir extends Error {
  constructor(m, status = 400) {
    super(m);
    this.status = status;
  }
}

async function planear(body) {
  const origenId = Number(body.origen_id);
  const destinoId = Number(body.destino_id);
  const destinoSubId = Number(body.destino_subcategoria_id) || null;
  if (!origenId || !destinoId) throw new ErrorUnir('Elige la categoría que se va a unir y a cuál');
  if (origenId === destinoId) throw new ErrorUnir('Elige una categoría distinta como destino');

  const cats = await sql`SELECT id, nombre FROM categorias WHERE id = ANY(${[origenId, destinoId]})`;
  const origen = cats.find((c) => Number(c.id) === origenId);
  const destino = cats.find((c) => Number(c.id) === destinoId);
  if (!origen || !destino) throw new ErrorUnir('Una de las categorías ya no existe', 404);
  // Coleccionables la usan las sedes (Venecia): si se borra, se vuelve a crear sola.
  if (esCategoriaColeccionable(origen.nombre)) throw new ErrorUnir('"Coleccionables" la usan las sedes: no se puede unir con otra.');

  const subs = await sql`
    SELECT s.id, s.categoria_id, s.nombre,
           (SELECT COUNT(*) FROM productos p WHERE p.subcategoria_id = s.id)::int AS productos
    FROM subcategorias s WHERE s.categoria_id = ANY(${[origenId, destinoId]})
  `;
  const subsOrigen = subs.filter((s) => Number(s.categoria_id) === origenId);
  const subsDestino = subs.filter((s) => Number(s.categoria_id) === destinoId);
  let destinoSub = null;
  if (destinoSubId) {
    destinoSub = subsDestino.find((s) => Number(s.id) === destinoSubId);
    if (!destinoSub) throw new ErrorUnir('La subcategoría elegida no es de la categoría destino', 404);
  }

  const [{ n: productos }] = await sql`SELECT COUNT(*)::int AS n FROM productos WHERE categoria_id = ${origenId}`;

  // Qué pasa con cada subcategoría de la vieja (solo sin subcategoría destino).
  const pasos = subsOrigen.map((s) => {
    if (destinoSub) return { sub: s, accion: 'juntar', en: destinoSub };
    const igual = subsDestino.find((d) => claveNombre(d.nombre) === claveNombre(s.nombre));
    return igual ? { sub: s, accion: 'juntar', en: igual } : { sub: s, accion: 'mover' };
  });

  return { origen, destino, destinoSub, productos, pasos };
}

function vistaDe(plan) {
  const { origen, destino, destinoSub, productos, pasos } = plan;
  return {
    origen: origen.nombre,
    destino: destino.nombre,
    destino_subcategoria: destinoSub?.nombre || null,
    productos,
    subcategorias: pasos.map((p) => ({
      nombre: p.sub.nombre,
      productos: p.sub.productos,
      queda: p.accion === 'mover' ? `${destino.nombre} › ${p.sub.nombre} (se pasa)` : `${destino.nombre} › ${p.en.nombre}`,
    })),
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const plan = await planear(body);
    const vista = vistaDe(plan);
    if (!body.aplicar) return NextResponse.json({ ok: true, vista });

    const { origen, destino, destinoSub, pasos } = plan;
    const o = Number(origen.id);
    const d = Number(destino.id);
    const q = [];
    if (destinoSub) {
      // Todo a una sola subcategoría.
      q.push(sql`UPDATE productos SET categoria_id = ${d}, subcategoria_id = ${destinoSub.id}, actualizado_en = now() WHERE categoria_id = ${o}`);
    } else {
      for (const p of pasos) {
        if (p.accion === 'juntar') {
          q.push(sql`UPDATE productos SET categoria_id = ${d}, subcategoria_id = ${p.en.id}, actualizado_en = now() WHERE subcategoria_id = ${p.sub.id}`);
        } else {
          q.push(sql`UPDATE subcategorias SET categoria_id = ${d} WHERE id = ${p.sub.id}`);
          q.push(sql`UPDATE productos SET categoria_id = ${d}, actualizado_en = now() WHERE subcategoria_id = ${p.sub.id}`);
        }
      }
      // Los que no tenían subcategoría (o una que no era de esta categoría).
      q.push(sql`UPDATE productos SET categoria_id = ${d}, subcategoria_id = NULL, actualizado_en = now() WHERE categoria_id = ${o}`);
    }
    // Lo que quedó de la vieja ya está vacío: se borra.
    q.push(sql`UPDATE productos SET subcategoria_id = NULL WHERE subcategoria_id IN (SELECT id FROM subcategorias WHERE categoria_id = ${o})`);
    q.push(sql`DELETE FROM subcategorias WHERE categoria_id = ${o}`);
    q.push(sql`DELETE FROM categorias WHERE id = ${o}`);
    await sql.transaction(q);
    return NextResponse.json({ ok: true, vista });
  } catch (error) {
    if (error instanceof ErrorUnir) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
