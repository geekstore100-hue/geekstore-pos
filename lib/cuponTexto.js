// Textos del cupón (sin base de datos: se usa tanto en el servidor como en
// el celular, ver app/ventas/rapida y app/cupones). Octubre 2026.
// Sirven igual para un cupón y para una campaña (tienen las mismas columnas:
// compra_tipo, compra_porcentaje, compra_monto, compra_tope, compra_minimo,
// compra_excluir, servicio_bono, servicio_minimo, servicio_garantia, mensaje).

export const VIDEO_SERVICIO = 'https://youtu.be/lasUJbfzCaE';
export const SITIO = 'https://geekstore.com.co';

export function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}

// Fecha AAAA-MM-DD (o Date) → "30 de noviembre".
export function fechaIso(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10);
}

export function fechaLarga(iso) {
  const d = new Date(`${fechaIso(iso)}T12:00:00`);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
}

export function excluidas(cupon) {
  return String(cupon.compra_excluir || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Primer nombre con mayúscula inicial ("laura MARÍA" → "Laura").
export function primerNombre(nombre) {
  const n = String(nombre || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toLocaleUpperCase('es-CO') + n.slice(1).toLocaleLowerCase('es-CO') : '';
}

// Prefijo del código: solo letras y números, máximo 12 ("bf" → "BF").
// Igual a normalizarPrefijo de lib/cupones.js (que no se puede usar en el
// navegador).
export function limpiarPrefijo(p) {
  return String(p || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

// Prefijo sugerido a partir del nombre, sin el año ("Navidad 2026" → "NAVIDAD").
export function prefijoDesdeNombre(nombre) {
  return limpiarPrefijo(String(nombre || '').replace(/\b(19|20)\d\d\b/g, '')) || limpiarPrefijo(nombre);
}

export const esMonto = (c) => c?.compra_tipo === 'monto';
export const tieneServicio = (c) => Number(c?.servicio_bono) > 0;

// "10% de descuento" / "$20.000 de descuento".
export function descuentoCorto(c) {
  return esMonto(c) ? `${moneda(c.compra_monto)} de descuento` : `${Number(c.compra_porcentaje)}% de descuento`;
}

// Condiciones del descuento: "hasta $40.000; en compras desde $100.000; no
// aplica en consolas". Vacío si no tiene ninguna.
export function condicionesCompra(c) {
  const partes = [];
  const tope = Number(c.compra_tope) || 0;
  if (!esMonto(c) && tope > 0) partes.push(`hasta ${moneda(tope)}`);
  if (Number(c.compra_minimo) > 0) partes.push(`en compras desde ${moneda(c.compra_minimo)}`);
  const exc = excluidas(c);
  if (exc.length) partes.push(`no aplica en ${exc.join(', ').toLowerCase()}`);
  return partes.join('; ');
}

// "10% de descuento (hasta $40.000; no aplica en consolas)".
export function descripcionCompra(c) {
  const cond = condicionesCompra(c);
  return `${descuentoCorto(c)}${cond ? ` (${cond})` : ''}`;
}

export function descripcionServicio(c) {
  if (!tieneServicio(c)) return '';
  return `Bono de ${moneda(c.servicio_bono)} en servicio técnico${Number(c.servicio_minimo) > 0 ? ` desde ${moneda(c.servicio_minimo)}` : ''}${c.servicio_garantia ? ` + ${String(c.servicio_garantia).split(':')[0].toLowerCase()}` : ''}`;
}

function vigenciaTexto(c) {
  return `Válido del ${fechaLarga(c.valido_desde)} al ${fechaLarga(c.valido_hasta)} de ${fechaIso(c.valido_hasta).slice(0, 4)}.`;
}

// Saludo: el mensaje de la campaña. Los cupones SOFA viejos no tienen
// mensaje guardado (null): se arma con el nombre del evento como antes.
function saludo(cupon) {
  if (cupon.mensaje) return cupon.mensaje;
  if (cupon.mensaje === undefined || cupon.mensaje === null) {
    const evento = String(cupon.campana || '').replace(/\s*20\d\d$/, '').trim();
    if (evento) return `Gracias por visitarnos en ${evento}.`;
  }
  return 'Aquí tienes tu cupón de Geek Store.';
}

export function enlaceCupon(cupon) {
  return `${SITIO}/?cupon=${encodeURIComponent(cupon.codigo)}`;
}

// Mensaje de WhatsApp para entregar el cupón (personalizado con el nombre
// de la persona, si se escribió). El enlace del cupón es el ÚNICO enlace del
// mensaje (WhatsApp muestra la vista previa del primer enlace).
export function textoCuponWhatsapp(cupon) {
  const nombre = primerNombre(cupon.cliente_nombre);
  const l = [];
  l.push(`¡Hola${nombre ? ` ${nombre}` : ''}! 👋 ${saludo(cupon)}`);
  l.push('');
  l.push(`🎁 *Tu cupón: ${cupon.codigo}*`);
  l.push('👉 *Toca aquí y el descuento queda listo en tu carrito:*');
  l.push(enlaceCupon(cupon));
  l.push('');
  const cond = condicionesCompra(cupon);
  l.push(`🛒 *${descuentoCorto(cupon)}* en la página${cond ? ` (${cond})` : ''}.`);
  if (tieneServicio(cupon)) l.push(`🔧 *${descripcionServicio(cupon)}*. Revisión sin costo.`);
  l.push('');
  l.push(vigenciaTexto(cupon));
  return l.join('\n');
}

// Línea corta para agregar al comprobante de una venta.
export function lineaCuponComprobante(cupon) {
  const benef = [`${descripcionCompra(cupon)} en la página`];
  if (tieneServicio(cupon)) benef.push(descripcionServicio(cupon).replace(/^Bono/, 'bono'));
  return [
    '',
    '━━━━━━━━━━━━',
    `🎁 *Regalo para tu próxima compra: cupón ${cupon.codigo}*`,
    `${benef.join(' y ')}. Del ${fechaLarga(cupon.valido_desde)} al ${fechaLarga(cupon.valido_hasta)}.`,
    '',
    '👉 *Toca aquí y el descuento queda listo en tu carrito:*',
    enlaceCupon(cupon),
  ].join('\n');
}

// ─── Recordatorios por WhatsApp (nov 2026) ─────────────────────────────
// Plantillas editables desde Cupones → Recordatorios. Se reemplazan:
//   {nombre} {codigo} {descuento} {condiciones} {servicio} {vence}
//   {cuando} {enlace} {evento}
export const PLANTILLAS_RECORDATORIO = {
  activo: {
    titulo: 'Sigue activo',
    texto:
      '¡Hola {nombre}! 👋 Te escribimos de Geek Store{evento}.\n\nTu cupón *{codigo}* sigue activo hasta el *{vence}*:\n🛒 *{descuento}* en la página{condiciones}.\n{servicio}\n👉 Toca aquí y el descuento queda listo en tu carrito:\n{enlace}\n\nSi no quieres recibir más mensajes, respóndenos NO.',
  },
  ultimos: {
    titulo: 'Últimos días',
    texto:
      '¡Hola {nombre}! ⏰ Tu cupón *{codigo}* de Geek Store vence {cuando}.\n\n🛒 *{descuento}* en la página{condiciones}.\n{servicio}\n👉 Úsalo aquí antes de que se venza:\n{enlace}\n\nSi no quieres recibir más mensajes, respóndenos NO.',
  },
};

function hoyIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

// Días que le quedan al cupón (0 = vence hoy).
export function diasParaVencer(cupon, hoy = hoyIso()) {
  const a = new Date(`${hoy}T12:00:00Z`);
  const b = new Date(`${fechaIso(cupon.valido_hasta)}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function textoRecordatorio(cupon, plantilla, hoy = hoyIso()) {
  const dias = diasParaVencer(cupon, hoy);
  const vence = fechaLarga(cupon.valido_hasta);
  const cond = condicionesCompra(cupon);
  const evento = cupon.mensaje === null || cupon.mensaje === undefined ? String(cupon.campana || '').replace(/\s*20\d\d$/, '').trim() : '';
  const valores = {
    nombre: primerNombre(cupon.cliente_nombre),
    codigo: cupon.codigo,
    descuento: descuentoCorto(cupon),
    condiciones: cond ? ` (${cond})` : '',
    servicio: tieneServicio(cupon) && !cupon.servicio_usado_en ? `🔧 Y tu ${descripcionServicio(cupon).replace(/^Bono/, 'bono')} sigue disponible.` : '',
    vence,
    cuando: dias <= 0 ? 'HOY' : dias === 1 ? 'MAÑANA' : `en ${dias} días (el ${vence})`,
    enlace: enlaceCupon(cupon),
    evento: evento ? ` (nos conocimos en ${evento})` : '',
  };
  return String(plantilla || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m))
    .replace(/ +([!,.?])/g, '$1') // "¡Hola !" → "¡Hola!"
    .replace(/\n{3,}/g, '\n\n') // línea vacía si no hay {servicio}
    .trim();
}
