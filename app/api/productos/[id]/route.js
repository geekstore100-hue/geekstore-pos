import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
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
    } = body;

    if (!referencia || !referencia.trim()) {
      return NextResponse.json({ ok: false, error: 'La referencia es obligatoria' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const inventariable = es_inventariable === undefined ? true : Boolean(es_inventariable);
    // El precio de costo es obligatorio para productos inventariables (mismo
    // criterio que al crear uno, para que no se pueda vaciar después de
    // creado). Un servicio (es_inventariable = false) nunca tiene precio de
    // compra: se guarda siempre en null, sin importar lo que venga del formulario.
    if (inventariable && !(Number(precio_costo) > 0)) {
      return NextResponse.json(
        { ok: false, error: 'El precio de costo es obligatorio para un producto inventariable' },
        { status: 400 }
      );
    }
    const precioCostoFinal = inventariable ? Number(precio_costo) : null;

    const [producto] = await sql`
      UPDATE productos SET
        referencia = ${referencia.trim()},
        nombre = ${nombre.trim()},
        descripcion = ${descripcion || null},
        categoria_id = ${categoria_id || null},
        subcategoria_id = ${subcategoria_id || null},
        precio_venta = ${precio_venta || null},
        precio_costo = ${precioCostoFinal},
        precio_distribuidor = ${precio_distribuidor || null},
        activo = ${activo === undefined ? true : activo},
        es_inventariable = ${inventariable},
        actualizado_en = now()
      WHERE id = ${id}
      RETURNING id
    `;

    if (!producto) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }

    // Si quedó como servicio, no debe quedar cargando existencias: se borran
    // las filas de stock que tuviera (la venta ya no las va a mirar, pero
    // así tampoco quedan datos viejos e inconsistentes).
    if (!inventariable) {
      await sql`DELETE FROM stock WHERE producto_id = ${id}`;
    }

    return NextResponse.json({ ok: true, producto });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un producto con esa referencia' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
