import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Búsqueda rápida de manifiestos de importación — para cuando la DIAN pide
// "el manifiesto de este producto" y hay que encontrarlo ya. Se busca por
// número de factura, nombre del proveedor, o referencia/nombre de un
// producto que haya venido en esa factura; se devuelven las facturas de
// compra que coinciden, con sus manifiestos adjuntos (si tiene) y los
// productos de esa factura, para confirmar que es la correcta.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ ok: true, resultados: [] });
    }
    const texto = `%${q}%`;

    const facturas = await sql`
      SELECT DISTINCT f.id, f.numero, f.fecha_creacion, p.nombre AS proveedor_nombre
      FROM facturas_compra f
      JOIN proveedores p ON p.id = f.proveedor_id
      LEFT JOIN movimientos_stock m ON m.factura_compra_id = f.id AND m.tipo = 'factura_compra'
      LEFT JOIN productos pr ON pr.id = m.producto_id
      WHERE
        f.numero ILIKE ${texto}
        OR p.nombre ILIKE ${texto}
        OR pr.referencia ILIKE ${texto}
        OR pr.nombre ILIKE ${texto}
      ORDER BY f.fecha_creacion DESC
      LIMIT 30
    `;

    if (facturas.length === 0) {
      return NextResponse.json({ ok: true, resultados: [] });
    }

    const facturaIds = facturas.map((f) => f.id);

    const manifiestos = await sql`
      SELECT id, factura_compra_id, archivo_key, nombre_original, tipo_archivo, subido_en
      FROM factura_compra_manifiestos
      WHERE factura_compra_id = ANY(${facturaIds})
      ORDER BY subido_en ASC
    `;
    const manifiestosPorFactura = new Map();
    for (const m of manifiestos) {
      const lista = manifiestosPorFactura.get(m.factura_compra_id) || [];
      lista.push(m);
      manifiestosPorFactura.set(m.factura_compra_id, lista);
    }

    const items = await sql`
      SELECT m.factura_compra_id, pr.referencia, pr.nombre
      FROM movimientos_stock m
      JOIN productos pr ON pr.id = m.producto_id
      WHERE m.tipo = 'factura_compra' AND m.factura_compra_id = ANY(${facturaIds})
    `;
    const itemsPorFactura = new Map();
    for (const it of items) {
      const lista = itemsPorFactura.get(it.factura_compra_id) || [];
      lista.push({ referencia: it.referencia, nombre: it.nombre });
      itemsPorFactura.set(it.factura_compra_id, lista);
    }

    const resultados = facturas.map((f) => ({
      factura_compra_id: f.id,
      numero: f.numero,
      fecha_creacion: f.fecha_creacion,
      proveedor_nombre: f.proveedor_nombre,
      items: itemsPorFactura.get(f.id) || [],
      manifiestos: manifiestosPorFactura.get(f.id) || [],
    }));

    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
