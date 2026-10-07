import sql from './db';

// Venta rápida desde el celular (octubre 2026) — ver
// app/api/ventas/rapida/route.js y app/ventas/rapida/page.js.
//
// Dos modos:
//   - 'evento' (ej. SOFA 2026): la venta NO entra a ningún turno de caja
//     (turno_id vacío) y queda marcada con el nombre del evento.
//   - 'tienda': igual que una venta normal, dentro del turno abierto.
// En los dos, cada producto sale de la bodega que se elija (Principal o
// Bodega Distribuidor).

export const MEDIOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'];
export const BODEGA_EXCLUIDA = 'Garantías con Proveedor';

export const MENSAJE_MIGRACION =
  'Falta correr migracion_ventas_evento.sql en Neon (SQL Editor) para poder usar la venta rápida.';

export class ErrorVenta extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

let migracionLista = false;
export async function migracionVentasEvento() {
  if (migracionLista) return true;
  const [fila] = await sql`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name IN ('evento', 'id_local', 'cliente_nombre', 'cliente_telefono')
  `;
  migracionLista = fila?.n === 4;
  return migracionLista;
}

// Deja solo dígitos; un celular colombiano de 10 dígitos (3xx...) queda
// con el 57 adelante, listo para wa.me.
export function normalizarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = `57${d}`;
  return d.length >= 7 && d.length <= 15 ? d : '';
}

// Valida y arma la venta. NO escribe nada.
export async function prepararVentaRapida(body = {}) {
  const modo = body.modo === 'tienda' ? 'tienda' : body.modo === 'evento' ? 'evento' : null;
  if (!modo) throw new ErrorVenta('Modo de venta inválido');

  const evento = modo === 'evento' ? String(body.evento || '').trim().slice(0, 60) : null;
  if (modo === 'evento' && !evento) throw new ErrorVenta('Escribe el nombre del evento (ej. SOFA 2026)');

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ErrorVenta('Agrega al menos un producto');
  if (items.length > 60) throw new ErrorVenta('Demasiados productos en una sola venta');

  const bodegas = await sql`SELECT id, nombre FROM bodegas`;
  const bodegaPorId = new Map(bodegas.map((b) => [Number(b.id), b]));
  const principal = bodegas.find((b) => b.nombre === 'Principal');

  const ids = [...new Set(items.map((i) => Number(i.producto_id)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new ErrorVenta('Producto inválido');
  const productos = await sql`
    SELECT p.id, p.nombre, p.referencia, p.precio_venta, p.es_inventariable
    FROM productos p WHERE p.id = ANY(${ids}::int[])
  `;
  const prodPorId = new Map(productos.map((p) => [Number(p.id), p]));

  const lineas = [];
  for (const it of items) {
    const p = prodPorId.get(Number(it.producto_id));
    if (!p) throw new ErrorVenta('Uno de los productos ya no existe');
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) throw new ErrorVenta(`Cantidad inválida en "${p.nombre}"`);
    const precio = Math.round(Number(it.precio_unitario));
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorVenta(`Precio inválido en "${p.nombre}"`);
    const bodegaId = Number(it.bodega_id) || principal?.id;
    const bodega = bodegaPorId.get(Number(bodegaId));
    if (!bodega || bodega.nombre === BODEGA_EXCLUIDA) throw new ErrorVenta(`Elige la bodega de "${p.nombre}"`);
    const precioLista = Number(p.precio_venta) || 0;
    const descuento = precioLista > 0 && precio < precioLista ? Math.round((1 - precio / precioLista) * 10000) / 100 : 0;
    lineas.push({
      producto_id: Number(p.id),
      nombre: p.nombre,
      referencia: p.referencia,
      inventariable: p.es_inventariable !== false,
      cantidad,
      precio,
      descuento,
      subtotal: precio * cantidad,
      bodega_id: Number(bodega.id),
      bodega_nombre: bodega.nombre,
    });
  }

  // Stock suficiente por producto Y bodega (sumando líneas repetidas).
  const pedido = new Map();
  for (const l of lineas) {
    if (!l.inventariable) continue;
    const k = `${l.producto_id}:${l.bodega_id}`;
    pedido.set(k, (pedido.get(k) || 0) + l.cantidad);
  }
  if (pedido.size) {
    const prodIds = [...new Set(lineas.filter((l) => l.inventariable).map((l) => l.producto_id))];
    const stock = await sql`SELECT producto_id, bodega_id, cantidad FROM stock WHERE producto_id = ANY(${prodIds}::int[])`;
    const disp = new Map(stock.map((s) => [`${s.producto_id}:${s.bodega_id}`, Number(s.cantidad)]));
    for (const [k, cant] of pedido) {
      const hay = disp.get(k) || 0;
      if (hay < cant) {
        const l = lineas.find((x) => `${x.producto_id}:${x.bodega_id}` === k);
        throw new ErrorVenta(`No alcanza "${l.nombre}" en ${l.bodega_nombre}: hay ${hay} y se necesitan ${cant}.`, 409);
      }
    }
  }

  const total = lineas.reduce((a, l) => a + l.subtotal, 0);

  // Pagos: uno solo o combinado.
  let pagos;
  if (Array.isArray(body.pagos) && body.pagos.length > 0) {
    pagos = body.pagos.map((p) => ({ medio_pago: p.medio_pago, monto: Math.round(Number(p.monto)) }));
    if (pagos.some((p) => !MEDIOS_PAGO.includes(p.medio_pago) || !(p.monto > 0))) throw new ErrorVenta('Revisa los montos del pago combinado');
    const suma = pagos.reduce((a, p) => a + p.monto, 0);
    if (Math.abs(suma - total) > 1) throw new ErrorVenta(`Los pagos (${suma}) no suman el total (${total})`);
  } else {
    if (!MEDIOS_PAGO.includes(body.medio_pago)) throw new ErrorVenta('Elige el medio de pago');
    pagos = [{ medio_pago: body.medio_pago, monto: total }];
  }
  const medioPago = [...new Set(pagos.map((p) => p.medio_pago))].join(' + ');

  let fecha = null;
  if (body.fecha_offline) {
    const f = new Date(body.fecha_offline);
    // Solo fechas razonables (no futuras, máximo 7 días atrás).
    if (!Number.isNaN(f.getTime()) && f.getTime() <= Date.now() + 60000 && f.getTime() > Date.now() - 7 * 864e5) fecha = f.toISOString();
  }

  const idLocal = String(body.id_local || '').trim().slice(0, 80) || null;

  return {
    modo,
    evento,
    lineas,
    total,
    pagos,
    medioPago,
    vendedorId: Number(body.vendedor_id) || null,
    clienteNombre: String(body.cliente_nombre || '').trim().slice(0, 80) || null,
    clienteTelefono: normalizarTelefono(body.cliente_telefono) || null,
    fecha,
    idLocal,
  };
}
