import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Lista de compras para resurtir, agrupada por proveedor — la idea es que
// se va llenando sola (desde Reabastecimiento, cuando un producto hay que
// comprarlo y no solo trasladarlo) y también a mano, y queda ahí guardada
// hasta que se marca como comprada. Agrupar por proveedor es lo que permite
// armar un solo pedido por proveedor en vez de comprar producto por
// producto.
export async function GET() {
  try {
    const items = await sql`
      SELECT
        i.id, i.producto_id, i.proveedor_id, i.cantidad, i.precio_referencia, i.nota, i.creado_en,
        p.referencia, p.nombre AS producto_nombre, p.imagen_key,
        prov.nombre AS proveedor_nombre
      FROM lista_compras_items i
      JOIN productos p ON p.id = i.producto_id
      LEFT JOIN proveedores prov ON prov.id = i.proveedor_id
      WHERE i.comprado_en IS NULL
      ORDER BY prov.nombre NULLS FIRST, p.nombre ASC
    `;

    // Agrupado por proveedor en el propio servidor para que la pantalla no
    // tenga que repetir esa lógica.
    const gruposPorId = new Map();
    for (const it of items) {
      const clave = it.proveedor_id || 'sin_proveedor';
      if (!gruposPorId.has(clave)) {
        gruposPorId.set(clave, {
          proveedor_id: it.proveedor_id,
          proveedor_nombre: it.proveedor_nombre || 'Sin proveedor asignado',
          items: [],
          total: 0,
        });
      }
      const grupo = gruposPorId.get(clave);
      grupo.items.push(it);
      grupo.total += Number(it.precio_referencia || 0) * Number(it.cantidad || 0);
    }
    const grupos = [...gruposPorId.values()].sort((a, b) => {
      if (!a.proveedor_id) return 1;
      if (!b.proveedor_id) return -1;
      return a.proveedor_nombre.localeCompare(b.proveedor_nombre);
    });

    return NextResponse.json({ ok: true, grupos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Agrega un producto a la lista de compras (desde Reabastecimiento o a
// mano). Si el producto ya está pendiente de comprar, en vez de duplicarlo
// se suma la cantidad al ítem existente (mismo producto + mismo proveedor,
// incluyendo "sin proveedor" como su propio grupo).
export async function POST(request) {
  try {
    const body = await request.json();
    const producto_id = Number(body.producto_id);
    const proveedor_id = body.proveedor_id ? Number(body.proveedor_id) : null;
    const cantidad = Number(body.cantidad) || 1;
    const precio_referencia = body.precio_referencia != null ? Number(body.precio_referencia) : null;
    const nota = body.nota ? String(body.nota).trim() : null;

    if (!producto_id) {
      return NextResponse.json({ ok: false, error: 'Producto inválido' }, { status: 400 });
    }
    if (cantidad <= 0) {
      return NextResponse.json({ ok: false, error: 'La cantidad debe ser mayor a cero' }, { status: 400 });
    }

    const [producto] = await sql`SELECT id FROM productos WHERE id = ${producto_id}`;
    if (!producto) {
      return NextResponse.json({ ok: false, error: 'El producto ya no existe' }, { status: 404 });
    }
    if (proveedor_id) {
      const [proveedor] = await sql`SELECT id FROM proveedores WHERE id = ${proveedor_id}`;
      if (!proveedor) {
        return NextResponse.json({ ok: false, error: 'El proveedor ya no existe' }, { status: 404 });
      }
    }

    const [existente] = await sql`
      SELECT id, cantidad FROM lista_compras_items
      WHERE producto_id = ${producto_id}
        AND comprado_en IS NULL
        AND proveedor_id IS NOT DISTINCT FROM ${proveedor_id}
    `;

    let item;
    if (existente) {
      [item] = await sql`
        UPDATE lista_compras_items
        SET cantidad = cantidad + ${cantidad},
            precio_referencia = COALESCE(${precio_referencia}, precio_referencia)
        WHERE id = ${existente.id}
        RETURNING id
      `;
    } else {
      [item] = await sql`
        INSERT INTO lista_compras_items (producto_id, proveedor_id, cantidad, precio_referencia, nota)
        VALUES (${producto_id}, ${proveedor_id}, ${cantidad}, ${precio_referencia}, ${nota})
        RETURNING id
      `;
    }

    return NextResponse.json({ ok: true, itemId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
