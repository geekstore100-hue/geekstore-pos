// Tarifas de ReteICA de Bogotá (sin base de datos: se usa en el navegador y
// en el servidor).
//
// En Bogotá las tarifas del ICA van POR MIL. Hasta oct 2026 el POS tenía
// 0,41 % y 1,1 %, pero las de verdad son 4,14 por mil = 0,414 % y 11,04 por
// mil = 1,104 % (así sale en las facturas de los proveedores: "Retenc. ICA
// 4,14"). Con 0,41 % cada retención quedaba un poquito corta.
// Las retenciones guardadas con las tarifas viejas se corrigen desde
// ReteICA (ver app/api/reteica/corregir-tarifas).

export const TARIFAS_RETEICA = [
  { valor: 1.104, texto: '1,104 % (11,04 por mil)' },
  { valor: 0.414, texto: '0,414 % (4,14 por mil)' },
];

// Las que se aceptan al guardar una factura de compra (0 = sin retención).
export const TARIFAS_PERMITIDAS = [0, ...TARIFAS_RETEICA.map((t) => t.valor)];

// Tarifa vieja → tarifa correcta.
export const TARIFAS_VIEJAS = { 0.41: 0.414, 1.1: 1.104 };

export function tarifaValida(p) {
  const n = Number(p);
  return TARIFAS_PERMITIDAS.some((t) => Math.abs(t - n) < 1e-9);
}

// "0,414 %"
export function textoTarifa(p) {
  return `${Number(p || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })} %`;
}
