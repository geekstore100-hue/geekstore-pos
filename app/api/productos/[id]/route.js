import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { esUrlYoutubeValida } from '../../../../lib/youtube';
import { normalizarEspecificaciones } from '../../../../lib/especificaciones';
import { guardarPrecioAnterior } from '../../../../lib/precioAnterior';
import { altoDeFicha, esCategoriaColeccionable, MENSAJE_FALTA_ALTO } from '../../../../lib/figuras';
import { categoriaColeccionables } from '../../../../lib/sedes';

// Edición desde la sesión limitada de una sede (Venecia, ver lib/sedes.js):
// solo sus productos y solo la ficha web — nombre, descripción, subcategoría
// (de Coleccionables), ficha técnica (con el alto), Zona Gamer, video y si
// se publica. El precio y el stock los manda su POS; la referencia no cambia.
async function guardarDeSede(sede, id, body) {
  const [p] = await sql`SELECT id, to_jsonb(productos) ->> 'sede' AS sede FROM productos WHERE id = ${id}`;
  if (!p || p.sede !== sede) return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
  const descripcion = String(body.descripcion || '');
  if (descripcion.length > 600) return NextResponse.json({ ok: false, error: 'La descripción no puede pasar de 600 caracteres' }, { status: 400 });
  if (!esUrlYoutubeValida(body.video_youtube)) {
    return NextResponse.json({ ok: false, error: 'Pon un enlace válido de YouTube (youtube.com o youtu.be)' }, { status: 400 });
  }
  const especificaciones = normalizarEspecificaciones(body.especificaciones);
  if (!altoDeFicha(especificaciones)) return NextResponse.json({ ok: false, error: MENSAJE_FALTA_ALTO }, { status: 400 });
  const cat = await categoriaColeccionables();
  let subId = Number(body.subcategoria_id) || null;
  if (subId) {
    const [sc] = await sql`SELECT id FROM subcategorias WHERE id = ${subId} AND categoria_id = ${cat.id}`;
    if (!sc) subId = null;
  }
  const [producto] = await sql`
    UPDATE productos SET
      nombre = ${nombre.slice(0, 150)}, descripcion = ${descripcion || null}, categoria_id = ${cat.id}, subcategoria_id = ${subId},
      -- Venecia (nov 2026): sus coleccionables siempre van publicados y
      -- nunca son Zona Gamer (el editor ya no muestra esas casillas).
      mostrar_en_tienda = true, es_gamer = false,
      video_youtube = ${String(body.video_youtube || '').trim() || null},
      especificaciones = ${especificaciones ? JSON.stringify(especificaciones) : null}::jsonb, actualizado_en = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return NextResponse.json({ ok: true, producto });
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    // Sesión de una sede, o el administrador editando un producto de una sede:
    // en los dos casos solo se edita la ficha web (precio y stock los manda
    // el POS de la sede; no tiene costo ni va a Alegra).
    let sede = request.headers.get('x-pos-sede');
    if (!sede) {
      const [p] = await sql`SELECT to_jsonb(productos) ->> 'sede' AS sede FROM productos WHERE id = ${Number(id) || 0}`;
      if (p?.sede && p.sede !== 'kennedy') sede = p.sede;
    }
    if (sede) return guardarDeSede(sede, Number(id), body);
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
      video_youtube,
    } = body;
    // Ficha técnica (ver lib/especificaciones.js). Si quien llama no manda
    // "especificaciones" (otra pantalla que solo edita algunos campos), se
    // deja la que ya estaba; si la manda (aunque sea vacía), se reemplaza.
    const traeEspecificaciones = Object.prototype.hasOwnProperty.call(body, 'especificaciones');
    const especificaciones = normalizarEspecificaciones(body.especificaciones);
    const especificacionesJson = especificaciones ? JSON.stringify(especificaciones) : null;

    if (!referencia || !referencia.trim()) {
      return NextResponse.json({ ok: false, error: 'La referencia es obligatoria' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }
    if (descripcion && descripcion.length > 600) {
      return NextResponse.json({ ok: false, error: 'La descripción no puede pasar de 600 caracteres' }, { status: 400 });
    }
    if (!esUrlYoutubeValida(video_youtube)) {
      return NextResponse.json({ ok: false, error: 'Pon un enlace válido de YouTube (youtube.com o youtu.be)' }, { status: 400 });
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

    // Coleccionables (nov 2026): el alto de la figura es obligatorio.
    if (traeEspecificaciones && categoria_id && !altoDeFicha(especificaciones)) {
      const [cat] = await sql`SELECT nombre FROM categorias WHERE id = ${categoria_id}`;
      if (esCategoriaColeccionable(cat?.nombre)) {
        return NextResponse.json({ ok: false, error: MENSAJE_FALTA_ALTO }, { status: 400 });
      }
    }

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
        mostrar_en_tienda = ${mostrar_en_tienda === undefined ? true : Boolean(mostrar_en_tienda)},
        es_gamer = ${Boolean(es_gamer)},
        video_youtube = ${video_youtube?.trim() || null},
        especificaciones = CASE WHEN ${traeEspecificaciones} THEN ${especificacionesJson}::jsonb ELSE especificaciones END,
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

    // "Precio antes" (oferta en la tienda): solo si la pantalla lo manda
    // (otras pantallas que editan solo algunos campos no lo borran).
    let avisoPrecioAnterior = null;
    if (Object.prototype.hasOwnProperty.call(body, 'precio_anterior')) {
      const r = await guardarPrecioAnterior(producto.id, body.precio_anterior, precio_venta);
      if (!r.ok) avisoPrecioAnterior = r.aviso;
    }

    return NextResponse.json({ ok: true, producto, ...(avisoPrecioAnterior ? { aviso: avisoPrecioAnterior } : {}) });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un producto con esa referencia' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
