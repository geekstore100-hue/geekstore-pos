// lib/pedidoWeb.js — pedidos de la tienda online como VENTAS del POS (nov 2026).
//
// Antes, un pedido pagado en geekstore.com.co solo se facturaba en Alegra
// (factura electrónica) y el inventario del POS no se enteraba: había que
// venderlo a mano en la caja. Ahora el botón "Facturar" del admin de la
// tienda también lo registra aquí como una venta:
//   - canal "Tienda web" (columna evento): NO entra al turno de caja (el
//     dinero llegó por Wompi, no a la caja) y sale aparte en Reportes;
//   - cada producto se descuenta SOLO de Principal (Nelson, nov 2026). Si
//     no alcanza, no se registra nada y se avisa qué falta y si está en
//     otra bodega (ej. Bodega Distribuidor), para hacer el traslado o el
//     ajuste a Principal y volver a intentar;
//   - el cupón se reparte como descuento en las líneas. El envío NO entra
//     (Nelson, nov 2026): en el POS solo cuenta el valor de los productos;
//   - si se manda dos veces el mismo pedido, NO se registra dos veces
//     (id_local = "web:<referencia>").

import sql from './db';
import { BODEGA_EXCLUIDA, ErrorVenta } from './ventaRapida';

export const CANAL_WEB = 'Tienda web';

export function idLocalPedido(referencia) {
  return `web:${String(referencia || '').trim()}`.slice(0, 80);
}

// Wompi: CARD = tarjeta; PSE, NEQUI, BANCOLOMBIA_TRANSFER… = transferencia.
export function medioDeWompi(metodo) {
  return /card|tarjeta/i.test(String(metodo || '')) ? 'Tarjeta' : 'Transferencia';
}

// Busca en el POS los productos de un pedido de la tienda (ver abajo, en
// prepararPedidoWeb, por qué
// NO se usa el id interno del POS). La usan la venta web y los apartados.
export async function buscarProductosWeb(articulos = []) {
  const refs = [...new Set(articulos.map((a) => String(a.reference || '').trim()).filter(Boolean))];
  const idsTienda = [...new Set(articulos.map((a) => String(a.id ?? '').trim()).filter(Boolean))];
  const productos = await sql`
    SELECT id, referencia, nombre, precio_venta, es_inventariable, activo,
           (to_jsonb(p) ->> 'alegra_id') AS alegra_id
    FROM productos p
    WHERE referencia = ANY(${refs}::text[])
       OR referencia = ANY(${idsTienda}::text[])
       OR (to_jsonb(p) ->> 'alegra_id') = ANY(${idsTienda}::text[])
    ORDER BY activo DESC NULLS LAST, id DESC
  `;
  // Si hubiera repetidos, gana el activo (y el más nuevo): se guarda el primero.
  const primero = (mapa, clave, p) => { if (clave && !mapa.has(clave)) mapa.set(clave, p); };
  const porRef = new Map();
  const porAlegra = new Map();
  for (const p of productos) {
    primero(porRef, String(p.referencia || '').trim(), p);
    primero(porAlegra, String(p.alegra_id || '').trim(), p);
  }
  const productoDe = (a) => {
    const ref = String(a.reference || '').trim();
    const id = String(a.id ?? '').trim();
    return (ref && porRef.get(ref)) || (id && porAlegra.get(id)) || (id && porRef.get(id)) || null;
  };
  return { productos, productoDe };
}

// Arma la venta (sin guardar nada). Lanza ErrorVenta con un mensaje claro.
export async function prepararPedidoWeb(pedido = {}) {
  const referencia = String(pedido.referencia || '').trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(referencia)) throw new ErrorVenta('Referencia de pedido inválida');
  const articulos = Array.isArray(pedido.articulos) ? pedido.articulos.filter((a) => Number(a?.cantidad) > 0) : [];
  if (!articulos.length) throw new ErrorVenta('El pedido no trae productos');

  // Producto del POS (corregido nov 2026). OJO: el "id" que manda la tienda
  // NO es el id del POS: el catálogo público usa alegra_id (o la referencia
  // si no tiene). Antes se buscaba por id del POS y un pedido con el cable
  // de alegra_id 3325 terminaba buscando el producto 3325 del POS (otro
  // producto: un radio). Ahora, en este orden: la referencia (igual que la
  // factura de Alegra), el alegra_id, y la referencia = id (productos sin
  // alegra_id). Nunca el id interno del POS.
  const { productos, productoDe } = await buscarProductosWeb(articulos);

  const bodegas = await sql`SELECT id, nombre FROM bodegas`;
  const principal = bodegas.find((b) => b.nombre === 'Principal');
  if (!principal) throw new ErrorVenta('No existe la bodega Principal en el POS', 500);
  const prodIds = productos.map((p) => Number(p.id));
  const stock = prodIds.length ? await sql`SELECT producto_id, bodega_id, cantidad FROM stock WHERE producto_id = ANY(${prodIds}::int[])` : [];
  const disp = new Map(stock.map((s) => [`${s.producto_id}:${s.bodega_id}`, Number(s.cantidad)]));

  const subtotal = articulos.reduce((s, a) => s + Math.round(Number(a.price) || 0) * Number(a.cantidad), 0);
  const descuentoCupon = Math.max(0, Math.min(Math.round(Number(pedido.descuento) || 0), subtotal));
  const pctCupon = subtotal > 0 ? Math.round((descuentoCupon / subtotal) * 1000000) / 10000 : 0;

  const lineas = [];
  const faltan = [];
  for (const a of articulos) {
    const p = productoDe(a);
    if (!p) {
      faltan.push(`"${a.name || a.reference || a.id}" no existe en el POS`);
      continue;
    }
    const cantidad = Number(a.cantidad);
    if (!Number.isInteger(cantidad) || cantidad > 999) throw new ErrorVenta(`Cantidad inválida en "${p.nombre}"`);
    const precioWeb = Math.round(Number(a.price) || 0);
    const precio = Math.round(precioWeb * (1 - pctCupon / 100) * 100) / 100;
    const base = { producto_id: Number(p.id), nombre: p.nombre, referencia: p.referencia, precio, descuento: pctCupon };
    if (p.es_inventariable === false) {
      lineas.push({ ...base, inventariable: false, cantidad, bodega_id: principal?.id, bodega_nombre: principal?.nombre });
      continue;
    }
    // Solo de Principal.
    const k = `${p.id}:${principal.id}`;
    const hay = Math.max(0, disp.get(k) || 0);
    if (hay >= cantidad) {
      lineas.push({ ...base, inventariable: true, cantidad, bodega_id: Number(principal.id), bodega_nombre: principal.nombre });
      disp.set(k, hay - cantidad);
    } else {
      // ¿Dónde están las que faltan? (para saber si es traslado o ajuste)
      const enOtras = bodegas
        .filter((b) => Number(b.id) !== Number(principal.id) && b.nombre !== BODEGA_EXCLUIDA)
        .map((b) => ({ nombre: b.nombre, n: Math.max(0, disp.get(`${p.id}:${b.id}`) || 0) }))
        .filter((x) => x.n > 0);
      const dondeHay = enOtras.length ? ` En otras bodegas hay: ${enOtras.map((x) => `${x.n} en ${x.nombre}`).join(', ')} → trasládalas a Principal.` : ' Tampoco hay en otras bodegas → haz un ajuste de inventario o reabastece Principal.';
      faltan.push(`"${p.nombre}" (ref. ${p.referencia}): se necesitan ${cantidad} en Principal y hay ${hay}.${dondeHay}`);
    }
  }
  if (faltan.length) throw new ErrorVenta(`No se registró en el POS (se factura siempre desde Principal). ${faltan.join(' ')} Luego dale otra vez.`, 409);

  // Total = valor de los productos (con el cupón), sin el envío.
  const totalFinal = Math.round(lineas.reduce((s, l) => s + l.precio * l.cantidad, 0));

  const cliente = pedido.cliente || {};
  const telefono = String(cliente.celular || '').replace(/\D/g, '');
  return {
    referencia,
    idLocal: idLocalPedido(referencia),
    lineas,
    total: totalFinal,
    medioPago: medioDeWompi(pedido.metodo),
    clienteNombre: String(cliente.nombre || '').trim().slice(0, 120) || null,
    clienteTelefono: telefono ? (telefono.length === 10 && telefono.startsWith('3') ? `57${telefono}` : telefono).slice(0, 20) : null,
    fecha: (() => {
      const f = new Date(pedido.fecha || '');
      return Number.isNaN(f.getTime()) || f.getTime() > Date.now() + 60000 ? null : f.toISOString();
    })(),
    nota: `Pedido web ${referencia}`,
  };
}
