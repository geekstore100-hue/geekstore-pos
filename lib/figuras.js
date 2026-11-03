// COLECCIONABLES (nov 2026): toda figura / muñeco de la categoría
// Coleccionables debe tener su ALTO en la ficha técnica (fila "Alto", en cm)
// — es lo primero que pregunta un coleccionista. Lo exigen el editor de
// Productos, el asistente de facturas de compra y la API al guardar.
// Sin base de datos: se usa en el navegador y en el servidor.

function normalizar(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function esCategoriaColeccionable(nombreCategoria) {
  return normalizar(nombreCategoria).includes('coleccionable');
}

const NOMBRES_ALTO = ['alto', 'altura', 'alto de la figura', 'tamano', 'medida'];

function esFilaAlto(nombre) {
  const n = normalizar(nombre);
  return NOMBRES_ALTO.some((x) => n === x || n.startsWith(`${x} `) || n.startsWith(`${x}(`));
}

// Alto en cm a partir del texto ("15 cm", "15,5cm", "150 mm", "6 pulgadas",
// '6"'). null si no hay un número.
export function altoEnCm(valor) {
  const t = normalizar(valor).replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!(n > 0)) return null;
  if (/\bmm\b|milimetro/.test(t)) n /= 10;
  else if (/pulg|inch|"|''/.test(t)) n *= 2.54;
  else if (/\bm\b|metro/.test(t) && !/cm|centimetro/.test(t) && n < 5) n *= 100;
  return Math.round(n * 10) / 10;
}

// Alto (cm) que trae la ficha, o null.
export function altoDeFicha(especificaciones) {
  const filas = Array.isArray(especificaciones) ? especificaciones : [];
  for (const f of filas) {
    if (f && esFilaAlto(f.nombre ?? f.name)) {
      const cm = altoEnCm(f.valor ?? f.value);
      if (cm) return cm;
    }
  }
  return null;
}

// Pone (o reemplaza) la fila "Alto" de la ficha.
export function conAlto(especificaciones, cm) {
  const filas = (Array.isArray(especificaciones) ? especificaciones : []).filter((f) => !esFilaAlto(f?.nombre));
  const valor = String(cm ?? '').trim();
  if (!valor) return filas;
  return [{ nombre: 'Alto', valor: /[a-z"]/i.test(valor) ? valor : `${valor} cm` }, ...filas];
}

export function valorAltoDeFicha(especificaciones) {
  const f = (Array.isArray(especificaciones) ? especificaciones : []).find((x) => x && esFilaAlto(x.nombre));
  return f ? String(f.valor ?? '').replace(/\s*cm$/i, '') : '';
}

export const MENSAJE_FALTA_ALTO = 'Escribe el alto de la figura (en cm). En Coleccionables es obligatorio.';
