import sql from './db';

// Costo del DÍA de la venta (octubre 2026).
//
// Antes los reportes calculaban la ganancia con el costo ACTUAL del
// producto: si el costo cambiaba después, la ganancia de ventas viejas
// cambiaba también. Ahora cada línea vendida guarda su costo en
// movimientos_stock.costo_unitario en el momento de la venta.
//
// - La columna se crea sola la primera vez (no hay que correr nada en Neon).
// - Al crearla, las ventas que ya existían quedan con el costo de ese día
//   (es lo más cercano que hay; antes no se guardaba).
// - Si por algo no se pudiera crear, la venta se guarda igual (solo que sin
//   el costo congelado) — nunca se bloquea una venta por esto.

let listo = null;

export async function costoListo() {
  if (listo !== null) return listo;
  try {
    const [existe] = await sql`
      SELECT 1 AS si FROM information_schema.columns
      WHERE table_name = 'movimientos_stock' AND column_name = 'costo_unitario'
    `;
    if (!existe) {
      await sql`ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC`;
      // Congela las ventas anteriores con el costo de hoy.
      await sql`
        UPDATE movimientos_stock m
        SET costo_unitario = CASE WHEN p.es_inventariable = false THEN 0 ELSE COALESCE(p.precio_costo, 0) END
        FROM productos p
        WHERE p.id = m.producto_id AND m.tipo = 'venta' AND m.costo_unitario IS NULL
      `;
    }
    listo = true;
  } catch (e) {
    console.error('[costoVenta] no se pudo preparar la columna costo_unitario:', e?.message);
    listo = false;
  }
  return listo;
}

// Paso para sql.transaction: guarda el costo de hoy en las líneas de la
// venta recién creada (la que está anotada en la variable de la transacción).
export function consultaGuardarCosto(variable = 'pos.id_venta') {
  return sql`
    UPDATE movimientos_stock m
    SET costo_unitario = CASE WHEN p.es_inventariable = false THEN 0 ELSE COALESCE(p.precio_costo, 0) END
    FROM productos p
    WHERE m.venta_id = current_setting(${variable})::int
      AND m.tipo = 'venta' AND p.id = m.producto_id AND m.costo_unitario IS NULL
  `;
}

// Para leer el costo en reportes sin fallar si la columna no existe:
// usa el costo guardado y, si no hay, el costo actual del producto.
//   COALESCE((to_jsonb(m) ->> 'costo_unitario')::numeric, p.precio_costo, 0)
