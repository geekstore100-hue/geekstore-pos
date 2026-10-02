// Interpreta la respuesta de cualquiera de las 3 IA (Mistral, Gemini, Groq)
// para "Nuevo producto" y la deja en el mismo formato, ya limpia y con
// límites de tamaño. Antes cada proveedor tenía su propia copia de esto.
//
// Es tolerante con lo que a veces devuelven los modelos aunque se les pida
// "solo JSON": bloques ```json ... ```, texto antes o después del JSON, o el
// razonamiento interno <think>...</think> que escriben algunos modelos
// (como Qwen en Groq) antes de la respuesta.

import { normalizarEspecificaciones } from './especificaciones';

export function interpretarRespuestaIA(texto, nombreProveedor = 'La IA') {
  let limpio = String(texto || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json|```/gi, '')
    .trim();

  // Si hay texto alrededor, se toma desde la primera "{" hasta la última "}".
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio !== -1 && fin > inicio) limpio = limpio.slice(inicio, fin + 1);

  let resultado;
  try {
    resultado = JSON.parse(limpio);
  } catch {
    throw new Error(`${nombreProveedor} no devolvió un JSON válido: ` + limpio.slice(0, 150));
  }

  return {
    nombre: String(resultado.nombre || '').trim().slice(0, 150),
    descripcion: String(resultado.descripcion || '').trim().slice(0, 600),
    categoria: String(resultado.categoria || '').trim().slice(0, 60),
    subcategoria: String(resultado.subcategoria || '').trim().slice(0, 60),
    especificaciones: normalizarEspecificaciones(resultado.especificaciones) || [],
  };
}
