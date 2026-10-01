import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { actualizarCostoPromedio } from '../../../lib/transaccion';

// Antes decía "Kennedy" y buscaba una bodega con ese nombre, que no existe
// en el sistema (la bodega principal se llama "Principal", igual que en
// Ventas y Reabastecimiento) — por eso Entradas venía fallando siempre con
// "No existe la bodega Kennedy".
async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}

export async function GET() {
  try {
    const entradas = await sql`
      SELECT m.id, m.cantidad, m.nota, m.creado_en, m.precio_unitario AS precio_compra, p.referencia, p.nombre
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.tipo = 'entrada' AND (m.creado_en::timestamptz AT TIME ZONE 'America/Bogota')::date >= (now() AT TIME ZONE 'America/Bogota')::date
      ORDER BY m.creado_en DESC
    `;
    return NextResponse.json({ ok: true, entradas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { producto_id, cantidad, nota, precio_compra } = await request.json();

    if (!producto_id || !cantidad || cantidad <= 0) {
      return NextResponse.json({ ok: false, error: 'Producto y cantidad son obligatorios' }, { status: 400 });
    }

    const bodegaId = await bodegaPrincipalId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Principal' }, { status: 500 });
    }

    const [producto] = await sql`SELECT precio_costo FROM productos WHERE id = ${producto_id}`;

    // Si se indica a qué precio se compró esta entrada, se usa ESE precio
    // como costo de este movimiento (más exacto que la foto vieja de
    // precio_costo), y además se recalcula el costo promedio ponderado del
    // producto para que quede al día automáticamente con cada compra real:
    //   nuevo promedio = (stock que ya había × costo que ya tenía
    //                      + cantidad comprada × precio de esta compra)
    //                     / (stock que ya había + cantidad comprada)
    // Se usa el stock de TODAS las bodegas (no solo Principal) porque el
    // costo es un solo valor por producto, no uno distinto por bodega. Si
    // antes no había stock o no tenía costo registrado, el promedio nuevo
    // es directamente el precio de esta compra (la fórmula de arriba ya da
    // ese resultado sola cuando el stock anterior es 0).
    // Si NO se indica el precio de compra (campo opcional, por si solo se
    // quiere corregir la cantidad), se sigue comportando exactamente igual
    // que antes: se usa como referencia el precio_costo actual y no se
    // recalcula nada.
    const precioCompraNum = Number(precio_compra) || 0;
    const precioParaElMovimiento = precioCompraNum > 0 ? precioCompraNum : producto?.precio_costo ?? null;

    // Todo en una sola transacción (ver lib/transaccion.js): el costo
    // promedio, el stock y el movimiento se guardan juntos o no se guarda
    // nada. El costo promedio ahora lo calcula la base de datos al momento
    // de guardar (misma fórmula de arriba), antes de sumar el stock.
    const consultas = [];
    if (precioCompraNum > 0) {
      consultas.push(actualizarCostoPromedio(producto_id, Number(cantidad), precioCompraNum));
    }
    consultas.push(sql`
      INSERT INTO stock (producto_id, bodega_id, cantidad)
      VALUES (${producto_id}, ${bodegaId}, ${cantidad})
      ON CONFLICT (producto_id, bodega_id)
      DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      RETURNING cantidad
    `);
    const indiceStock = consultas.length - 1;
    consultas.push(sql`
      INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, nota, precio_unitario)
      VALUES (${producto_id}, ${bodegaId}, 'entrada', ${cantidad}, ${nota || null}, ${precioParaElMovimiento})
    `);

    const resultados = await sql.transaction(consultas);
    const actualizado = resultados[indiceStock];

    return NextResponse.json({ ok: true, stock: actualizado[0].cantidad });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
