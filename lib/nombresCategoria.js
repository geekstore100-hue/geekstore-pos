// lib/nombresCategoria.js
// Para que no vuelvan a aparecer categorías repetidas (nov 2026). Pasó que
// existían "Juegos PS4", "Juegos PS5" y "Juegos Xbox" como CATEGORÍAS
// sueltas, además de ser subcategorías de "Video Juegos", y algunos juegos
// quedaron en las sueltas.
//
// clave(): compara nombres sin tildes, mayúsculas, espacios, signos ni
// plurales: "Video Juegos" = "Videojuegos" = "videojuego";
// "Juegos PS4" = "Juego PS4" = "juegos ps 4".

function sinTildes(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function claveNombre(nombre) {
  return sinTildes(nombre)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((p) => (p.length > 3 && p.endsWith('ES') ? p.slice(0, -2) : p.length > 3 && p.endsWith('S') ? p.slice(0, -1) : p))
    .join('');
}

// ¿Este nombre de CATEGORÍA nueva choca con algo que ya existe?
// Devuelve el mensaje para Nelson, o null si está bien.
export function choqueCategoria(nombre, categorias, subcategorias) {
  const k = claveNombre(nombre);
  if (!k) return 'Escribe un nombre';
  const cat = categorias.find((c) => claveNombre(c.nombre) === k);
  if (cat) return `Ya existe la categoría "${cat.nombre}". Usa esa.`;
  const sub = subcategorias.find((s) => claveNombre(s.nombre) === k);
  if (sub) {
    const padre = categorias.find((c) => Number(c.id) === Number(sub.categoria_id));
    return `"${sub.nombre}" ya existe como subcategoría${padre ? ` de "${padre.nombre}"` : ''}. Úsala en vez de crear una categoría nueva.`;
  }
  return null;
}

// ¿Esta SUBCATEGORÍA nueva choca con algo que ya existe?
export function choqueSubcategoria(nombre, categoriaId, categorias, subcategorias) {
  const k = claveNombre(nombre);
  if (!k) return 'Escribe un nombre';
  const repetida = subcategorias.find((s) => Number(s.categoria_id) === Number(categoriaId) && claveNombre(s.nombre) === k);
  if (repetida) return `Ya existe la subcategoría "${repetida.nombre}" en esta categoría.`;
  const cat = categorias.find((c) => claveNombre(c.nombre) === k);
  if (cat) return `"${cat.nombre}" ya es una categoría. Si quieres que quede dentro de esta, únela desde "Unir con otra categoría".`;
  return null;
}
