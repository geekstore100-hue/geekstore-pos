import sql from './db';

// UNIDADES APARTADAS POR PEDIDOS WEB (nov 2026).
//
// Cuando Wompi aprueba un pago en geekstore.com.co, la tienda aparta en el
// POS las unidades del pedido (POST /api/publico/apartados). NO se descuenta
// el inventario ni se factura nada (eso sigue siendo el botón "Facturar" del
// admin de la tienda), pero esas unidades ya NO se pueden vender en el local:
//   - Vender (y venta rápida / pedidos de distribuidor desde Principal) no
//     deja venderlas: solo las que sobran;
//   - la pantalla de Vender muestra el stock de Principal SIN las apartadas;
//   - el catálogo de la página tampoco las cuenta (no se venden dos veces).
// El apartado se libera solo cuando:
//   - el pedido se registra como venta en el POS ("Facturar"): las unidades
//     se descuentan de verdad, en la misma transacción;
//   - Nelson marca el pedido "vendido a mano" o "facturado por fuera", o le
//     da "Liberar apartado" en el admin de la tienda (ej. si se devolvió el
//     dinero).
// Los apartados son siempre de la bodega Principal (de ahí se factura).
//
// La tabla se crea sola la primera vez (no hay que correr nada en Neon).

let tablaLista = false;
export async function asegurarApartados() {
  if (tablaLista) return;
  await sql`
    CREATE TABLE IF NOT EXISTS apartados_web (
      id SERIAL PRIMARY KEY,
      referencia TEXT NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      cliente TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      liberado_en TIMESTAMPTZ,
      motivo TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS apartados_web_activos ON apartados_web (producto_id) WHERE liberado_en IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS apartados_web_referencia ON apartados_web (referencia)`;
  tablaLista = true;
}

// ¿Ya existe la tabla? (para leer sin crearla: si nunca se ha apartado
// nada, no hay nada que restar).
let existe = false;
async function hayTabla() {
  if (existe || tablaLista) return true;
  const [f] = await sql`SELECT to_regclass('public.apartados_web') IS NOT NULL AS hay`;
  existe = f?.hay === true;
  return existe;
}

// Map producto_id → { cantidad, referencias: [...] } de lo apartado y sin
// liberar. Si se pasan ids, solo de esos productos. Nunca falla: si algo sale
// mal devuelve un Map vacío (no debe tumbar Vender ni el catálogo).
export async function apartadosActivos(productoIds = null) {
  const r = new Map();
  try {
    if (!(await hayTabla())) return r;
    const filas = Array.isArray(productoIds)
      ? await sql`
          SELECT producto_id, SUM(cantidad)::int AS cantidad, array_agg(DISTINCT referencia) AS referencias
          FROM apartados_web WHERE liberado_en IS NULL AND producto_id = ANY(${productoIds.map(Number)}::int[])
          GROUP BY producto_id
        `
      : await sql`
          SELECT producto_id, SUM(cantidad)::int AS cantidad, array_agg(DISTINCT referencia) AS referencias
          FROM apartados_web WHERE liberado_en IS NULL
          GROUP BY producto_id
        `;
    for (const f of filas) r.set(Number(f.producto_id), { cantidad: Number(f.cantidad) || 0, referencias: f.referencias || [] });
  } catch (e) {
    console.error('[apartados] no se pudieron leer:', e?.message);
  }
  return r;
}

// Para Vender y demás ventas desde Principal: si lo pedido se come unidades
// apartadas, devuelve el mensaje de error (o null si alcanza).
//   pedidoPorId: Map producto_id → cantidad pedida (solo de Principal)
//   disponiblePorId: Map producto_id → stock en Principal
//   nombrePorId: Map producto_id → nombre (para el mensaje)
export async function errorPorApartados(pedidoPorId, disponiblePorId, nombrePorId = new Map()) {
  if (!pedidoPorId?.size) return null;
  const apartados = await apartadosActivos([...pedidoPorId.keys()]);
  for (const [id, pedido] of pedidoPorId) {
    const a = apartados.get(Number(id));
    if (!a?.cantidad) continue;
    const hay = Number(disponiblePorId.get(Number(id))) || 0;
    const libres = Math.max(0, hay - a.cantidad);
    if (pedido > libres) {
      const nombre = nombrePorId.get(Number(id)) || 'uno de los productos';
      const refs = a.referencias.slice(0, 3).join(', ');
      return (
        `"${nombre}": hay ${hay} en Principal pero ${a.cantidad} ${a.cantidad === 1 ? 'está apartada' : 'están apartadas'} ` +
        `para ${a.referencias.length === 1 ? 'el pedido web' : 'los pedidos web'} ${refs}. ` +
        `Se ${libres === 1 ? 'puede' : 'pueden'} vender ${libres}.`
      );
    }
  }
  return null;
}

// Consulta para liberar los apartados de un pedido (para meterla dentro de
// una transacción, ej. al registrar la venta web).
export function consultaLiberar(referencia, motivo) {
  return sql`
    UPDATE apartados_web SET liberado_en = now(), motivo = ${String(motivo || 'liberado').slice(0, 60)}
    WHERE referencia = ${String(referencia)} AND liberado_en IS NULL
  `;
}
