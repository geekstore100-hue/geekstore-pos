import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { claveValida } from '../../../../lib/distribuidores';
import { asegurarApartados, consultaLiberar } from '../../../../lib/apartadosWeb';
import { buscarProductosWeb, idLocalPedido } from '../../../../lib/pedidoWeb';

export const dynamic = 'force-dynamic';

// Apartados de pedidos web (ver lib/apartadosWeb.js). Solo la llama el
// servidor de la tienda, con el secreto compartido (x-distribuidor-clave).
//   POST { referencia, articulos, cliente }         → aparta (o vuelve a apartar)
//   POST { referencia, liberar: true, motivo }      → libera
//   GET  ?referencia=…                              → lo apartado de ese pedido

const REF_VALIDA = /^[A-Za-z0-9_-]{6,80}$/;

async function apartadosDe(referencia) {
  return sql`
    SELECT a.producto_id, a.cantidad, p.nombre, p.referencia
    FROM apartados_web a JOIN productos p ON p.id = a.producto_id
    WHERE a.referencia = ${referencia} AND a.liberado_en IS NULL
    ORDER BY a.id
  `;
}

export async function GET(request) {
  if (!claveValida(request)) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  try {
    const referencia = new URL(request.url).searchParams.get('referencia') || '';
    if (!REF_VALIDA.test(referencia)) return NextResponse.json({ ok: false, error: 'Referencia inválida' }, { status: 400 });
    await asegurarApartados();
    return NextResponse.json({ ok: true, lineas: await apartadosDe(referencia) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!claveValida(request)) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const referencia = String(body.referencia || '').trim();
    if (!REF_VALIDA.test(referencia)) return NextResponse.json({ ok: false, error: 'Referencia inválida' }, { status: 400 });
    await asegurarApartados();

    if (body.liberar === true) {
      await consultaLiberar(referencia, body.motivo || 'liberado desde la tienda');
      return NextResponse.json({ ok: true, liberado: true });
    }

    // Si el pedido ya quedó como venta en el POS, no hay nada que apartar
    // (las unidades ya se descontaron).
    const [venta] = await sql`SELECT id FROM ventas WHERE id_local = ${idLocalPedido(referencia)} AND anulada IS NOT TRUE`;
    if (venta) {
      await consultaLiberar(referencia, 'vendido');
      return NextResponse.json({ ok: true, yaVendido: true, ventaId: venta.id, lineas: [] });
    }

    const articulos = Array.isArray(body.articulos) ? body.articulos.filter((a) => Number(a?.cantidad) > 0) : [];
    if (!articulos.length) return NextResponse.json({ ok: false, error: 'El pedido no trae productos' }, { status: 400 });
    const { productoDe } = await buscarProductosWeb(articulos);

    // Cantidad por producto (sumando líneas repetidas). Los servicios no se apartan.
    const porProducto = new Map();
    const noEncontrados = [];
    for (const a of articulos) {
      const p = productoDe(a);
      if (!p) {
        noEncontrados.push(String(a.name || a.reference || a.id));
        continue;
      }
      if (p.es_inventariable === false) continue;
      const cantidad = Number(a.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) continue;
      const x = porProducto.get(Number(p.id)) || { producto: p, cantidad: 0 };
      x.cantidad += cantidad;
      porProducto.set(Number(p.id), x);
    }

    const cliente = String(body.cliente || '').trim().slice(0, 80) || null;
    // Se reemplaza lo que hubiera (así darle dos veces no aparta doble).
    const consultas = [consultaLiberar(referencia, 'reemplazado')];
    for (const [id, x] of porProducto) {
      consultas.push(sql`
        INSERT INTO apartados_web (referencia, producto_id, cantidad, cliente)
        VALUES (${referencia}, ${id}, ${x.cantidad}, ${cliente})
      `);
    }
    await sql.transaction(consultas);

    // Aviso (no bloquea): ¿alcanza en Principal para lo apartado?
    const ids = [...porProducto.keys()];
    const stock = ids.length
      ? await sql`
          SELECT s.producto_id, s.cantidad FROM stock s JOIN bodegas b ON b.id = s.bodega_id
          WHERE b.nombre = 'Principal' AND s.producto_id = ANY(${ids}::int[])
        `
      : [];
    const enPrincipal = new Map(stock.map((s) => [Number(s.producto_id), Number(s.cantidad)]));
    const faltan = [...porProducto.values()]
      .filter((x) => (enPrincipal.get(Number(x.producto.id)) || 0) < x.cantidad)
      .map((x) => `"${x.producto.nombre}": apartadas ${x.cantidad}, hay ${enPrincipal.get(Number(x.producto.id)) || 0} en Principal`);

    return NextResponse.json({
      ok: true,
      lineas: [...porProducto.values()].map((x) => ({ nombre: x.producto.nombre, referencia: x.producto.referencia, cantidad: x.cantidad })),
      ...(faltan.length ? { faltan } : {}),
      ...(noEncontrados.length ? { noEncontrados } : {}),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
