import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

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
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const [garantia] = await sql`
      SELECT
        g.id, g.motivo, g.observaciones, g.estado, g.total_costo, g.enviado_en, g.resuelto_en,
        g.proveedor_id, p.nombre AS proveedor_nombre, p.telefono AS proveedor_telefono
      FROM garantias_proveedor g
      JOIN proveedores p ON p.id = g.proveedor_id
      WHERE g.id = ${id}
    `;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
    }

    const items = await sql`
      SELECT id, producto_id, referencia, nombre, cantidad, precio_costo,
             resolucion, monto_nota_credito, nota_resolucion, resuelto_en
      FROM garantia_proveedor_items
      WHERE garantia_id = ${id}
      ORDER BY id ASC
    `;

    return NextResponse.json({ ok: true, garantia, items });
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
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Garantía inválida' }, { status: 400 });
    }

    const body = await request.json();
    const resolucionesBody = Array.isArray(body.items) ? body.items : [];
    if (resolucionesBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'No se indicó ninguna línea para resolver' }, { status: 400 });
    }

    const [garantia] = await sql`SELECT id FROM garantias_proveedor WHERE id = ${id}`;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Garantía no encontrada' }, { status: 404 });
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

    for (const r of resolucionesBody) {
      const itemId = Number(r.id);
      const [item] = await sql`
        SELECT id, garantia_id, producto_id, cantidad, precio_costo, resolucion
        FROM garantia_proveedor_items WHERE id = ${itemId} AND garantia_id = ${id}
      `;
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

      const cantidad = Number(item.cantidad);
      const costo = Number(item.precio_costo) || 0;
      const resolucion = r.resolucion;
      const notaResolucion = r.nota_resolucion || null;
      const montoNotaCredito = resolucion === 'nota_credito' ? Number(r.monto_nota_credito) : null;

      const devuelveAPrincipal =
        resolucion === 'producto_nuevo' || resolucion === 'producto_reparado' || resolucion === 'no_aplica_devuelto';

      // Sale siempre de la bodega de garantías (deja de estar "en trámite").
      await sql`
        UPDATE stock SET cantidad = cantidad - ${cantidad}
        WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodegaGarantias}
      `;
      const tipoSalida =
        resolucion === 'nota_credito'
          ? 'garantia_baja_credito'
          : resolucion === 'no_aplica_baja'
          ? 'garantia_baja_no_aplica'
          : 'garantia_salida_resuelta';
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
        VALUES (${item.producto_id}, ${bodegaGarantias}, ${tipoSalida}, ${cantidad}, ${costo}, ${id})
      `;

      if (devuelveAPrincipal) {
        await sql`
          INSERT INTO stock (producto_id, bodega_id, cantidad)
          VALUES (${item.producto_id}, ${bodegaPrincipal}, ${cantidad})
          ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
        `;
        const tipoEntrada =
          resolucion === 'producto_nuevo'
            ? 'garantia_entrada_nuevo'
            : resolucion === 'producto_reparado'
            ? 'garantia_entrada_reparado'
            : 'garantia_entrada_no_aplica';
        await sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
          VALUES (${item.producto_id}, ${bodegaPrincipal}, ${tipoEntrada}, ${cantidad}, ${costo}, ${id})
        `;
      }

      await sql`
        UPDATE garantia_proveedor_items
        SET resolucion = ${resolucion}, monto_nota_credito = ${montoNotaCredito}, nota_resolucion = ${notaResolucion}, resuelto_en = now()
        WHERE id = ${itemId}
      `;
    }

    const [{ pendientes }] = await sql`
      SELECT COUNT(*) AS pendientes FROM garantia_proveedor_items WHERE garantia_id = ${id} AND resolucion IS NULL
    `;
    if (Number(pendientes) === 0) {
      await sql`UPDATE garantias_proveedor SET estado = 'resuelta', resuelto_en = now() WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
