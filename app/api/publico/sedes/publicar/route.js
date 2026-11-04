import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { atenderSede, cabecerasCors, cuerpoJson, limpiarCodigo, categoriaColeccionables, filaParaSede, DATOS_SEDES } from '../../../../../lib/sedes';
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
  return atenderSede(request, 'publicar', async ({ sede, paso, responder }) => {
    const body = await cuerpoJson(request);
    if (!body || typeof body !== 'object') return responder(400, { ok: false, codigo: 'datos', error: 'Datos inválidos' });
    const codigo = limpiarCodigo(body.codigo);
    if (!codigo) return responder(400, { ok: false, codigo: 'datos', error: 'Falta el código del producto' });
    const nombre = String(body.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    const precio = Math.round(Number(body.precio) || 0);
    const stock = Math.max(0, Math.floor(Number(body.stock) || 0));

    paso('buscando el producto');
    let [p] = await sql`SELECT * FROM productos WHERE sede = ${sede} AND sede_codigo = ${codigo}`;
    if (!p) {
      if (!nombre) return responder(400, { ok: false, codigo: 'datos', error: 'Falta el nombre del producto' });
      paso('creando la ficha web');
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
      paso('actualizando precio y stock');
      [p] = await sql`
        UPDATE productos SET
          precio_venta = CASE WHEN ${precio} > 0 THEN ${precio} ELSE precio_venta END,
          sede_stock = ${stock}, sede_sincronizado_en = now(), activo = true
        WHERE id = ${p.id}
        RETURNING *
      `;
    }
    paso('creando el enlace al editor');
    const origen = new URL(request.url).origin;
    const t = await crearEnlaceSede(sede, p.id);
    return responder(200, {
      ok: true,
      producto: filaParaSede(p, origen),
      enlace: `${origen}/api/publico/sedes/entrar?t=${encodeURIComponent(t)}`,
    });
  });
}
