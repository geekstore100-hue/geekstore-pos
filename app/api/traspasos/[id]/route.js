import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { descontarStockSeguro, sumarStock, esErrorDeGuardia } from '../../../../lib/transaccion';

// Detalle de un traspaso (documento) para el documento imprimible: cabecera
// con las bodegas y el valor total, y las líneas de productos que llegaron a
// la bodega destino (con lo que ya había antes, para poder verificar).
export async function GET(request, { params }) {
  try {
    const id = Number((await params).id);
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
    const items = await sql`
      SELECT
        me.producto_id,
        p.referencia,
        p.nombre,
        me.cantidad,
        me.precio_unitario,
        me.stock_antes
      FROM movimientos_stock me
      JOIN productos p ON p.id = me.producto_id
      WHERE me.traspaso_id = ${id}
        AND me.bodega_id = ${traspaso.bodega_destino_id}
        AND me.tipo IN ('traspaso_entrada', 'ajuste_incremento')
      ORDER BY p.nombre ASC
    `;

    // "Queda disponible" en el documento impreso antes se calculaba restando
    // la cantidad de este traspaso a un "stock_antes" que quedaba grabado en
    // el movimiento de salida DESDE EL MOMENTO en que ese producto se agregó
    // por primera vez al traspaso — y ese valor nunca se actualizaba después,
    // ni cuando se editaba la cantidad (PUT /api/traspasos/[id]) ni si
    // mientras tanto pasó cualquier otro movimiento de esa bodega (otra
    // venta, otro traspaso, otra entrada). Por eso Nelson veía en la pantalla
    // de editar un "disponible" correcto y calculado al momento, pero al
    // imprimir salía un número viejo que ya no correspondía a la realidad.
    // La forma correcta y a prueba de ediciones es simplemente consultar el
    // stock ACTUAL de la bodega de origen para esos productos — ya que para
    // cuando se imprime, la base de datos ya quedó actualizada con el
    // resultado final del traspaso (con todas sus ediciones incluidas).
    const idsInvolucrados = [...new Set(items.map((it) => it.producto_id))];
    const stockActualOrigen = idsInvolucrados.length
      ? await sql`
          SELECT producto_id, cantidad
          FROM stock
          WHERE bodega_id = ${traspaso.bodega_origen_id} AND producto_id = ANY(${idsInvolucrados})
        `
      : [];
    const stockOrigenPorProducto = new Map(stockActualOrigen.map((f) => [f.producto_id, Number(f.cantidad)]));
    const itemsConStockOrigen = items.map((it) => ({
      ...it,
      stock_actual_origen: stockOrigenPorProducto.get(it.producto_id) ?? 0,
    }));

    return NextResponse.json({ ok: true, traspaso, items: itemsConStockOrigen });
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
    const id = Number((await params).id);
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

    // Fase de aplicación: ya validado todo, se ejecutan los cambios — en UNA
    // sola transacción (ver lib/transaccion.js): o se aplican todos, o
    // ninguno. Antes eran pasos sueltos y, si algo fallaba a mitad, el
    // traspaso podía quedar editado a medias (stock movido en una bodega y
    // no en la otra). Las restas usan descontarStockSeguro: si en el último
    // segundo otra operación se llevó unidades, se cancela todo en vez de
    // dejar el stock negativo.
    const consultas = [];
    for (const accion of acciones) {
      if (accion.tipo === 'delta') {
        if (accion.delta > 0) {
          consultas.push(descontarStockSeguro(accion.producto_id, traspaso.bodega_origen_id, accion.delta));
          consultas.push(sumarStock(accion.producto_id, traspaso.bodega_destino_id, accion.delta));
        } else {
          const devolver = Math.abs(accion.delta);
          consultas.push(descontarStockSeguro(accion.producto_id, traspaso.bodega_destino_id, devolver));
          consultas.push(sumarStock(accion.producto_id, traspaso.bodega_origen_id, devolver));
        }
        consultas.push(sql`UPDATE movimientos_stock SET cantidad = ${accion.nuevaCantidad} WHERE id = ${accion.entrada_id}`);
        if (accion.salida_id) {
          consultas.push(sql`UPDATE movimientos_stock SET cantidad = ${accion.nuevaCantidad} WHERE id = ${accion.salida_id}`);
        }
      } else if (accion.tipo === 'agregar') {
        const stockAntesOrigen = stockOrigenPorProducto.get(accion.producto_id) || 0;
        const stockAntesDestino = stockDestinoPorProducto.get(accion.producto_id) || 0;

        consultas.push(descontarStockSeguro(accion.producto_id, traspaso.bodega_origen_id, accion.cantidad));
        consultas.push(sumarStock(accion.producto_id, traspaso.bodega_destino_id, accion.cantidad));
        consultas.push(sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, traspaso_id, stock_antes)
          VALUES (${accion.producto_id}, ${traspaso.bodega_origen_id}, 'traspaso_salida', ${accion.cantidad}, ${accion.costo}, ${id}, ${stockAntesOrigen})
        `);
        consultas.push(sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, ajuste_id, traspaso_id, stock_antes)
          VALUES (${accion.producto_id}, ${traspaso.bodega_destino_id}, 'ajuste_incremento', ${accion.cantidad}, ${accion.costo}, ${ajuste?.id || null}, ${id}, ${stockAntesDestino})
        `);
      } else if (accion.tipo === 'quitar') {
        consultas.push(descontarStockSeguro(accion.producto_id, traspaso.bodega_destino_id, accion.cantidad));
        consultas.push(sumarStock(accion.producto_id, traspaso.bodega_origen_id, accion.cantidad));
        consultas.push(sql`DELETE FROM movimientos_stock WHERE id = ${accion.entrada_id}`);
        if (accion.salida_id) {
          consultas.push(sql`DELETE FROM movimientos_stock WHERE id = ${accion.salida_id}`);
        }
      }
    }

    // Recalcular el valor total (dentro de la misma transacción, después de
    // todos los cambios): para las líneas que ya existían se usa el precio
    // que ya tenían guardado (el costo del momento en que se hizo el
    // traspaso), y para las nuevas el costo actual del producto.
    consultas.push(sql`
      UPDATE traspasos_inventario
      SET valor_total = (
            SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM movimientos_stock
            WHERE traspaso_id = ${id} AND bodega_id = ${traspaso.bodega_destino_id}
              AND tipo IN ('traspaso_entrada', 'ajuste_incremento')
          ),
          observaciones = ${observaciones}
      WHERE id = ${id}
      RETURNING valor_total
    `);
    const indiceTotal = consultas.length - 1;
    if (ajuste) {
      consultas.push(sql`
        UPDATE ajustes_inventario
        SET total = (SELECT valor_total FROM traspasos_inventario WHERE id = ${id}),
            observaciones = ${observaciones}
        WHERE id = ${ajuste.id}
      `);
    }

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          { ok: false, error: 'El stock cambió mientras se guardaba (otra operación movió unidades de uno de los productos). No se cambió nada — revisa y vuelve a intentar.' },
          { status: 409 }
        );
      }
      throw error;
    }
    const nuevoTotal = Number(resultados[indiceTotal][0]?.valor_total) || 0;

    return NextResponse.json({ ok: true, traspasoId: id, total: nuevoTotal });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
