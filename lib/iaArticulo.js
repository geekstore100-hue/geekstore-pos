import sql from './db';

// Configuración de la IA usada en "Nuevo producto" (Productos) para sugerir
// nombre y descripción a partir de una foto. Se guarda en la tabla genérica
// "configuracion" (igual que la hora del arqueo):
//   clave = 'ia_articulo'
//   valor = {"modelo": "...", "modeloGemini": "...", "modeloGroq": "...", "proveedor": "mistral"|"gemini"|"groq", "prompt": "..."}
// Si nunca se ha configurado, se usan los valores por defecto de abajo.

export const MODELO_DEF = 'mistral-small-latest';
export const MODELO_GEMINI_DEF = 'gemini-2.5-flash';
export const MODELO_GROQ_DEF = 'qwen/qwen3.8-27b';
export const PROVEEDOR_DEF = 'mistral';

export const PROMPT_DEF = `Mirá esta foto de un producto de tecnología (Geek Store, tienda en Bogotá, Colombia). Puede ser una foto del producto en sí, o de la CAJA/empaque con las especificaciones técnicas impresas — en ese caso, leé el texto de la caja para sacar los datos. Respondé SOLO con un objeto JSON válido, sin texto adicional, sin markdown, con esta forma exacta:
{"nombre": "...", "descripcion": "...", "categoria": "...", "subcategoria": "..."}

FORMATO DEL "nombre" (título del producto):
- Un título natural y fluido, SIN guiones ni separadores tipo "Artículo - característica - marca - modelo". Nada de guiones " - " entre palabras.
- Ejemplo correcto: "Cable USB-C Movisun de carga rápida". Ejemplo INCORRECTO (no hacer esto): "Cable USB C - Carga rápida - Movisun".
- Incluí el tipo de producto, su característica principal y la marca, todo en una frase natural, en ese orden aproximado.
- Siempre incluí la marca si es visible o identificable en la foto. Si no reconocés la marca con certeza, no la inventes: omitila del título en vez de adivinar.
- Máximo 80 caracteres.

FORMATO de la "descripcion":
- Es texto de e-commerce para VENDER el producto, no una ficha técnica seca. Resaltá un beneficio concreto para quien lo compra (qué gana usándolo: velocidad, comodidad, durabilidad, ahorro de tiempo, etc.), no solo una lista de specs.
- Aprovechá al máximo el espacio: apuntá a texto cercano a 600 caracteres (nunca más de 600), no lo dejes corto.
- Español de Colombia, tono cercano pero profesional. IMPORTANTE: nunca uses "vos" ni conjugaciones de voseo (como "cargá", "transferí", "tenés", "usá") — Colombia usa "tú" ("carga", "transfiere", "tienes", "usa"). Revisá cada verbo antes de responder.

"categoria": una sola palabra o frase corta sugiriendo la categoría (ej. "Accesorios PC", "Celulares y tablets", "Cargadores y powerbank"). Si no estás seguro, poné "Gadgets". Es solo una pista para elegir la categoría del menú — no se aplica sola.

"subcategoria": una frase corta sugiriendo la subcategoría dentro de esa categoría (ej. si la categoría es "Accesorios PC", la subcategoría podría ser "Mouse", "Teclados" o "Audífonos"). Si no hay una subcategoría clara, dejalo vacío ("").

Si no reconocés el producto con claridad, hacé tu mejor estimación basada en lo que se ve (forma, marca visible, tipo de conector, etc.) en vez de dejar el campo vacío.`;

function normalizarProveedor(p) {
  return p === 'gemini' || p === 'groq' ? p : 'mistral';
}

export async function leerConfigIA() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'ia_articulo'`;
    if (!fila?.valor) {
      return { modelo: MODELO_DEF, modeloGemini: MODELO_GEMINI_DEF, modeloGroq: MODELO_GROQ_DEF, proveedor: PROVEEDOR_DEF, prompt: PROMPT_DEF };
    }
    const v = JSON.parse(fila.valor);
    return {
      modelo: v.modelo || MODELO_DEF,
      modeloGemini: v.modeloGemini || MODELO_GEMINI_DEF,
      modeloGroq: v.modeloGroq || MODELO_GROQ_DEF,
      proveedor: normalizarProveedor(v.proveedor),
      prompt: v.prompt || PROMPT_DEF,
    };
  } catch {
    return { modelo: MODELO_DEF, modeloGemini: MODELO_GEMINI_DEF, modeloGroq: MODELO_GROQ_DEF, proveedor: PROVEEDOR_DEF, prompt: PROMPT_DEF };
  }
}

export async function guardarConfigIA({ modelo, modeloGemini, modeloGroq, proveedor, prompt }) {
  const config = {
    modelo: typeof modelo === 'string' && modelo.trim() ? modelo.trim() : MODELO_DEF,
    modeloGemini: typeof modeloGemini === 'string' && modeloGemini.trim() ? modeloGemini.trim() : MODELO_GEMINI_DEF,
    modeloGroq: typeof modeloGroq === 'string' && modeloGroq.trim() ? modeloGroq.trim() : MODELO_GROQ_DEF,
    proveedor: normalizarProveedor(proveedor),
    prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : PROMPT_DEF,
  };
  const valor = JSON.stringify(config);
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES ('ia_articulo', ${valor}, now())
    ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
  `;
  return config;
}
