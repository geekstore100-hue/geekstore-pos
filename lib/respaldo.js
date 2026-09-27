import { getStore } from '@netlify/blobs';
import { gzipSync } from 'zlib';
import sql from './db';

// Respaldo automático de la base de datos. Vuelca TODAS las tablas (los
// DATOS: qué productos hay, qué se vendió, facturas de compra, garantías,
// etc.) a un solo archivo JSON comprimido, y lo guarda en Netlify Blobs —
// el mismo mecanismo que ya se usa para las fotos de producto y los
// manifiestos de importación (ver app/api/imagenes y app/api/manifiestos).
//
// Ojo: esto NO es un respaldo de la ESTRUCTURA de las tablas (columnas,
// índices, etc.) — eso ya queda documentado en los archivos
// migracion_*.sql que se van guardando en el repositorio cada vez que se
// agrega algo nuevo. Esto es específicamente para recuperar información si
// algo se borra o se daña por error (una consulta mal hecha, un dato
// equivocado, etc.) — la estructura se reconstruye corriendo de nuevo esas
// migraciones.
//
// Se llama desde dos lugares:
// - netlify/functions/respaldo-programado.js: todos los días, solo.
// - app/api/respaldos/route.js (POST): el botón "Generar respaldo ahora"
//   en Configuraciones → Respaldos.
const NOMBRE_STORE = 'respaldos-bd';
const CLAVE_INDICE = 'indice.json';
// Un respaldo diario durante un mes es un buen equilibrio entre tener
// suficiente historia y no ir acumulando espacio para siempre. Si algún
// día hace falta más, solo hay que subir este número.
const MAX_RESPALDOS_GUARDADOS = 30;

export async function generarRespaldo() {
  const tablas = await sql(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  // Todas las tablas se consultan en paralelo (no una por una) — la base
  // vive en Neon, cada consulta va por HTTP, y sumar esos viajes de ida y
  // vuelta uno tras otro para 25-30 tablas puede acercarse al límite de
  // tiempo que tienen las funciones de Netlify. En paralelo, el tiempo
  // total es el de la tabla más lenta, no la suma de todas.
  const nombresTablas = tablas.map((t) => t.table_name);
  const filasPorTabla = await Promise.all(
    // El nombre de la tabla viene del catálogo de Postgres, no de algo que
    // escribió una persona, así que es seguro interpolarlo directo acá —
    // no existe una forma de mandar el NOMBRE de una tabla como parámetro
    // separado en SQL (los parámetros solo sirven para valores).
    nombresTablas.map((tabla) => sql(`SELECT * FROM "${tabla}"`))
  );

  const datos = {};
  nombresTablas.forEach((tabla, i) => {
    datos[tabla] = filasPorTabla[i];
  });

  const contenido = JSON.stringify({ generadoEn: new Date().toISOString(), tablas: datos });
  const comprimido = gzipSync(Buffer.from(contenido, 'utf-8'));

  const ahora = new Date();
  const key = `respaldo-${ahora.toISOString().replace(/[:.]/g, '-')}.json.gz`;

  const store = getStore(NOMBRE_STORE);
  await store.set(key, new Blob([comprimido], { type: 'application/gzip' }), {
    metadata: { contentType: 'application/gzip' },
  });

  await actualizarIndice(store, {
    key,
    creadoEn: ahora.toISOString(),
    tamanoBytes: comprimido.byteLength,
    tablas: nombresTablas.length,
  });

  return { key, tamanoBytes: comprimido.byteLength, tablas: nombresTablas.length };
}

async function actualizarIndice(store, entradaNueva) {
  let indice = [];
  try {
    const actual = await store.get(CLAVE_INDICE, { type: 'json' });
    if (Array.isArray(actual)) indice = actual;
  } catch {
    // Sin índice todavía (primer respaldo que se corre) — arranca vacío.
  }

  indice.unshift(entradaNueva);

  // Lo que sobra del límite se borra también del store (no solo del
  // índice), para no ir acumulando espacio de más para siempre.
  const paraBorrar = indice.slice(MAX_RESPALDOS_GUARDADOS);
  indice = indice.slice(0, MAX_RESPALDOS_GUARDADOS);

  await store.setJSON(CLAVE_INDICE, indice);

  for (const vieja of paraBorrar) {
    try {
      await store.delete(vieja.key);
    } catch {
      // Si uno viejo no se alcanza a borrar, no es grave: ya no aparece en
      // el índice ni cuenta para el límite de acá en adelante, y se
      // reintenta borrarlo el día que le toque salir de nuevo.
    }
  }
}

// Lista de respaldos disponibles (fecha y tamaño), para la pantalla de
// Configuraciones → Respaldos. Nunca trae el contenido, solo el índice.
export async function listarRespaldos() {
  const store = getStore(NOMBRE_STORE);
  try {
    const indice = await store.get(CLAVE_INDICE, { type: 'json' });
    return Array.isArray(indice) ? indice : [];
  } catch {
    return [];
  }
}

// Trae el archivo comprimido de un respaldo puntual, para descargarlo.
export async function leerRespaldo(key) {
  const store = getStore(NOMBRE_STORE);
  return store.get(key, { type: 'arrayBuffer' });
}
