// lib/iaTexto.js
// Preguntarle algo SOLO DE TEXTO a la IA (sin foto) y recibir el texto de
// la respuesta tal cual. Usa los mismos proveedores, claves y modelos de
// "Nuevo producto" (Configuraciones → IA). Lo usa, por ejemplo, la revisión
// de nombres de productos.
//
// Octubre 2026: si la IA elegida falla o se llena, contesta la siguiente
// (lib/iaCadena.js): Mistral Large → Gemini → Groq → Ministral 14B → 8B.

import { leerConfigIA } from './iaArticulo';
import { preguntarEnCadena } from './iaCadena';

export async function preguntarIA(prompt) {
  const config = await leerConfigIA();
  const r = await preguntarEnCadena({ config, primero: 'mistral', prompt, maxTokens: 3000, temperatura: 0.2, presupuestoMs: 22000 });
  return { proveedor: r.proveedor === 'ministral' ? 'mistral' : r.proveedor, texto: r.resultado };
}
