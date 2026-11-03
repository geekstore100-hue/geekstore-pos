import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { asegurarSedes, sedeDeClave, cabecerasCors, limpiarCodigo, categoriaColeccionables, filaParaSede, DATOS_SEDES } from '../../../../../lib/sedes';
import { crearEnlaceSede } from '../../../../../lib/sesionSede';

export const dynamic = 'force-dynamic';

// POS de la sede → "Publicar en la web" / "Editar ficha web" (nov 2026).
// Header x-sede-clave. POST { codigo, nombre, precio, stock }
//   - Si el producto todavía no existe aquí, crea su ficha web (referencia
//     V-<codigo>, categoría Coleccionables, sin publicar hasta completarla).
//   - Si ya existe, actualiza precio y stock.
//   - Devuelve el producto y "enlace": abre el editor de este POS en modo
//     limitado (vale 15 minutos). Ver lib/sedes.js.
export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(request) });
}

export async function POST(request) {
  const cors = cabecerasCors(request);
  try {
    const sede = sedeDeClave(request);
    if (!sede) return NextResponse.json({ ok: false, error: 'Clave inválida' }, { status: 401, headers: cors });
    await asegurarSedes();
    const body = await request.json();
    const codigo = limpiarCodigo(body.codigo);
    if (!codigo) return NextResponse.json({ ok: false, error: 'Falta el código del producto' }, { status: 400, headers: cors });
    const nombre = String(body.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    const precio = Math.round(Number(body.precio) || 0);
    const stock = Math.max(0, Math.floor(Number(body.stock) || 0));

    let [p] = await sql`SELECT * FROM productos WHERE sede = ${sede} AND sede_codigo = ${codigo}`;
    if (!p) {
      if (!nombre) return NextResponse.json({ ok: false, error: 'Falta el nombre del producto' }, { status: 400, headers: cors });
      const cat = await categoriaColeccionables();
      const referencia = `${DATOS_SEDES[sede].prefijo}${codigo}`;
      [p] = await sql`
        INSERT INTO productos (referencia, nombre, categoria_id, precio_venta, precio_costo, activo, es_inventariable,
                               mostrar_en_tienda, es_gamer, sede, sede_codigo, sede_stock, sede_sincronizado_en)
        VALUES (${referencia}, ${nombre}, ${cat.id}, ${precio || null}, NULL, true, true,
                false, false, ${sede}, ${codigo}, ${stock}, now())
        RETURNING *
      `;
    } else {
      [p] = await sql`
        UPDATE productos SET
          precio_venta = CASE WHEN ${precio} > 0 THEN ${precio} ELSE precio_venta END,
          sede_stock = ${stock}, sede_sincronizado_en = now(), activo = true
        WHERE id = ${p.id}
        RETURNING *
      `;
    }
    const origen = new URL(request.url).origin;
    const t = await crearEnlaceSede(sede, p.id);
    return NextResponse.json(
      { ok: true, producto: filaParaSede(p, origen), enlace: `${origen}/api/publico/sedes/entrar?t=${encodeURIComponent(t)}` },
      { headers: cors }
    );
  } catch (error) {
    const msg = String(error.message).includes('duplicate key') ? 'Ya existe un producto con esa referencia' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: cors });
  }
}
