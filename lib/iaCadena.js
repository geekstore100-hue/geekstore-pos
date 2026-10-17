// lib/iaCadena.js
// CADENA DE IAs para el POS (octubre 2026), con el mismo orden que Geeky en
// la tienda y en el cotizador. Si una IA falla o se llena, contesta la
// siguiente, sin que haya que cambiar nada a mano:
//   1. Mistral Large      (el mejor; plan gratis con US$10/mes)
//   2. Gemini 2.5 Flash   (gratis, pocas respuestas por día)
//   3. Groq               (gratis; con foto usa el modelo con visión de Configuraciones)
//   4. Ministral 14B y 8B (Mistral, mucha capacidad, menos inteligentes)
// Si en "Nuevo producto" se elige una IA en el selector, esa se prueba
// PRIMERO y las demás quedan de respaldo en el mismo orden.
//
// Lo usan "Nuevo producto" (/api/productos/analizar-foto, con o sin foto) y
// la revisión de nombres (lib/iaTexto.js, solo texto).
// Claves (Netlify, sitio del POS): MISTRAL_API_KEY, GEMINI_API_KEY, GROQ_API_KEY.

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Modelos de Mistral que ya no conviene usar como primer intento (el plan
// gratis les da muy poca capacidad por minuto): si quedaron guardados en
// Configuraciones, se usa Mistral Large.
const MISTRAL_VIEJOS = ['', 'mistral-small-latest', 'mistral-small-2503', 'mistral-small-2506', 'pixtral-12b-2409', 'pixtral-12b-latest'];
const MISTRAL_LARGE = 'mistral-large-2512';
// Modelos de Groq apagados para cuentas gratis (agosto/septiembre 2026).
const GROQ_APAGADOS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3.6-27b'];

function conLimite(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(Math.max(1500, ms)) : undefined;
}

async function compatible({ url, apiKey, nombre, modelo, prompt, imagenBase64, maxTokens, temperatura, extra = {}, ms }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: [
        {
          role: 'user',
          content: imagenBase64
            ? [
                { type: 'text', text: prompt },
                // Mistral exige el formato anidado {url: ...} para base64.
                { type: 'image_url', image_url: { url: imagenBase64 } },
              ]
            : prompt,
        },
      ],
      max_tokens: maxTokens,
      ...(temperatura != null ? { temperature: temperatura } : {}),
      ...extra,
    }),
    signal: conLimite(ms),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    const e = new Error(`${nombre} (${modelo}) respondió ${res.status}: ${texto.slice(0, 160)}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content || '');
}

async function gemini({ apiKey, modelo, prompt, imagenBase64, maxTokens, temperatura, ms }) {
  const partes = [{ text: prompt }];
  if (imagenBase64) {
    const mimeType = imagenBase64.match(/^data:(.+);base64/)?.[1] || 'image/jpeg';
    partes.push({ inline_data: { mime_type: mimeType, data: imagenBase64.split(',')[1] || '' } });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: partes }],
      generationConfig: { maxOutputTokens: maxTokens, ...(temperatura != null ? { temperature: temperatura } : {}) },
    }),
    signal: conLimite(ms),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    const e = new Error(`Gemini (${modelo}) respondió ${res.status}: ${texto.slice(0, 160)}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

// Arma la lista de intentos según la configuración guardada.
function pasos(config, primero, conImagen) {
  const modeloMistral = MISTRAL_VIEJOS.includes(String(config.modelo || '').trim()) ? MISTRAL_LARGE : config.modelo;
  const modeloGroq = String(config.modeloGroq || '').trim();
  const lista = [
    { id: 'mistral', nombre: 'Mistral', modelo: modeloMistral },
    { id: 'gemini', nombre: 'Gemini', modelo: config.modeloGemini || 'gemini-2.5-flash' },
    // Sin foto, Groq puede usar su mejor modelo de texto; con foto, solo el de visión.
    {
      id: 'groq',
      nombre: 'Groq',
      modelo: conImagen ? (GROQ_APAGADOS.includes(modeloGroq) ? '' : modeloGroq) : 'openai/gpt-oss-120b',
    },
    { id: 'ministral', nombre: 'Ministral 14B', modelo: 'ministral-14b-2512' },
    { id: 'ministral', nombre: 'Ministral 8B', modelo: 'ministral-8b-2512' },
  ].filter((p) => p.modelo);
  if (primero === 'gemini' || primero === 'groq') {
    const i = lista.findIndex((p) => p.id === primero);
    if (i > 0) lista.unshift(...lista.splice(i, 1));
  }
  return lista;
}

async function llamar(paso, { prompt, imagenBase64, maxTokens, temperatura, ms }) {
  if (paso.id === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
    return gemini({ apiKey, modelo: paso.modelo, prompt, imagenBase64, maxTokens, temperatura, ms });
  }
  if (paso.id === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('Falta GROQ_API_KEY');
    const extra = paso.modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
    return compatible({ url: GROQ_URL, apiKey, nombre: 'Groq', modelo: paso.modelo, prompt, imagenBase64, maxTokens: maxTokens + (extra.reasoning_effort ? 600 : 0), temperatura, extra, ms });
  }
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Falta MISTRAL_API_KEY');
  return compatible({ url: MISTRAL_URL, apiKey, nombre: paso.nombre, modelo: paso.modelo, prompt, imagenBase64, maxTokens, temperatura, ms });
}

// Pregunta a la cadena de IAs. "interpretar" recibe el texto y el nombre de
// la IA y devuelve el resultado; si lanza un error (por ejemplo, la IA no
// devolvió un JSON válido), se prueba la siguiente IA.
// Devuelve { proveedor, nombre, modelo, resultado, errores }.
export async function preguntarEnCadena({ config, primero, prompt, imagenBase64 = null, maxTokens = 1800, temperatura, presupuestoMs = 24000, interpretar = (t) => t }) {
  const hasta = Date.now() + presupuestoMs;
  const errores = [];
  for (const paso of pasos(config, primero, Boolean(imagenBase64))) {
    const queda = hasta - Date.now();
    if (queda < 2000) {
      errores.push(`${paso.nombre}: sin tiempo`);
      break;
    }
    try {
      const texto = await llamar(paso, { prompt, imagenBase64, maxTokens, temperatura, ms: Math.min(20000, queda) });
      const limpio = String(texto || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!limpio) throw new Error(`${paso.nombre} respondió vacío`);
      return { proveedor: paso.id, nombre: paso.nombre, modelo: paso.modelo, resultado: interpretar(limpio, paso.nombre), errores };
    } catch (e) {
      const msg = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `${paso.nombre} tardó demasiado` : e?.message || String(e);
      errores.push(msg);
      console.error('[IA]', msg);
    }
  }
  throw new Error(`Ninguna IA pudo responder. ${errores.join(' | ')}`.slice(0, 900));
}
