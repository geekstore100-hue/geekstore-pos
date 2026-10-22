// lib/cotizacionPdf.js
// PDF de las cotizaciones para clientes, con el diseño "Poder" de la tienda
// geekstore.com.co (octubre 2026): encabezado oscuro, acentos cian y
// magenta, títulos en Chakra Petch y textos en Barlow, fotos de los
// productos y Geeky al final.
//
// Se arma en el NAVEGADOR con jsPDF (igual que el certificado de ReteICA).
// Las fuentes, el logo y Geeky están en public/cotizacion/.

const C = {
  negro: [6, 8, 14],
  panel: [11, 15, 26],
  panel2: [15, 22, 38],
  linea: [42, 53, 80],
  cian: [25, 195, 255],
  cianClaro: [127, 227, 255],
  magenta: [255, 46, 136],
  tinta: [11, 18, 32],
  gris: [110, 122, 145],
  grisClaro: [163, 174, 194],
  fondo: [243, 245, 249],
  borde: [227, 231, 239],
  blanco: [255, 255, 255],
};

const PAGINA = { ancho: 215.9, alto: 279.4 }; // carta
const M = 14; // margen

let recursos = null;

async function aBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function aDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('foto');
  const blob = await res.blob();
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });
}

// Foto del producto → JPEG cuadrado con fondo blanco (jsPDF no lee WebP y
// así todas quedan del mismo tamaño). Devuelve null si no se puede.
async function fotoCuadrada(url, lado = 220) {
  try {
    const src = await aDataUrl(url);
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lado, lado);
    const escala = Math.min((lado * 0.92) / img.width, (lado * 0.92) / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

async function cargarRecursos() {
  if (recursos) return recursos;
  const base = '/cotizacion';
  const [chakra, barlow, barlowSemi, barlowBold, logo, geeky] = await Promise.all([
    aBase64(`${base}/ChakraPetch-BoldItalic.ttf`),
    aBase64(`${base}/Barlow-Regular.ttf`),
    aBase64(`${base}/Barlow-SemiBold.ttf`),
    aBase64(`${base}/Barlow-Bold.ttf`),
    aDataUrl(`${base}/logo-oscuro.png`).catch(() => null),
    aDataUrl(`${base}/geeky.png`).catch(() => null),
  ]);
  recursos = { chakra, barlow, barlowSemi, barlowBold, logo, geeky };
  return recursos;
}

function registrarFuentes(doc, r) {
  doc.addFileToVFS('ChakraPetch-BoldItalic.ttf', r.chakra);
  doc.addFont('ChakraPetch-BoldItalic.ttf', 'Chakra', 'normal');
  doc.addFileToVFS('Barlow-Regular.ttf', r.barlow);
  doc.addFont('Barlow-Regular.ttf', 'Barlow', 'normal');
  doc.addFileToVFS('Barlow-SemiBold.ttf', r.barlowSemi);
  doc.addFont('Barlow-SemiBold.ttf', 'Barlow', 'semibold');
  doc.addFileToVFS('Barlow-Bold.ttf', r.barlowBold);
  doc.addFont('Barlow-Bold.ttf', 'Barlow', 'bold');
}

export function pesos(n) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
}

export function numeroCotizacion(id) {
  return `COT-${String(id).padStart(4, '0')}`;
}

function fechaLarga(d) {
  return new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
}

function color(doc, tipo, rgb) {
  if (tipo === 'fill') doc.setFillColor(...rgb);
  else if (tipo === 'draw') doc.setDrawColor(...rgb);
  else doc.setTextColor(...rgb);
}

function fuente(doc, familia, estilo, tam) {
  doc.setFont(familia, estilo);
  doc.setFontSize(tam);
}

// Franja "gamer": paralelogramo inclinado.
function franja(doc, x, y, w, h, rgb, inclinacion = 4) {
  color(doc, 'fill', rgb);
  doc.lines([[w, 0], [-inclinacion, h], [-w, 0]], x + inclinacion, y, [1, 1], 'F', true);
}

// Encabezado grande (página 1) o compacto (páginas siguientes).
function encabezado(doc, r, cot, empresa, completo) {
  const alto = completo ? 40 : 22;
  color(doc, 'fill', C.panel);
  doc.rect(0, 0, PAGINA.ancho, alto, 'F');
  // Rejilla sutil de "pantalla"
  color(doc, 'draw', C.panel2);
  doc.setLineWidth(0.2);
  for (let x = 6; x < PAGINA.ancho; x += 6) doc.line(x, 0, x, alto);
  // Franjas cian y magenta abajo
  color(doc, 'fill', C.cian);
  doc.rect(0, alto, PAGINA.ancho, 1.1, 'F');
  franja(doc, PAGINA.ancho - 78, alto - 2.4, 64, 2.4, C.magenta, 2.4);

  const logoH = completo ? 13 : 9;
  const logoW = logoH * 4.4;
  const logoY = completo ? 9 : 6.5;
  if (r.logo) {
    doc.addImage(r.logo, 'PNG', M, logoY, logoW, logoH);
    doc.link(M, logoY, logoW, logoH, { url: 'https://geekstore.com.co' });
  } else {
    color(doc, 'text', C.blanco);
    fuente(doc, 'Chakra', 'normal', 18);
    doc.text('GEEK STORE', M, logoY + logoH - 2);
  }

  const derecha = PAGINA.ancho - M;
  if (completo) {
    color(doc, 'text', C.blanco);
    fuente(doc, 'Chakra', 'normal', 24);
    doc.text('COTIZACIÓN', derecha, 15.5, { align: 'right' });
    color(doc, 'text', C.cian);
    fuente(doc, 'Chakra', 'normal', 12);
    doc.text(`N.º ${numeroCotizacion(cot.id)}`, derecha, 22.5, { align: 'right' });
    color(doc, 'text', C.grisClaro);
    fuente(doc, 'Barlow', 'normal', 8.5);
    const desde = new Date(cot.creado_en || Date.now());
    const hasta = new Date(desde.getTime() + (Number(cot.validez_dias) || 8) * 86400000);
    doc.text(`Fecha: ${fechaLarga(desde)}`, derecha, 28.5, { align: 'right' });
    doc.text(`Válida hasta: ${fechaLarga(hasta)}`, derecha, 33, { align: 'right' });
  } else {
    color(doc, 'text', C.blanco);
    fuente(doc, 'Chakra', 'normal', 13);
    doc.text(`COTIZACIÓN  ${numeroCotizacion(cot.id)}`, derecha, 13, { align: 'right' });
  }
  return alto + 1.1;
}

function pie(doc, empresa, pagina, total) {
  const y = PAGINA.alto - 10;
  color(doc, 'draw', C.borde);
  doc.setLineWidth(0.3);
  doc.line(M, y - 4, PAGINA.ancho - M, y - 4);
  color(doc, 'text', C.gris);
  fuente(doc, 'Barlow', 'normal', 7.5);
  const partes = ['geekstore.com.co', 'Instagram @geekstorebogota'];
  if (empresa.telefono) partes.push(`WhatsApp ${empresa.telefono}`);
  doc.text(partes.join('   ·   '), M, y);
  doc.link(M, y - 3, 24, 4, { url: 'https://geekstore.com.co' });
  doc.text(`Página ${pagina} de ${total}`, PAGINA.ancho - M, y, { align: 'right' });
}

function tarjeta(doc, x, y, w, h, titulo, lineas) {
  color(doc, 'fill', C.fondo);
  color(doc, 'draw', C.borde);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  color(doc, 'fill', C.cian);
  doc.rect(x, y + 3, 1.2, h - 6, 'F');
  color(doc, 'text', C.magenta);
  fuente(doc, 'Chakra', 'normal', 8);
  doc.text(titulo, x + 5, y + 6.5);
  let ty = y + 12;
  lineas.forEach((l, i) => {
    if (!l) return;
    color(doc, 'text', i === 0 ? C.tinta : C.gris);
    fuente(doc, 'Barlow', i === 0 ? 'bold' : 'normal', i === 0 ? 10.5 : 8.5);
    const txt = doc.splitTextToSize(l, w - 9);
    doc.text(txt[0], x + 5, ty);
    ty += i === 0 ? 5.2 : 4.2;
  });
}

// Columnas de la tabla
const COL = (() => {
  const ancho = PAGINA.ancho - 2 * M;
  const foto = 17;
  const cant = 14;
  const unit = 27;
  const desc = 15;
  const total = 28;
  const prod = ancho - foto - cant - unit - desc - total;
  let x = M;
  const c = {};
  for (const [k, w] of [['foto', foto], ['prod', prod], ['cant', cant], ['unit', unit], ['desc', desc], ['total', total]]) {
    c[k] = { x, w };
    x += w;
  }
  return c;
})();

function cabeceraTabla(doc, y) {
  const h = 8;
  color(doc, 'fill', C.panel);
  doc.rect(M, y, PAGINA.ancho - 2 * M, h, 'F');
  franja(doc, M, y + h - 0.9, 30, 0.9, C.cian, 0.9);
  color(doc, 'text', C.blanco);
  fuente(doc, 'Chakra', 'normal', 8);
  const yt = y + 5.4;
  doc.text('PRODUCTO', COL.prod.x + 1, yt);
  doc.text('CANT.', COL.cant.x + COL.cant.w / 2, yt, { align: 'center' });
  doc.text('PRECIO UNIT.', COL.unit.x + COL.unit.w - 2, yt, { align: 'right' });
  doc.text('DESC.', COL.desc.x + COL.desc.w / 2, yt, { align: 'center' });
  color(doc, 'text', C.cian);
  doc.text('TOTAL', COL.total.x + COL.total.w - 2, yt, { align: 'right' });
  return y + h;
}

export async function generarPdfCotizacion(cot, empresa = {}) {
  const { jsPDF } = await import('jspdf');
  const r = await cargarRecursos();
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  registrarFuentes(doc, r);
  doc.setProperties({ title: `Cotización ${numeroCotizacion(cot.id)} - Geek Store`, author: 'Geek Store', creator: 'POS Geek Store' });

  const items = Array.isArray(cot.items) ? cot.items : [];
  const fotos = await Promise.all(items.map((it) => (it.imagen_key ? fotoCuadrada(`/api/imagenes/${it.imagen_key}`) : Promise.resolve(null))));

  const limiteY = PAGINA.alto - 20;
  let y = encabezado(doc, r, cot, empresa, true) + 7;

  // Tarjetas Cliente / Geek Store
  const anchoT = (PAGINA.ancho - 2 * M - 6) / 2;
  tarjeta(doc, M, y, anchoT, 30, 'CLIENTE', [
    cot.cliente_nombre || 'Cliente',
    cot.cliente_documento ? `Documento: ${cot.cliente_documento}` : '',
    cot.cliente_telefono ? `Teléfono: ${cot.cliente_telefono}` : '',
    cot.cliente_email || '',
  ].filter((l, i) => i === 0 || l));
  tarjeta(doc, M + anchoT + 6, y, anchoT, 30, 'GEEK STORE', [
    empresa.razonSocial || 'Geek Store',
    empresa.nit ? `NIT: ${empresa.nit}` : '',
    [empresa.direccion, empresa.ciudad].filter(Boolean).join(' · '),
    cot.vendedor ? `Te atendió: ${cot.vendedor}` : empresa.telefono ? `Tel: ${empresa.telefono}` : '',
  ].filter((l, i) => i === 0 || l));
  y += 30 + 8;

  y = cabeceraTabla(doc, y);

  const altoFila = 19;
  items.forEach((it, i) => {
    fuente(doc, 'Barlow', 'semibold', 9.5);
    const nombre = doc.splitTextToSize(it.nombre, COL.prod.w - 3).slice(0, 3);
    const alto = Math.max(altoFila, 7 + nombre.length * 4.2 + 5);
    if (y + alto > limiteY) {
      doc.addPage();
      y = encabezado(doc, r, cot, empresa, false) + 6;
      y = cabeceraTabla(doc, y);
    }
    if (i % 2 === 1) {
      color(doc, 'fill', [248, 250, 253]);
      doc.rect(M, y, PAGINA.ancho - 2 * M, alto, 'F');
    }
    // Foto
    const lado = 14;
    const fy = y + (alto - lado) / 2;
    color(doc, 'draw', C.borde);
    color(doc, 'fill', C.blanco);
    doc.setLineWidth(0.25);
    doc.roundedRect(COL.foto.x + 1, fy, lado, lado, 1.5, 1.5, 'FD');
    if (fotos[i]) doc.addImage(fotos[i], 'JPEG', COL.foto.x + 1.6, fy + 0.6, lado - 1.2, lado - 1.2);
    else {
      color(doc, 'text', C.grisClaro);
      fuente(doc, 'Chakra', 'normal', 9);
      doc.text('GS', COL.foto.x + 1 + lado / 2, fy + lado / 2 + 1.5, { align: 'center' });
    }
    // Nombre y referencia
    color(doc, 'text', C.tinta);
    fuente(doc, 'Barlow', 'semibold', 9.5);
    const yNombre = y + (alto - (nombre.length * 4.2 + 4)) / 2 + 3.2;
    doc.text(nombre, COL.prod.x + 1, yNombre, { lineHeightFactor: 1.25 });
    if (it.referencia) {
      color(doc, 'text', C.gris);
      fuente(doc, 'Barlow', 'normal', 7.5);
      doc.text(`Ref. ${it.referencia}`, COL.prod.x + 1, yNombre + nombre.length * 4.2 + 0.6);
    }
    const ym = y + alto / 2 + 1.4;
    color(doc, 'text', C.tinta);
    fuente(doc, 'Barlow', 'semibold', 9.5);
    doc.text(String(it.cantidad), COL.cant.x + COL.cant.w / 2, ym, { align: 'center' });
    fuente(doc, 'Barlow', 'normal', 9);
    doc.text(pesos(it.precio_unitario), COL.unit.x + COL.unit.w - 2, ym, { align: 'right' });
    if (Number(it.descuento_pct) > 0) {
      color(doc, 'text', C.magenta);
      fuente(doc, 'Barlow', 'bold', 9);
      doc.text(`-${Number(it.descuento_pct).toLocaleString('es-CO')}%`, COL.desc.x + COL.desc.w / 2, ym, { align: 'center' });
    } else {
      color(doc, 'text', C.grisClaro);
      doc.text('—', COL.desc.x + COL.desc.w / 2, ym, { align: 'center' });
    }
    color(doc, 'text', C.tinta);
    fuente(doc, 'Barlow', 'bold', 10);
    doc.text(pesos(it.total), COL.total.x + COL.total.w - 2, ym, { align: 'right' });
    color(doc, 'draw', C.borde);
    doc.setLineWidth(0.2);
    doc.line(M, y + alto, PAGINA.ancho - M, y + alto);
    y += alto;
  });

  // Totales
  const hayDescuento = Number(cot.descuento) > 0;
  const altoTotales = (hayDescuento ? 12 : 6) + 16;
  const notas = String(cot.notas || '').trim();
  fuente(doc, 'Barlow', 'normal', 8.5);
  const anchoNotas = PAGINA.ancho - 2 * M - 92;
  const lineasNotas = notas ? doc.splitTextToSize(notas, anchoNotas - 8) : [];
  const altoNotas = Math.max(28, 12 + lineasNotas.length * 3.9);
  if (y + 6 + Math.max(altoTotales, altoNotas) + 34 > limiteY) {
    doc.addPage();
    y = encabezado(doc, r, cot, empresa, false) + 6;
  }
  y += 6;
  const xT = PAGINA.ancho - M - 86;
  const wT = 86;
  let yt = y + 4;
  fuente(doc, 'Barlow', 'normal', 9.5);
  color(doc, 'text', C.gris);
  doc.text('Subtotal', xT + 4, yt);
  color(doc, 'text', C.tinta);
  doc.text(pesos(cot.subtotal), xT + wT - 4, yt, { align: 'right' });
  if (hayDescuento) {
    yt += 6;
    color(doc, 'text', C.magenta);
    doc.text('Descuentos', xT + 4, yt);
    doc.text(`- ${pesos(cot.descuento)}`, xT + wT - 4, yt, { align: 'right' });
  }
  yt += 4;
  color(doc, 'fill', C.panel);
  doc.rect(xT, yt, wT, 14, 'F');
  franja(doc, xT, yt + 12.6, 34, 1.4, C.magenta, 1.4);
  color(doc, 'fill', C.cian);
  doc.rect(xT, yt, 1.4, 14, 'F');
  color(doc, 'text', C.blanco);
  fuente(doc, 'Chakra', 'normal', 12);
  doc.text('TOTAL', xT + 5, yt + 9);
  color(doc, 'text', C.cian);
  fuente(doc, 'Chakra', 'normal', 16);
  doc.text(pesos(cot.total), xT + wT - 4, yt + 9.4, { align: 'right' });
  // Texto debajo del total (editable en cada cotización; vacío = nada).
  const notaTotal = cot.nota_total == null ? 'Valores en pesos colombianos (COP), IVA incluido.' : String(cot.nota_total).trim();
  let altoNotaTotal = 0;
  if (notaTotal) {
    color(doc, 'text', C.gris);
    fuente(doc, 'Barlow', 'normal', 7.5);
    const lineasNT = doc.splitTextToSize(notaTotal, wT).slice(0, 4);
    lineasNT.forEach((l, i) => doc.text(l, xT + wT, yt + 19 + i * 3.4, { align: 'right' }));
    altoNotaTotal = (lineasNT.length - 1) * 3.4;
  }

  // Condiciones / notas (a la izquierda de los totales)
  const yN = y;
  color(doc, 'fill', C.fondo);
  color(doc, 'draw', C.borde);
  doc.roundedRect(M, yN, anchoNotas, altoNotas, 2, 2, 'FD');
  color(doc, 'text', C.magenta);
  fuente(doc, 'Chakra', 'normal', 8);
  doc.text('CONDICIONES', M + 4, yN + 6.5);
  color(doc, 'text', C.tinta);
  fuente(doc, 'Barlow', 'normal', 8.5);
  const lineasBase = lineasNotas.length
    ? lineasNotas
    : doc.splitTextToSize(`Cotización válida por ${cot.validez_dias || 8} días. Precios sujetos a disponibilidad de inventario.`, anchoNotas - 8);
  doc.text(lineasBase, M + 4, yN + 12, { lineHeightFactor: 1.35 });

  // Geeky + llamado a la acción
  let yG = Math.max(yN + altoNotas, yt + 22 + altoNotaTotal) + 6;
  if (yG + 30 > limiteY) {
    doc.addPage();
    yG = encabezado(doc, r, cot, empresa, false) + 10;
  }
  color(doc, 'fill', C.panel);
  doc.roundedRect(M, yG, PAGINA.ancho - 2 * M, 26, 3, 3, 'F');
  franja(doc, PAGINA.ancho - M - 60, yG + 24.6, 46, 1.4, C.cian, 1.4);
  if (r.geeky) doc.addImage(r.geeky, 'PNG', M + 3, yG - 6, 30, 31.7);
  color(doc, 'text', C.blanco);
  fuente(doc, 'Chakra', 'normal', 13);
  doc.text('¿LISTO PARA SUBIR DE NIVEL?', M + 38, yG + 10.5);
  color(doc, 'text', C.grisClaro);
  fuente(doc, 'Barlow', 'normal', 9);
  const contacto = empresa.telefono
    ? `Escríbenos al WhatsApp ${empresa.telefono} con el número ${numeroCotizacion(cot.id)} y separamos tu pedido.`
    : `Escríbenos con el número ${numeroCotizacion(cot.id)} y separamos tu pedido.`;
  doc.text(doc.splitTextToSize(contacto, PAGINA.ancho - 2 * M - 44), M + 38, yG + 16.5);
  color(doc, 'text', C.cian);
  fuente(doc, 'Barlow', 'bold', 9);
  doc.text('geekstore.com.co', M + 38, yG + 22.5);
  doc.link(M + 38, yG + 19.5, 30, 4, { url: 'https://geekstore.com.co' });

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    pie(doc, empresa, p, totalPaginas);
  }
  return doc;
}
