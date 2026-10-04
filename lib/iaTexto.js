// lib/iaTexto.js
// Preguntarle algo SOLO DE TEXTO a la IA (sin foto) y recibir el texto de
// la respuesta tal cual. Usa los mismos proveedores, claves y modelos de
// "Nuevo producto" (Configuraciones → IA): Mistral, Gemini o Groq.
// Lo usa, por ejemplo, la revisión de nombres de productos.

import { leerConfigIA } from './iaArticulo';

async function chatCompatibleOpenAI(url, apiKey, modelo, prompt, nombre) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`${nombre} respondió ${res.status}: ${texto.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function gemini(apiKey, modelo, prompt) {
  const cuerpo = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
  });
  const llamar = (version) =>
    fetch(`https://generativelanguage.googleapis.com/${version}/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
    });
  // Igual que lib/geminiVision.js: primero /v1beta/ (la que le funciona a
  // la tienda con la misma clave) y, si la rechaza, /v1/.
  let res = await llamar('v1beta');
  if ([400, 401, 403, 404].includes(res.status)) {
    const primerError = await res.text().catch(() => '');
    const segundo = await llamar('v1');
    if (!segundo.ok) throw new Error(`Gemini respondió ${res.status}: ${primerError.slice(0, 200)}`);
    res = segundo;
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Gemini respondió ${res.status}: ${texto.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

export async function preguntarIA(prompt, proveedorElegido) {
  const { modelo, modeloGemini, modeloGroq, proveedor: proveedorConfig } = await leerConfigIA();
  const proveedor = ['mistral', 'gemini', 'groq'].includes(proveedorElegido) ? proveedorElegido : proveedorConfig;
  let texto;
  if (proveedor === 'gemini') {
    const k = process.env.GEMINI_API_KEY;
    if (!k) throw new Error('Falta configurar GEMINI_API_KEY en Netlify');
    texto = await gemini(k, modeloGemini, prompt);
  } else if (proveedor === 'groq') {
    const k = process.env.GROQ_API_KEY;
    if (!k) throw new Error('Falta configurar GROQ_API_KEY en Netlify');
    texto = await chatCompatibleOpenAI('https://api.groq.com/openai/v1/chat/completions', k, modeloGroq, prompt, 'Groq');
  } else {
    const k = process.env.MISTRAL_API_KEY;
    if (!k) throw new Error('Falta configurar MISTRAL_API_KEY en Netlify');
    texto = await chatCompatibleOpenAI('https://api.mistral.ai/v1/chat/completions', k, modelo, prompt, 'Mistral');
  }
  // Algunos modelos "piensan en voz alta" antes de responder: se quita.
  return { proveedor, texto: String(texto || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() };
}
