import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Corrige el costo de los productos de una factura de compra VIEJA que tenía
// descuentos (oct 2026). Antes del arreglo, el costo promedio se calculaba
// con el precio antes del descuento, así que cada unidad quedó más cara de
// lo que de verdad costó.
//
// Cuánto sobra por unidad: cantidad × precio × descuento ÷ (unidades que
// había justo después de esa compra). Eso se le resta al costo del producto
// y al costo guardado de las ventas que se hicieron después.
//
// No se toca un producto si después de esta factura tuvo otra compra o
// entrada (ahí el promedio ya se mezcló y hay que corregirlo a mano), ni si
// la factura ya se corrigió (descuento_en_costo = true).

const ENTRAN = ['entrada', 'ajuste_incremento', 'factura_compra', 'garantia_entrada', 'garantia_eliminada_entrada'];
const SALEN = ['ajuste_disminucion', 'disminuir', 'garantia_salida', 'garantia_eliminada'];

async function calcular(id) {
  await sql`ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS descuento_en_costo BOOLEAN`;
  await sql`ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC`;
  const [factura] = await sql`SELECT id, descuento_en_costo FROM facturas_compra WHERE id = ${id}`;
  if (!factura) return { error: 'Factura no encontrada', status: 404 };

  const lineas = await sql`
    SELECT m.id AS mov_id, m.producto_id, m.cantidad, m.precio_unitario, m.descuento_porcentaje,
           p.referencia, p.nombre, p.precio_costo,
           (SELECT COALESCE(SUM(s.cantidad), 0) FROM stock s WHERE s.producto_id = m.producto_id) AS stock_ahora
    FROM movimientos_stock m
    JOIN productos p ON p.id = m.producto_id
    WHERE m.tipo = 'factura_compra' AND m.factura_compra_id = ${id} AND COALESCE(m.descuento_porcentaje, 0) > 0
    ORDER BY m.id
  `;

  const resultado = [];
  for (const l of lineas) {
    const posteriores = await sql`
      SELECT m.tipo, COALESCE(SUM(m.cantidad), 0) AS cantidad, COUNT(*) AS n
      FROM movimientos_stock m
      LEFT JOIN ventas v ON v.id = m.venta_id
      WHERE m.producto_id = ${l.producto_id} AND m.id > ${l.mov_id}
        AND (m.tipo <> 'venta' OR COALESCE(v.anulada, false) = false)
      GROUP BY m.tipo
    `;
    const por = Object.fromEntries(posteriores.map((x) => [x.tipo, { cantidad: Number(x.cantidad), n: Number(x.n) }]));
    const comprasDespues = (por.factura_compra?.n || 0) + (por.entrada?.n || 0);
    const entraron = ENTRAN.reduce((a, t) => a + (por[t]?.cantidad || 0), 0);
    const salieron = SALEN.reduce((a, t) => a + (por[t]?.cantidad || 0), 0) + (por.venta?.cantidad || 0);
    // Unidades que había justo después de esta compra.
    const stockDespues = Number(l.stock_ahora) - entraron + salieron;
    const q = Number(l.cantidad);
    const p = Number(l.precio_unitario);
    const d = Number(l.descuento_porcentaje);
    const sobra = stockDespues > 0 ? (q * p * (d / 100)) / stockDespues : 0;
    const costo = Number(l.precio_costo) || 0;
    let aplicable = true;
    let motivo = '';
    if (factura.descuento_en_costo) {
      aplicable = false;
      motivo = 'Esta factura ya tiene el descuento en el costo.';
    } else if (comprasDespues) {
      aplicable = false;
      motivo = 'Tuvo otra compra después: corrige el costo a mano en Productos.';
    } else if (!(stockDespues > 0) || !(sobra > 0) || sobra >= costo) {
      aplicable = false;
      motivo = 'No se pudo calcular con seguridad: corrige el costo a mano en Productos.';
    }
    resultado.push({
      mov_id: Number(l.mov_id),
      producto_id: Number(l.producto_id),
      referencia: l.referencia,
      nombre: l.nombre,
      cantidad: q,
      precio: p,
      descuento: d,
      costo_actual: costo,
      costo_nuevo: aplicable ? Math.round((costo - sobra) * 100) / 100 : costo,
      sobra_por_unidad: Math.round(sobra * 100) / 100,
      ventas_despues: por.venta?.n || 0,
      aplicable,
      motivo,
    });
  }
  return { factura, lineas: resultado };
}

// GET → vista previa de lo que se corregiría.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const r = await calcular(Number(id));
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, yaCorregida: !!r.factura.descuento_en_costo, lineas: r.lineas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST → aplica la corrección (todo o nada) y marca la factura.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const facturaId = Number(id);
    const r = await calcular(facturaId);
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    if (r.factura.descuento_en_costo) return NextResponse.json({ ok: false, error: 'Esta factura ya se corrigió.' }, { status: 409 });
    const aplicar = r.lineas.filter((l) => l.aplicable);
    const consultas = [];
    for (const l of aplicar) {
      consultas.push(sql`UPDATE productos SET precio_costo = ${l.costo_nuevo} WHERE id = ${l.producto_id}`);
      // Ventas hechas después: su costo guardado también tenía el sobrecosto.
      consultas.push(sql`
        UPDATE movimientos_stock
        SET costo_unitario = GREATEST(0, costo_unitario - ${l.sobra_por_unidad})
        WHERE tipo = 'venta' AND producto_id = ${l.producto_id} AND id > ${l.mov_id} AND costo_unitario IS NOT NULL
      `);
    }
    consultas.push(sql`UPDATE facturas_compra SET descuento_en_costo = true WHERE id = ${facturaId}`);
    await sql.transaction(consultas);
    return NextResponse.json({
      ok: true,
      corregidos: aplicar.length,
      pendientes: r.lineas.filter((l) => !l.aplicable).map((l) => ({ referencia: l.referencia, nombre: l.nombre, motivo: l.motivo })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
