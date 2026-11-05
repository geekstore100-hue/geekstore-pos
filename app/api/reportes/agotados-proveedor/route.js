import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// AGOTADOS POR PROVEEDOR (nov 2026). Para cada proveedor, sus productos
// (los que alguna vez se le compraron en una factura de compra) que:
//   - AGOTADOS: stock total en 0 (todas las bodegas menos "Garantías con
//     Proveedor") desde hace 2 meses o menos → hay que pedirlos.
//   - POR AGOTARSE: les queda stock, pero al ritmo de venta de los últimos
//     30 días alcanza para 15 días o menos, o quedan 2 o menos y se han
//     vendido en los últimos 90 días.
//   - AGOTADOS HACE MÁS DE 2 MESES: lo más probable es que el proveedor ya
//     no los volvió a traer; van aparte para no estorbar.
// "Se agotó" = la fecha del último movimiento que sacó unidades (venta,
// ajuste, garantía…) de un producto que hoy está en 0.
//
// GET                 → resumen por proveedor (cuántos de cada grupo)
// GET ?proveedor_id=N → el detalle de ese proveedor
export const dynamic = 'force-dynamic';

const DIAS_VIEJO = 60;
const DIAS_COBERTURA = 15;
const POCAS_UNIDADES = 2;

function clasificar(p) {
  const stock = Number(p.stock_total) || 0;
  const v30 = Number(p.vendidas_30) || 0;
  const v90 = Number(p.vendidas_90) || 0;
  if (stock <= 0) {
    const desde = p.agotado_desde ? new Date(p.agotado_desde) : null;
    const dias = desde ? Math.floor((Date.now() - desde.getTime()) / 86400000) : null;
    return { grupo: dias != null && dias > DIAS_VIEJO ? 'viejos' : 'agotados', diasAgotado: dias, diasCobertura: 0 };
  }
  const porDia = v30 / 30;
  const diasCobertura = porDia > 0 ? Math.floor(stock / porDia) : null;
  if ((diasCobertura != null && diasCobertura <= DIAS_COBERTURA) || (stock <= POCAS_UNIDADES && v90 > 0)) {
    return { grupo: 'porAgotarse', diasAgotado: null, diasCobertura };
  }
  return { grupo: null, diasAgotado: null, diasCobertura };
}

export async function GET(request) {
  try {
    const proveedorId = Number(new URL(request.url).searchParams.get('proveedor_id')) || null;
    const filas = await sql`
      WITH compras AS (
        SELECT m.producto_id, f.proveedor_id,
               MAX(m.creado_en) AS ultima_compra,
               (ARRAY_AGG(m.precio_unitario ORDER BY m.creado_en DESC))[1] AS ultimo_costo,
               (ARRAY_AGG(m.cantidad ORDER BY m.creado_en DESC))[1] AS ultima_cantidad
        FROM movimientos_stock m
        JOIN facturas_compra f ON f.id = m.factura_compra_id
        WHERE m.tipo = 'factura_compra'
          AND (${proveedorId}::int IS NULL OR f.proveedor_id = ${proveedorId}::int)
        GROUP BY m.producto_id, f.proveedor_id
      ),
      ultimo_proveedor AS (
        SELECT DISTINCT ON (m.producto_id) m.producto_id, f.proveedor_id, pr.nombre AS proveedor_nombre
        FROM movimientos_stock m
        JOIN facturas_compra f ON f.id = m.factura_compra_id
        JOIN proveedores pr ON pr.id = f.proveedor_id
        WHERE m.tipo = 'factura_compra'
        ORDER BY m.producto_id, m.creado_en DESC
      ),
      existencias AS (
        SELECT s.producto_id, SUM(s.cantidad) AS stock_total
        FROM stock s
        JOIN bodegas b ON b.id = s.bodega_id
        WHERE b.nombre <> 'Garantías con Proveedor'
        GROUP BY s.producto_id
      ),
      vendidas AS (
        SELECT m.producto_id,
               COALESCE(SUM(m.cantidad) FILTER (WHERE v.creado_en >= now() - INTERVAL '30 days'), 0) AS vendidas_30,
               COALESCE(SUM(m.cantidad) FILTER (WHERE v.creado_en >= now() - INTERVAL '90 days'), 0) AS vendidas_90,
               MAX(v.creado_en) AS ultima_venta
        FROM movimientos_stock m
        JOIN ventas v ON v.id = m.venta_id
        WHERE m.tipo = 'venta' AND v.anulada = false
        GROUP BY m.producto_id
      ),
      salidas AS (
        SELECT producto_id, MAX(creado_en) AS ultima_salida
        FROM movimientos_stock
        WHERE tipo IN ('venta', 'ajuste_disminucion', 'disminuir', 'garantia_salida', 'garantia_eliminada')
        GROUP BY producto_id
      )
      SELECT p.id, p.referencia, p.nombre, p.imagen_key,
             c.proveedor_id, pr.nombre AS proveedor_nombre,
             c.ultima_compra, c.ultimo_costo, c.ultima_cantidad,
             up.proveedor_id AS ultimo_proveedor_id, up.proveedor_nombre AS ultimo_proveedor_nombre,
             COALESCE(e.stock_total, 0) AS stock_total,
             COALESCE(vd.vendidas_30, 0) AS vendidas_30,
             COALESCE(vd.vendidas_90, 0) AS vendidas_90,
             vd.ultima_venta,
             COALESCE(sa.ultima_salida, c.ultima_compra) AS agotado_desde
      FROM compras c
      JOIN productos p ON p.id = c.producto_id
      JOIN proveedores pr ON pr.id = c.proveedor_id
      LEFT JOIN ultimo_proveedor up ON up.producto_id = p.id
      LEFT JOIN existencias e ON e.producto_id = p.id
      LEFT JOIN vendidas vd ON vd.producto_id = p.id
      LEFT JOIN salidas sa ON sa.producto_id = p.id
      WHERE p.activo = true
        AND p.es_inventariable IS DISTINCT FROM false
        AND COALESCE(to_jsonb(p) ->> 'sede', 'kennedy') = 'kennedy'
      ORDER BY p.nombre
    `;

    const conGrupo = filas
      .map((p) => ({ ...p, ...clasificar(p) }))
      .filter((p) => p.grupo);

    if (!proveedorId) {
      const porProveedor = new Map();
      for (const p of conGrupo) {
        const r = porProveedor.get(p.proveedor_id) || { id: p.proveedor_id, nombre: p.proveedor_nombre, agotados: 0, porAgotarse: 0, viejos: 0 };
        r[p.grupo] += 1;
        porProveedor.set(p.proveedor_id, r);
      }
      const resumen = [...porProveedor.values()].sort((a, b) => b.agotados + b.porAgotarse - (a.agotados + a.porAgotarse) || a.nombre.localeCompare(b.nombre, 'es'));
      return NextResponse.json({ ok: true, resumen, diasViejo: DIAS_VIEJO, diasCobertura: DIAS_COBERTURA });
    }

    const limpio = (p) => ({
      id: p.id,
      referencia: p.referencia,
      nombre: p.nombre,
      imagen_key: p.imagen_key,
      stock: Number(p.stock_total) || 0,
      vendidas30: Number(p.vendidas_30) || 0,
      vendidas90: Number(p.vendidas_90) || 0,
      ultimaVenta: p.ultima_venta,
      agotadoDesde: Number(p.stock_total) > 0 ? null : p.agotado_desde,
      diasAgotado: p.diasAgotado,
      diasCobertura: p.diasCobertura,
      ultimaCompra: p.ultima_compra,
      ultimoCosto: p.ultimo_costo != null ? Number(p.ultimo_costo) : null,
      ultimaCantidad: p.ultima_cantidad != null ? Number(p.ultima_cantidad) : null,
      // Si la última vez se le compró a OTRO proveedor, se avisa.
      otroProveedor: p.ultimo_proveedor_id && p.ultimo_proveedor_id !== p.proveedor_id ? p.ultimo_proveedor_nombre : null,
    });
    const grupo = (g) => conGrupo.filter((p) => p.grupo === g).map(limpio);
    return NextResponse.json({
      ok: true,
      agotados: grupo('agotados').sort((a, b) => b.vendidas90 - a.vendidas90),
      porAgotarse: grupo('porAgotarse').sort((a, b) => (a.diasCobertura ?? 999) - (b.diasCobertura ?? 999)),
      viejos: grupo('viejos').sort((a, b) => (a.diasAgotado ?? 0) - (b.diasAgotado ?? 0)),
      diasViejo: DIAS_VIEJO,
      diasCobertura: DIAS_COBERTURA,
    });
  } catch (error) {
    console.error('Error en agotados por proveedor', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
