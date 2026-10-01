import sql from './db';

// Ayudas para las operaciones que mueven inventario (ventas, traspasos,
// ajustes, facturas de compra, garantías, devoluciones, entradas).
//
// Todas esas operaciones ahora se guardan en UNA sola transacción con
// sql.transaction([...]): o se guarda todo, o no se guarda nada. Antes eran
// muchos pasos sueltos, y si la conexión se caía en medio quedaban a medias
// (por ejemplo, la mercancía salía de una bodega y nunca llegaba a la otra).
//
// Como en una transacción así todos los pasos se mandan juntos de una vez,
// desde aquí no se puede "mirar" el resultado de un paso para decidir el
// siguiente. Por eso, cuando un paso tiene que cancelar toda la operación
// (por ejemplo: ya no alcanza el stock porque otra caja se lo llevó en ese
// mismo instante), se usa un truco: el paso divide 1 entre la cantidad de
// filas que logró actualizar. Si no actualizó ninguna, es 1/0 → error →
// Postgres deshace TODA la transacción. El conteo se calcula al momento de
// ejecutar (no antes), así que solo falla cuando de verdad no se pudo.
// esErrorDeGuardia() reconoce ese error para mostrar un mensaje claro.
//
// Enlazar los pasos con el documento recién creado (la venta, la factura,
// el traspaso...): el paso que lo crea deja su id anotado en una variable
// que solo existe dentro de esta transacción —
//   WITH nueva AS (INSERT ... RETURNING id)
//   SELECT id, set_config('pos.id_venta', id::text, true) FROM nueva
// — y los pasos siguientes la leen con current_setting('pos.id_venta')::int.
// Si por algo no estuviera anotada, leerla da error y se cancela todo: nunca
// queda un pago o un movimiento sin enlazar a su documento.

export function esErrorDeGuardia(error) {
  return /division by zero/i.test(String(error?.message || ''));
}

// Resta stock SOLO si alcanza (nunca lo deja en negativo). Si no alcanza,
// cancela toda la transacción (ver arriba).
export function descontarStockSeguro(productoId, bodegaId, cantidad) {
  return sql`
    WITH descontado AS (
      UPDATE stock SET cantidad = cantidad - ${cantidad}
      WHERE producto_id = ${productoId} AND bodega_id = ${bodegaId} AND cantidad >= ${cantidad}
      RETURNING 1
    )
    SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM descontado) c
  `;
}

// Suma stock (crea la fila de stock si ese producto todavía no tenía en esa
// bodega).
export function sumarStock(productoId, bodegaId, cantidad) {
  return sql`
    INSERT INTO stock (producto_id, bodega_id, cantidad)
    VALUES (${productoId}, ${bodegaId}, ${cantidad})
    ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
  `;
}

// Resta stock sin exigir que alcance (puede quedar negativo). Solo para
// casos donde bloquear sería peor que el negativo — por ejemplo, sacar de la
// bodega de Garantías algo que ya se registró ahí.
export function restarStock(productoId, bodegaId, cantidad) {
  return sql`
    UPDATE stock SET cantidad = cantidad - ${cantidad}
    WHERE producto_id = ${productoId} AND bodega_id = ${bodegaId}
  `;
}

// Recalcula el costo promedio ponderado de un producto por una compra
// (misma fórmula que ya se usaba en Entradas y Facturas de compra), pero
// calculado DENTRO de la base de datos al momento de guardar, para que
// quede dentro de la misma transacción:
//   nuevo promedio = (stock total × costo actual + cantidad × precio de compra)
//                    / (stock total + cantidad)
// Si no había stock o no tenía costo, queda directamente el precio de compra.
// Debe ir ANTES de sumar el stock de esa compra (usa el stock "de antes").
export function actualizarCostoPromedio(productoId, cantidad, precio) {
  return sql`
    UPDATE productos p
    SET precio_costo = CASE
      WHEN s.total > 0 AND COALESCE(p.precio_costo, 0) > 0
        THEN (s.total * p.precio_costo + ${cantidad}::numeric * ${precio}::numeric) / (s.total + ${cantidad}::numeric)
      ELSE ${precio}::numeric
    END
    FROM (SELECT COALESCE(SUM(cantidad), 0) AS total FROM stock WHERE producto_id = ${productoId}) s
    WHERE p.id = ${productoId}
  `;
}
