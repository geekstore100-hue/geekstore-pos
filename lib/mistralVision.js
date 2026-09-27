// lib/mistralVision.js
// Usa la API de Mistral (modelo con visión) para analizar la foto de un
// producto y sugerir nombre, descripción y categoría — usado desde
// "Nuevo producto" en Productos (POS). El modelo y el prompt son
// configurables desde Configuraciones > Inteligencia artificial (se
// guardan vía /api/productos/ia-config) — no están fijos acá.
// Requiere la variable de entorno MISTRAL_API_KEY configurada en el
// proyecto del POS en Netlify (es propia de este proyecto, distinta de
// la que use la página web geekstore.com.co si también tiene una).

// imagenBase64: data URI completo, ej. "data:image/jpeg;base64,/9j/4AA..."
// opciones: { modelo, prompt } — el caller es quien los trae desde la
// configuración guardada (esta función no tiene un valor por defecto
// propio a propósito).
export async function analizarFotoProducto(imagenBase64, { modelo, prompt }) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Falta configurar MISTRAL_API_KEY en Netlify (Configuración del sitio > Variables de entorno)');
  if (!modelo || !prompt) throw new Error('Falta el modelo o el prompt de la IA');

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
            // Mistral exige el formato anidado {url: ...} para imágenes en
            // base64 (el string plano directo lo ignora sin tirar error).
            { type: 'image_url', image_url: { url: imagenBase64 } },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Mistral respondió ${res.status}: ${texto.slice(0, 200)}`);
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
    };
  } catch (err) {
    throw new Error('La IA no devolvió un JSON válido: ' + limpio.slice(0, 150));
  }
}
