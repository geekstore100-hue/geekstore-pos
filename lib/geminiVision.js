// lib/geminiVision.js
// Segunda opción de IA con visión para "Nuevo producto" (respaldo si se
// agotan los créditos de Mistral). Usa Google Gemini, que también tiene
// plan gratis. Requiere la variable de entorno GEMINI_API_KEY en Netlify
// (se consigue gratis en aistudio.google.com, sin tarjeta de crédito) —
// propia del proyecto del POS.

export async function analizarFotoProductoGemini(imagenBase64, { modelo, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en Netlify (Configuración del sitio > Variables de entorno)');
  if (!modelo || !prompt) throw new Error('Falta el modelo o el prompt de la IA');

  const mimeType = imagenBase64.match(/^data:(.+);base64/)?.[1] || 'image/jpeg';
  const datosBase64 = imagenBase64.split(',')[1] || '';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
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
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const limpio = texto.replace(/```json|```/g, '').trim();

  try {
    const resultado = JSON.parse(limpio);
    return {
      nombre: String(resultado.nombre || '').slice(0, 150),
      descripcion: String(resultado.descripcion || '').slice(0, 600),
      categoria: String(resultado.categoria || '').slice(0, 60),
    };
  } catch (err) {
    throw new Error('Gemini no devolvió un JSON válido: ' + limpio.slice(0, 150));
  }
}
