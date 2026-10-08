// Textos del cupón (sin base de datos: se usa tanto en el servidor como en
// el celular, ver app/ventas/rapida). Octubre 2026, campaña SOFA 2026.

import { textoRedes } from './redes';

export const VIDEO_SERVICIO = 'https://youtu.be/lasUJbfzCaE';
export const SITIO = 'https://geekstore.com.co';

function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}

export function fechaLarga(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
}

export function excluidas(cupon) {
  return String(cupon.compra_excluir || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Mensaje de WhatsApp para entregar el cupón.
export function textoCuponWhatsapp(cupon) {
  const exc = excluidas(cupon);
  const l = [];
  l.push(`🎟️ *Tu cupón Geek Store${cupon.campana ? ` · ${cupon.campana}` : ''}*`);
  l.push(`Código: *${cupon.codigo}*`);
  l.push('');
  l.push(
    `🛒 *${Number(cupon.compra_porcentaje)}% de descuento* en tu compra en geekstore.com.co (hasta ${moneda(cupon.compra_tope)}${exc.length ? `; no aplica en ${exc.join(', ').toLowerCase()}` : ''}). Abre este enlace y el cupón queda listo en tu carrito:`
  );
  l.push(`${SITIO}/?cupon=${encodeURIComponent(cupon.codigo)}`);
  l.push('');
  l.push(
    `🔧 *Servicio técnico:* bono de ${moneda(cupon.servicio_bono)} en reparaciones o mantenimientos desde ${moneda(cupon.servicio_minimo)}${cupon.servicio_garantia ? `, y ${cupon.servicio_garantia.charAt(0).toLowerCase()}${cupon.servicio_garantia.slice(1)}` : ''}. Trae tu control, consola o PC: la revisión, como siempre, no tiene costo.`
  );
  l.push(`▶️ Mira cómo trabajamos: ${VIDEO_SERVICIO}`);
  l.push('');
  l.push(`Válido del ${fechaLarga(cupon.valido_desde)} al ${fechaLarga(cupon.valido_hasta)} de ${String(cupon.valido_hasta).slice(0, 4)}. Cada beneficio se usa una vez.`);
  l.push('');
  l.push(textoRedes());
  return l.join('\n');
}

// Línea corta para agregar al comprobante de una venta.
export function lineaCuponComprobante(cupon) {
  return [
    '',
    `🎟️ *Regalo para tu próxima visita:* cupón *${cupon.codigo}*`,
    `${Number(cupon.compra_porcentaje)}% en geekstore.com.co (hasta ${moneda(cupon.compra_tope)}) y bono de ${moneda(cupon.servicio_bono)} + doble garantía en servicio técnico. Del ${fechaLarga(cupon.valido_desde)} al ${fechaLarga(cupon.valido_hasta)}.`,
    `${SITIO}/?cupon=${encodeURIComponent(cupon.codigo)}`,
  ].join('\n');
}
