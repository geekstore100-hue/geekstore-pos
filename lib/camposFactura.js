// lib/camposFactura.js
// Campos que el asistente de Factura de compra EXIGE en cada producto nuevo
// antes de dejar aprobar (oct 2026). Nelson los marca o desmarca él mismo
// desde el asistente (⚙️ Campos obligatorios); se guardan en la tabla
// "configuracion" con la clave factura_campos_obligatorios.
//
// Siempre obligatorios (no se pueden quitar): nombre, cantidad, costo y
// precio de venta (sin él no se puede crear en Alegra).

export const CAMPOS_CONFIGURABLES = [
  { clave: 'categoria', texto: 'Categoría' },
  { clave: 'subcategoria', texto: 'Subcategoría' },
  { clave: 'distribuidor', texto: 'Decidir el precio distribuidor (calcular, a mano o no aplica)' },
  { clave: 'gamer', texto: 'Responder si es gamer (Sí / No)' },
  { clave: 'foto', texto: 'Al menos 1 foto' },
  { clave: 'descripcion', texto: 'Descripción de mínimo 400 letras' },
  { clave: 'ficha', texto: 'Al menos 3 datos en la ficha técnica' },
];

export const OBLIGATORIOS_POR_DEFECTO = CAMPOS_CONFIGURABLES.map((c) => c.clave);

export function normalizarObligatorios(lista) {
  if (!Array.isArray(lista)) return [...OBLIGATORIOS_POR_DEFECTO];
  const validas = new Set(CAMPOS_CONFIGURABLES.map((c) => c.clave));
  return [...new Set(lista.filter((c) => validas.has(c)))];
}
