// lib/geminiVision.js
// Segunda opción de IA con visión para "Nuevo producto" (respaldo si se
// agotan los créditos de Mistral). Usa Google Gemini, que también tiene
// plan gratis. Requiere la variable de entorno GEMINI_API_KEY en Netlify
// (se consigue gratis en aistudio.google.com, sin tarjeta de crédito) —
// propia del proyecto del POS.
//
// IMPORTANTE: la URL usa "/v1/", NO "/v1beta/". Las claves nuevas que
// entrega Google AI Studio ahora (empiezan con "AQ.") responden
// "API key not valid" / 401 ACCESS_TOKEN_TYPE_UNSUPPORTED en "v1beta",
// pero funcionan perfecto en "v1" (probado en vivo). No cambiar esto a
// v1beta sin volver a probar con una clave de este tipo.

import { interpretarRespuestaIA } from './respuestaIA';

// imagenBase64 es opcional: si no viene (solo enlace del fabricante o texto
// pegado), se manda únicamente el texto.
export async function analizarFotoProductoGemini(imagenBase64, { modelo, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en Netlify (Configuración del sitio > Variables de entorno)');
  if (!modelo || !prompt) throw new Error('Falta el modelo o el prompt de la IA');

  const partes = [{ text: prompt }];
  if (imagenBase64) {
    const mimeType = imagenBase64.match(/^data:(.+);base64/)?.[1] || 'image/jpeg';
    const datosBase64 = imagenBase64.split(',')[1] || '';
    partes.push({ inline_data: { mime_type: mimeType, data: datosBase64 } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${modelo}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: datosBase64 } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Gemini respondió ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return interpretarRespuestaIA(texto, 'Gemini');
}
