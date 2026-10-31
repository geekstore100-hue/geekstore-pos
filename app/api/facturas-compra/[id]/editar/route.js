import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { descontarStockSeguro, sumarStock, esErrorDeGuardia } from '../../../../../lib/transaccion';

export const dynamic = 'force-dynamic';

// EDITAR una factura de compra ya guardada (oct 2026).
//
// POST { aplicar: false, ...cambios } → vista previa (no guarda nada).
// POST { aplicar: true,  ...cambios } → guarda todo en una sola transacción.
//
// cambios: { numero, proveedor_id, fecha_creacion, fecha_vencimiento, notas,
//            items: [{ mov_id?, producto_id, cantidad, precio, descuento_porcentaje }] }
//   - mov_id: la línea que ya existía (se actualiza). Sin mov_id: línea nueva.
//   - Las líneas que no vengan se quitan de la factura.
//   - La bodega no se cambia aquí.
//
// Qué hace con el inventario, producto por producto:
//   STOCK: suma o resta la diferencia de unidades en la bodega de la factura.
//     Si hay que restar y en esa bodega ya no quedan (se vendieron), no deja.
//   COSTO PROMEDIO: lo recalcula como si la factura se hubiera guardado bien
//     desde el principio:
//       unidades justo después de la factura = stock hoy − lo que entró después
//                                              + lo que salió después
//       valor antes de la factura = costo hoy × unidades después − valor de la factura vieja
//       costo nuevo = (valor antes + valor de la factura corregida)
//                     / (unidades antes + unidades corregidas)
//     y corrige el costo guardado de las ventas hechas después.
//     Si el producto tuvo OTRA compra o entrada después, el promedio ya se
//     mezcló: se corrige el stock pero el costo no (se avisa para revisarlo a
//     mano en Productos).
//   El costo usa el precio CON descuento. Si la factura es de antes del
//   arreglo de descuentos (oct 2026), al recalcular también queda corregido.

const ENTRAN = ['entrada', 'ajuste_incremento', 'factura_compra', 'garantia_entrada', 'garantia_eliminada_entrada'];
const SALEN = ['ajuste_disminucion', 'disminuir', 'garantia_salida', 'garantia_eliminada'];

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const neto = (precio, desc) => r2(Number(precio) * (1 - (Number(desc) || 0) / 100));

class ErrorEdicion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

async function asegurarColumnas() {
  await sql`ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS descuento_en_costo BOOLEAN`;
  await sql`ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC`;
}

function leerCambios(body) {
  const proveedor_id = Number(body.proveedor_id);
  if (!proveedor_id) throw new ErrorEdicion('Selecciona el proveedor');
  const fecha_creacion = String(body.fecha_creacion || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_creacion)) throw new ErrorEdicion('La fecha de creación es obligatoria');
  const fv = String(body.fecha_vencimiento || '').slice(0, 10);
  const items = [];
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const producto_id = Number(it.producto_id);
    const cantidad = Number(it.cantidad);
    const precio = Number(it.precio);
    const descuento_porcentaje = Number(it.descuento_porcentaje) || 0;
    if (!producto_id || !(cantidad > 0) || !Number.isInteger(cantidad)) throw new ErrorEdicion('Hay un producto con una cantidad inválida');
    if (!(precio > 0)) throw new ErrorEdicion('Hay un producto sin precio de compra');
    if (descuento_porcentaje < 0 || descuento_porcentaje >= 100) throw new ErrorEdicion('Hay un descuento inválido');
    items.push({ mov_id: Number(it.mov_id) || null, producto_id, cantidad, precio, descuento_porcentaje });
  }
  if (!items.length) throw new ErrorEdicion('La factura debe tener al menos un producto');
  return {
    numero: String(body.numero || '').trim() || null,
    proveedor_id,
    fecha_creacion,
    fecha_vencimiento: /^\d{4}-\d{2}-\d{2}$/.test(fv) ? fv : null,
    notas: String(body.notas || '').trim() || null,
    items,
  };
}

// Arma el plan (lo que cambiaría) sin tocar nada.
async function planear(id, body) {
  await asegurarColumnas();
  const [factura] = await sql`SELECT * FROM facturas_compra WHERE id = ${id}`;
  if (!factura) throw new ErrorEdicion('Factura no encontrada', 404);
  const c = leerCambios(body);

  const [prov] = await sql`SELECT id, nombre FROM proveedores WHERE id = ${c.proveedor_id}`;
  if (!prov) throw new ErrorEdicion('El proveedor seleccionado ya no existe', 404);

  const viejas = await sql`
    SELECT id AS mov_id, producto_id, cantidad, precio_unitario, descuento_porcentaje, creado_en
    FROM movimientos_stock
    WHERE tipo = 'factura_compra' AND factura_compra_id = ${id}
    ORDER BY id
  `;
  if (!viejas.length) throw new ErrorEdicion('Esta factura no tiene productos registrados', 409);
  const ancla = viejas[0];
  const porMov = new Map(viejas.map((v) => [Number(v.mov_id), v]));

  // Líneas: se conservan (mismo mov_id y mismo producto), nuevas o quitadas.
  const usadas = new Set();
  const lineas = c.items.map((it) => {
    const v = it.mov_id ? porMov.get(it.mov_id) : null;
    if (v && Number(v.producto_id) === it.producto_id && !usadas.has(it.mov_id)) {
      usadas.add(it.mov_id);
      return { ...it, accion: 'actualizar' };
    }
    return { ...it, mov_id: null, accion: 'insertar' };
  });
  const quitadas = viejas.filter((v) => !usadas.has(Number(v.mov_id)));

  // Precio que se usó para el costo en la factura vieja.
  const descEnCosto = factura.descuento_en_costo === true;
  const costoViejo = (v) => (descEnCosto ? neto(v.precio_unitario, v.descuento_porcentaje) : Number(v.precio_unitario));

  const ids = [...new Set([...viejas.map((v) => Number(v.producto_id)), ...lineas.map((l) => l.producto_id)])];
  const productos = await sql`
    SELECT p.id, p.referencia, p.nombre, p.precio_costo, p.es_inventariable,
           (SELECT COALESCE(SUM(s.cantidad), 0) FROM stock s WHERE s.producto_id = p.id) AS stock_total,
           (SELECT COALESCE(SUM(s.cantidad), 0) FROM stock s WHERE s.producto_id = p.id AND s.bodega_id = ${factura.bodega_id}) AS stock_bodega
    FROM productos p WHERE p.id = ANY(${ids})
  `;
  const prodPor = new Map(productos.map((p) => [Number(p.id), p]));
  for (const l of lineas) {
    const p = prodPor.get(l.producto_id);
    if (!p) throw new ErrorEdicion('Uno de los productos ya no existe', 404);
    if (l.accion === 'insertar' && p.es_inventariable === false) {
      throw new ErrorEdicion(`"${p.nombre}" es un servicio y no maneja inventario`);
    }
  }

  const resumen = [];
  const errores = [];
  for (const pid of ids) {
    const p = prodPor.get(pid);
    const old = viejas.filter((v) => Number(v.producto_id) === pid);
    const nue = lineas.filter((l) => l.producto_id === pid);
    const qOld = old.reduce((a, v) => a + Number(v.cantidad), 0);
    const vOld = old.reduce((a, v) => a + Number(v.cantidad) * costoViejo(v), 0);
    const qNew = nue.reduce((a, l) => a + l.cantidad, 0);
    const vNew = nue.reduce((a, l) => a + l.cantidad * neto(l.precio, l.descuento_porcentaje), 0);
    const dq = qNew - qOld;
    const cambiaValor = Math.abs(vNew - vOld) > 0.005 || dq !== 0;
    const stockBodega = Number(p.stock_bodega);
    const costoHoy = Number(p.precio_costo) || 0;

    const fila = {
      producto_id: pid,
      referencia: p.referencia,
      nombre: p.nombre,
      cantidad_antes: qOld,
      cantidad_despues: qNew,
      stock_bodega_antes: stockBodega,
      stock_bodega_despues: stockBodega + dq,
      costo_actual: costoHoy,
      costo_nuevo: costoHoy,
      ventas_corregidas: 0,
      recalcula_costo: false,
      aviso: '',
    };

    if (dq < 0 && stockBodega + dq < 0) {
      errores.push(`${p.referencia || ''} ${p.nombre}: en la bodega de la factura quedan ${stockBodega} unidades y habría que sacar ${-dq}. Ya se vendieron o se movieron.`.trim());
    }

    if (cambiaValor && p.es_inventariable !== false) {
      // Movimientos de este producto después de la factura (sin contar los de
      // la misma factura).
      const despues = await sql`
        SELECT m.tipo, COALESCE(SUM(m.cantidad), 0) AS cantidad, COUNT(*) AS n
        FROM movimientos_stock m
        LEFT JOIN ventas v ON v.id = m.venta_id
        WHERE m.producto_id = ${pid} AND m.id > ${ancla.mov_id}
          AND NOT (m.tipo = 'factura_compra' AND m.factura_compra_id = ${id})
          AND (m.tipo <> 'venta' OR COALESCE(v.anulada, false) = false)
        GROUP BY m.tipo
      `;
      const por = Object.fromEntries(despues.map((x) => [x.tipo, { cantidad: Number(x.cantidad), n: Number(x.n) }]));
      const comprasDespues = (por.factura_compra?.n || 0) + (por.entrada?.n || 0);
      // Devoluciones de clientes: reponen stock sin movimiento.
      let devueltas = 0;
      try {
        const [d] = await sql`SELECT COALESCE(SUM(cantidad), 0) AS n FROM devoluciones WHERE producto_id = ${pid} AND creado_en > ${ancla.creado_en}`;
        devueltas = Number(d?.n) || 0;
      } catch {
        devueltas = 0;
      }
      const entraron = ENTRAN.reduce((a, t) => a + (por[t]?.cantidad || 0), 0) + devueltas;
      const salieron = SALEN.reduce((a, t) => a + (por[t]?.cantidad || 0), 0) + (por.venta?.cantidad || 0);
      const despuesFactura = Number(p.stock_total) - entraron + salieron; // unidades justo después (versión vieja)
      const antesFactura = Math.max(0, despuesFactura - qOld);

      if (comprasDespues) {
        fila.aviso = 'Tuvo otra compra después: se corrige el stock, pero el costo revísalo a mano en Productos.';
      } else if (despuesFactura < qOld - 0.0001) {
        fila.aviso = 'El historial de este producto no cuadra: se corrige el stock, pero el costo revísalo a mano en Productos.';
      } else {
        const valorAntes = Math.max(0, costoHoy * despuesFactura - vOld);
        const unidades = antesFactura + qNew;
        const nuevo = unidades > 0 ? (valorAntes + vNew) / unidades : costoHoy;
        fila.costo_nuevo = r4(nuevo);
        fila.recalcula_costo = Math.abs(fila.costo_nuevo - costoHoy) > 0.00005;
        fila.ventas_corregidas = fila.recalcula_costo ? por.venta?.n || 0 : 0;
      }
    }
    if (dq !== 0 || cambiaValor || fila.aviso) resumen.push(fila);
  }

  const subtotal = r2(lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento_porcentaje / 100), 0));
  const subtotalViejo = Number(factura.subtotal) || 0;
  // Si la retención se había calculado sobre todo el subtotal, se actualiza
  // sola; si la base se escribió a mano distinta, se deja.
  const pct = Number(factura.retencion_porcentaje) || 0;
  let retencion = null;
  if (pct > 0 && Math.abs(Number(factura.retencion_base) - subtotalViejo) < 1 && Math.abs(subtotal - subtotalViejo) >= 1) {
    retencion = { base: subtotal, valor: r2(subtotal * (pct / 100)) };
  }
  // La marca "descuento ya en el costo" queda puesta si ningún producto con
  // descuento se quedó sin recalcular.
  const pendientes = new Set(resumen.filter((f) => f.aviso).map((f) => f.producto_id));
  const hayDescuentoPendiente = lineas.some((l) => l.descuento_porcentaje > 0 && pendientes.has(l.producto_id));
  const marcaDescuento = descEnCosto || !hayDescuentoPendiente;

  return {
    factura,
    cambios: c,
    lineas,
    quitadas,
    resumen,
    errores,
    totales: {
      subtotal_antes: subtotalViejo,
      subtotal_despues: subtotal,
      retencion_antes: Number(factura.retencion_valor) || 0,
      retencion_despues: retencion ? retencion.valor : Number(factura.retencion_valor) || 0,
      retencion_actualizada: Boolean(retencion),
      pagada: factura.estado_pago === 'pagada',
    },
    retencion,
    marcaDescuento,
    ancla,
  };
}

export async function POST(request, { params }) {
  try {
    const { id: idTexto } = await params;
    const id = Number(idTexto);
    if (!id) return NextResponse.json({ ok: false, error: 'Factura inválida' }, { status: 400 });
    const body = await request.json();
    const plan = await planear(id, body);
    const vista = {
      resumen: plan.resumen,
      errores: plan.errores,
      totales: plan.totales,
      lineas_nuevas: plan.lineas.filter((l) => l.accion === 'insertar').length,
      lineas_quitadas: plan.quitadas.length,
    };
    if (!body.aplicar) return NextResponse.json({ ok: true, vista });
    if (plan.errores.length) return NextResponse.json({ ok: false, error: plan.errores.join(' '), vista }, { status: 409 });

    const { factura, cambios: c } = plan;
    const bodega = factura.bodega_id;
    const q = [];
    // 1) Stock por producto (si hay que restar, solo si alcanza).
    for (const f of plan.resumen) {
      const dq = f.cantidad_despues - f.cantidad_antes;
      if (dq > 0) q.push(sumarStock(f.producto_id, bodega, dq));
      if (dq < 0) q.push(descontarStockSeguro(f.producto_id, bodega, -dq));
    }
    // 2) Costo promedio y costo de las ventas hechas después.
    for (const f of plan.resumen) {
      if (!f.recalcula_costo) continue;
      const delta = f.costo_nuevo - f.costo_actual;
      q.push(sql`UPDATE productos SET precio_costo = ${f.costo_nuevo} WHERE id = ${f.producto_id}`);
      q.push(sql`
        UPDATE movimientos_stock SET costo_unitario = GREATEST(0, costo_unitario + ${delta})
        WHERE tipo = 'venta' AND producto_id = ${f.producto_id} AND id > ${plan.ancla.mov_id} AND costo_unitario IS NOT NULL
      `);
    }
    // 3) Líneas de la factura.
    for (const v of plan.quitadas) q.push(sql`DELETE FROM movimientos_stock WHERE id = ${v.mov_id}`);
    for (const l of plan.lineas) {
      if (l.accion === 'actualizar') {
        q.push(sql`
          UPDATE movimientos_stock SET cantidad = ${l.cantidad}, precio_unitario = ${l.precio}, descuento_porcentaje = ${l.descuento_porcentaje}
          WHERE id = ${l.mov_id}
        `);
      } else {
        q.push(sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, factura_compra_id)
          VALUES (${l.producto_id}, ${bodega}, 'factura_compra', ${l.cantidad}, ${l.precio}, ${l.descuento_porcentaje}, ${id})
        `);
      }
    }
    // 4) Encabezado y totales.
    const t = plan.totales;
    q.push(sql`
      UPDATE facturas_compra SET numero = ${c.numero}, proveedor_id = ${c.proveedor_id}, fecha_creacion = ${c.fecha_creacion},
        fecha_vencimiento = ${c.fecha_vencimiento}, notas = ${c.notas}, subtotal = ${t.subtotal_despues}, total = ${t.subtotal_despues},
        descuento_en_costo = ${plan.marcaDescuento}
      WHERE id = ${id}
    `);
    if (plan.retencion) {
      q.push(sql`UPDATE facturas_compra SET retencion_base = ${plan.retencion.base}, retencion_valor = ${plan.retencion.valor} WHERE id = ${id}`);
    }
    await sql.transaction(q);
    return NextResponse.json({ ok: true, vista });
  } catch (error) {
    if (error instanceof ErrorEdicion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (esErrorDeGuardia(error)) {
      return NextResponse.json({ ok: false, error: 'Mientras editabas se vendieron o movieron unidades y ya no alcanza el stock. Vuelve a abrir la factura.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
