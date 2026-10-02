// lib/geminiVision.js
// Segunda opción de IA con visión para "Nuevo producto" (respaldo si se
// agotan los créditos de Mistral). Usa Google Gemini, que también tiene
// plan gratis. Requiere la variable de entorno GEMINI_API_KEY en Netlify
// (se consigue gratis en aistudio.google.com, sin tarjeta de crédito) —
// propia del proyecto del POS.
//
// Versión de la API: Google tiene dos tipos de clave y dos "puertas"
// (/v1/ y /v1beta/), y no todas las claves funcionan en las dos. Las claves
// clásicas ("AIza...") funcionan en /v1beta/ (es la que usa la tienda
// geekstore.com.co, y le funciona); con las claves nuevas ("AQ.") en algún
// momento funcionó /v1/ y /v1beta/ no. En vez de casarse con una sola, se
// prueba /v1/ y, si Google responde que la clave no sirve ahí (400/401/403),
// se reintenta en /v1beta/ con la misma clave. Si falla en las dos, el
// problema es la clave en sí (ver el mensaje de error).

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

  const cuerpo = JSON.stringify({
    // partes: el texto, y la foto solo si se mandó una (ver arriba).
    contents: [{ parts: partes }],
  });
  const llamar = (version) =>
    fetch(`https://generativelanguage.googleapis.com/${version}/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
    });

  let res = await llamar('v1');
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const primerError = await res.text().catch(() => '');
    // Solo se reintenta si el problema es la clave/autenticación (no, por
    // ejemplo, una foto o un modelo inválido, que fallarían igual).
    if (/api key|API_KEY|credential|authenticat|PERMISSION_DENIED|ACCESS_TOKEN/i.test(primerError)) {
      res = await llamar('v1beta');
    } else {
      throw new Error(`Gemini respondió ${res.status}: ${primerError.slice(0, 200)}`);
    }
  }

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error(
        `Gemini no aceptó la clave GEMINI_API_KEY del POS (respondió ${res.status}). Copia en el proyecto del POS en Netlify la misma GEMINI_API_KEY que tiene la tienda, que sí funciona. Detalle: ${texto.slice(0, 150)}`
      );
    }
    throw new Error(`Gemini respondió ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return interpretarRespuestaIA(texto, 'Gemini');
}
