import { leerConfigIA } from '../../../../lib/iaArticulo';
import { preguntarEnCadena } from '../../../../lib/iaCadena';
import { interpretarRespuestaIA } from '../../../../lib/respuestaIA';
import { leerPaginaFabricante, ErrorPagina, MAX_CARACTERES_TEXTO } from '../../../../lib/leerPaginaFabricante';
import { guiaDeCamposParaIA } from '../../../../lib/plantillasFicha';
import { clavesIADeSede, DATOS_SEDES } from '../../../../lib/sedes';

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
// Configuraciones (ver lib/iaArticulo.js). Octubre 2026: si la IA elegida
// falla o se llena, contesta la siguiente sola (lib/iaCadena.js): Mistral
// Large → Gemini → Groq → Ministral 14B → Ministral 8B. Además, al final del prompt se
// agrega SIEMPRE el bloque FORMATO_RESPUESTA (fijo, no editable): así la
// ficha técnica y la regla de no inventar datos aplican aunque el prompt
// guardado en Configuraciones sea uno viejo.
//
// No necesita revisar una clave de administrador acá: esta ruta ya está
// protegida como todas las del POS (hay que haber iniciado sesión — ver
// middleware.js).
export const dynamic = 'force-dynamic';

// maxDesc (nov 2026): Venecia pide 550 en vez de 600 — la IA no cuenta
// bien las letras y se pasaba del límite.
const formatoRespuesta = (maxDesc = 600) => `INSTRUCCIONES FINALES (tienen prioridad sobre cualquier instrucción anterior sobre el formato de la respuesta):

Responde SOLO con un objeto JSON válido, sin texto adicional y sin markdown, con esta forma exacta:
{"nombre": "...", "descripcion": "...", "categoria": "...", "subcategoria": "...", "especificaciones": [{"nombre": "...", "valor": "..."}]}

"descripcion" (entre 400 y ${maxDesc} caracteres en total, contando espacios y saltos de línea; NUNCA más de ${maxDesc}): es el texto para VENDER, no una ficha técnica. Empieza con una frase que diga qué es el producto y para quién o para qué sirve. Después pon de 2 a 4 beneficios concretos, cada uno en su propia línea y empezando con "✓ " — habla de lo que gana el cliente (por ejemplo: cargar el celular más rápido, trabajar más cómodo, no preocuparse por la batería). NO pongas en la descripción cifras técnicas ni listas de características: esas van en "especificaciones". Español de Colombia con trato de "tú" (nunca "vos" ni voseo).

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
      enlaceFabricante,
      textoFabricante,
      maxDescripcion,
    } = await request.json();

    const enlace = String(enlaceFabricante || '').trim();
    const textoPegado = String(textoFabricante || '').trim();

    // Sede externa (Venecia, ver lib/sedes.js): usa SUS claves de IA.
    const sede = request.headers.get('x-pos-sede');
    const claves = sede ? clavesIADeSede(sede) : null;
    if (claves && !Object.values(claves).some(Boolean)) {
      return Response.json(
        { ok: false, error: `${DATOS_SEDES[sede]?.nombre || 'La sede'} todavía no tiene sus claves de IA configuradas. Pídele a Nelson que las ponga.` },
        { status: 400 }
      );
    }

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

    const config = await leerConfigIA();
    const { prompt } = config;
    // Todo automático: siempre arranca con Mistral Large y sigue la cadena.
    const proveedor = 'mistral';

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
    // Venecia (sede) o una ficha de Venecia abierta por el administrador:
    // descripción 50 letras más corta (ver lib/descripcionProducto.js).
    const maxDesc = Math.min(600, Math.max(300, Number(maxDescripcion) || (sede ? 550 : 600)));
    bloques.push(formatoRespuesta(maxDesc));
    const promptFinal = bloques.join('\n\n');

    const r = await preguntarEnCadena({
      config,
      primero: proveedor,
      prompt: promptFinal,
      imagenBase64: imagenBase64 || null,
      maxTokens: 1800,
      claves,
      // Si una IA no devuelve un JSON válido, se prueba la siguiente.
      interpretar: (texto, nombre) => interpretarRespuestaIA(texto, nombre),
    });

    return Response.json({
      ok: true,
      proveedorUsado: r.proveedor === 'ministral' ? 'mistral' : r.proveedor,
      iaUsada: `${r.nombre} (${r.modelo})`,
      intentosFallidos: r.errores,
      fuenteFabricante,
      ...r.resultado,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
