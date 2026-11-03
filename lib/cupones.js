import crypto from 'crypto';
import sql from './db';

// CUPONES (octubre 2026). Ver migracion_cupones.sql.
// Cada cupón tiene un código único y hasta dos beneficios de un solo uso:
// compra (en geekstore.com.co o en la tienda) y servicio técnico (opcional).
//
// CAMPAÑAS PERSONALIZADAS (oct 2026): Nelson crea sus propias campañas desde
// el POS (Cupones → Crear cupones): nombre, prefijo del código, descuento en
// PORCENTAJE (con tope opcional) o en VALOR FIJO, compra mínima, categorías
// que no aplican, vigencia, mensaje y bono de servicio técnico opcional.
// Se guardan en la tabla cupon_campanas (se crea sola). Cada cupón copia las
// reglas de su campaña al crearse: si después se cambia la campaña, los
// cupones ya entregados conservan las suyas.

// Campaña con la que arrancó el sistema (feria SOFA). Se usa para crear la
// primera campaña en la tabla si está vacía.
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
  mensaje: 'Gracias por visitarnos en SOFA.',
};

export const MENSAJE_MIGRACION = 'Falta correr migracion_cupones.sql en Neon (SQL Editor) para usar los cupones.';

// Tope "sin límite" que se le entrega a la tienda (la versión anterior de la
// tienda trata tope 0 como "sin descuento").
const SIN_TOPE = 999999999;

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
  if (migracionLista) await asegurarCampanas();
  return migracionLista;
}

// Tabla de campañas + columnas nuevas de los cupones (se crean solas).
let campanasListas = false;
export async function asegurarCampanas() {
  if (campanasListas) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cupon_campanas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      prefijo TEXT NOT NULL,
      compra_tipo TEXT NOT NULL DEFAULT 'porcentaje',
      compra_porcentaje NUMERIC NOT NULL DEFAULT 0,
      compra_monto NUMERIC NOT NULL DEFAULT 0,
      compra_tope NUMERIC,
      compra_minimo NUMERIC,
      compra_excluir TEXT NOT NULL DEFAULT '',
      servicio_bono NUMERIC NOT NULL DEFAULT 0,
      servicio_minimo NUMERIC NOT NULL DEFAULT 0,
      servicio_garantia TEXT NOT NULL DEFAULT '',
      valido_desde DATE NOT NULL,
      valido_hasta DATE NOT NULL,
      mensaje TEXT NOT NULL DEFAULT '',
      activa BOOLEAN NOT NULL DEFAULT false,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS compra_tipo TEXT`;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS compra_monto NUMERIC`;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS compra_minimo NUMERIC`;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS mensaje TEXT`;
  // Recordatorios por WhatsApp (nov 2026): cuándo se le escribió, cuántas
  // veces, y si pidió no recibir más mensajes.
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS recordado_en TIMESTAMPTZ`;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS recordatorios INT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE cupones ADD COLUMN IF NOT EXISTS no_contactar BOOLEAN NOT NULL DEFAULT false`;
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM cupon_campanas`;
  if (!n) {
    const k = CAMPANA;
    await sql`
      INSERT INTO cupon_campanas (nombre, prefijo, compra_tipo, compra_porcentaje, compra_tope, compra_excluir,
        servicio_bono, servicio_minimo, servicio_garantia, valido_desde, valido_hasta, mensaje, activa)
      VALUES (${k.nombre}, ${k.prefijo}, 'porcentaje', ${k.compraPorcentaje}, ${k.compraTope}, ${k.compraExcluir},
        ${k.servicioBono}, ${k.servicioMinimo}, ${k.servicioGarantia}, ${k.validoDesde}, ${k.validoHasta}, ${k.mensaje}, true)
      ON CONFLICT (nombre) DO NOTHING
    `;
  }
  campanasListas = true;
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

// Prefijo del código: solo letras y números, máximo 12 (igual a
// limpiarPrefijo de lib/cuponTexto.js).
export function normalizarPrefijo(p) {
  return String(p || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

// Prefijo sugerido a partir del nombre, sin el año ("Navidad 2026" → "NAVIDAD").
function prefijoDesdeNombre(nombre) {
  return normalizarPrefijo(String(nombre || '').replace(/\b(19|20)\d\d\b/g, '')) || normalizarPrefijo(nombre);
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

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const esMonto = (c) => c.compra_tipo === 'monto';

// Lo que se puede mostrar fuera del POS (sin teléfono ni datos internos).
// porcentaje/tope van también para la versión anterior de la tienda: un
// valor fijo se ve como "100 % con tope = valor" (da el mismo descuento).
export function cuponPublico(c) {
  const monto = esMonto(c);
  const tope = num(c.compra_tope);
  return {
    codigo: c.codigo,
    campana: c.campana,
    // null = cupón viejo (antes de las campañas): la tienda saluda con el evento.
    mensaje: c.mensaje ?? null,
    validoDesde: iso(c.valido_desde),
    validoHasta: iso(c.valido_hasta),
    vigencia: estadoVigencia(c),
    compra: {
      tipo: monto ? 'monto' : 'porcentaje',
      porcentaje: monto ? 100 : Number(c.compra_porcentaje),
      monto: monto ? Number(c.compra_monto) : 0,
      tope: monto ? Number(c.compra_monto) : tope && tope > 0 ? tope : SIN_TOPE,
      conTope: monto ? false : Boolean(tope && tope > 0),
      minimo: Number(c.compra_minimo) || 0,
      excluir: String(c.compra_excluir || '').split(',').map((s) => s.trim()).filter(Boolean),
      usada: Boolean(c.compra_usada_en),
    },
    servicio: {
      activo: Number(c.servicio_bono) > 0,
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

// ─── Campañas ──────────────────────────────────────────────────────────
export async function listarCampanas() {
  await asegurarCampanas();
  return sql`
    SELECT k.*, COALESCE(c.n, 0)::int AS entregados
    FROM cupon_campanas k
    LEFT JOIN (SELECT campana, COUNT(*) AS n FROM cupones GROUP BY campana) c ON c.campana = k.nombre
    ORDER BY k.activa DESC, k.creado_en DESC
  `;
}

export async function leerCampana(nombre) {
  await asegurarCampanas();
  if (nombre) {
    const [k] = await sql`SELECT * FROM cupon_campanas WHERE nombre = ${nombre}`;
    if (k) return k;
  }
  const [activa] = await sql`SELECT * FROM cupon_campanas WHERE activa = true ORDER BY id DESC LIMIT 1`;
  if (activa) return activa;
  const [ultima] = await sql`SELECT * FROM cupon_campanas ORDER BY creado_en DESC LIMIT 1`;
  return ultima || null;
}

// Revisa y limpia lo que llega del formulario de campaña.
export function validarCampana(b) {
  const nombre = String(b.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!nombre) throw new ErrorCupon('Escribe el nombre del cupón / campaña');
  const prefijo = b.prefijo ? normalizarPrefijo(b.prefijo) : prefijoDesdeNombre(nombre);
  if (prefijo.length < 2) throw new ErrorCupon('El prefijo del código debe tener al menos 2 letras o números');
  const tipo = b.compra_tipo === 'monto' ? 'monto' : 'porcentaje';
  const porcentaje = Number(b.compra_porcentaje) || 0;
  const monto = Math.round(Number(b.compra_monto) || 0);
  if (tipo === 'porcentaje' && !(porcentaje > 0 && porcentaje <= 100)) throw new ErrorCupon('El porcentaje debe ser entre 1 y 100');
  if (tipo === 'monto' && !(monto > 0)) throw new ErrorCupon('Escribe el valor del descuento');
  const tope = Math.round(Number(b.compra_tope) || 0) || null;
  const minimo = Math.round(Number(b.compra_minimo) || 0) || null;
  const desde = iso(b.valido_desde);
  const hasta = iso(b.valido_hasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new ErrorCupon('Elige las fechas de vigencia');
  if (hasta < desde) throw new ErrorCupon('La fecha final no puede ser antes de la inicial');
  const servicioBono = Math.round(Number(b.servicio_bono) || 0);
  return {
    nombre,
    prefijo,
    compra_tipo: tipo,
    compra_porcentaje: tipo === 'porcentaje' ? porcentaje : 0,
    compra_monto: tipo === 'monto' ? monto : 0,
    compra_tope: tipo === 'porcentaje' ? tope : null,
    compra_minimo: minimo,
    compra_excluir: String(b.compra_excluir || '').split(',').map((s) => s.trim()).filter(Boolean).join(', ').slice(0, 200),
    servicio_bono: servicioBono,
    servicio_minimo: servicioBono ? Math.round(Number(b.servicio_minimo) || 0) : 0,
    servicio_garantia: servicioBono ? String(b.servicio_garantia || '').trim().slice(0, 200) : '',
    valido_desde: desde,
    valido_hasta: hasta,
    mensaje: String(b.mensaje || '').trim().slice(0, 400),
  };
}

// Crea (sin id) o actualiza (con id) una campaña.
export async function guardarCampana(b) {
  await asegurarCampanas();
  const k = validarCampana(b);
  const id = Number(b.id) || 0;
  const [igual] = await sql`SELECT id FROM cupon_campanas WHERE lower(nombre) = lower(${k.nombre}) AND id <> ${id}`;
  if (igual) throw new ErrorCupon('Ya existe una campaña con ese nombre', 409);
  try {
    const [fila] = id
      ? await sql`
          UPDATE cupon_campanas SET nombre = ${k.nombre}, prefijo = ${k.prefijo}, compra_tipo = ${k.compra_tipo},
            compra_porcentaje = ${k.compra_porcentaje}, compra_monto = ${k.compra_monto}, compra_tope = ${k.compra_tope},
            compra_minimo = ${k.compra_minimo}, compra_excluir = ${k.compra_excluir}, servicio_bono = ${k.servicio_bono},
            servicio_minimo = ${k.servicio_minimo}, servicio_garantia = ${k.servicio_garantia}, valido_desde = ${k.valido_desde},
            valido_hasta = ${k.valido_hasta}, mensaje = ${k.mensaje}
          WHERE id = ${id}
          RETURNING *
        `
      : await sql`
          INSERT INTO cupon_campanas (nombre, prefijo, compra_tipo, compra_porcentaje, compra_monto, compra_tope, compra_minimo,
            compra_excluir, servicio_bono, servicio_minimo, servicio_garantia, valido_desde, valido_hasta, mensaje)
          VALUES (${k.nombre}, ${k.prefijo}, ${k.compra_tipo}, ${k.compra_porcentaje}, ${k.compra_monto}, ${k.compra_tope}, ${k.compra_minimo},
            ${k.compra_excluir}, ${k.servicio_bono}, ${k.servicio_minimo}, ${k.servicio_garantia}, ${k.valido_desde}, ${k.valido_hasta}, ${k.mensaje})
          RETURNING *
        `;
    if (!fila) throw new ErrorCupon('Esa campaña ya no existe', 404);
    // Si se renombró, los cupones ya entregados siguen en la campaña.
    if (id && b.nombreAnterior && b.nombreAnterior !== k.nombre) {
      await sql`UPDATE cupones SET campana = ${k.nombre} WHERE campana = ${b.nombreAnterior}`;
    }
    return fila;
  } catch (e) {
    if (String(e.message).includes('duplicate key')) throw new ErrorCupon('Ya existe una campaña con ese nombre', 409);
    throw e;
  }
}

// La campaña activa es la que usa "🎟️ Dar cupón" de Venta rápida.
export async function activarCampana(id) {
  await asegurarCampanas();
  await sql.transaction([
    sql`UPDATE cupon_campanas SET activa = false WHERE activa = true`,
    sql`UPDATE cupon_campanas SET activa = true WHERE id = ${Number(id)}`,
  ]);
}

// ─── Crear cupones ─────────────────────────────────────────────────────
async function insertarCupon(k, { codigo, nombre, tel, ventaId }) {
  const filas = await sql`
    INSERT INTO cupones (codigo, campana, cliente_nombre, cliente_telefono, venta_id, valido_desde, valido_hasta,
                         compra_tipo, compra_porcentaje, compra_monto, compra_tope, compra_minimo, compra_excluir,
                         servicio_bono, servicio_minimo, servicio_garantia, mensaje)
    VALUES (${codigo}, ${k.nombre}, ${String(nombre || '').trim().slice(0, 80) || null}, ${tel || null}, ${Number(ventaId) || null},
            ${iso(k.valido_desde)}, ${iso(k.valido_hasta)}, ${k.compra_tipo || 'porcentaje'}, ${Number(k.compra_porcentaje) || 0},
            ${Number(k.compra_monto) || 0}, ${num(k.compra_tope) ?? 0}, ${num(k.compra_minimo)}, ${k.compra_excluir || ''},
            ${Number(k.servicio_bono) || 0}, ${Number(k.servicio_minimo) || 0}, ${k.servicio_garantia || ''}, ${k.mensaje || ''})
    ON CONFLICT (codigo) DO NOTHING
    RETURNING *
  `;
  return filas[0] || null;
}

// Crea un cupón (o devuelve el que ya tenía ese celular en la campaña: un
// cupón por persona). codigo: opcional, un código escrito a mano
// (ej. "NELSON20"); si ya existe, error.
export async function crearCupon({ telefono, nombre, ventaId, campana, codigo } = {}) {
  await asegurarCampanas();
  const k = await leerCampana(campana);
  if (!k) throw new ErrorCupon('No hay ninguna campaña de cupones creada', 404);
  if (campana && k.nombre !== campana) throw new ErrorCupon(`No existe la campaña ${campana}`, 404);
  const tel = normalizarTelefono(telefono);
  if (telefono && !tel) throw new ErrorCupon('El celular debe tener 10 dígitos y empezar por 3');
  if (tel) {
    const [ya] = await sql`SELECT * FROM cupones WHERE campana = ${k.nombre} AND cliente_telefono = ${tel} ORDER BY id LIMIT 1`;
    if (ya) return { cupon: ya, existente: true };
  }
  const manual = normalizarCodigo(codigo);
  if (manual) {
    if (manual.length < 4) throw new ErrorCupon('El código debe tener al menos 4 letras o números');
    const c = await insertarCupon(k, { codigo: manual, nombre, tel, ventaId });
    if (!c) throw new ErrorCupon(`Ya existe un cupón con el código ${manual}`, 409);
    return { cupon: c, existente: false };
  }
  for (let intento = 0; intento < 6; intento++) {
    const c = await insertarCupon(k, { codigo: generarCodigo(normalizarPrefijo(k.prefijo) || 'GEEK'), nombre, tel, ventaId });
    if (c) return { cupon: c, existente: false };
  }
  throw new ErrorCupon('No se pudo generar un código único, intenta de nuevo', 500);
}

// Varios cupones iguales de una campaña, con códigos distintos (para
// repartir o imprimir). Máximo 500 por vez.
export async function crearLote({ campana, cantidad }) {
  await asegurarCampanas();
  const k = await leerCampana(campana);
  if (!k) throw new ErrorCupon('No hay ninguna campaña de cupones creada', 404);
  if (campana && k.nombre !== campana) throw new ErrorCupon(`No existe la campaña ${campana}`, 404);
  const n = Math.floor(Number(cantidad) || 0);
  if (!(n >= 1 && n <= 500)) throw new ErrorCupon('La cantidad debe ser entre 1 y 500');
  const creados = [];
  let fallos = 0;
  while (creados.length < n && fallos < 20) {
    const c = await insertarCupon(k, { codigo: generarCodigo(normalizarPrefijo(k.prefijo) || 'GEEK') });
    if (c) creados.push(c);
    else fallos++;
  }
  return creados;
}

// ─── Usar cupones ──────────────────────────────────────────────────────
export function descuentoCompra(c, totalElegible) {
  const base = Math.max(0, Math.round(Number(totalElegible) || 0));
  if (Number(c.compra_minimo) > 0 && base < Number(c.compra_minimo)) return 0;
  if (esMonto(c)) return Math.min(Math.round(Number(c.compra_monto) || 0), base);
  const d = Math.round((base * Number(c.compra_porcentaje)) / 100);
  const tope = num(c.compra_tope);
  return tope && tope > 0 ? Math.min(d, tope) : d;
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
  if (donde !== 'web') {
    revisarVigencia(c);
    const minimo = Number(c.compra_minimo) || 0;
    if (minimo > 0 && Math.round(Number(total) || 0) < minimo) {
      throw new ErrorCupon(`Este cupón aplica en compras desde $${minimo.toLocaleString('es-CO')}`);
    }
  }
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
  if (!(Number(c.servicio_bono) > 0)) throw new ErrorCupon('Este cupón no trae bono de servicio técnico');
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

// ─── Recordatorios (nov 2026) ──────────────────────────────────────────
// Cupones de una campaña que todavía no se han usado en una compra, que
// tienen celular y que no han vencido: a esos se les puede escribir por
// WhatsApp para recordarles el cupón (uno por uno, desde Cupones).
export async function paraRecordar(campana) {
  await asegurarCampanas();
  const hoy = hoyBogota();
  return sql`
    SELECT * FROM cupones
    WHERE campana = ${campana} AND compra_usada_en IS NULL
      AND COALESCE(cliente_telefono, '') <> '' AND valido_hasta >= ${hoy}
    ORDER BY no_contactar ASC, recordado_en ASC NULLS FIRST, creado_en ASC, id ASC
  `;
}

// accion: 'enviado' (se abrió WhatsApp con el mensaje), 'no_contactar' (pidió
// no recibir más), 'contactar' (deshace lo anterior).
export async function marcarRecordatorio(codigo, accion) {
  await asegurarCampanas();
  const cod = normalizarCodigo(codigo);
  let filas;
  if (accion === 'enviado') {
    filas = await sql`UPDATE cupones SET recordado_en = now(), recordatorios = recordatorios + 1 WHERE codigo = ${cod} RETURNING *`;
  } else if (accion === 'no_contactar' || accion === 'contactar') {
    filas = await sql`UPDATE cupones SET no_contactar = ${accion === 'no_contactar'} WHERE codigo = ${cod} RETURNING *`;
  } else {
    throw new ErrorCupon('Acción inválida');
  }
  if (!filas.length) throw new ErrorCupon('Ese cupón no existe', 404);
  return filas[0];
}

