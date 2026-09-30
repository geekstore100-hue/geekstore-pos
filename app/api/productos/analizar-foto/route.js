import { analizarFotoProducto } from '../../../../lib/mistralVision';
import { analizarFotoProductoGemini } from '../../../../lib/geminiVision';
import { analizarFotoProductoGroq } from '../../../../lib/groqVision';
import { leerConfigIA } from '../../../../lib/iaArticulo';

// Recibe una foto (base64) y devuelve nombre/descripción/categoría
// sugeridos por IA, para prellenar el formulario de "Nuevo producto".
// No crea nada — es solo el paso de sugerencia; el vendedor revisa y
// ajusta antes de guardar. El modelo, el prompt y el proveedor (Mistral
// o Gemini, por si se agotan los créditos de uno) se traen de
// /api/productos/ia-config (editables desde Configuraciones), no están
// fijos en el código.
//
// No necesita revisar una clave de administrador acá: esta ruta ya está
// protegida como todas las del POS (hay que haber iniciado sesión —
// ver middleware.js), a diferencia de la página web que no tiene login.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { imagenBase64, infoAdicional } = await request.json();
    if (!imagenBase64) {
      return Response.json({ ok: false, error: 'Falta la imagen' }, { status: 400 });
    }
    const { modelo, modeloGemini, modeloGroq, proveedor, prompt } = await leerConfigIA();
    const promptFinal = infoAdicional && infoAdicional.trim()
      ? `${prompt}\n\nInformación adicional que dio el usuario sobre este producto (la foto puede no mostrarla toda) — tenela en cuenta junto con lo que ves en la imagen: "${infoAdicional.trim()}"`
      : prompt;

    const sugerencia = proveedor === 'gemini'
      ? await analizarFotoProductoGemini(imagenBase64, { modelo: modeloGemini, prompt: promptFinal })
      : proveedor === 'groq'
      ? await analizarFotoProductoGroq(imagenBase64, { modelo: modeloGroq, prompt: promptFinal })
      : await analizarFotoProducto(imagenBase64, { modelo, prompt: promptFinal });

    return Response.json({ ok: true, proveedorUsado: proveedor, ...sugerencia });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
