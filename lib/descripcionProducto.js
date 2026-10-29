// lib/descripcionProducto.js
// Reglas de la descripción de un producto (oct 2026).
//
// Antes, si la IA escribía más de 600 letras, se cortaba en la letra 600
// tal cual y quedaba a mitad de palabra ("…a cualquier evento gamer o
// simp"). Ahora se corta en el último final de frase completo y, en el
// borrador de factura, si la IA se pasa se le vuelve a pedir una vez.

export const DESCRIPCION_MAXIMA = 600;
export const DESCRIPCION_MINIMA = 400;

// Instrucciones que se le agregan a la IA cuando escribe la descripción
// desde la factura de compra (el formato es el mismo del formulario de
// Productos: frase inicial + beneficios con "✓ ").
export const REGLAS_DESCRIPCION_IA = [
  `La "descripcion" debe tener entre ${DESCRIPCION_MINIMA} y ${DESCRIPCION_MAXIMA} caracteres en total (cuéntalos; nunca más de ${DESCRIPCION_MAXIMA}).`,
  'Formato obligatorio: una frase que diga qué es el producto y para quién o para qué sirve; después de 2 a 4 beneficios, cada uno en su propia línea empezando con "✓ ". Termina cada línea con punto.',
  'No afirmes ninguna característica que no esté en los datos de arriba (por ejemplo, no digas que es silencioso, resistente al agua o duradero si los datos no lo dicen). Escribe la marca exactamente como aparece en los datos.',
].join(' ');

// Deja la descripción en máximo 600 letras SIN cortar a mitad de palabra:
// corta en el último final de frase (". ", "!", "?" o salto de línea) y, si
// no hay ninguno razonable, en el último espacio, terminando con punto.
export function ajustarDescripcion(texto, max = DESCRIPCION_MAXIMA) {
  const t = String(texto || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  let fin = -1;
  const re = /[.!?](?=\s|$)|\n/g;
  let m;
  while ((m = re.exec(corte))) fin = m.index;
  if (fin >= max * 0.5) return corte.slice(0, fin + (corte[fin] === '\n' ? 0 : 1)).trim();
  const espacio = corte.lastIndexOf(' ');
  const base = (espacio > 0 ? corte.slice(0, espacio) : corte).replace(/[\s,;:–-]+$/, '');
  return `${base.slice(0, max - 1)}.`;
}
