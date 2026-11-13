// Ticket de venta de 80 mm (nov 2026). Antes vivía dentro de app/ventas/page.js;
// se sacó aquí para que Historial pueda imprimir una COPIA del ticket de
// cualquier venta con exactamente el mismo formato.
//
// Notas de impresión (las mismas de antes):
// - El papel es de 80 mm, pero el área que imprime la térmica es más angosta:
//   el contenido va a 68 mm, pegado a la izquierda (muchas térmicas no
//   centran y cortaban el borde derecho).
// - Fuente de palo en negrita: en térmica se ve más nítida.
// - Si sale cortado o borroso: en el cuadro de impresión, Escala 100 %,
//   márgenes "Ninguno" y papel 80 mm / Recibo.
// - Se imprime en un <iframe> invisible (no se abren ventanas que queden
//   olvidadas ni lo bloquea el navegador como pop-up).

function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

export function escaparHtml(texto) {
  return String(texto || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fechaTicket(fecha = new Date()) {
  return new Date(fecha).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// copia: texto que sale arriba del ticket (p. ej. "COPIA", impresa desde Historial).
export function htmlTicketVenta({ ventaId, items, totalVenta, pagos, vendedorNombre, listaUsada, fecha, sinConexion, copia, anulada }) {
  const filasHtml = (items || [])
    .map((i) => {
      const desc = Number(i.descuento_porcentaje) || 0;
      const sub = Number(i.cantidad) * Number(i.precio_unitario) * (1 - desc / 100);
      return `
          <tr><td colspan="2" style="padding-top:6px;">${escaparHtml(i.nombre)}</td></tr>
          <tr><td colspan="2" class="ref">Ref. ${escaparHtml(i.referencia || '-')}</td></tr>
          <tr>
            <td>${Number(i.cantidad)} x ${moneda(i.precio_unitario)}${desc ? ` (-${desc}%)` : ''}</td>
            <td style="text-align:right;">${moneda(sub)}</td>
          </tr>`;
    })
    .join('');
  const listaPagos = pagos || [];

  return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${escaparHtml(ventaId)}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            width: 68mm;
            margin: 0;
            padding: 4px 0 10px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 600;
            font-size: 13px;
            color: #000;
          }
          h1 { font-size: 17px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
          p { margin: 3px 0; }
          .centro { text-align: center; }
          .recuadro { border: 1px solid #000; padding: 3px; }
          .ref { font-size: 11px; font-weight: 400; color: #333; padding-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; }
          hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
          .total-fila td { font-size: 15px; font-weight: 700; padding-top: 6px; }
        </style>
      </head>
      <body>
        <h1>GEEK STORE</h1>
        ${sinConexion ? '<p class="centro recuadro">*** SIN CONEXIÓN - PENDIENTE DE SINCRONIZAR ***</p>' : ''}
        ${copia ? `<p class="centro recuadro">*** ${escaparHtml(copia)} ***</p>` : ''}
        ${anulada ? '<p class="centro recuadro">*** VENTA ANULADA ***</p>' : ''}
        <p class="centro">Venta #${escaparHtml(ventaId)}</p>
        <p class="centro">${escaparHtml(fecha)}</p>
        <hr />
        <table>${filasHtml}</table>
        <hr />
        <table>
          <tr class="total-fila"><td>TOTAL</td><td style="text-align:right;">${moneda(totalVenta)}</td></tr>
        </table>
        <hr />
        ${
          listaPagos.length > 1
            ? listaPagos.map((p) => `<p>${escaparHtml(p.medio_pago)}: ${moneda(p.monto)}</p>`).join('')
            : `<p>Medio de pago: ${escaparHtml(listaPagos[0]?.medio_pago || '-')}</p>`
        }
        ${vendedorNombre ? `<p>Vendedor: ${escaparHtml(vendedorNombre)}</p>` : ''}
        ${listaUsada ? `<p>Lista de precios: ${listaUsada === 'distribuidor' ? 'Distribuidor' : 'Principal'}</p>` : ''}
        <hr />
        <p class="centro">¡Gracias por su compra!</p>
      </body>
      </html>`;
}

// Imprime un HTML en un iframe invisible. alTerminar se llama al cerrar el
// diálogo de impresión (impreso o cancelado).
export function imprimirEnIframe(html, alTerminar) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  let limpiado = false;
  const limpiar = () => {
    if (limpiado) return;
    limpiado = true;
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  let terminado = false;
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    limpiar();
    if (alTerminar) alTerminar();
  };

  const ventanaIframe = iframe.contentWindow;
  ventanaIframe.addEventListener('afterprint', terminar);
  // Por si el navegador no dispara "afterprint" en un iframe: se limpia igual
  // (sin llamar alTerminar, para no mover el cursor de alguien que ya escribe).
  setTimeout(limpiar, 30000);

  // Margen para que el navegador termine de montar el documento. En Chrome,
  // print() espera hasta que se cierra el diálogo.
  setTimeout(() => {
    try {
      ventanaIframe.focus();
      ventanaIframe.print();
      terminar();
    } catch {
      terminar();
    }
  }, 200);
}

export function imprimirTicketVenta(datos, alTerminar) {
  imprimirEnIframe(htmlTicketVenta(datos), alTerminar);
}
