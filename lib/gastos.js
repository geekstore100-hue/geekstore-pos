import sql from './db';

// lib/gastos.js — nov 2026. Gastos del negocio que NO son mercancía:
// arriendo, servicios públicos, nómina, domicilios, aseo… (las compras de
// mercancía siguen en Gastos → Factura de compra).
//
// - Cada gasto tiene su N.º consecutivo (CE-0001…) y se imprime como
//   "Comprobante de egreso" en hoja carta (app/gastos/[id]/imprimir).
// - Si se pagó en efectivo CON PLATA DE LA CAJA, se marca "de_caja" y queda
//   en el turno abierto: se resta del dinero esperado al cerrar el turno y en
//   los arqueos (lib/resumenTurno.js).
// - No se borra: se anula (queda la huella, con el motivo).
// - "Pagado a" sale de una lista de contactos (gastos_contactos): se crea
//   una vez (nombre, NIT/cédula, teléfono) y después solo se elige. El gasto
//   guarda además una copia del nombre y documento, para que el comprobante
//   no cambie si después se edita el contacto.

export const CATEGORIAS = [
  'Arriendo',
  'Servicios públicos',
  'Internet y teléfono',
  'Nómina',
  'Seguridad social',
  'Honorarios (contador, abogado)',
  'Transporte y domicilios',
  'Aseo y cafetería',
  'Papelería y oficina',
  'Mantenimiento y reparaciones',
  'Publicidad',
  'Impuestos',
  'Gastos bancarios',
  'Otros',
];

export const MEDIOS_PAGO_GASTO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'];

let lista = null;
// Crea la tabla la primera vez (si ya existe no hace nada).
export async function tablaGastos() {
  if (lista) return lista;
  lista = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS gastos (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL,
        categoria TEXT NOT NULL,
        concepto TEXT NOT NULL,
        beneficiario TEXT,
        beneficiario_doc TEXT,
        valor NUMERIC NOT NULL CHECK (valor > 0),
        medio_pago TEXT NOT NULL,
        de_caja BOOLEAN NOT NULL DEFAULT false,
        turno_id INT,
        notas TEXT,
        id_local TEXT UNIQUE,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
        anulado BOOLEAN NOT NULL DEFAULT false,
        anulado_en TIMESTAMPTZ,
        motivo_anulacion TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha)`;
    await sql`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS contacto_id INT`;
    await sql`
      CREATE TABLE IF NOT EXISTS gastos_contactos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        documento TEXT,
        telefono TEXT,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS gastos_contactos_nombre_unico ON gastos_contactos (lower(nombre))`;
    // Los "Pagado a" que ya se habían escrito antes pasan a ser contactos.
    await sql`
      INSERT INTO gastos_contactos (nombre, documento)
      SELECT DISTINCT ON (lower(beneficiario)) beneficiario, beneficiario_doc
      FROM gastos WHERE beneficiario IS NOT NULL AND beneficiario <> ''
      -- de cada nombre, el más reciente que tenga NIT/cédula
      ORDER BY lower(beneficiario), (beneficiario_doc IS NULL OR beneficiario_doc = ''), id DESC
      ON CONFLICT DO NOTHING
    `;
    await sql`
      UPDATE gastos g SET contacto_id = c.id FROM gastos_contactos c
      WHERE g.contacto_id IS NULL AND g.beneficiario IS NOT NULL AND lower(c.nombre) = lower(g.beneficiario)
    `;
    await sql`CREATE INDEX IF NOT EXISTS gastos_turno_idx ON gastos (turno_id) WHERE de_caja`;
    return true;
  })().catch((e) => {
    lista = null;
    throw e;
  });
  return lista;
}

// ¿Ya existe la tabla? (para el cuadre de caja: si nunca se ha registrado un
// gasto, no hay nada que restar y no se crea nada).
export async function hayTablaGastos() {
  const [f] = await sql`SELECT to_regclass('public.gastos') IS NOT NULL AS si`;
  return Boolean(f?.si);
}

export function limpiarContacto(b = {}) {
  const t = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return { nombre: t(b.nombre, 120), documento: t(b.documento, 30) || null, telefono: t(b.telefono, 30) || null };
}

export function numeroComprobante(id) {
  return `CE-${String(id).padStart(4, '0')}`;
}

export { valorEnLetras } from './valorEnLetras';
