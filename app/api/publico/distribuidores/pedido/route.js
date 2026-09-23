import { NextResponse } from 'next/server';
import crypto from 'crypto';
import sql from '../../../../../lib/db';
import { claveValida, buscarDistribuidor } from '../../../../../lib/distribuidores';

// Crea el pedido de un distribuidor como una COTIZACIÓN pendiente en el
// POS — nunca descuenta stock ni genera ninguna venta real. Nelson la
// revisa e imprime desde /cotizaciones-distribuidor, y cuando decide
// facturarla lo hace él manualmente (la marca como "facturada" ahí
// mismo, solo para su propio control).
//
// Antes esto creaba una "cotización" (estimate) en Alegra Cuenta 1.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!claveValida(request)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }
    const { cedula, items } = await request.json();
    const distribuidor = await buscarDistribuidor(cedula);
    if (!distribuidor) {
      return NextResponse.json({ ok: false, error: 'Distribuidor no encontrado' }, { status: 404 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'El pedido está vacío' }, { status: 400 });
    }

    // Validar cada ítem contra el precio distribuidor y el stock REALES
    // del servidor — nunca se confía en lo que mande el navegador.
    const productos = await sql`
      SELECT
        p.id, p.referencia, p.alegra_id, p.nombre, p.precio_distribuidor, p.es_inventariable,
        COALESCE(st.stock_total, 0) AS stock_total
      FROM productos p
      LEFT JOIN (
        SELECT producto_id, SUM(cantidad) AS stock_total
        FROM stock
        GROUP BY producto_id
      ) st ON st.producto_id = p.id
      WHERE p.activo = true AND p.precio_distribuidor IS NOT NULL AND p.precio_distribuidor > 0
    `;
    const porId = new Map(productos.map((p) => [String(p.alegra_id || p.referencia), p]));

    const detalle = [];
    let total = 0;
    for (const item of items) {
      const prod = porId.get(String(item.id));
      const cantidad = Math.floor(Number(item.cantidad));
      if (!prod || !Number.isFinite(cantidad) || cantidad < 1) continue;
      const disponible = prod.es_inventariable === false ? cantidad : Math.floor(Number(prod.stock_total));
      const cant = Math.min(cantidad, Math.max(disponible, 0));
      if (cant < 1) continue;
      const precioUnitario = Number(prod.precio_distribuidor);
      const subtotal = precioUnitario * cant;
      total += subtotal;
      detalle.push({
        producto_id: prod.id,
        referencia: prod.referencia,
        nombre: prod.nombre,
        cantidad: cant,
        precio_unitario: precioUnitario,
        subtotal,
      });
    }

    if (detalle.length === 0) {
      return NextResponse.json({ ok: false, error: 'Ningún artículo del pedido es válido (sin stock o sin precio distribuidor).' }, { status: 400 });
    }

    const numero = `DIST-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const [cotizacion] = await sql`
      INSERT INTO cotizaciones_distribuidor (numero, distribuidor_id, distribuidor_nombre, distribuidor_cedula, total)
      VALUES (${numero}, ${distribuidor.id}, ${distribuidor.nombre}, ${distribuidor.cedula}, ${total})
      RETURNING id, numero
    `;

    for (const linea of detalle) {
      await sql`
        INSERT INTO cotizacion_distribuidor_items
          (cotizacion_id, producto_id, referencia, nombre, cantidad, precio_unitario, subtotal)
        VALUES
          (${cotizacion.id}, ${linea.producto_id}, ${linea.referencia}, ${linea.nombre}, ${linea.cantidad}, ${linea.precio_unitario}, ${linea.subtotal})
      `;
    }

    return NextResponse.json({ ok: true, numero: cotizacion.numero, total, articulos: detalle.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
