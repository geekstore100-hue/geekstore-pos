// lib/journalVentas.js
// Arma el "Journal de ventas" (Reportes) a partir de lo que devuelve
// /api/reportes/journal, y lo exporta a Excel (octubre 2026).
//
// Excel con 4 hojas:
//   1. Resumen      → totales, por medio de pago, por día, por vendedor,
//                     por categoría y por canal.
//   2. Journal      → una fila por cada producto vendido (y devoluciones
//                     en negativo).
//   3. Ventas       → una fila por venta, con el desglose del pago.
//   4. Devoluciones
//
// Las ventas ANULADAS (si se pidieron) salen marcadas en Journal y Ventas,
// pero NO suman en ningún total.

export const MEDIOS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'];

function n(v) {
  return Number(v) || 0;
}

function redondear(v) {
  return Math.round(n(v));
}

export function armarJournal(datos) {
  const pagosPorVenta = new Map();
  for (const p of datos.pagos || []) {
    const m = pagosPorVenta.get(Number(p.venta_id)) || {};
    const medio = MEDIOS.includes(p.medio_pago) ? p.medio_pago : 'Otro';
    m[medio] = (m[medio] || 0) + n(p.monto);
    pagosPorVenta.set(Number(p.venta_id), m);
  }

  const lineas = (datos.lineas || []).map((l) => {
    const cantidad = n(l.cantidad);
    const neto = n(l.precio_neto);
    const desc = n(l.descuento_pct);
    const lista = desc > 0 && desc < 100 ? neto / (1 - desc / 100) : neto;
    const totalNeto = neto * cantidad;
    const bruto = lista * cantidad;
    const costo = n(l.costo_unitario) * cantidad;
    return {
      tipo: l.anulada ? 'Venta ANULADA' : 'Venta',
      anulada: Boolean(l.anulada),
      fecha: l.fecha,
      hora: l.hora,
      venta_id: Number(l.venta_id),
      canal: l.canal,
      cliente: l.cliente || '',
      vendedor: l.vendedor || 'Sin vendedor',
      medio_pago: l.medio_pago || '',
      referencia: l.referencia,
      producto: l.producto,
      categoria: l.categoria || 'Sin categoría',
      subcategoria: l.subcategoria || '',
      bodega: l.bodega || '',
      cantidad,
      precio_lista: lista,
      descuento_pct: desc,
      precio_neto: neto,
      bruto,
      descuento: bruto - totalNeto,
      total: totalNeto,
      costo,
      utilidad: totalNeto - costo,
      servicio: l.es_inventariable === false,
      nota: l.nota || '',
    };
  });

  const devoluciones = (datos.devoluciones || []).map((d) => ({
    tipo: 'Devolución',
    fecha: d.fecha,
    hora: d.hora,
    id: d.id,
    venta_id: d.venta_id ? Number(d.venta_id) : null,
    referencia: d.referencia,
    producto: d.producto,
    categoria: d.categoria || 'Sin categoría',
    cantidad: n(d.cantidad),
    monto: n(d.monto),
    costo: n(d.costo_unitario) * n(d.cantidad),
    motivo: d.motivo || '',
  }));

  // Una fila por venta
  const ventasMap = new Map();
  for (const l of lineas) {
    let v = ventasMap.get(l.venta_id);
    if (!v) {
      v = {
        venta_id: l.venta_id,
        fecha: l.fecha,
        hora: l.hora,
        canal: l.canal,
        cliente: l.cliente,
        vendedor: l.vendedor,
        medio_pago: l.medio_pago,
        anulada: l.anulada,
        productos: 0,
        unidades: 0,
        bruto: 0,
        descuento: 0,
        total: 0,
        costo: 0,
        pagos: pagosPorVenta.get(l.venta_id) || {},
      };
      ventasMap.set(l.venta_id, v);
    }
    v.productos += 1;
    v.unidades += l.cantidad;
    v.bruto += l.bruto;
    v.descuento += l.descuento;
    v.total += l.total;
    v.costo += l.costo;
  }
  const ventas = [...ventasMap.values()];
  for (const v of ventas) {
    // Si una venta vieja no tiene detalle de pago, todo va al medio que dice la venta.
    if (!Object.keys(v.pagos).length) {
      const medio = MEDIOS.includes(v.medio_pago) ? v.medio_pago : 'Otro';
      v.pagos = { [medio]: v.total };
    }
    v.utilidad = v.total - v.costo;
  }

  // Resumen (sin anuladas)
  const vigentes = ventas.filter((v) => !v.anulada);
  const lineasVigentes = lineas.filter((l) => !l.anulada);
  const suma = (arr, k) => arr.reduce((a, x) => a + n(x[k]), 0);
  const totalDevoluciones = suma(devoluciones, 'monto');
  const costoDevuelto = suma(devoluciones, 'costo');
  const resumen = {
    ventas: vigentes.length,
    anuladas: ventas.length - vigentes.length,
    unidades: suma(vigentes, 'unidades'),
    bruto: suma(vigentes, 'bruto'),
    descuento: suma(vigentes, 'descuento'),
    neto: suma(vigentes, 'total'),
    devoluciones: totalDevoluciones,
    netoFinal: suma(vigentes, 'total') - totalDevoluciones,
    costo: suma(vigentes, 'costo') - costoDevuelto,
  };
  resumen.utilidad = resumen.netoFinal - resumen.costo;
  resumen.margen = resumen.netoFinal > 0 ? resumen.utilidad / resumen.netoFinal : 0;
  resumen.ticket = resumen.ventas ? resumen.neto / resumen.ventas : 0;

  const agrupar = (arr, clave, campos) => {
    const m = new Map();
    for (const x of arr) {
      const k = typeof clave === 'function' ? clave(x) : x[clave];
      const g = m.get(k) || { clave: k, ventas: new Set(), unidades: 0, total: 0, costo: 0 };
      g.ventas.add(x.venta_id);
      g.unidades += n(x[campos.unidades]);
      g.total += n(x[campos.total]);
      g.costo += n(x[campos.costo]);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, ventas: g.ventas.size, utilidad: g.total - g.costo }));
  };
  const camposLinea = { unidades: 'cantidad', total: 'total', costo: 'costo' };

  const porMedio = MEDIOS.map((medio) => ({
    medio,
    ventas: vigentes.filter((v) => n(v.pagos[medio]) > 0).length,
    total: vigentes.reduce((a, v) => a + n(v.pagos[medio]), 0),
  })).filter((x) => x.total > 0);
  const devEfectivo = totalDevoluciones; // las devoluciones se pagan en efectivo
  const porDia = agrupar(lineasVigentes, 'fecha', camposLinea).sort((a, b) => (a.clave < b.clave ? -1 : 1));
  const devPorDia = new Map();
  for (const d of devoluciones) devPorDia.set(d.fecha, (devPorDia.get(d.fecha) || 0) + d.monto);
  for (const fecha of devPorDia.keys()) {
    if (!porDia.some((d) => d.clave === fecha)) porDia.push({ clave: fecha, ventas: 0, unidades: 0, total: 0, costo: 0, utilidad: 0 });
  }
  porDia.sort((a, b) => (a.clave < b.clave ? -1 : 1));
  for (const d of porDia) d.devoluciones = devPorDia.get(d.clave) || 0;

  return {
    lineas,
    ventas,
    devoluciones,
    resumen,
    porMedio,
    devEfectivo,
    porDia,
    porVendedor: agrupar(lineasVigentes, 'vendedor', camposLinea).sort((a, b) => b.total - a.total),
    porCategoria: agrupar(lineasVigentes, 'categoria', camposLinea).sort((a, b) => b.total - a.total),
    porCanal: agrupar(lineasVigentes, 'canal', camposLinea).sort((a, b) => b.total - a.total),
  };
}

// ── Excel ───────────────────────────────────────────────────────────────

const PESOS = '"$"#,##0;[Red]-"$"#,##0';
const PORC = '0.0%';

function fechaExcel(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? new Date(Date.UTC(y, m - 1, d)) : '';
}

// Hoja con encabezados, formatos por columna, anchos y autofiltro.
function hoja(XLSX, encabezados, filas, formatos = {}, anchos = {}) {
  const ws = XLSX.utils.aoa_to_sheet([encabezados, ...filas], { cellDates: true });
  const rango = XLSX.utils.decode_range(ws['!ref']);
  encabezados.forEach((h, c) => {
    const z = formatos[h];
    if (!z) return;
    for (let r = 1; r <= rango.e.r; r++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && (celda.t === 'n' || celda.t === 'd')) celda.z = z;
    }
  });
  ws['!cols'] = encabezados.map((h) => ({ wch: anchos[h] || Math.max(10, String(h).length + 2) }));
  if (filas.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rango.e.r, c: encabezados.length - 1 } }) };
  return ws;
}

export async function exportarJournalExcel(j, { desde, hasta }) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  const r = j.resumen;

  // 1. Resumen
  const aoa = [
    ['GEEK STORE — JOURNAL DE VENTAS'],
    [`Del ${desde} al ${hasta}`],
    [`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`],
    [],
    ['TOTALES', ''],
    ['Ventas (cantidad)', r.ventas],
    ['Ventas anuladas (no suman)', r.anuladas],
    ['Unidades vendidas', r.unidades],
    ['Ventas brutas (precio de lista)', redondear(r.bruto)],
    ['Descuentos', redondear(r.descuento)],
    ['Ventas netas', redondear(r.neto)],
    ['Devoluciones', -redondear(r.devoluciones)],
    ['Neto después de devoluciones', redondear(r.netoFinal)],
    ['Costo (costo actual de los productos)', redondear(r.costo)],
    ['Utilidad bruta', redondear(r.utilidad)],
    ['Margen', r.margen],
    ['Ticket promedio', redondear(r.ticket)],
    [],
    ['POR MEDIO DE PAGO', 'Ventas', 'Total'],
    ...j.porMedio.map((m) => [m.medio, m.ventas, redondear(m.total)]),
    ...(r.devoluciones ? [['Devoluciones (efectivo)', '', -redondear(r.devoluciones)]] : []),
    [],
    ['POR DÍA', 'Ventas', 'Unidades', 'Total', 'Devoluciones', 'Costo', 'Utilidad'],
    ...j.porDia.map((d) => [fechaExcel(d.clave), d.ventas, d.unidades, redondear(d.total), -redondear(d.devoluciones), redondear(d.costo), redondear(d.utilidad)]),
    [],
    ['POR VENDEDOR', 'Ventas', 'Unidades', 'Total', 'Costo', 'Utilidad'],
    ...j.porVendedor.map((d) => [d.clave, d.ventas, d.unidades, redondear(d.total), redondear(d.costo), redondear(d.utilidad)]),
    [],
    ['POR CATEGORÍA', 'Ventas', 'Unidades', 'Total', 'Costo', 'Utilidad'],
    ...j.porCategoria.map((d) => [d.clave, d.ventas, d.unidades, redondear(d.total), redondear(d.costo), redondear(d.utilidad)]),
    [],
    ['POR CANAL', 'Ventas', 'Unidades', 'Total', 'Costo', 'Utilidad'],
    ...j.porCanal.map((d) => [d.clave, d.ventas, d.unidades, redondear(d.total), redondear(d.costo), redondear(d.utilidad)]),
  ];
  const wsR = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  // Formatos del resumen: montos en pesos (los conteos se dejan como número).
  const filasConteo = new Set(['Ventas (cantidad)', 'Ventas anuladas (no suman)', 'Unidades vendidas']);
  let seccion = '';
  aoa.forEach((fila, ri) => {
    if (fila.length > 1 && typeof fila[1] === 'string' && fila[0] === String(fila[0]).toUpperCase() && fila[0]) seccion = fila[0];
    fila.forEach((v, ci) => {
      const celda = wsR[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (!celda) return;
      if (celda.t === 'd') celda.z = 'dd/mm/yyyy';
      if (celda.t !== 'n') return;
      if (fila[0] === 'Margen') celda.z = PORC;
      else if (seccion === 'TOTALES' && ci === 1 && !filasConteo.has(fila[0])) celda.z = PESOS;
      else if (seccion === 'POR MEDIO DE PAGO' && ci === 2) celda.z = PESOS;
      else if (seccion !== 'TOTALES' && seccion !== 'POR MEDIO DE PAGO' && ci >= 3) celda.z = PESOS;
    });
  });
  wsR['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(libro, wsR, 'Resumen');

  // 2. Journal (línea por línea + devoluciones)
  const encJ = ['Fecha', 'Hora', 'Tipo', 'N.º venta', 'Canal', 'Cliente', 'Vendedor', 'Medio de pago', 'Referencia', 'Producto', 'Categoría', 'Subcategoría', 'Bodega', 'Cantidad', 'Precio lista', 'Desc. %', 'Precio unitario', 'Descuento', 'Total', 'Costo', 'Utilidad', 'Nota'];
  const filasJ = [
    ...j.lineas.map((l) => [
      fechaExcel(l.fecha), l.hora, l.tipo, l.venta_id, l.canal, l.cliente, l.vendedor, l.medio_pago, l.referencia, l.producto, l.categoria, l.subcategoria, l.bodega,
      l.cantidad, redondear(l.precio_lista), l.descuento_pct / 100, redondear(l.precio_neto), redondear(l.descuento), redondear(l.total), redondear(l.costo), redondear(l.utilidad), l.nota,
    ]),
    ...j.devoluciones.map((d) => [
      fechaExcel(d.fecha), d.hora, d.tipo, d.venta_id || '', '', '', '', 'Efectivo', d.referencia, d.producto, d.categoria, '', 'Principal',
      -d.cantidad, '', '', '', '', -redondear(d.monto), -redondear(d.costo), -redondear(d.monto - d.costo), d.motivo,
    ]),
  ].sort((a, b) => (a[0] instanceof Date && b[0] instanceof Date ? a[0] - b[0] : 0) || String(a[1]).localeCompare(String(b[1])));
  XLSX.utils.book_append_sheet(
    libro,
    hoja(
      XLSX,
      encJ,
      filasJ,
      { Fecha: 'dd/mm/yyyy', 'Precio lista': PESOS, 'Desc. %': PORC, 'Precio unitario': PESOS, Descuento: PESOS, Total: PESOS, Costo: PESOS, Utilidad: PESOS },
      { Producto: 48, Cliente: 22, Canal: 18, Categoría: 18, Subcategoría: 16, Vendedor: 16, 'Medio de pago': 22, Nota: 30, Tipo: 14 }
    ),
    'Journal'
  );

  // 3. Ventas
  const encV = ['Fecha', 'Hora', 'N.º venta', 'Estado', 'Canal', 'Cliente', 'Vendedor', 'Medio de pago', ...MEDIOS, 'Productos', 'Unidades', 'Bruto', 'Descuento', 'Total', 'Costo', 'Utilidad'];
  const filasV = j.ventas.map((v) => [
    fechaExcel(v.fecha), v.hora, v.venta_id, v.anulada ? 'ANULADA' : 'Vigente', v.canal, v.cliente, v.vendedor, v.medio_pago,
    ...MEDIOS.map((m) => redondear(v.pagos[m] || 0)),
    v.productos, v.unidades, redondear(v.bruto), redondear(v.descuento), redondear(v.total), redondear(v.costo), redondear(v.utilidad),
  ]);
  const fmtV = { Fecha: 'dd/mm/yyyy', Bruto: PESOS, Descuento: PESOS, Total: PESOS, Costo: PESOS, Utilidad: PESOS };
  for (const m of MEDIOS) fmtV[m] = PESOS;
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, encV, filasV, fmtV, { Cliente: 22, Canal: 18, Vendedor: 16, 'Medio de pago': 22 }), 'Ventas');

  // 4. Devoluciones
  const encD = ['Fecha', 'Hora', 'N.º devolución', 'Referencia', 'Producto', 'Categoría', 'Cantidad', 'Valor devuelto', 'Motivo'];
  const filasD = j.devoluciones.map((d) => [fechaExcel(d.fecha), d.hora, d.id, d.referencia, d.producto, d.categoria, d.cantidad, redondear(d.monto), d.motivo]);
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, encD, filasD, { Fecha: 'dd/mm/yyyy', 'Valor devuelto': PESOS }, { Producto: 48, Motivo: 30, Categoría: 18 }), 'Devoluciones');

  XLSX.writeFile(libro, `Journal_ventas_${desde}_a_${hasta}.xlsx`);
}
