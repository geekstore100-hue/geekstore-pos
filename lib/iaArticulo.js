import sql from './db';

// Configuración de la IA usada en "Nuevo producto" (Productos) para sugerir
// nombre y descripción a partir de una foto. Se guarda en la tabla genérica
// "configuracion" (igual que la hora del arqueo):
//   clave = 'ia_articulo'
//   valor = {"modelo": "...", "modeloGemini": "...", "modeloGroq": "...", "proveedor": "mistral"|"gemini"|"groq", "prompt": "..."}
// El formato exacto de la respuesta (JSON con nombre, descripción, categoría,
// subcategoría y especificaciones) y la regla de no inventar datos técnicos
// NO van en este prompt editable: los agrega siempre la ruta
// /api/productos/analizar-foto al final (FORMATO_RESPUESTA), así funcionan
// aunque aquí se guarde un prompt viejo o personalizado.
// Si nunca se ha configurado, se usan los valores por defecto de abajo.

export const MODELO_DEF = 'mistral-small-latest';
export const MODELO_GEMINI_DEF = 'gemini-2.5-flash';
export const MODELO_GROQ_DEF = 'qwen/qwen3.8-27b';
export const PROVEEDOR_DEF = 'mistral';

export const PROMPT_DEF = `Vas a crear la ficha de un producto de tecnología para Geek Store (tienda en Bogotá, Colombia). Puedes recibir una foto del producto o de su CAJA con las especificaciones impresas (léelas), información copiada de la página del fabricante, y notas del usuario. Usa todo lo que recibas.

"nombre" (título del producto):
- Un título natural y fluido, SIN guiones ni separadores tipo "Artículo - característica - marca". Nada de " - " entre palabras.
- Ejemplo correcto: "Cable USB-C Movisun de carga rápida". Ejemplo INCORRECTO: "Cable USB C - Carga rápida - Movisun".
- Incluye el tipo de producto, su característica principal y la marca, en ese orden aproximado.
- Pon la marca solo si la ves en la foto o en la información del fabricante; si no estás seguro, no la inventes.
- Máximo 80 caracteres.

"descripcion": texto de e-commerce para VENDER el producto — una frase que diga qué es y para qué sirve, y luego los beneficios concretos para quien lo compra. Español de Colombia, tono cercano pero profesional, con trato de "tú" (nunca "vos" ni voseo: "carga", "tienes", "usa").

"categoria": una frase corta sugiriendo la categoría (ej. "Accesorios PC", "Celulares y tablets", "Cargadores y powerbank"). Si no estás seguro, pon "Gadgets". Es solo una pista para elegir la categoría del menú.

"subcategoria": una frase corta sugiriendo la subcategoría dentro de esa categoría (ej. "Mouse", "Teclados", "Audífonos"). Si no hay una clara, déjala vacía ("").

Si no reconoces el producto con claridad, haz tu mejor estimación para el nombre y la descripción con lo que se ve (forma, marca visible, tipo de conector), pero NUNCA inventes datos técnicos.`;

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
