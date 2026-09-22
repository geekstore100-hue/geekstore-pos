import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Detalle de un traspaso (documento) para el documento imprimible: cabecera
// con las bodegas y el valor total, y las líneas de productos que llegaron a
// la bodega destino (con lo que ya había antes, para poder verificar).
export async function GET(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Traspaso inválido' }, { status: 400 });
    }

    const [traspaso] = await sql`
      SELECT
        t.id,
        t.creado_en,
        t.observaciones,
        t.valor_total,
        t.estado_pago,
        t.pagado_en,
        t.bodega_origen_id,
        t.bodega_destino_id,
        bo.nombre AS bodega_origen_nombre,
        bd.nombre AS bodega_destino_nombre
      FROM traspasos_inventario t
      JOIN bodegas bo ON bo.id = t.bodega_origen_id
      JOIN bodegas bd ON bd.id = t.bodega_destino_id
      WHERE t.id = ${id}
    `;
    if (!traspaso) {
      return NextResponse.json({ ok: false, error: 'Traspaso no encontrado' }, { status: 404 });
    }

    // Las líneas que llegaron a la bodega destino pueden venir de dos formas:
    // 'traspaso_entrada' (traspaso creado directamente) o 'ajuste_incremento'
    // (traspaso confirmado a través de la pantalla de Ajustes de Inventario).
    // Filtrar por la bodega destino en vez del tipo cubre ambos casos.
    // También se trae, del movimiento de salida en la bodega de ORIGEN (mismo
    // traspaso, mismo producto), cuánto había ahí antes de sacar la
    // mercancía, para poder mostrar en el documento cuánto queda disponible
    // en la bodega de origen después de este traspaso.
    const items = await sql`
      SELECT
        me.producto_id,
        p.referencia,
        p.nombre,
        me.cantidad,
        me.precio_unitario,
        me.stock_antes,
        mo.stock_antes AS stock_antes_origen
      FROM movimientos_stock me
      JOIN productos p ON p.id = me.producto_id
      LEFT JOIN movimientos_stock mo
        ON mo.traspaso_id = me.traspaso_id
        AND mo.producto_id = me.producto_id
        AND mo.bodega_id = ${traspaso.bodega_origen_id}
        AND mo.tipo = 'traspaso_salida'
      WHERE me.traspaso_id = ${id}
        AND me.bodega_id = ${traspaso.bodega_destino_id}
        AND me.tipo IN ('traspaso_entrada', 'ajuste_incremento')
      ORDER BY p.nombre ASC
    `;

    return NextResponse.json({ ok: true, traspaso, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Corrige las cantidades de un traspaso que ya se guardó: agrega o quita
// productos, o cambia cuánto llegó de cada uno, y recalcula el stock de las
// dos bodegas para que quede como si siempre hubiera sido así. No se puede
// editar la bodega de origen/destino (para eso hay que hacer un traspaso
// nuevo), ni un traspaso que ya se marcó como pagado.
export async function PUT(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Traspaso inválido' }, { status: 400 });
    }

    const body = await request.json();
    const observaciones = body.observaciones ?? null;
    const itemsBody = Array.isArray(body.items) ? body.items : [];
    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'El traspaso debe tener al menos un producto' }, { status: 400 });
    }

    const [traspaso] = await sql`
      SELECT id, bodega_origen_id, bodega_destino_id, estado_pago
      FROM traspasos_inventario WHERE id = ${id}
    `;
    if (!traspaso) {
      return NextResponse.json({ ok: false, error: 'Traspaso no encontrado' }, { status: 404 });
    }
    if (traspaso.estado_pago === 'pagado') {
      return NextResponse.json({ ok: false, error: 'Este traspaso ya se marcó como pagado y no se puede editar' }, { status: 409 });
    }

    const [ajuste] = await sql`SELECT id FROM ajustes_inventario WHERE traspaso_id = ${id}`;

    // Cantidades nuevas, agrupadas por producto por si se repite alguno.
    const nuevasPorProducto = new Map();
    for (const it of itemsBody) {
      const productoId = Number(it.producto_id);
      const cantidad = Number(it.cantidad);
      if (!productoId || !cantidad || cantidad <= 0) {
        return NextResponse.json({ ok: false, error: 'Hay un producto con una cantidad inválida' }, { status: 400 });
      }
      nuevasPorProducto.set(productoId, (nuevasPorProducto.get(productoId) || 0) + cantidad);
    }

    // Líneas actuales del traspaso (lo que ya está guardado), con el id de
    // sus dos movimientos (salida en origen, entrada en destino) para poder
    // corregirlos o borrarlos.
    const lineasActuales = await sql`
      SELECT
        me_entrada.producto_id,
        me_entrada.id AS entrada_id,
        me_entrada.cantidad AS cantidad_actual,
        me_entrada.precio_unitario,
        me_salida.id AS salida_id
      FROM movimientos_stock me_entrada
      LEFT JOIN movimientos_stock me_salida
        ON me_salida.traspaso_id = me_entrada.traspaso_id
        AND me_salida.producto_id = me_entrada.producto_id
        AND me_salida.tipo = 'traspaso_salida'
      WHERE me_entrada.traspaso_id = ${id}
        AND me_entrada.bodega_id = ${traspaso.bodega_destino_id}
        AND me_entrada.tipo IN ('traspaso_entrada', 'ajuste_incremento')
    `;
    const actualesPorProducto = new Map(lineasActuales.map((l) => [Number(l.producto_id), l]));

    const productoIdsInvolucrados = new Set([...nuevasPorProducto.keys(), ...actualesPorProducto.keys()]);

    // Traer costo actual y stock actual en ambas bodegas de todos los
    // productos que entran en juego, para poder validar antes de tocar nada.
    const idsArray = [...productoIdsInvolucrados];
    const productosInfo = await sql`
      SELECT id, nombre, precio_costo FROM productos WHERE id = ANY(${idsArray})
    `;
    const productoPorId = new Map(productosInfo.map((p) => [p.id, p]));

    const stockOrigenFilas = await sql`
      SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE bodega_id = ${traspaso.bodega_origen_id} AND producto_id = ANY(${idsArray})
    `;
    const stockOrigenPorProducto = new Map(stockOrigenFilas.map((f) => [f.producto_id, Number(f.cantidad)]));

    const stockDestinoFilas = await sql`
      SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE bodega_id = ${traspaso.bodega_destino_id} AND producto_id = ANY(${idsArray})
    `;
    const stockDestinoPorProducto = new Map(stockDestinoFilas.map((f) => [f.producto_id, Number(f.cantidad)]));

    // Fase de validación: calcular qué le pasa a cada producto sin tocar la
    // base de datos todavía, y rechazar todo el cambio si algo no cuadra.
    const acciones = []; // { producto_id, tipo: 'delta'|'agregar'|'quitar', ... }
    for (const productoId of productoIdsInvolucrados) {
      const actual = actualesPorProducto.get(productoId);
      const nuevaCantidad = nuevasPorProducto.get(productoId) || 0;
      const disponibleOrigen = stockOrigenPorProducto.get(productoId) || 0;
      const disponibleDestino = stockDestinoPorProducto.get(productoId) || 0;
      const nombreProducto = productoPorId.get(productoId)?.nombre || `producto #${productoId}`;

      if (actual && nuevaCantidad > 0) {
        const delta = nuevaCantidad - Number(actual.cantidad_actual);
        if (delta > 0 && disponibleOrigen < delta) {
          return NextResponse.json(
            { ok: false, error: `Stock insuficiente en la bodega de origen para aumentar "${nombreProducto}" (disponible: ${disponibleOrigen})` },
            { status: 409 }
          );
        }
        if (delta < 0 && disponibleDestino < Math.abs(delta)) {
          return NextResponse.json(
            { ok: false, error: `No se puede bajar la cantidad de "${nombreProducto}": ya no hay suficiente en la bodega destino (puede que parte ya se haya vendido o movido)` },
            { status: 409 }
          );
        }
        if (delta !== 0) acciones.push({ producto_id: productoId, tipo: 'delta', delta, entrada_id: actual.entrada_id, salida_id: actual.salida_id, nuevaCantidad });
      } else if (!actual && nuevaCantidad > 0) {
        if (disponibleOrigen < nuevaCantidad) {
          return NextResponse.json(
            { ok: false, error: `Stock insuficiente en la bodega de origen para agregar "${nombreProducto}" (disponible: ${disponibleOrigen})` },
            { status: 409 }
          );
        }
        acciones.push({ producto_id: productoId, tipo: 'agregar', cantidad: nuevaCantidad, costo: Number(productoPorId.get(productoId)?.precio_costo) || 0 });
      } else if (actual && nuevaCantidad === 0) {
        if (disponibleDestino < Number(actual.cantidad_actual)) {
          return NextResponse.json(
            { ok: false, error: `No se puede quitar "${nombreProducto}": ya no hay suficiente en la bodega destino (puede que parte ya se haya vendido o movido)` },
            { status: 409 }
          );
        }
        acciones.push({ producto_id: productoId, tipo: 'quitar', cantidad: Number(actual.cantidad_actual), entrada_id: actual.entrada_id, salida_id: actual.salida_id });
      }
    }

    // Fase de aplicación: ya validado todo, se ejecutan los cambios.
    for (const accion of acciones) {
      if (accion.tipo === 'delta') {
        await sql`UPDATE stock SET cantidad = cantidad - ${accion.delta} WHERE producto_id = ${accion.producto_id} AND bodega_id = ${traspaso.bodega_origen_id}`;
        await sql`UPDATE stock SET cantidad = cantidad + ${accion.delta} WHERE producto_id = ${accion.producto_id} AND bodega_id = ${traspaso.bodega_destino_id}`;
        await sql`UPDATE movimientos_stock SET cantidad = ${accion.nuevaCantidad} WHERE id = ${accion.entrada_id}`;
        if (accion.salida_id) {
          await sql`UPDATE movimientos_stock SET cantidad = ${accion.nuevaCantidad} WHERE id = ${accion.salida_id}`;
        }
      } else if (accion.tipo === 'agregar') {
        const stockAntesOrigen = stockOrigenPorProducto.get(accion.producto_id) || 0;
        const stockAntesDestino = stockDestinoPorProducto.get(accion.producto_id) || 0;

        await sql`UPDATE stock SET cantidad = cantidad - ${accion.cantidad} WHERE producto_id = ${accion.producto_id} AND bodega_id = ${traspaso.bodega_origen_id}`;
        await sql`
          INSERT INTO stock (producto_id, bodega_id, cantidad) VALUES (${accion.producto_id}, ${traspaso.bodega_destino_id}, ${accion.cantidad})
          ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
        `;
        await sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, traspaso_id, stock_antes)
          VALUES (${accion.producto_id}, ${traspaso.bodega_origen_id}, 'traspaso_salida', ${accion.cantidad}, ${accion.costo}, ${id}, ${stockAntesOrigen})
        `;
        await sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, ajuste_id, traspaso_id, stock_antes)
          VALUES (${accion.producto_id}, ${traspaso.bodega_destino_id}, 'ajuste_incremento', ${accion.cantidad}, ${accion.costo}, ${ajuste?.id || null}, ${id}, ${stockAntesDestino})
        `;
      } else if (accion.tipo === 'quitar') {
        await sql`UPDATE stock SET cantidad = cantidad + ${accion.cantidad} WHERE producto_id = ${accion.producto_id} AND bodega_id = ${traspaso.bodega_origen_id}`;
        await sql`UPDATE stock SET cantidad = cantidad - ${accion.cantidad} WHERE producto_id = ${accion.producto_id} AND bodega_id = ${traspaso.bodega_destino_id}`;
        await sql`DELETE FROM movimientos_stock WHERE id = ${accion.entrada_id}`;
        if (accion.salida_id) {
          await sql`DELETE FROM movimientos_stock WHERE id = ${accion.salida_id}`;
        }
      }
    }

    // Recalcular el valor total: para las líneas que ya existían se usa el
    // precio que ya tenían guardado (el costo del momento en que se hizo el
    // traspaso), y para las nuevas el costo actual del producto.
    const lineasFinal = await sql`
      SELECT cantidad, precio_unitario
      FROM movimientos_stock
      WHERE traspaso_id = ${id} AND bodega_id = ${traspaso.bodega_destino_id}
        AND tipo IN ('traspaso_entrada', 'ajuste_incremento')
    `;
    const nuevoTotal = lineasFinal.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.precio_unitario), 0);

    await sql`UPDATE traspasos_inventario SET valor_total = ${nuevoTotal}, observaciones = ${observaciones} WHERE id = ${id}`;
    if (ajuste) {
      await sql`UPDATE ajustes_inventario SET total = ${nuevoTotal}, observaciones = ${observaciones} WHERE id = ${ajuste.id}`;
    }

    return NextResponse.json({ ok: true, traspasoId: id, total: nuevoTotal });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
