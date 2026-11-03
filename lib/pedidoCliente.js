import sql from './db';
import { leerConfigIA } from './iaArticulo';
import { preguntarEnCadena } from './iaCadena';

// COTIZAR DESDE FOTO (nov 2026). Un cliente (empresa, colegio, entidad)
// manda la lista de lo que necesita —una foto de una tabla de Excel, un PDF
// pasado a foto o un texto— y el POS:
//   1) leerPedido: la IA lee cada línea (número del cliente, qué es,
//      características pedidas y cantidad) y propone palabras para buscar.
//   2) buscarCandidatos: busca en el catálogo del POS por esas palabras
//      (nombre, categoría, subcategoría, ficha y descripción).
//   3) elegirOpciones: la IA mira los candidatos de cada línea y deja hasta
//      3 que de verdad sirven, avisando qué requisito no cumple cada uno.
// Nelson elige una o varias opciones por línea y se arma la cotización.

const sinTildes = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const PALABRAS_VACIAS = new Set(
  'de del la las el los un una unos unas y o con sin para por en a al que se su sus tipo minimo maximo debe deben entregar cada uno como mas menos sobre segun hasta desde entre este esta estos estas ser son tiene tienen incluye incluir color unidad unidades und cantidad marca modelo referencia producto productos elementos accesorios respectivos garantia'.split(
    ' '
  )
);

function palabras(t) {
  return sinTildes(t)
    .replace(/[^a-z0-9ñ.\s-]/g, ' ')
    .split(/[\s/,;:()]+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w) && !/^\d+$/.test(w));
}

// Saca el primer JSON { ... } de la respuesta de la IA.
function sacarJson(texto) {
  const limpio = String(texto || '').replace(/```(?:json)?/gi, '');
  const i = limpio.indexOf('{');
  const j = limpio.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('La IA no devolvió un JSON');
  return JSON.parse(limpio.slice(i, j + 1));
}

const MAX_LINEAS = 60;

const PROMPT_LEER = `Eres asistente de Geek Store, una tienda de tecnología en Bogotá (Colombia). Un cliente mandó la lista de lo que quiere cotizar (puede ser una foto de una tabla de Excel, un documento o un texto). Lee TODAS las líneas.

Por cada línea saca:
- "ref": el número o código que el cliente le puso a la línea (columna ID, IDD, ítem, #...). Vacío si no tiene.
- "nombre": qué producto es, corto y claro en español (ej. "Trípode para celular", "Aro de luz LED 12 a 18 pulgadas", "Puntero láser presentador"). OJO: a veces la columna del nombre/material NO coincide con las características (error del cliente); en ese caso guíate por las CARACTERÍSTICAS, que es lo que de verdad pide.
- "descripcion": las características que pide el cliente, copiadas completas (corrige solo saltos de línea).
- "cantidad": número entero (1 si no aparece).
- "buscar": de 3 a 6 palabras o frases cortas con las que una tienda de tecnología colombiana nombraría ese producto en su catálogo, incluyendo sinónimos (ej. para un trípode con palo de selfie: ["tripode", "palo de selfie", "selfie stick", "soporte celular"]).

No inventes líneas ni cantidades. Si una línea se lee mal, igual inclúyela con lo que se alcance a leer.

Responde SOLO este JSON, sin nada más:
{"lineas":[{"ref":"","nombre":"","descripcion":"","cantidad":1,"buscar":[""]}]}`;

function limpiarLineas(json) {
  const lista = Array.isArray(json?.lineas) ? json.lineas : [];
  return lista
    .map((l, i) => ({
      n: i + 1,
      ref: String(l.ref ?? '').trim().slice(0, 20),
      nombre: String(l.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      descripcion: String(l.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      cantidad: Math.min(99999, Math.max(1, Math.round(Number(l.cantidad) || 1))),
      buscar: (Array.isArray(l.buscar) ? l.buscar : [])
        .map((b) => String(b).replace(/\s+/g, ' ').trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 8),
    }))
    .filter((l) => l.nombre || l.descripcion)
    .slice(0, MAX_LINEAS);
}

// 1) Leer la lista del cliente (foto o texto).
export async function leerPedido({ imagen, texto }) {
  const conFoto = typeof imagen === 'string' && imagen.startsWith('data:image/');
  const txt = String(texto || '').trim().slice(0, 15000);
  if (!conFoto && !txt) throw new Error('Sube la foto o pega el texto de lo que pide el cliente');
  const config = await leerConfigIA();
  const prompt = txt ? `${PROMPT_LEER}\n\nTEXTO DEL CLIENTE:\n<<<\n${txt}\n>>>` : PROMPT_LEER;
  const r = await preguntarEnCadena({
    config,
    primero: conFoto ? 'gemini' : 'mistral',
    prompt,
    imagenBase64: conFoto ? imagen : null,
    maxTokens: 4000,
    temperatura: 0.1,
    presupuestoMs: 24000,
    interpretar: (t) => {
      const lineas = limpiarLineas(sacarJson(t));
      if (!lineas.length) throw new Error('La IA no encontró líneas');
      return lineas;
    },
  });
  return { lineas: r.resultado, ia: `${r.nombre} (${r.modelo})` };
}

// Catálogo para buscar (activos, con stock, precio, ficha y descripción).
export async function catalogoParaCotizar() {
  return sql`
    SELECT p.id, p.referencia, p.nombre, p.precio_venta, p.imagen_key, p.es_inventariable,
           LEFT(COALESCE(p.descripcion, ''), 700) AS descripcion, p.especificaciones,
           c.nombre AS categoria, sc.nombre AS subcategoria,
           COALESCE((SELECT SUM(s.cantidad) FROM stock s WHERE s.producto_id = p.id), 0) AS stock
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
    WHERE p.activo = true AND COALESCE(to_jsonb(p) ->> 'sede', 'kennedy') = 'kennedy'
  `;
}

function fichaTexto(esp) {
  if (!Array.isArray(esp)) return '';
  return esp.map((f) => `${f.nombre}: ${f.valor}`).join('; ');
}

// 2) Buscar candidatos en el catálogo para una línea (sin IA).
export function buscarCandidatos(linea, catalogo, max = 12) {
  const frases = (linea.buscar || []).map((b) => sinTildes(b).trim()).filter((b) => b.length >= 3);
  const deFrases = frases.flatMap((f) => palabras(f));
  const deNombre = palabras(linea.nombre);
  const deDesc = palabras(linea.descripcion).slice(0, 25);
  const fuertes = new Set([...deFrases, ...deNombre]);
  const todas = new Set([...fuertes, ...deDesc]);
  const puntuados = [];
  for (const p of catalogo) {
    const nombre = sinTildes(`${p.nombre} ${p.referencia}`);
    const cat = sinTildes(`${p.categoria || ''} ${p.subcategoria || ''}`);
    const resto = sinTildes(`${fichaTexto(p.especificaciones)} ${p.descripcion || ''}`);
    let puntos = 0;
    for (const f of frases) if (f.includes(' ') && nombre.includes(f)) puntos += 8;
    for (const w of todas) {
      const fuerte = fuertes.has(w);
      if (nombre.includes(w)) puntos += fuerte ? 4 : 1.5;
      else if (cat.includes(w)) puntos += fuerte ? 2.5 : 0.8;
      else if (resto.includes(w)) puntos += fuerte ? 1 : 0.4;
    }
    if (puntos < 3) continue;
    if (Number(p.stock) > 0 || p.es_inventariable === false) puntos += 1;
    puntuados.push({ p, puntos });
  }
  return puntuados
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, max)
    .map((x) => x.p);
}

const PROMPT_ELEGIR = `Eres asesor de ventas de Geek Store (tienda de tecnología en Bogotá). Un cliente pide varios productos. Para cada línea te doy lo que pide y unos CANDIDATOS de nuestro catálogo (con id, nombre, categoría, ficha, precio y stock).

Por cada línea elige hasta 3 candidatos que de verdad sirvan para lo que pide el cliente, del mejor al menos bueno. Reglas:
- Solo productos que cumplan la FUNCIÓN pedida (un cable no sirve como adaptador multipuerto; un aro de luz pequeño de 6" no cumple "12 a 18 pulgadas" — puedes incluirlo pero con aviso).
- Si ninguno sirve, deja "opciones" vacío. Es mejor vacío que proponer algo que no es.
- "encaja": "alto" (cumple lo importante), "medio" (sirve pero falta o no se sabe algo), "bajo" (parecido, solo como alternativa).
- "nota": máximo 15 palabras en español: qué requisito no cumple o no se puede confirmar con la ficha (ej. "La ficha no dice el alcance; pide mínimo 15 m"). Vacío si cumple todo.
- Usa solo los id que aparecen en los candidatos de ESA línea.

Responde SOLO este JSON:
{"lineas":[{"n":1,"opciones":[{"id":123,"encaja":"alto","nota":""}]}]}`;

function resumenProducto(p) {
  const ficha = fichaTexto(p.especificaciones).slice(0, 260);
  const desc = String(p.descripcion || '').replace(/\s+/g, ' ').slice(0, 160);
  return `  - id ${p.id}: ${p.nombre} | ${[p.categoria, p.subcategoria].filter(Boolean).join(' / ')} | $${Math.round(Number(p.precio_venta) || 0)} | stock ${Number(p.stock) || 0}${ficha ? ` | ficha: ${ficha}` : ''}${!ficha && desc ? ` | ${desc}` : ''}`;
}

function datosOpcion(p, extra = {}) {
  return {
    producto_id: Number(p.id),
    referencia: p.referencia,
    nombre: p.nombre,
    imagen_key: p.imagen_key || null,
    precio_venta: Math.round(Number(p.precio_venta) || 0),
    stock: Number(p.stock) || 0,
    inventariable: p.es_inventariable !== false,
    categoria: [p.categoria, p.subcategoria].filter(Boolean).join(' / '),
    encaja: extra.encaja || '',
    nota: extra.nota || '',
  };
}

// 3) Para un grupo de líneas (máx. 8 por llamada): candidatos + la IA elige.
// Si la IA no responde, quedan los 3 mejores de la búsqueda (sin aviso).
export async function opcionesParaLineas(lineas) {
  const catalogo = await catalogoParaCotizar();
  const porId = new Map(catalogo.map((p) => [Number(p.id), p]));
  const candidatos = lineas.map((l) => buscarCandidatos(l, catalogo));

  const conCandidatos = lineas.map((l, i) => ({ l, c: candidatos[i] })).filter((x) => x.c.length);
  let elegidas = null;
  let ia = '';
  let avisoIA = '';
  if (conCandidatos.length) {
    const bloques = conCandidatos.map(
      ({ l, c }) =>
        `LÍNEA ${l.n}: ${l.nombre} (cantidad ${l.cantidad})\nPide: ${l.descripcion || l.nombre}\nCandidatos:\n${c.map(resumenProducto).join('\n')}`
    );
    try {
      const config = await leerConfigIA();
      const r = await preguntarEnCadena({
        config,
        primero: 'mistral',
        prompt: `${PROMPT_ELEGIR}\n\n${bloques.join('\n\n')}`,
        maxTokens: 1800,
        temperatura: 0.1,
        presupuestoMs: 22000,
        interpretar: (t) => {
          const j = sacarJson(t);
          if (!Array.isArray(j?.lineas)) throw new Error('Respuesta sin lineas');
          return j.lineas;
        },
      });
      elegidas = new Map(r.resultado.map((x) => [Number(x.n), Array.isArray(x.opciones) ? x.opciones : []]));
      ia = `${r.nombre} (${r.modelo})`;
    } catch (e) {
      avisoIA = 'La IA no respondió: se muestran los resultados más parecidos de la búsqueda, revísalos.';
      console.error('[cotizar desde foto]', e.message);
    }
  }

  const resultado = lineas.map((l, i) => {
    const permitidos = new Set(candidatos[i].map((p) => Number(p.id)));
    let opciones;
    if (elegidas && elegidas.has(l.n)) {
      const vistos = new Set();
      opciones = elegidas
        .get(l.n)
        .filter((o) => permitidos.has(Number(o.id)) && !vistos.has(Number(o.id)) && vistos.add(Number(o.id)))
        .slice(0, 3)
        .map((o) =>
          datosOpcion(porId.get(Number(o.id)), {
            encaja: ['alto', 'medio', 'bajo'].includes(o.encaja) ? o.encaja : 'medio',
            nota: String(o.nota || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          })
        );
    } else {
      opciones = candidatos[i].slice(0, 3).map((p) => datosOpcion(p));
    }
    // Más candidatos (los que la IA no eligió), por si Nelson quiere otro.
    const elegidosIds = new Set(opciones.map((o) => o.producto_id));
    const otros = candidatos[i].filter((p) => !elegidosIds.has(Number(p.id))).slice(0, 6).map((p) => datosOpcion(p));
    return { n: l.n, opciones, otros };
  });
  return { lineas: resultado, ia, avisoIA };
}
