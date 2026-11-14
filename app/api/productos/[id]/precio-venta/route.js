import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { actualizarPrecioEnAlegra } from '../../../../../lib/alegraFacturacion';

// POST /api/productos/[id]/precio-venta  { precio_venta }
//
// Cambia SOLO el precio de venta de un producto que ya existe y lo deja
// igual en Alegra (nov 2026). Lo usa la factura de compra: al recibir
// mercancía con otro costo, Nelson ajusta ahí mismo el precio de venta.
//
// - El POS es el que manda: primero se guarda aquí; si Alegra falla, el
//   precio del POS queda cambiado y se devuelve el aviso (alegra.estado).
// - Si el producto tenía "precio antes" (oferta) y el nuevo precio lo
//   alcanza o lo pasa, la oferta se quita (ya no sería una rebaja).
// - Los productos de otra sede (Venecia) no se tocan: su precio lo manda
//   el POS de esa sede.
const MENSAJES = {
  'no-esta': 'El producto no existe en Alegra con esa referencia. Créalo desde Productos → Pendientes en Alegra.',
  'sin-precio': 'El producto no tiene precio de venta.',
  'no-confirmado': 'Alegra recibió el cambio pero sigue mostrando otro precio: revísalo en Alegra.',
};

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const productoId = Number(id) || 0;
    const body = await request.json().catch(() => ({}));
    const precio = Math.round(Number(body.precio_venta));
    if (!Number.isFinite(precio) || precio <= 0) {
      return NextResponse.json({ ok: false, error: 'Escribe un precio de venta mayor que cero' }, { status: 400 });
    }

    const [p] = await sql`
      SELECT id, referencia, precio_venta,
             to_jsonb(productos) ->> 'sede' AS sede,
             (to_jsonb(productos) ->> 'precio_anterior')::numeric AS precio_anterior
      FROM productos WHERE id = ${productoId}
    `;
    if (!p) return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    if (p.sede && p.sede !== 'kennedy') {
      return NextResponse.json({ ok: false, error: 'El precio de este producto lo maneja el POS de su sede' }, { status: 400 });
    }

    const antes = Number(p.precio_venta) || 0;
    if (antes !== precio) {
      await sql`UPDATE productos SET precio_venta = ${precio}, actualizado_en = now() WHERE id = ${productoId}`;
    }
    let ofertaQuitada = false;
    if (Number(p.precio_anterior) > 0 && Number(p.precio_anterior) <= precio) {
      await sql`UPDATE productos SET precio_anterior = NULL WHERE id = ${productoId}`;
      ofertaQuitada = true;
    }

    // Alegra: nunca tumba el cambio del POS; si falla, se avisa.
    let alegra;
    try {
      alegra = await actualizarPrecioEnAlegra(productoId);
      if (MENSAJES[alegra.estado]) alegra.motivo = MENSAJES[alegra.estado];
    } catch (error) {
      alegra = { estado: 'error', motivo: error.message };
    }
    const alegraOk = alegra.estado === 'actualizado' || alegra.estado === 'ya-estaba';

    return NextResponse.json({ ok: true, referencia: p.referencia, antes, precio_venta: precio, ofertaQuitada, alegra, alegraOk });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
