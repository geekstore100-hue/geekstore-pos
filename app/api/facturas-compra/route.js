import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Tarifas de ReteICA permitidas. 0 = "Sin retención".
const TARIFAS_RETEICA = [0, 1.1, 0.41];

// Lista de facturas de compra, con lo que se ve en la pantalla "Facturas de
// compra": proveedor, fechas, total, cuánto se retuvo (ReteICA) y cuánto
// queda por pagar (total - retención), más si ya se pagó o sigue pendiente.
export async function GET() {
  try {
    const facturas = await sql`
      SELECT
        f.id,
        f.numero,
        f.fecha_creacion,
        f.fecha_vencimiento,
        f.subtotal,
        f.retencion_porcentaje,
        f.retencion_base,
        f.retencion_valor,
        f.total,
        (f.total - f.retencion_valor) AS por_pagar,
        f.estado_pago,
        f.pagado_en,
        f.notas,
        p.id AS proveedor_id,
        p.nombre AS proveedor_nombre,
        b.nombre AS bodega_nombre,
        COALESCE(li.items, 0) AS items
      FROM facturas_compra f
      JOIN proveedores p ON p.id = f.proveedor_id
      JOIN bodegas b ON b.id = f.bodega_id
      LEFT JOIN (
        SELECT factura_compra_id, COUNT(*) AS items
        FROM movimientos_stock
        WHERE tipo = 'factura_compra' AND factura_compra_id IS NOT NULL
        GROUP BY factura_compra_id
      ) li ON li.factura_compra_id = f.id
      ORDER BY f.creado_en DESC
      LIMIT 200
    `;
    return NextResponse.json({ ok: true, facturas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Crea una factura de compra: agrega cada línea al stock de la bodega
// elegida y recalcula el costo promedio ponderado del producto (el mismo
// sistema ya usado en Entradas), usando el precio de esa línea como precio
// de compra real. La retención de ReteICA solo afecta lo que queda "por
// pagar" al proveedor, nunca el costo del inventario.
export async function POST(request) {
  try {
    const body = await request.json();
    const proveedor_id = Number(body.proveedor_id);
    const bodega_id = Number(body.bodega_id);
    const numero = body.numero?.trim() || null;
    const fecha_creacion = body.fecha_creacion || null;
    const fecha_vencimiento = body.fecha_vencimiento || null;
    const notas = body.notas?.trim() || null;
    const retencionPorcentaje = Number(body.retencion_porcentaje) || 0;
    const itemsBody = Array.isArray(body.items) ? body.items : [];

    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona el proveedor' }, { status: 400 });
    }
    if (!bodega_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona la bodega que va a recibir la mercancía' }, { status: 400 });
    }
    if (!fecha_creacion) {
      return NextResponse.json({ ok: false, error: 'La fecha de creación es obligatoria' }, { status: 400 });
    }
    if (!TARIFAS_RETEICA.includes(retencionPorcentaje)) {
      return NextResponse.json({ ok: false, error: 'La tarifa de ReteICA no es válida' }, { status: 400 });
    }
    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto a la factura' }, { status: 400 });
    }

    const items = [];
    for (const it of itemsBody) {
      const producto_id = Number(it.producto_id);
      const cantidad = Number(it.cantidad);
      const precio = Number(it.precio);
      const descuento_porcentaje = Number(it.descuento_porcentaje) || 0;
      if (!producto_id || !cantidad || cantidad <= 0) {
        return NextResponse.json({ ok: false, error: 'Hay un producto con una cantidad inválida' }, { status: 400 });
      }
      if (!precio || precio <= 0) {
        return NextResponse.json({ ok: false, error: 'Hay un producto sin precio de compra' }, { status: 400 });
      }
      const subtotalLinea = precio * cantidad * (1 - descuento_porcentaje / 100);
      items.push({ producto_id, cantidad, precio, descuento_porcentaje, subtotalLinea });
    }

    const [proveedor] = await sql`SELECT id FROM proveedores WHERE id = ${proveedor_id}`;
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: 'El proveedor seleccionado ya no existe' }, { status: 404 });
    }
    const [bodega] = await sql`SELECT id FROM bodegas WHERE id = ${bodega_id}`;
    if (!bodega) {
      return NextResponse.json({ ok: false, error: 'La bodega seleccionada ya no existe' }, { status: 404 });
    }

    const productoIds = [...new Set(items.map((it) => it.producto_id))];
    const productos = await sql`
      SELECT id, nombre, es_inventariable, precio_costo FROM productos WHERE id = ANY(${productoIds})
    `;
    if (productos.length !== productoIds.length) {
      return NextResponse.json({ ok: false, error: 'Uno de los productos ya no existe' }, { status: 404 });
    }
    const noInventariable = productos.find((p) => p.es_inventariable === false);
    if (noInventariable) {
      return NextResponse.json(
        { ok: false, error: `"${noInventariable.nombre}" es un servicio y no maneja inventario, no se puede agregar a una factura de compra` },
        { status: 400 }
      );
    }

    const subtotal = items.reduce((acc, it) => acc + it.subtotalLinea, 0);
    const total = subtotal; // Por ahora no se manejan impuestos ni descuentos a nivel de factura.
    // Al crear la factura, la base de la retención es el subtotal completo
    // (lo normal). Si hace falta, se puede entrar después a "Editar
    // retención" y cambiar esa base a mano (ej. si solo aplica a una parte
    // de la compra).
    const retencionBase = subtotal;
    const retencionValor = retencionBase * (retencionPorcentaje / 100);

    const [factura] = await sql`
      INSERT INTO facturas_compra
        (numero, proveedor_id, bodega_id, fecha_creacion, fecha_vencimiento, subtotal, retencion_porcentaje, retencion_base, retencion_valor, total, notas)
      VALUES
        (${numero}, ${proveedor_id}, ${bodega_id}, ${fecha_creacion}, ${fecha_vencimiento}, ${subtotal}, ${retencionPorcentaje}, ${retencionBase}, ${retencionValor}, ${total}, ${notas})
      RETURNING id
    `;

    // Se procesa una línea a la vez (no en paralelo) para que, si el mismo
    // producto aparece en dos líneas de la misma factura, el costo promedio
    // de la segunda línea ya tenga en cuenta el stock que dejó la primera.
    for (const it of items) {
      const [producto] = await sql`SELECT precio_costo FROM productos WHERE id = ${it.producto_id}`;
      const [{ total_stock }] = await sql`
        SELECT COALESCE(SUM(cantidad), 0) AS total_stock FROM stock WHERE producto_id = ${it.producto_id}
      `;
      const stockAntes = Number(total_stock) || 0;
      const costoAntes = Number(producto?.precio_costo) || 0;

      const nuevoPromedio =
        stockAntes > 0 && costoAntes > 0
          ? (stockAntes * costoAntes + it.cantidad * it.precio) / (stockAntes + it.cantidad)
          : it.precio;

      await sql`UPDATE productos SET precio_costo = ${nuevoPromedio} WHERE id = ${it.producto_id}`;

      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${it.producto_id}, ${bodega_id}, ${it.cantidad})
        ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;

      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, factura_compra_id)
        VALUES (${it.producto_id}, ${bodega_id}, 'factura_compra', ${it.cantidad}, ${it.precio}, ${it.descuento_porcentaje}, ${factura.id})
      `;
    }

    return NextResponse.json({ ok: true, facturaId: factura.id, subtotal, retencionValor, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
