// Opciones dentro de una cotización (sin base de datos: se usa en el
// navegador y en el servidor). Ver lib/cotizacionesCliente.js.

// OPCIONES (nov 2026, "Cotizar desde foto"): varias líneas pueden ser
// opciones para lo mismo que pidió el cliente. Llevan el mismo "grupo" (lo
// que pidió el cliente, ej. "54 · Trípode para celular"). La PRIMERA línea de
// cada grupo es la opción A y es la que suma al total; las siguientes
// (opción B, C...) se muestran con su precio pero no suman ("alternativa").
export function marcarOpciones(lineas) {
  const vistos = new Map();
  return lineas.map((l) => {
    const g = String(l.grupo || '').trim();
    if (!g) return { ...l, grupo: '', opcion: '', alternativa: false };
    const n = vistos.get(g) || 0;
    vistos.set(g, n + 1);
    return { ...l, grupo: g, opcion: String.fromCharCode(65 + Math.min(n, 25)), alternativa: n > 0 };
  });
}

// Si un grupo quedó con una sola línea, no es "Opción A": se quita la letra.
export function limpiarOpcionesSueltas(lineas) {
  const cuenta = new Map();
  for (const l of lineas) if (l.grupo) cuenta.set(l.grupo, (cuenta.get(l.grupo) || 0) + 1);
  return lineas.map((l) => (l.grupo && cuenta.get(l.grupo) === 1 ? { ...l, opcion: '' } : l));
}

// Las líneas que suman al total (sin las opciones B, C...).
export function lineasQueSuman(lineas) {
  return limpiarOpcionesSueltas(marcarOpciones(lineas)).filter((l) => !l.alternativa);
}
