// lib/revisionNombres.js
// Revisión de NOMBRES de productos con IA (Productos → "Revisar nombres").
//
// La IA solo SUGIERE: Nelson ve cada sugerencia y aprueba o descarta. Además,
// aquí se filtran sugerencias peligrosas antes de mostrarlas:
//   - Si la sugerencia cambia demasiado el nombre (no es una corrección de
//     ortografía sino otro nombre), se descarta.
//   - Si cambia una de las "palabras correctas" que Nelson marcó (marcas o
//     modelos que la IA cree mal escritos pero están bien, ej. "Raop"), se
//     descarta.

export const TAMANO_LOTE = 40;

export function quitarTildes(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function distancia(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let previa = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const actual = [i];
    for (let j = 1; j <= n; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[n];
}

// 1 = idénticos, 0 = nada que ver (sin importar mayúsculas ni tildes).
export function parecido(a, b) {
  const x = quitarTildes(a).toLowerCase();
  const y = quitarTildes(b).toLowerCase();
  const largo = Math.max(x.length, y.length) || 1;
  return 1 - distancia(x, y) / largo;
}

function palabras(t) {
  return quitarTildes(t).toLowerCase().split(/[^a-z0-9ñ+]+/i).filter(Boolean);
}

export function construirPrompt(lote, palabrasCorrectas = []) {
  const lista = lote.map((p) => `${p.id}\t${p.nombre}`).join('\n');
  const protegidas = palabrasCorrectas.length
    ? `\nEstas palabras ESTÁN BIEN escritas (son marcas o modelos): NUNCA las cambies: ${palabrasCorrectas.join(', ')}.\n`
    : '';
  return `Eres corrector de ortografía de una tienda de tecnología en Colombia (Geek Store). Revisa estos nombres de productos.

Corrige SOLO errores claros:
- Palabras en español mal escritas (ej. "Estrabilizador" → "Estabilizador", "inalambrico" → "inalámbrico", "Maletin" → "Maletín").
- Espacios dobles o pegados y letras repetidas por error.

NO cambies:
- Marcas, modelos, referencias ni siglas (aunque no las conozcas: si dudas, déjalas igual).
- El orden de las palabras, la información ni el estilo del nombre. No agregues ni quites datos.
- Palabras en inglés que son normales en tecnología (gamer, gaming, mouse, powerbank, smartwatch...).
${protegidas}
Si un nombre parece CORTADO (termina a mitad de una palabra o con una letra suelta), no lo completes: márcalo con "cortado": true.

Responde SOLO con un arreglo JSON (sin markdown ni texto adicional), con UNA entrada por cada nombre que tenga algo para corregir o esté cortado. Si todos están bien, responde [].
Forma: [{"id": 123, "sugerido": "nombre corregido", "motivo": "qué corregiste, corto", "cortado": false}]

Nombres (id, tabulador, nombre):
${lista}`;
}

export function interpretarSugerencias(texto, lote, palabrasCorrectas = []) {
  const limpio = String(texto || '').replace(/```(?:json)?/gi, '').trim();
  const inicio = limpio.indexOf('[');
  const fin = limpio.lastIndexOf(']');
  if (inicio < 0 || fin < inicio) return [];
  let datos;
  try {
    datos = JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  const porId = new Map(lote.map((p) => [Number(p.id), p]));
  const protegidas = new Set(palabrasCorrectas.map((w) => quitarTildes(w).toLowerCase()));
  const salida = [];
  const vistos = new Set();
  for (const d of datos) {
    const prod = porId.get(Number(d?.id));
    if (!prod || vistos.has(prod.id)) continue;
    const cortado = Boolean(d.cortado);
    let sugerido = String(d.sugerido || '').replace(/\s+/g, ' ').trim();
    if (sugerido === prod.nombre.trim()) sugerido = '';
    if (sugerido) {
      if (sugerido.length < 3 || sugerido.length > 150) sugerido = '';
      // Si cambia demasiado, no es una corrección de ortografía.
      else if (parecido(prod.nombre, sugerido) < 0.75) sugerido = '';
      else {
        // No puede desaparecer ninguna palabra protegida del nombre original.
        const nuevas = new Set(palabras(sugerido));
        for (const w of palabras(prod.nombre)) {
          if (protegidas.has(w) && !nuevas.has(w)) {
            sugerido = '';
            break;
          }
        }
      }
    }
    if (!sugerido && !cortado) continue;
    vistos.add(prod.id);
    salida.push({
      id: prod.id,
      referencia: prod.referencia,
      actual: prod.nombre,
      sugerido: sugerido || null,
      motivo: String(d.motivo || (cortado ? 'Parece cortado' : '')).slice(0, 160),
      cortado,
    });
  }
  return salida;
}
