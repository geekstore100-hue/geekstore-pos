import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { descontarStockSeguro, sumarStock, esErrorDeGuardia } from '../../../../lib/transaccion';

// Un ajuste de inventario ya guardado: verlo (para el documento imprimible
// y para cargarlo en la pantalla de edición) y corregirlo.
//
// Los ajustes que vienen de un traspaso NO se editan aquí: se editan desde
// el traspaso (Traspasos > Editar), porque ahí también hay que devolver o
// sacar mercancía de la otra bodega.

const TIPOS_AJUSTE = ['ajuste_incremento', 'ajuste_disminucion'];

async function leerAjuste(id) {
  const [ajuste] = await sql`
    SELECT a.id, a.bodega_id, a.numeracion, a.observaciones, a.total, a.creado_en, a.traspaso_id,
           b.nombre AS bodega_nombre
    FROM ajustes_inventario a
    LEFT JOIN bodegas b ON b.id = a.bodega_id
    WHERE a.id = ${id}
  `;
  return ajuste || null;
}

export async function GET(request, { params }) {
  try {
    const id = Number((await params).id);
    if (!id) return NextResponse.json({ ok: false, error: 'Ajuste inválido' }, { status: 400 });

    const ajuste = await leerAjuste(id);
    if (!ajuste) return NextResponse.json({ ok: false, error: 'Ajuste no encontrado' }, { status: 404 });

    const items = await sql`
      SELECT m.id, m.producto_id, p.referencia, p.nombre, m.tipo, m.cantidad, m.precio_unitario,
             COALESCE(s.cantidad, 0) AS stock_actual
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN stock s ON s.producto_id = m.producto_id AND s.bodega_id = ${ajuste.bodega_id}
      WHERE m.ajuste_id = ${id} AND m.bodega_id = ${ajuste.bodega_id} AND m.tipo = ANY(${TIPOS_AJUSTE})
      ORDER BY m.id ASC
    `;

    return NextResponse.json({
      ok: true,
      ajuste,
      items: items.map((it) => ({
        ...it,
        objetivo: it.tipo === 'ajuste_disminucion' ? 'disminuir' : 'incrementar',
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario) || 0,
        stock_actual: Number(it.stock_actual) || 0,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Corrige un ajuste ya guardado: cambiar cantidades, cambiar entre
// aumentar/disminuir, agregar o quitar productos y cambiar las
// observaciones. La bodega no se cambia (para eso se hace otro ajuste).
//
// Cómo funciona: para cada producto se compara el efecto que tenía el
// ajuste guardado (por ejemplo -2) con el efecto nuevo (por ejemplo -3), y
// solo se aplica la diferencia al stock (-1). Así el inventario queda como
// si el ajuste siempre hubiera sido el nuevo. Todo va en una sola
// transacción: o se aplica completo o no se cambia nada.
export async function PUT(request, { params }) {
  try {
    const id = Number((await params).id);
    if (!id) return NextResponse.json({ ok: false, error: 'Ajuste inválido' }, { status: 400 });

    const body = await request.json();
    const observaciones = body.observaciones ? String(body.observaciones) : null;
    const itemsBody = Array.isArray(body.items) ? body.items : [];
    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'El ajuste debe tener al menos un producto' }, { status: 400 });
    }

    const ajuste = await leerAjuste(id);
    if (!ajuste) return NextResponse.json({ ok: false, error: 'Ajuste no encontrado' }, { status: 404 });
    if (ajuste.traspaso_id) {
      return NextResponse.json(
        { ok: false, error: 'Este ajuste viene de un traspaso: corrígelo desde el traspaso (botón Editar del traspaso).' },
        { status: 409 }
      );
    }
    const bodegaId = ajuste.bodega_id;

    // Líneas nuevas, agrupadas por producto + aumentar/disminuir.
    const nuevas = new Map(); // "productoId|objetivo" -> { producto_id, objetivo, cantidad }
    for (const it of itemsBody) {
      const productoId = Number(it.producto_id);
      const cantidad = Number(it.cantidad);
      const objetivo = it.objetivo === 'disminuir' ? 'disminuir' : it.objetivo === 'incrementar' ? 'incrementar' : null;
      if (!productoId || !objetivo || !Number.isFinite(cantidad) || cantidad <= 0) {
        return NextResponse.json({ ok: false, error: 'Hay un producto con una cantidad inválida' }, { status: 400 });
      }
      const clave = `${productoId}|${objetivo}`;
      const previa = nuevas.get(clave);
      nuevas.set(clave, { producto_id: productoId, objetivo, cantidad: (previa?.cantidad || 0) + cantidad });
    }

    // Lo que está guardado hoy.
    const actuales = await sql`
      SELECT id, producto_id, tipo, cantidad, precio_unitario
      FROM movimientos_stock
      WHERE ajuste_id = ${id} AND bodega_id = ${bodegaId} AND tipo = ANY(${TIPOS_AJUSTE})
      ORDER BY id ASC
    `;
    // "Huella" de lo guardado: si otra persona edita este mismo ajuste al
    // mismo tiempo (o se da doble clic), la segunda edición se cancela en
    // vez de aplicar la diferencia dos veces.
    const huella = actuales.map((m) => m.id).join(',');

    const costoGuardado = new Map(); // "productoId|objetivo" -> costo con que se guardó
    const efectoAnterior = new Map(); // productoId -> efecto neto en el stock
    for (const m of actuales) {
      const productoId = Number(m.producto_id);
      const objetivo = m.tipo === 'ajuste_disminucion' ? 'disminuir' : 'incrementar';
      const clave = `${productoId}|${objetivo}`;
      if (!costoGuardado.has(clave)) costoGuardado.set(clave, Number(m.precio_unitario) || 0);
      const signo = objetivo === 'disminuir' ? -1 : 1;
      efectoAnterior.set(productoId, (efectoAnterior.get(productoId) || 0) + signo * Number(m.cantidad));
    }

    const efectoNuevo = new Map();
    for (const l of nuevas.values()) {
      const signo = l.objetivo === 'disminuir' ? -1 : 1;
      efectoNuevo.set(l.producto_id, (efectoNuevo.get(l.producto_id) || 0) + signo * l.cantidad);
    }

    const idsProductos = [...new Set([...efectoAnterior.keys(), ...efectoNuevo.keys()])];
    const infoProductos = await sql`
      SELECT p.id, p.nombre, COALESCE(p.precio_costo, 0) AS precio_costo, COALESCE(s.cantidad, 0) AS stock
      FROM productos p
      LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
      WHERE p.id = ANY(${idsProductos})
    `;
    const infoPorId = new Map(infoProductos.map((p) => [Number(p.id), p]));
    for (const productoId of efectoNuevo.keys()) {
      if (!infoPorId.has(productoId)) {
        return NextResponse.json({ ok: false, error: 'Uno de los productos ya no existe' }, { status: 400 });
      }
    }

    // Validar: la diferencia que hay que restar tiene que alcanzar en la bodega.
    const diferencias = [];
    for (const productoId of idsProductos) {
      const diferencia = (efectoNuevo.get(productoId) || 0) - (efectoAnterior.get(productoId) || 0);
      if (diferencia === 0) continue;
      const info = infoPorId.get(productoId);
      const stock = Number(info?.stock) || 0;
      if (diferencia < 0 && stock < -diferencia) {
        return NextResponse.json(
          {
            ok: false,
            error: `No alcanza el stock de "${info?.nombre || `producto #${productoId}`}" en ${ajuste.bodega_nombre || 'la bodega'} para ese cambio (hay ${stock} y habría que quitar ${-diferencia}). Puede que parte ya se haya vendido o movido.`,
          },
          { status: 409 }
        );
      }
      diferencias.push({ productoId, diferencia });
    }

    // Líneas finales con su costo: las que ya existían conservan el costo con
    // que se guardaron; las nuevas toman el costo actual del producto.
    const lineasFinales = [...nuevas.values()].map((l) => {
      const clave = `${l.producto_id}|${l.objetivo}`;
      const costo = costoGuardado.has(clave) ? costoGuardado.get(clave) : Number(infoPorId.get(l.producto_id)?.precio_costo) || 0;
      return { ...l, costo };
    });
    const total = lineasFinales.reduce((acc, l) => acc + (l.objetivo === 'disminuir' ? -1 : 1) * l.costo * l.cantidad, 0);

    const consultas = [
      // 1) Bloquea el ajuste mientras se edita.
      sql`SELECT id FROM ajustes_inventario WHERE id = ${id} FOR UPDATE`,
      // 2) Verifica que nadie lo haya cambiado desde que se leyó.
      sql`
        SELECT 1 / (CASE WHEN COALESCE((
          SELECT string_agg(id::text, ',' ORDER BY id) FROM movimientos_stock
          WHERE ajuste_id = ${id} AND bodega_id = ${bodegaId} AND tipo = ANY(${TIPOS_AJUSTE})
        ), '') = ${huella} THEN 1 ELSE 0 END) AS ok
      `,
    ];
    for (const d of diferencias) {
      consultas.push(
        d.diferencia > 0
          ? sumarStock(d.productoId, bodegaId, d.diferencia)
          : descontarStockSeguro(d.productoId, bodegaId, -d.diferencia)
      );
    }
    consultas.push(sql`
      DELETE FROM movimientos_stock
      WHERE ajuste_id = ${id} AND bodega_id = ${bodegaId} AND tipo = ANY(${TIPOS_AJUSTE})
    `);
    for (const l of lineasFinales) {
      // Se conserva la fecha original del ajuste en los movimientos.
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, ajuste_id, traspaso_id, stock_antes, creado_en)
        VALUES (
          ${l.producto_id}, ${bodegaId}, ${l.objetivo === 'disminuir' ? 'ajuste_disminucion' : 'ajuste_incremento'},
          ${l.cantidad}, ${l.costo}, ${id}, NULL, NULL,
          (SELECT creado_en FROM ajustes_inventario WHERE id = ${id})
        )
      `);
    }
    consultas.push(sql`
      UPDATE ajustes_inventario SET total = ${total}, observaciones = ${observaciones} WHERE id = ${id}
    `);

    try {
      await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'El ajuste o el stock cambiaron mientras se guardaba (otra operación o un doble clic). No se cambió nada — recarga y vuelve a intentar.',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, ajusteId: id, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
