// lib/groqVision.js
// Tercera opción de IA con visión para "Nuevo producto" (respaldo si se
// agotan Mistral y Gemini). Usa Groq (modelos Llama con visión de Meta),
// que tiene un nivel gratis genuino y no pide tarjeta para activarse.
// Requiere la variable de entorno GROQ_API_KEY en Netlify (se consigue
// gratis en console.groq.com, sin tarjeta de crédito) — propia de este
// proyecto del POS.

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
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imagenBase64 } },
          ],
        },
      ],
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Groq respondió ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = data.choices?.[0]?.message?.content || '';

  // Por si el modelo envuelve el JSON en ```json ... ``` a pesar de la instrucción
  const limpio = texto.replace(/```json|```/g, '').trim();

  try {
    const resultado = JSON.parse(limpio);
    return {
      nombre: String(resultado.nombre || '').slice(0, 150),
      descripcion: String(resultado.descripcion || '').slice(0, 600),
      categoria: String(resultado.categoria || '').slice(0, 60),
      subcategoria: String(resultado.subcategoria || '').slice(0, 60),
    };
  } catch (err) {
    throw new Error('Groq no devolvió un JSON válido: ' + limpio.slice(0, 150));
  }
}
