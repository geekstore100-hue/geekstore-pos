import sql from './db';

// Retenciones de ReteICA registradas SIN factura de compra (octubre 2026).
// Pensado para Eve Jeans: el local de ropa declara con el mismo NIT que
// Geek Store, así que sus retenciones van en la misma declaración y en los
// mismos certificados, pero sus compras NO se registran como facturas de
// compra del POS (no son productos de Geek Store y no deben mover stock ni
// el valor del inventario). Aquí solo se guarda la retención.
//
// Tabla: retenciones_reteica (migracion_retenciones_reteica.sql).

export const NEGOCIOS = ['Eve Jeans', 'Geek Store'];
// Las mismas tarifas rápidas de las facturas de compra; también se acepta
// otra tarifa (la de la actividad del proveedor), entre 0 y 10 %.
export const TARIFAS_SUGERIDAS = [1.1, 0.41];

export const MENSAJE_MIGRACION =
  'Falta correr migracion_retenciones_reteica.sql en Neon (SQL Editor) para poder registrar retenciones sin factura de compra.';

export class ErrorRetencion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

let existeCache = false;
export async function existeTablaRetenciones() {
  if (existeCache) return true;
  const [fila] = await sql`SELECT to_regclass('public.retenciones_reteica') IS NOT NULL AS existe`;
  existeCache = Boolean(fila?.existe);
  return existeCache;
}

function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

const texto = (v, max) => {
  const t = String(v ?? '').trim().slice(0, max);
  return t || null;
};

// Valida y limpia lo que llega del formulario.
export async function prepararRetencion(body = {}) {
  const negocio = NEGOCIOS.includes(body.negocio) ? body.negocio : null;
  if (!negocio) throw new ErrorRetencion('Elige el negocio (Eve Jeans o Geek Store)');

  const proveedorId = Number(body.proveedor_id);
  if (!Number.isInteger(proveedorId) || proveedorId <= 0) throw new ErrorRetencion('Selecciona el proveedor');
  const [proveedor] = await sql`SELECT id, nombre FROM proveedores WHERE id = ${proveedorId}`;
  if (!proveedor) throw new ErrorRetencion('El proveedor no existe', 404);

  if (!fechaValida(body.fecha)) throw new ErrorRetencion('Escribe la fecha de la factura');

  const base = Math.round(Number(body.base));
  const porcentaje = Number(body.porcentaje);
  const valor = Math.round(Number(body.valor));
  if (!(base > 0)) throw new ErrorRetencion('La base de la retención debe ser mayor a 0');
  if (!(porcentaje > 0 && porcentaje <= 10)) throw new ErrorRetencion('La tarifa debe estar entre 0 y 10 %');
  if (!(valor > 0)) throw new ErrorRetencion('El valor retenido debe ser mayor a 0');
  if (valor > base) throw new ErrorRetencion('El valor retenido no puede ser mayor que la base');

  return {
    negocio,
    proveedor_id: proveedorId,
    fecha: body.fecha,
    numero_factura: texto(body.numero_factura, 60),
    concepto: texto(body.concepto, 160),
    base,
    porcentaje: Math.round(porcentaje * 1000) / 1000,
    valor,
    notas: texto(body.notas, 500),
  };
}

// Todas las retenciones de un período, de las DOS fuentes, con el mismo
// formato que ya usaban el certificado y su PDF (numero, fecha_creacion,
// retencion_base, retencion_porcentaje, retencion_valor):
//   - facturas de compra del POS con retención (Geek Store),
//   - retenciones registradas sin factura (Eve Jeans u otras).
export async function retencionesDelPeriodo({ desde, hasta, proveedorId = null }) {
  const facturas = await sql`
    SELECT 'f-' || f.id AS id, f.proveedor_id, f.numero, f.fecha_creacion,
           f.retencion_porcentaje, COALESCE(f.retencion_base, f.subtotal) AS retencion_base, f.retencion_valor,
           'Geek Store' AS negocio, 'Factura de compra' AS origen
    FROM facturas_compra f
    WHERE f.fecha_creacion >= ${desde} AND f.fecha_creacion <= ${hasta}
      AND f.retencion_valor > 0
      AND (${proveedorId}::int IS NULL OR f.proveedor_id = ${proveedorId}::int)
  `;
  let otras = [];
  if (await existeTablaRetenciones()) {
    otras = await sql`
      SELECT 'r-' || r.id AS id, r.proveedor_id, r.numero_factura AS numero, r.fecha AS fecha_creacion,
             r.porcentaje AS retencion_porcentaje, r.base AS retencion_base, r.valor AS retencion_valor,
             r.negocio, 'Sin factura de compra' AS origen
      FROM retenciones_reteica r
      WHERE r.fecha >= ${desde} AND r.fecha <= ${hasta}
        AND (${proveedorId}::int IS NULL OR r.proveedor_id = ${proveedorId}::int)
    `;
  }
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  return [...facturas, ...otras]
    .map((x) => ({ ...x, fecha_creacion: iso(x.fecha_creacion) }))
    .sort((a, b) => (a.fecha_creacion < b.fecha_creacion ? -1 : a.fecha_creacion > b.fecha_creacion ? 1 : String(a.id).localeCompare(String(b.id))));
}
