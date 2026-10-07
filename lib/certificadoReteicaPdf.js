'use client';

import { jsPDF } from 'jspdf';

// Arma y descarga el PDF del certificado de retención de ReteICA a partir
// de los datos que entrega /api/reteica/certificado. Se genera en el
// navegador (no en el servidor) con jsPDF — no hay tabla lista para armar
// (jsPDF solo, sin el plugin autoTable), así que la tabla de facturas se
// dibuja a mano con rectángulos y texto, fila por fila.

function formatearFecha(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

// N.° de factura del proveedor. Las filas vienen de dos fuentes (ver
// lib/retencionesReteica.js): 'f-12' = factura de compra del POS (si no
// tiene número, se muestra su consecutivo #12) y 'r-5' = retención
// registrada sin factura de compra.
export function numeroFactura(f) {
  if (f.numero) return String(f.numero);
  const id = String(f.id);
  return id.startsWith('f-') ? `#${id.slice(2)}` : '—';
}

const MARGEN = 20;
const ANCHO_PAGINA = 216; // carta, mm
const ALTO_PAGINA = 279;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

const COLUMNAS = [
  { titulo: 'Fecha', ancho: 42, alinear: 'left' },
  { titulo: 'N.° factura', ancho: 34, alinear: 'left' },
  { titulo: 'Base retención', ancho: 40, alinear: 'right' },
  { titulo: 'Tarifa', ancho: 20, alinear: 'right' },
  { titulo: 'Valor retenido', ancho: 40, alinear: 'right' },
];

function dibujarFilaTabla(doc, y, valores, { negrita = false, fondo = null } = {}) {
  const alturaFila = 7;
  let x = MARGEN;
  if (fondo) {
    doc.setFillColor(...fondo);
    doc.rect(MARGEN, y, ANCHO_UTIL, alturaFila, 'F');
  }
  doc.setDrawColor(210, 210, 210);
  doc.rect(MARGEN, y, ANCHO_UTIL, alturaFila);
  doc.setFont('helvetica', negrita ? 'bold' : 'normal');
  doc.setFontSize(9);
  COLUMNAS.forEach((col, i) => {
    doc.line(x, y, x, y + alturaFila);
    const texto = String(valores[i] ?? '');
    if (col.alinear === 'right') {
      doc.text(texto, x + col.ancho - 2, y + alturaFila / 2 + 1.3, { align: 'right' });
    } else {
      doc.text(texto, x + 2, y + alturaFila / 2 + 1.3);
    }
    x += col.ancho;
  });
  doc.line(x, y, x, y + alturaFila);
  return y + alturaFila;
}

export function generarPdfCertificadoReteica({ empresa, proveedor, periodo, facturas, totales }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = MARGEN;

  // Encabezado con los datos de la empresa (agente retenedor)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(empresa.razonSocial || '(Falta configurar la razón social en Configuraciones)', MARGEN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (empresa.nit) { doc.text(`NIT: ${empresa.nit}`, MARGEN, y); y += 4.5; }
  if (empresa.direccion) { doc.text(empresa.direccion, MARGEN, y); y += 4.5; }
  const ciudadTelefono = [empresa.ciudad, empresa.telefono].filter(Boolean).join('  ·  Tel: ');
  if (ciudadTelefono) { doc.text(ciudadTelefono, MARGEN, y); y += 4.5; }

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titulo = doc.splitTextToSize(
    'CERTIFICADO DE RETENCIÓN EN LA FUENTE POR INDUSTRIA Y COMERCIO (ReteICA)',
    ANCHO_UTIL - 20
  );
  doc.text(titulo, ANCHO_PAGINA / 2, y, { align: 'center' });
  y += titulo.length * 6 + 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cuerpo =
    `${empresa.razonSocial || '[Razón social pendiente de configurar]'}, identificada con NIT ` +
    `${empresa.nit || '[pendiente]'}, en calidad de agente retenedor del Impuesto de Industria y Comercio, ` +
    `certifica que a ${proveedor.nombre}, identificado con documento N.° ${proveedor.identificacion || '[sin identificación registrada]'}, ` +
    `le fue practicada retención en la fuente por concepto de ReteICA durante el período comprendido entre el ` +
    `${formatearFecha(periodo.desde)} y el ${formatearFecha(periodo.hasta)}, según el siguiente detalle:`;
  const cuerpoLineas = doc.splitTextToSize(cuerpo, ANCHO_UTIL);
  doc.text(cuerpoLineas, MARGEN, y);
  y += cuerpoLineas.length * 5 + 8;

  // Tabla de facturas
  y = dibujarFilaTabla(doc, y, COLUMNAS.map((c) => c.titulo), { negrita: true, fondo: [235, 240, 239] });

  if (facturas.length === 0) {
    y = dibujarFilaTabla(doc, y, ['Sin facturas con retención en este período', '', '', '', '']);
  } else {
    for (const f of facturas) {
      if (y > ALTO_PAGINA - 50) {
        doc.addPage();
        y = MARGEN;
        y = dibujarFilaTabla(doc, y, COLUMNAS.map((c) => c.titulo), { negrita: true, fondo: [235, 240, 239] });
      }
      y = dibujarFilaTabla(doc, y, [
        formatearFecha(f.fecha_creacion),
        numeroFactura(f),
        moneda(f.retencion_base),
        `${Number(f.retencion_porcentaje).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`,
        moneda(f.retencion_valor),
      ]);
    }
  }

  y = dibujarFilaTabla(doc, y, ['', '', 'TOTAL', '', moneda(totales.retenido)], { negrita: true, fondo: [235, 240, 239] });

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cierre = doc.splitTextToSize(
    `El valor total retenido en el período certificado es de ${moneda(totales.retenido)}. ` +
    `Este certificado se expide a solicitud del interesado para los fines que estime pertinentes, ` +
    `en ${empresa.ciudad || 'Bogotá D.C.'}, a los ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}.`,
    ANCHO_UTIL
  );
  doc.text(cierre, MARGEN, y);
  y += cierre.length * 5 + 20;

  doc.line(MARGEN, y, MARGEN + 70, y);
  y += 5;
  doc.setFontSize(9);
  doc.text('Firma autorizada', MARGEN, y);
  y += 4.5;
  doc.text(empresa.razonSocial || '', MARGEN, y);

  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const nombreArchivo = `certificado-reteica-${slug(proveedor.nombre)}-${periodo.desde}-a-${periodo.hasta}.pdf`;
  doc.save(nombreArchivo);
}
