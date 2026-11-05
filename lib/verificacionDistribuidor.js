// lib/verificacionDistribuidor.js — verificar un pedido de distribuidor
// renglón por renglón (nov 2026).
//
// Después de alistar, alguien revisa la caja y va marcando cuántas unidades
// de cada producto ya están (botones −, +1 y "✓ Completo" en la cotización).
// Se guarda en la columna verificacion (JSON) de cotizaciones_distribuidor:
//   { items: { "<producto_id>": unidades verificadas }, completa_en: fecha | null }
// Va por producto (no por renglón) para que no se pierda si alguien edita
// la cotización; si al editar cambian las cantidades, completa_en se borra y
// se ve qué falta.

import sql from './db';

let listo = false;
export async function asegurarVerificacion() {
  if (listo) return;
  const [col] = await sql`
    SELECT 1 AS si FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'cotizaciones_distribuidor' AND column_name = 'verificacion'
  `;
  if (!col) await sql`ALTER TABLE cotizaciones_distribuidor ADD COLUMN IF NOT EXISTS verificacion JSONB`;
  listo = true;
}

// Cantidad pedida por producto (si un producto viene en dos renglones, se suman).
export function requeridosPorProducto(items) {
  const req = {};
  for (const it of items || []) {
    const pid = String(it.producto_id);
    req[pid] = (req[pid] || 0) + (Number(it.cantidad) || 0);
  }
  return req;
}

export function estaCompleta(items, verificacion) {
  const req = requeridosPorProducto(items);
  const hechas = verificacion?.items || {};
  const pids = Object.keys(req);
  return pids.length > 0 && pids.every((pid) => (Number(hechas[pid]) || 0) >= req[pid]);
}
