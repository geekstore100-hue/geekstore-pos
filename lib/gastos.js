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

export function numeroComprobante(id) {
  return `CE-${String(id).padStart(4, '0')}`;
}

export { valorEnLetras } from './valorEnLetras';
