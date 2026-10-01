import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { sumarStock, restarStock, esErrorDeGuardia } from '../../../../lib/transaccion';

async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}
async function bodegaGarantiasId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Garantías con Proveedor'`;
  return b?.id;
}

const RESOLUCIONES_VALIDAS = [
  'nota_credito',
  'producto_nuevo',
  'producto_reparado',
  'no_aplica_devuelto',
  'no_aplica_baja',
];

// Detalle de un caso: cabecera con el proveedor y las líneas de productos,
// cada una con su resolución si ya se resolvió.
export async function GET(request, { params }) {
  try {
    const id = Number((await params).id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const [garantia] = await sql`
      SELECT
        g.id, g.motivo, g.observaciones, g.estado, g.total_costo, g.enviado_en, g.resuelto_en, g.creado_en,
        g.proveedor_id, p.nombre AS proveedor_nombre, p.telefono AS proveedor_telefono
      FROM garantias_proveedor g
      LEFT JOIN proveedores p ON p.id = g.proveedor_id
      WHERE g.id = ${id}
    `;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
    }

    const items = await sql`
      SELECT id, producto_id, referencia, nombre, cantidad, precio_costo, motivo,
             resolucion, monto_nota_credito, nota_resolucion, resuelto_en
      FROM garantia_proveedor_items
      WHERE garantia_id = ${id}
      ORDER BY id ASC
    `;

    return NextResponse.json({ ok: true, id, garantia, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Resuelve una o varias líneas del caso (cada producto puede resolverse
// distinto). Según la resolución elegida, mueve el stock desde la bodega de
// garantías: de vuelta a Principal (producto nuevo, reparado, o "no aplica"
// pero se devuelve tal cual) o dado de baja definitivamente (nota crédito, o
// "no aplica" pero se pierde). Cuando ya no queda ninguna línea pendiente,
// el caso completo queda marcado como resuelto.
export async function PATCH(request, { params }) {
  try {
    const id = Number((await params).id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const body = await request.json();
    const resolucionesBody = Array.isArray(body.items) ? body.items : [];
    if (resolucionesBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'No se indicó ninguna línea para resolver' }, { status: 400 });
    }

    const [garantia] = await sql`SELECT id, estado FROM garantias_proveedor WHERE id = ${id}`;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
    }
    if (garantia.estado === 'por_entregar') {
      return NextResponse.json(
        { ok: false, error: 'Primero marca esta garantía como entregada al proveedor' },
        { status: 409 }
      );
    }

    const bodegaPrincipal = await bodegaPrincipalId();
    const bodegaGarantias = await bodegaGarantiasId();
    if (!bodegaPrincipal || !bodegaGarantias) {
      return NextResponse.json({ ok: false, error: 'Faltan las bodegas necesarias' }, { status: 500 });
    }

    // Fase de validación: revisar todas las líneas antes de mover nada.
    for (const r of resolucionesBody) {
      const itemId = Number(r.id);
      if (!itemId || !RESOLUCIONES_VALIDAS.includes(r.resolucion)) {
        return NextResponse.json({ ok: false, error: 'Hay una resolución inválida' }, { status: 400 });
      }
      if (r.resolucion === 'nota_credito' && !(Number(r.monto_nota_credito) > 0)) {
        return NextResponse.json({ ok: false, error: 'Ingresa el valor de la nota crédito' }, { status: 400 });
      }
    }

    // Se traen todas las líneas a resolver de una sola vez (antes, una
    // consulta por línea) y se validan antes de tocar nada.
    const idsItems = resolucionesBody.map((r) => Number(r.id));
    const filasItems = await sql`
      SELECT id, garantia_id, producto_id, cantidad, precio_costo, resolucion
      FROM garantia_proveedor_items WHERE id = ANY(${idsItems}::int[]) AND garantia_id = ${id}
    `;
    const itemPorId = new Map(filasItems.map((f) => [Number(f.id), f]));
    for (const itemId of idsItems) {
      const item = itemPorId.get(itemId);
      if (!item) {
        return NextResponse.json({ ok: false, error: `Una de las líneas ya no existe (#${itemId})` }, { status: 404 });
      }
      if (item.resolucion) {
        return NextResponse.json({ ok: false, error: 'Una de las líneas ya estaba resuelta' }, { status: 409 });
      }
      if (!item.producto_id) {
        return NextResponse.json(
          { ok: false, error: 'El producto de una de las líneas ya no existe en el catálogo; no se puede mover el stock' },
          { status: 409 }
        );
      }
    }

    // Todo en una sola transacción (ver lib/transaccion.js): o se resuelven
    // todas las líneas (con sus movimientos de stock), o ninguna. Antes, si
    // algo fallaba a mitad, podían quedar líneas resueltas sin su movimiento
    // de stock, o al revés.
    // El primer paso de cada línea la marca como resuelta SOLO si todavía no
    // lo estaba. Si ya lo estaba (por ejemplo, se le dio "Guardar" dos veces
    // seguidas), no toca ninguna fila y se cancela TODO — así el stock nunca
    // se mueve dos veces por la misma línea.
    const consultas = [];
    for (const r of resolucionesBody) {
      const itemId = Number(r.id);
      const item = itemPorId.get(itemId);

      const cantidad = Number(item.cantidad);
      const costo = Number(item.precio_costo) || 0;
      const resolucion = r.resolucion;
      const notaResolucion = r.nota_resolucion || null;
      const montoNotaCredito = resolucion === 'nota_credito' ? Number(r.monto_nota_credito) : null;

      const devuelveAPrincipal =
        resolucion === 'producto_nuevo' || resolucion === 'producto_reparado' || resolucion === 'no_aplica_devuelto';

      consultas.push(sql`
        WITH marcada AS (
          UPDATE garantia_proveedor_items
          SET resolucion = ${resolucion}, monto_nota_credito = ${montoNotaCredito}, nota_resolucion = ${notaResolucion}, resuelto_en = now()
          WHERE id = ${itemId} AND resolucion IS NULL
          RETURNING 1
        )
        SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM marcada) c
      `);

      // Sale de la bodega de Garantías (sin exigir que alcance: es mercancía
      // que ya se registró ahí; bloquear la resolución sería peor).
      consultas.push(restarStock(item.producto_id, bodegaGarantias, cantidad));
      const tipoSalida =
        resolucion === 'nota_credito'
          ? 'garantia_baja_credito'
          : resolucion === 'no_aplica_baja'
          ? 'garantia_baja_no_aplica'
          : 'garantia_salida_resuelta';
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
        VALUES (${item.producto_id}, ${bodegaGarantias}, ${tipoSalida}, ${cantidad}, ${costo}, ${id})
      `);

      if (devuelveAPrincipal) {
        consultas.push(sumarStock(item.producto_id, bodegaPrincipal, cantidad));
        const tipoEntrada =
          resolucion === 'producto_nuevo'
            ? 'garantia_entrada_nuevo'
            : resolucion === 'producto_reparado'
            ? 'garantia_entrada_reparado'
            : 'garantia_entrada_no_aplica';
        consultas.push(sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
          VALUES (${item.producto_id}, ${bodegaPrincipal}, ${tipoEntrada}, ${cantidad}, ${costo}, ${id})
        `);
      }
    }

    // Si ya no queda ninguna línea pendiente, la garantía completa queda
    // resuelta (dentro de la misma transacción).
    consultas.push(sql`
      UPDATE garantias_proveedor SET estado = 'resuelta', resuelto_en = now()
      WHERE id = ${id}
        AND NOT EXISTS (SELECT 1 FROM garantia_proveedor_items WHERE garantia_id = ${id} AND resolucion IS NULL)
    `);

    try {
      await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          { ok: false, error: 'Una de las líneas ya estaba resuelta (¿se guardó dos veces?). No se cambió nada — recarga la página.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Elimina un caso creado por error, antes de que se haya resuelto. No se
// borra de la base de datos (para no perder el rastro de qué pasó con ese
// stock): se devuelve el stock separado a la bodega Principal, con sus
// propios movimientos de auditoría, y el caso queda marcado como
// "eliminada" — por eso desaparece de la lista aunque técnicamente el
// registro sigue existiendo. Una vez resuelta (nota crédito, reemplazo,
// etc.) ya no se puede eliminar: hay que dejar ese historial tal cual.
export async function DELETE(request, { params }) {
  try {
    const id = Number((await params).id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const [garantia] = await sql`SELECT id, estado FROM garantias_proveedor WHERE id = ${id}`;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
    }
    if (garantia.estado === 'resuelta') {
      return NextResponse.json(
        { ok: false, error: 'Esta garantía ya está resuelta y no se puede eliminar' },
        { status: 409 }
      );
    }
    if (garantia.estado === 'eliminada') {
      return NextResponse.json({ ok: false, error: 'Esta garantía ya estaba eliminada' }, { status: 409 });
    }

    const bodegaPrincipal = await bodegaPrincipalId();
    const bodegaGarantias = await bodegaGarantiasId();
    if (!bodegaPrincipal || !bodegaGarantias) {
      return NextResponse.json({ ok: false, error: 'Faltan las bodegas necesarias' }, { status: 500 });
    }

    const items = await sql`
      SELECT producto_id, cantidad, precio_costo FROM garantia_proveedor_items WHERE garantia_id = ${id}
    `;

    // Todo en una sola transacción (ver lib/transaccion.js): o se devuelve
    // TODO a Principal y la garantía queda eliminada, o no pasa nada.
    // El primer paso marca la garantía como eliminada SOLO si todavía se
    // puede (no estaba resuelta ni eliminada). Si se le dio "Eliminar" dos
    // veces seguidas, el segundo intento no toca ninguna fila y se cancela
    // todo — así la mercancía nunca se devuelve dos veces a Principal.
    // (Si el producto de una línea ya no existe en el catálogo no hay a dónde
    // devolver el stock; esa línea se deja como está, igual que antes.)
    const consultas = [
      sql`
        WITH marcada AS (
          UPDATE garantias_proveedor SET estado = 'eliminada'
          WHERE id = ${id} AND estado NOT IN ('resuelta', 'eliminada')
          RETURNING 1
        )
        SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM marcada) c
      `,
    ];
    for (const it of items) {
      if (!it.producto_id) continue;
      consultas.push(restarStock(it.producto_id, bodegaGarantias, it.cantidad));
      consultas.push(sumarStock(it.producto_id, bodegaPrincipal, it.cantidad));
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
        VALUES (${it.producto_id}, ${bodegaGarantias}, 'garantia_eliminada', ${it.cantidad}, ${it.precio_costo}, ${id})
      `);
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
        VALUES (${it.producto_id}, ${bodegaPrincipal}, 'garantia_eliminada_entrada', ${it.cantidad}, ${it.precio_costo}, ${id})
      `);
    }

    try {
      await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json({ ok: false, error: 'Esta garantía ya estaba eliminada o resuelta' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
