import crypto from 'crypto';
import sql from './db';

// CUPONES (octubre 2026). Ver migracion_cupones.sql.
// Cada cupón tiene un código único y dos beneficios de un solo uso:
// compra (en geekstore.com.co o en la tienda) y servicio técnico.

// Campaña activa. Para una campaña nueva basta cambiar estos valores: los
// cupones ya entregados conservan sus propias reglas.
export const CAMPANA = {
  nombre: 'SOFA 2026',
  prefijo: 'SOFA',
  validoDesde: '2026-10-13',
  validoHasta: '2026-11-30',
  compraPorcentaje: 10,
  compraTope: 40000,
  compraExcluir: 'Consolas',
  servicioBono: 30000,
  servicioMinimo: 100000,
  servicioGarantia: 'Doble garantía: 6 meses en repuestos y 60 días en mano de obra',
};

export const MENSAJE_MIGRACION = 'Falta correr migracion_cupones.sql en Neon (SQL Editor) para usar los cupones.';

export class ErrorCupon extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

let migracionLista = false;
export async function existeTablaCupones() {
  if (migracionLista) return true;
  const [f] = await sql`SELECT to_regclass('public.cupones') IS NOT NULL AS existe`;
  migracionLista = Boolean(f?.existe);
  return migracionLista;
}

// Sin letras que se confunden (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generarCodigo(prefijo = CAMPANA.prefijo) {
  const bytes = crypto.randomBytes(5);
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return `${prefijo}-${s}`;
}

export function normalizarCodigo(c) {
  return String(c || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 30);
}

export function normalizarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : '';
}

export function hoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));

export function estadoVigencia(c, hoy = hoyBogota()) {
  if (hoy < iso(c.valido_desde)) return 'antes';
  if (hoy > iso(c.valido_hasta)) return 'vencido';
  return 'vigente';
}

// Lo que se puede mostrar fuera del POS (sin teléfono ni datos internos).
export function cuponPublico(c) {
  return {
    codigo: c.codigo,
    campana: c.campana,
    validoDesde: iso(c.valido_desde),
    validoHasta: iso(c.valido_hasta),
    vigencia: estadoVigencia(c),
    compra: {
      porcentaje: Number(c.compra_porcentaje),
      tope: Number(c.compra_tope),
      excluir: String(c.compra_excluir || '').split(',').map((s) => s.trim()).filter(Boolean),
      usada: Boolean(c.compra_usada_en),
    },
    servicio: {
      bono: Number(c.servicio_bono),
      minimo: Number(c.servicio_minimo),
      garantia: c.servicio_garantia || '',
      usado: Boolean(c.servicio_usado_en),
    },
  };
}

export async function leerCupon(codigo) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  const [c] = await sql`SELECT * FROM cupones WHERE codigo = ${cod}`;
  return c || null;
}

// Crea (o devuelve el que ya tenía ese celular en la campaña: un cupón por
// persona).
export async function crearCupon({ telefono, nombre, ventaId } = {}) {
  const tel = normalizarTelefono(telefono);
  if (telefono && !tel) throw new ErrorCupon('El celular debe tener 10 dígitos y empezar por 3');
  if (tel) {
    const [ya] = await sql`SELECT * FROM cupones WHERE campana = ${CAMPANA.nombre} AND cliente_telefono = ${tel} ORDER BY id LIMIT 1`;
    if (ya) return { cupon: ya, existente: true };
  }
  const k = CAMPANA;
  for (let intento = 0; intento < 6; intento++) {
    const codigo = generarCodigo(k.prefijo);
    const filas = await sql`
      INSERT INTO cupones (codigo, campana, cliente_nombre, cliente_telefono, venta_id, valido_desde, valido_hasta,
                           compra_porcentaje, compra_tope, compra_excluir, servicio_bono, servicio_minimo, servicio_garantia)
      VALUES (${codigo}, ${k.nombre}, ${String(nombre || '').trim().slice(0, 80) || null}, ${tel || null}, ${Number(ventaId) || null},
              ${k.validoDesde}, ${k.validoHasta}, ${k.compraPorcentaje}, ${k.compraTope}, ${k.compraExcluir},
              ${k.servicioBono}, ${k.servicioMinimo}, ${k.servicioGarantia})
      ON CONFLICT (codigo) DO NOTHING
      RETURNING *
    `;
    if (filas[0]) return { cupon: filas[0], existente: false };
  }
  throw new ErrorCupon('No se pudo generar un código único, intenta de nuevo', 500);
}

export function descuentoCompra(c, totalElegible) {
  const base = Math.max(0, Math.round(Number(totalElegible) || 0));
  return Math.min(Math.round((base * Number(c.compra_porcentaje)) / 100), Number(c.compra_tope));
}

const fechaBonita = (d) => new Date(`${iso(d)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

function revisarVigencia(c) {
  const v = estadoVigencia(c);
  if (v === 'antes') throw new ErrorCupon(`Este cupón se puede usar desde el ${fechaBonita(c.valido_desde)}`, 409);
  if (v === 'vencido') throw new ErrorCupon(`Este cupón venció el ${fechaBonita(c.valido_hasta)}`, 409);
}

// Uso del beneficio de COMPRA.
//   donde: 'web' (lo marca la tienda al aprobarse el pago) o 'tienda'
//   (compra en el local, lo registra el POS).
export async function usarCompra(codigo, { donde, referencia, total, descuento }) {
  const c = await leerCupon(codigo);
  if (!c) throw new ErrorCupon('Ese cupón no existe', 404);
  if (c.compra_usada_en) {
    if (referencia && c.compra_ref === String(referencia)) return { cupon: c, repetido: true };
    throw new ErrorCupon('El descuento de compra de este cupón ya se usó', 409);
  }
  // En la web el pago ya está aprobado cuando llega aquí: se registra aunque
  // justo haya vencido (el cliente pagó con el descuento cuando era válido).
  if (donde !== 'web') revisarVigencia(c);
  const desc = descuento !== undefined ? Math.round(Number(descuento) || 0) : descuentoCompra(c, total);
  const [act] = await sql`
    UPDATE cupones SET compra_usada_en = now(), compra_donde = ${donde}, compra_ref = ${referencia ? String(referencia).slice(0, 80) : null},
      compra_descuento = ${desc}, compra_total = ${Math.round(Number(total) || 0)}
    WHERE id = ${c.id} AND compra_usada_en IS NULL
    RETURNING *
  `;
  if (!act) throw new ErrorCupon('El descuento de compra de este cupón ya se usó', 409);
  return { cupon: act, descuento: desc };
}

// Uso del beneficio de SERVICIO TÉCNICO (lo registra el POS).
export async function usarServicio(codigo, { total, referencia, nota }) {
  const c = await leerCupon(codigo);
  if (!c) throw new ErrorCupon('Ese cupón no existe', 404);
  if (c.servicio_usado_en) throw new ErrorCupon('El bono de servicio técnico de este cupón ya se usó', 409);
  revisarVigencia(c);
  const t = Math.round(Number(total) || 0);
  if (t < Number(c.servicio_minimo)) {
    throw new ErrorCupon(`El bono aplica en reparaciones o mantenimientos desde $${Number(c.servicio_minimo).toLocaleString('es-CO')}`);
  }
  const [act] = await sql`
    UPDATE cupones SET servicio_usado_en = now(), servicio_total = ${t},
      servicio_ref = ${String(referencia || '').trim().slice(0, 80) || null}, servicio_nota = ${String(nota || '').trim().slice(0, 300) || null}
    WHERE id = ${c.id} AND servicio_usado_en IS NULL
    RETURNING *
  `;
  if (!act) throw new ErrorCupon('El bono de servicio técnico de este cupón ya se usó', 409);
  return { cupon: act, bono: Math.min(Number(c.servicio_bono), t) };
}

// Antes de abrir el pago en la web: revisa que se pueda usar y deja anotada
// la referencia del pago (para saber qué intento lo usó).
export async function reservarCompra(codigo, referencia) {
  const c = await leerCupon(codigo);
  if (!c) throw new ErrorCupon('Ese cupón no existe', 404);
  if (c.compra_usada_en) throw new ErrorCupon('El descuento de compra de este cupón ya se usó', 409);
  revisarVigencia(c);
  await sql`UPDATE cupones SET compra_reservada_ref = ${String(referencia).slice(0, 80)}, compra_reservada_en = now() WHERE id = ${c.id}`;
  return c;
}
