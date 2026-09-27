import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { lunesDeLaSemana } from '../../../lib/horaColombia';

// Chequeo semanal de inventario: cada semana (a partir del lunes, hora
// Colombia) el sistema escoge al azar 2 productos con stock en la bodega
// Principal para que un vendedor los cuente físicamente y se compare con
// lo que dice el sistema.
//
// No hace falta ninguna tarea programada: la primera vez que alguien abre
// el POS en la semana, si todavía no hay productos escogidos para esa
// semana, se escogen en ese momento. La restricción UNIQUE (semana,
// posicion) evita que dos pantallas abiertas al mismo tiempo escojan 4.

const POR_SEMANA = 2;

async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}

async function filasDeLaSemana(semana) {
  return sql`
    SELECT c.id, c.posicion, c.producto_id, c.referencia, c.nombre,
           c.stock_sistema, c.cantidad_contada, c.contado_en, c.observaciones,
           ve.nombre AS vendedor_nombre
    FROM conteos_rutinarios c
    LEFT JOIN vendedores ve ON ve.id = c.vendedor_id
    WHERE c.semana = ${semana}
    ORDER BY c.posicion ASC
  `;
}

async function asegurarSemana(semana, bodegaId) {
  const existentes = await filasDeLaSemana(semana);
  if (existentes.length >= POR_SEMANA) return existentes;

  const posicionesUsadas = new Set(existentes.map((f) => Number(f.posicion)));
  const productosUsados = existentes.map((f) => f.producto_id).filter(Boolean);

  // Se prefieren productos que no se hayan revisado en las últimas 8
  // semanas, para ir cubriendo más referencias; si no alcanzan (inventario
  // muy chico), se permite repetir.
  let candidatos = await sql`
    SELECT p.id, p.referencia, p.nombre
    FROM productos p
    JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
    WHERE p.activo = true
      AND p.es_inventariable IS DISTINCT FROM false
      AND s.cantidad > 0
      AND NOT (p.id = ANY(${productosUsados}::int[]))
      AND p.id NOT IN (
        SELECT producto_id FROM conteos_rutinarios
        WHERE producto_id IS NOT NULL AND semana > ${semana}::date - 56
      )
    ORDER BY random()
    LIMIT ${POR_SEMANA}
  `;
  if (candidatos.length < POR_SEMANA - existentes.length) {
    candidatos = await sql`
      SELECT p.id, p.referencia, p.nombre
      FROM productos p
      JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
      WHERE p.activo = true
        AND p.es_inventariable IS DISTINCT FROM false
        AND s.cantidad > 0
        AND NOT (p.id = ANY(${productosUsados}::int[]))
      ORDER BY random()
      LIMIT ${POR_SEMANA}
    `;
  }

  let i = 0;
  for (let posicion = 1; posicion <= POR_SEMANA; posicion++) {
    if (posicionesUsadas.has(posicion)) continue;
    const p = candidatos[i++];
    if (!p) break;
    await sql`
      INSERT INTO conteos_rutinarios (semana, posicion, producto_id, referencia, nombre)
      VALUES (${semana}, ${posicion}, ${p.id}, ${p.referencia}, ${p.nombre})
      ON CONFLICT (semana, posicion) DO NOTHING
    `;
  }

  return filasDeLaSemana(semana);
}

function aSalida(f) {
  const contado = f.contado_en !== null;
  const diferencia = contado ? Number(f.cantidad_contada) - Number(f.stock_sistema) : null;
  return {
    id: f.id,
    referencia: f.referencia,
    nombre: f.nombre,
    contado,
    // Lo que dice el sistema solo se muestra DESPUÉS de contar: si se
    // mostrara antes, el conteo no serviría de nada (bastaría con copiar
    // el número).
    stock_sistema: contado ? Number(f.stock_sistema) : null,
    cantidad_contada: contado ? Number(f.cantidad_contada) : null,
    diferencia,
    coincide: contado ? diferencia === 0 : null,
    vendedor_nombre: f.vendedor_nombre || null,
    contado_en: f.contado_en,
    observaciones: f.observaciones,
  };
}

// GET: los productos a revisar esta semana (los escoge si todavía no hay).
// GET ?historial=1: además, las últimas 12 semanas, para revisar resultados.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const semana = lunesDeLaSemana();
    const bodegaId = await bodegaPrincipalId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Principal' }, { status: 500 });
    }

    const filas = await asegurarSemana(semana, bodegaId);
    const items = filas.map(aSalida);
    const respuesta = { ok: true, semana, items, pendientes: items.filter((it) => !it.contado).length };

    if (searchParams.get('historial')) {
      const historial = await sql`
        SELECT c.id, c.semana::text AS semana, c.posicion, c.producto_id, c.referencia, c.nombre,
               c.stock_sistema, c.cantidad_contada, c.contado_en, c.observaciones,
               ve.nombre AS vendedor_nombre
        FROM conteos_rutinarios c
        LEFT JOIN vendedores ve ON ve.id = c.vendedor_id
        WHERE c.semana > ${semana}::date - 84
        ORDER BY c.semana DESC, c.posicion ASC
      `;
      respuesta.historial = historial.map((f) => ({ ...aSalida(f), semana: f.semana }));
    }

    return NextResponse.json(respuesta);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST: guarda el conteo físico. body: { items: [{ id, cantidad_contada }],
// vendedor_id, observaciones }. El stock del sistema se toma EN ESTE
// MOMENTO (no cuando se escogió el producto), y se devuelve el resultado
// de la comparación. No se corrige el inventario solo: si no coincide,
// queda registrado para que el administrador lo revise.
export async function POST(request) {
  try {
    const body = await request.json();
    const itemsBody = Array.isArray(body.items) ? body.items : [];
    const vendedorId = body.vendedor_id ? Number(body.vendedor_id) : null;
    const observaciones = String(body.observaciones || '').trim() || null;

    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay nada que guardar' }, { status: 400 });
    }
    for (const it of itemsBody) {
      const cantidad = Number(it.cantidad_contada);
      if (!Number(it.id) || it.cantidad_contada === '' || it.cantidad_contada === null || !Number.isInteger(cantidad) || cantidad < 0) {
        return NextResponse.json({ ok: false, error: 'Escribe cuántas unidades contaste de cada producto (0 si no hay ninguna)' }, { status: 400 });
      }
    }

    const bodegaId = await bodegaPrincipalId();
    const semana = lunesDeLaSemana();
    const resultados = [];

    for (const it of itemsBody) {
      const [fila] = await sql`
        SELECT id, producto_id, contado_en FROM conteos_rutinarios
        WHERE id = ${Number(it.id)} AND semana = ${semana}
      `;
      if (!fila) {
        return NextResponse.json({ ok: false, error: 'Ese chequeo ya no es de esta semana' }, { status: 404 });
      }
      if (fila.contado_en) {
        return NextResponse.json({ ok: false, error: 'Ese producto ya se había contado' }, { status: 409 });
      }
      const [st] = fila.producto_id
        ? await sql`SELECT COALESCE(cantidad, 0) AS cantidad FROM stock WHERE producto_id = ${fila.producto_id} AND bodega_id = ${bodegaId}`
        : [];
      const stockSistema = Number(st?.cantidad) || 0;

      const [actualizada] = await sql`
        UPDATE conteos_rutinarios
        SET stock_sistema = ${stockSistema},
            cantidad_contada = ${Number(it.cantidad_contada)},
            vendedor_id = ${vendedorId},
            observaciones = ${observaciones},
            contado_en = now()
        WHERE id = ${fila.id} AND contado_en IS NULL
        RETURNING id, referencia, nombre, stock_sistema, cantidad_contada, contado_en, observaciones
      `;
      if (actualizada) resultados.push(aSalida(actualizada));
    }

    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
