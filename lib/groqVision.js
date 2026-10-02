// lib/groqVision.js
// Tercera opción de IA con visión para "Nuevo producto" (respaldo si se
// agotan Mistral y Gemini). Usa Groq (modelos Llama con visión de Meta),
// que tiene un nivel gratis genuino y no pide tarjeta para activarse.
// Requiere la variable de entorno GROQ_API_KEY en Netlify (se consigue
// gratis en console.groq.com, sin tarjeta de crédito) — propia de este
// proyecto del POS.

import { interpretarRespuestaIA } from './respuestaIA';

// imagenBase64 es opcional: si no viene (solo enlace del fabricante o texto
// pegado), se manda únicamente el texto.
export async function analizarFotoProductoGroq(imagenBase64, { modelo, prompt }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Falta configurar GROQ_API_KEY en Netlify (Configuración del sitio > Variables de entorno)');
  if (!modelo || !prompt) throw new Error('Falta el modelo o el prompt de la IA');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        {
          role: 'user',
          content: imagenBase64
            ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imagenBase64 } },
              ]
            : prompt,
        },
      ],
      max_tokens: 1800,
    }),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Groq respondió ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = data.choices?.[0]?.message?.content || '';

  return interpretarRespuestaIA(texto, 'Groq');
}
