import sql from './db';

// lib/ventaUnica.js — nov 2026. Que una misma venta NO se guarde dos veces.
//
// Qué pasaba: se fue el internet, la caja guardó la venta en el computador
// (lib/offlineVentas.js) y al volver la conexión la mandó al servidor varias
// veces (el aviso de "volvió el internet", el reintento de cada 45 segundos
// y el botón "Sincronizar" podían arrancar al mismo tiempo, y si la
// respuesta del servidor se perdía la venta quedaba pendiente y se volvía a
// mandar). Resultado: tres ventas de $10.000 donde había una.
//
// Ahora cada venta lleva un código único (id_local) desde que se crea en la
// caja. El servidor lo guarda en ventas.id_local y, si la misma venta llega
// otra vez, responde con la que ya quedó en vez de crear otra. Es lo mismo
// que ya hacía la venta rápida del celular (app/api/ventas/rapida).

let listo = null;

// Deja lista la columna id_local y su índice único (si ya existen, no hace
// nada). Si algo falla, las ventas se siguen guardando como antes.
export async function idLocalListo() {
  if (listo !== null) return listo;
  try {
    await sql`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS id_local TEXT`;
    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS ventas_id_local_unico ON ventas (id_local) WHERE id_local IS NOT NULL`;
    } catch (e) {
      console.error('[ventaUnica] no se pudo crear el índice único de id_local:', e?.message);
    }
    listo = true;
  } catch (e) {
    console.error('[ventaUnica] no se pudo preparar la columna id_local:', e?.message);
    listo = false;
  }
  return listo;
}

export function limpiarIdLocal(valor) {
  const v = String(valor || '').trim().slice(0, 80);
  return /^[A-Za-z0-9._:-]{6,80}$/.test(v) ? v : null;
}

export async function ventaPorIdLocal(idLocal) {
  if (!idLocal) return null;
  const [v] = await sql`SELECT id, total FROM ventas WHERE id_local = ${idLocal} LIMIT 1`;
  if (!v) return null;
  const pagos = await sql`SELECT medio_pago, monto FROM pagos_venta WHERE venta_id = ${v.id} ORDER BY id`;
  return { id: v.id, total: Number(v.total), pagos: pagos.map((p) => ({ medio_pago: p.medio_pago, monto: Number(p.monto) })) };
}

export function esDuplicadoIdLocal(error) {
  return /ventas_id_local_unico|duplicate key/i.test(error?.message || '');
}

// ¿Esta venta es una copia de otra anterior? Mismo total, medio de pago,
// vendedor y productos (con sus cantidades), hecha con menos de 2 minutos
// de diferencia, y la otra sigue activa. Devuelve el id de la original o
// null. Se usa para dejar anular la copia aunque no sea del día de hoy.
export async function originalDeDuplicada(id) {
  const [fila] = await sql`
    WITH v AS (
      SELECT id, total, medio_pago, vendedor_id, creado_en::timestamptz AS t,
        (SELECT string_agg(producto_id || 'x' || cantidad, ',' ORDER BY producto_id, cantidad)
           FROM movimientos_stock WHERE venta_id = ventas.id AND tipo = 'venta') AS firma
      FROM ventas WHERE id = ${id}
    )
    SELECT o.id
    FROM ventas o, v
    WHERE o.id < v.id
      AND o.anulada = false
      AND o.total = v.total
      AND o.medio_pago IS NOT DISTINCT FROM v.medio_pago
      AND o.vendedor_id IS NOT DISTINCT FROM v.vendedor_id
      AND o.creado_en::timestamptz BETWEEN v.t - interval '2 minutes' AND v.t + interval '2 minutes'
      AND (SELECT string_agg(producto_id || 'x' || cantidad, ',' ORDER BY producto_id, cantidad)
             FROM movimientos_stock WHERE venta_id = o.id AND tipo = 'venta') IS NOT DISTINCT FROM v.firma
    ORDER BY o.id
    LIMIT 1
  `;
  return fila ? fila.id : null;
}
