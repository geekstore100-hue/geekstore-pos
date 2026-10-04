import { analizarFotoProducto } from '../../../../lib/mistralVision';
import { analizarFotoProductoGemini } from '../../../../lib/geminiVision';
import { analizarFotoProductoGroq } from '../../../../lib/groqVision';
import { leerConfigIA } from '../../../../lib/iaArticulo';
import { leerPaginaFabricante, ErrorPagina, MAX_CARACTERES_TEXTO } from '../../../../lib/leerPaginaFabricante';
import { guiaDeCamposParaIA } from '../../../../lib/plantillasFicha';

// Recibe la información de un producto y devuelve nombre, descripción,
// categoría y ficha técnica (especificaciones) sugeridos por IA, para
// prellenar el formulario de "Nuevo producto". No crea nada — es solo el
// paso de sugerencia; se revisa y ajusta antes de guardar.
//
// Fuentes (se puede usar una o varias juntas):
// - imagenBase64: una foto (del producto o de la caja con las
//   especificaciones impresas).
// - enlaceFabricante: el enlace de la página del producto en el sitio del
//   fabricante; el servidor la abre y le pasa el texto a la IA (ver
//   lib/leerPaginaFabricante.js). Es la fuente más confiable para la ficha
//   técnica.
// - textoFabricante: el texto de esa página pegado a mano (plan B para las
//   páginas que no se dejan leer). Si viene, se usa en vez del enlace.
// - infoAdicional: notas libres de quien crea el producto.
//
// El modelo, el prompt y el proveedor por defecto se traen de
// Configuraciones (ver lib/iaArticulo.js). Además, al final del prompt se
// agrega SIEMPRE el bloque FORMATO_RESPUESTA (fijo, no editable): así la
// ficha técnica y la regla de no inventar datos aplican aunque el prompt
// guardado en Configuraciones sea uno viejo.
//
// No necesita revisar una clave de administrador acá: esta ruta ya está
// protegida como todas las del POS (hay que haber iniciado sesión — ver
// middleware.js).
export const dynamic = 'force-dynamic';

const FORMATO_RESPUESTA = `INSTRUCCIONES FINALES (tienen prioridad sobre cualquier instrucción anterior sobre el formato de la respuesta):

Responde SOLO con un objeto JSON válido, sin texto adicional y sin markdown, con esta forma exacta:
{"nombre": "...", "descripcion": "...", "categoria": "...", "subcategoria": "...", "especificaciones": [{"nombre": "...", "valor": "..."}]}

"descripcion" (máximo 600 caracteres en total): es el texto para VENDER, no una ficha técnica. Empieza con una frase que diga qué es el producto y para quién o para qué sirve. Después pon de 2 a 4 beneficios concretos, cada uno en su propia línea y empezando con "✓ " — habla de lo que gana el cliente (por ejemplo: cargar el celular más rápido, trabajar más cómodo, no preocuparse por la batería). NO pongas en la descripción cifras técnicas ni listas de características: esas van en "especificaciones". Español de Colombia con trato de "tú" (nunca "vos" ni voseo).

"especificaciones": la ficha técnica, normalmente de 4 a 15 filas. Cada fila tiene un "nombre" corto (por ejemplo "Marca", "Modelo", "Potencia", "Conector", "Compatibilidad", "Dimensiones", "Peso", "Batería", "Incluye") y un "valor" concreto con su unidad (por ejemplo "20 W", "USB-C", "iPhone 12 en adelante"). Escribe cada "nombre" en español y solo con la primera letra en mayúscula (por ejemplo "Velocidad del ventilador", NO "VELOCIDAD DEL VENTILADOR" ni "Velocidad Del Ventilador"); las marcas, modelos y siglas se dejan como son (por ejemplo "TDP", "RGB", "USB", "Thermalright"). Los valores tampoco van en mayúsculas sostenidas.

CAMPOS QUE MÁS IMPORTAN SEGÚN EL TIPO DE PRODUCTO (el asistente de la tienda los usa para saber si un producto le sirve a un cliente). Si el dato aparece en la información, ponlo con ESE nombre exacto de fila; si no aparece, no lo pongas:
${guiaDeCamposParaIA()}
Formato de esos valores: conectores siempre escritos "USB-C", "USB-A", "Lightning", "Micro USB"; en "Incluye cable" pon "Sí, USB-C a Lightning" o "No"; en "Compatible con" pon los equipos o la familia concreta (por ejemplo "iPhone 8 en adelante (con cable USB-C a Lightning)", "PS5", "Nintendo Switch") y SOLO si el fabricante o el usuario lo dicen.

REGLA MÁS IMPORTANTE: en "especificaciones" pon SOLO datos que aparezcan escritos en la información del fabricante, en la foto (por ejemplo impresos en la caja o en una etiqueta) o en la información adicional del usuario. Si un dato no aparece, NO lo pongas y NO lo supongas. Es mejor una ficha corta y cierta que una larga con datos inventados. Si no hay ningún dato técnico que se pueda verificar, deja "especificaciones" como [].

Si la información del fabricante está en otro idioma, tradúcela al español de Colombia (las marcas y los nombres de modelos se dejan igual). Ignora precios, envíos, cupones, reseñas y datos de la tienda que publica la página: solo interesa el producto.`;

export async function POST(request) {
  try {
    const {
      imagenBase64,
      infoAdicional,
      proveedor: proveedorElegido,
      enlaceFabricante,
      textoFabricante,
    } = await request.json();

    const enlace = String(enlaceFabricante || '').trim();
    const textoPegado = String(textoFabricante || '').trim();

    if (!imagenBase64 && !enlace && !textoPegado) {
      return Response.json(
        { ok: false, error: 'Sube una foto, pon el enlace del fabricante o pega el texto del producto' },
        { status: 400 }
      );
    }

    // Texto del fabricante: el pegado a mano tiene prioridad (si lo pegaron,
    // es porque el enlace no funcionó o porque quieren usar justo ese).
    let infoFabricante = '';
    let fuenteFabricante = null;
    if (textoPegado) {
      infoFabricante = textoPegado.slice(0, MAX_CARACTERES_TEXTO);
      fuenteFabricante = 'texto';
    } else if (enlace) {
      try {
        infoFabricante = await leerPaginaFabricante(enlace);
        fuenteFabricante = 'enlace';
      } catch (e) {
        if (e instanceof ErrorPagina) {
          return Response.json(
            {
              ok: false,
              codigo: e.codigo,
              error:
                e.codigo === 'pagina_no_legible'
                  ? `${e.message}. Abre la página, copia el texto del producto (descripción y especificaciones) y pégalo en el cuadro "Texto del fabricante".`
                  : e.message,
            },
            { status: 422 }
          );
        }
        throw e;
      }
    }

    const { modelo, modeloGemini, modeloGroq, proveedor: proveedorConfig, prompt } = await leerConfigIA();
    // Desde "Nuevo producto" se puede elegir cuál IA usar solo para este
    // análisis (selector simple, no toca la config guardada); si no manda
    // nada válido, se usa el proveedor por defecto de Configuraciones.
    const proveedor = ['mistral', 'gemini', 'groq'].includes(proveedorElegido) ? proveedorElegido : proveedorConfig;

    const bloques = [prompt];
    if (!imagenBase64) {
      bloques.push('NOTA: esta vez NO hay foto. Trabaja solo con la información de texto que viene abajo.');
    }
    if (infoFabricante) {
      bloques.push(
        `INFORMACIÓN DEL FABRICANTE (${fuenteFabricante === 'enlace' ? `texto sacado de su página web: ${enlace}` : 'texto copiado de su página web'}). Es la fuente más confiable para la ficha técnica:\n<<<\n${infoFabricante}\n>>>`
      );
    }
    if (infoAdicional && infoAdicional.trim()) {
      bloques.push(
        `Información adicional que dio el usuario sobre este producto — tenla en cuenta junto con lo demás: "${infoAdicional.trim()}"`
      );
    }
    bloques.push(FORMATO_RESPUESTA);
    const promptFinal = bloques.join('\n\n');

    const imagen = imagenBase64 || null;
    const sugerencia = proveedor === 'gemini'
      ? await analizarFotoProductoGemini(imagen, { modelo: modeloGemini, prompt: promptFinal })
      : proveedor === 'groq'
      ? await analizarFotoProductoGroq(imagen, { modelo: modeloGroq, prompt: promptFinal })
      : await analizarFotoProducto(imagen, { modelo, prompt: promptFinal });

    return Response.json({ ok: true, proveedorUsado: proveedor, fuenteFabricante, ...sugerencia });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
