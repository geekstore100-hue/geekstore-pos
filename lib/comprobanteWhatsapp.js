// Comprobante de venta como mensaje de WhatsApp (octubre 2026): se arma
// el texto y se abre wa.me con el número del cliente (si se escribió) o
// sin número (WhatsApp deja elegir el contacto). No usa ninguna API
// paga: el mensaje lo manda Nelson desde su propio WhatsApp.

import { textoRedes } from './redes';

function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}

export function normalizarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = `57${d}`;
  return d.length >= 7 && d.length <= 15 ? d : '';
}

// venta: { numero, fecha, evento, lineas:[{nombre, cantidad, precio}], total, pagos:[{medio_pago, monto}], clienteNombre, pendiente }
// empresa: { nit, telefono } (opcional)
// extra: texto que va antes de las redes (ej. el cupón de regreso).
export function textoComprobante(venta, empresa = {}, extra = '') {
  const fecha = new Date(venta.fecha || Date.now()).toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const l = [];
  l.push('*Geek Store* 🎮');
  if (empresa.nit) l.push(`NIT ${empresa.nit}`);
  l.push('');
  l.push(venta.numero ? `Comprobante de venta N.° ${venta.numero}` : 'Comprobante de venta');
  l.push(`${venta.evento ? `${venta.evento} · ` : ''}${fecha}`);
  if (venta.clienteNombre) l.push(`Cliente: ${venta.clienteNombre}`);
  l.push('');
  for (const x of venta.lineas || []) {
    l.push(`• ${x.cantidad} × ${x.nombre} — ${moneda(Number(x.precio) * Number(x.cantidad))}`);
  }
  l.push('');
  l.push(`*Total: ${moneda(venta.total)}*`);
  const pagos = venta.pagos || [];
  if (pagos.length > 1) l.push(`Pago: ${pagos.map((p) => `${p.medio_pago} ${moneda(p.monto)}`).join(' + ')}`);
  else if (pagos.length === 1) l.push(`Pago: ${pagos[0].medio_pago}`);
  l.push('');
  const nombre = String(venta.clienteNombre || '').trim().split(/\s+/)[0] || '';
  const nombreBonito = nombre ? nombre.charAt(0).toLocaleUpperCase('es-CO') + nombre.slice(1).toLocaleLowerCase('es-CO') : '';
  l.push(`¡Gracias por tu compra${nombreBonito ? `, ${nombreBonito}` : ''}! Guarda este mensaje como soporte de tu compra y garantía.`);
  if (empresa.telefono) l.push(`Dudas o garantías: ${empresa.telefono}`);
  l.push('geekstore.com.co');
  if (extra) l.push(extra);
  l.push('');
  l.push(textoRedes());
  return l.join('\n');
}

export function enlaceWhatsapp(telefono, texto) {
  const num = normalizarTelefono(telefono);
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
