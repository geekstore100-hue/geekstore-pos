import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    // El stock se suma entre TODAS las bodegas (no depende de un nombre de bodega fijo).
    const productos = await sql`
      SELECT
        p.id,
        p.referencia,
        p.nombre,
        p.descripcion,
        p.categoria_id,
        c.nombre AS categoria_nombre,
        p.subcategoria_id,
        sc.nombre AS subcategoria_nombre,
        p.precio_venta,
        p.precio_costo,
        p.precio_distribuidor,
        p.imagen_key,
        p.activo,
        p.es_inventariable,
        p.mostrar_en_tienda,
        p.es_gamer,
        COALESCE(SUM(s.cantidad), 0) AS stock,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) AS stock_principal,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) AS stock_distribuidor
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN stock s ON s.producto_id = p.id
      LEFT JOIN bodegas b ON b.id = s.bodega_id
      GROUP BY p.id, c.nombre, sc.nombre
      ORDER BY (p.imagen_key IS NULL) ASC, p.creado_en DESC, p.id DESC
    `;
    return NextResponse.json({ ok: true, productos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      referencia,
      nombre,
      descripcion,
      categoria_id,
      subcategoria_id,
      precio_venta,
      precio_costo,
      precio_distribuidor,
      activo,
      es_inventariable,
      mostrar_en_tienda,
      es_gamer,
    } = body;

    if (!referencia || !referencia.trim()) {
      return NextResponse.json({ ok: false, error: 'La referencia es obligatoria' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const inventariable = es_inventariable === undefined ? true : Boolean(es_inventariable);
    // El precio de costo es obligatorio para productos inventariables (para
    // poder calcular margen y valorizar el inventario); un servicio nunca
    // tiene precio de compra.
    if (inventariable && !(Number(precio_costo) > 0)) {
      return NextResponse.json(
        { ok: false, error: 'El precio de costo es obligatorio para un producto inventariable' },
        { status: 400 }
      );
    }
    const precioCostoFinal = inventariable ? Number(precio_costo) : null;

    const [producto] = await sql`
      INSERT INTO productos (
        referencia, nombre, descripcion, categoria_id, subcategoria_id,
        precio_venta, precio_costo, precio_distribuidor, activo, es_inventariable,
        mostrar_en_tienda, es_gamer
      )
      VALUES (
        ${referencia.trim()}, ${nombre.trim()}, ${descripcion || null},
        ${categoria_id || null}, ${subcategoria_id || null},
        ${precio_venta || null}, ${precioCostoFinal}, ${precio_distribuidor || null},
        ${activo === undefined ? true : activo}, ${inventariable},
        ${mostrar_en_tienda === undefined ? true : Boolean(mostrar_en_tienda)},
        ${Boolean(es_gamer)}
      )
      RETURNING id
    `;

    // Deja el producto con stock 0 en todas las bodegas existentes, para que
    // aparezca de una vez en compras/ventas sin importar la bodega elegida.
    // Los servicios (es_inventariable = false) no manejan stock, así que no
    // se les crean filas en la tabla stock.
    if (inventariable) {
      const bodegas = await sql`SELECT id FROM bodegas`;
      for (const bodega of bodegas) {
        await sql`
          INSERT INTO stock (producto_id, bodega_id, cantidad)
          VALUES (${producto.id}, ${bodega.id}, 0)
          ON CONFLICT (producto_id, bodega_id) DO NOTHING
        `;
      }
    }

    return NextResponse.json({ ok: true, producto });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un producto con esa referencia' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
