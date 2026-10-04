// lib/plantillasFicha.js
// PLANTILLAS DE FICHA TÉCNICA por tipo de producto.
//
// Para que el asistente de la tienda (y los clientes) sepan si un producto
// les sirve, cada tipo de producto necesita ciertos datos SÍ o SÍ. Por
// ejemplo, de un cargador hay que saber la potencia, los puertos, si trae
// cable (y de qué tipo) y con qué equipos es compatible. Sin eso, el chat no
// puede saber que el MPD-80 sirve para un iPhone 13.
//
// Aquí se define, por tipo:
//   - cómo reconocerlo (palabras en el nombre, la categoría o la subcategoría),
//   - qué campos lleva su ficha (los marcados "clave" son obligatorios para
//     que la ficha cuente como completa),
//   - otros nombres con los que ese campo puede estar escrito.
// Lo usan: el editor de Productos (campos sugeridos), la IA de "Nuevo
// producto" (para que llene esos campos) y el reporte "Fichas incompletas".

export function normalizarTexto(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// campo: [nombre, clave?, alias...]
const C = (nombre, clave = false, ...alias) => ({ nombre, clave, alias });

export const PLANTILLAS = [
  {
    tipo: 'cargador',
    titulo: 'Cargador',
    // "cargador" en el nombre, pero no "cable" como producto principal
    reconocer: ['cargador', 'cabezote', 'adaptador de corriente', 'cargador de carro', 'cargador para carro'],
    campos: [
      C('Potencia', true, 'potencia de salida', 'watts', 'salida', 'potencia maxima'),
      C('Puertos', true, 'puerto', 'salidas', 'conector', 'conectores'),
      C('Carga rápida', false, 'carga rapida', 'protocolo', 'pd', 'quick charge'),
      C('Incluye cable', true, 'cable incluido', 'incluye', 'cable'),
      C('Compatible con', true, 'compatibilidad', 'compatible'),
    ],
  },
  {
    tipo: 'cable',
    titulo: 'Cable',
    reconocer: ['cable', 'codo hdmi', 'adaptador hdmi', 'adaptador usb'],
    campos: [
      C('Conectores', true, 'conector', 'tipo de conector', 'entrada / salida', 'puertos'),
      C('Largo', true, 'longitud', 'largo del cable', 'medida'),
      C('Potencia', false, 'carga', 'potencia maxima', 'corriente'),
      C('Compatible con', false, 'compatibilidad', 'compatible'),
    ],
  },
  {
    tipo: 'powerbank',
    titulo: 'Power bank',
    reconocer: ['power bank', 'powerbank', 'bateria portatil', 'bateria externa'],
    campos: [
      C('Capacidad', true, 'capacidad de bateria', 'mah'),
      C('Puertos', true, 'salidas', 'entradas', 'conectores'),
      C('Carga rápida', false, 'carga rapida', 'potencia'),
      C('Carga inalámbrica', false, 'carga inalambrica', 'inalambrica'),
    ],
  },
  {
    tipo: 'audifonos',
    titulo: 'Audífonos / diadema',
    reconocer: ['audifono', 'auricular', 'diadema', 'manos libres', 'headset', 'earbuds', 'airpods', 'tws'],
    campos: [
      C('Conexión', true, 'conectividad', 'tipo de conexion', 'bluetooth', 'conector'),
      C('Tipo', false, 'formato', 'diseno'),
      C('Micrófono', true, 'microfono', 'mic'),
      C('Batería', false, 'bateria', 'autonomia', 'duracion de bateria'),
      C('Cancelación de ruido', false, 'cancelacion de ruido', 'anc', 'enc'),
    ],
  },
  {
    tipo: 'parlante',
    titulo: 'Parlante',
    reconocer: ['parlante', 'bocina', 'altavoz', 'barra de sonido'],
    campos: [
      C('Conexión', true, 'conectividad', 'bluetooth', 'conector'),
      C('Potencia', false, 'potencia de salida', 'watts'),
      C('Batería', true, 'bateria', 'autonomia', 'alimentacion'),
      C('Resistencia al agua', false, 'resistencia al agua', 'ip'),
    ],
  },
  {
    tipo: 'mouse',
    titulo: 'Mouse',
    reconocer: ['mouse', 'raton'],
    campos: [
      C('Conexión', true, 'conectividad', 'tipo de conexion', 'inalambrico', 'conector'),
      C('DPI', false, 'resolucion', 'sensor'),
      C('Botones', false, 'numero de botones'),
      C('Batería', false, 'bateria', 'alimentacion', 'recargable', 'pilas'),
    ],
  },
  {
    tipo: 'teclado',
    titulo: 'Teclado',
    reconocer: ['teclado', 'keyboard'],
    campos: [
      C('Conexión', true, 'conectividad', 'tipo de conexion', 'conector'),
      C('Idioma', true, 'distribucion', 'layout', 'idioma del teclado'),
      C('Tipo', false, 'tipo de teclado', 'switches', 'mecanico', 'membrana'),
      C('Iluminación', false, 'iluminacion', 'rgb', 'retroiluminacion'),
    ],
  },
  {
    tipo: 'control',
    titulo: 'Control / gamepad',
    reconocer: ['control', 'gamepad', 'joystick', 'mando'],
    campos: [
      C('Compatible con', true, 'compatibilidad', 'plataforma', 'compatible'),
      C('Conexión', true, 'conectividad', 'tipo de conexion', 'conector'),
      C('Batería', false, 'bateria', 'autonomia'),
    ],
  },
  {
    tipo: 'juego',
    titulo: 'Videojuego',
    reconocer: ['juego'],
    campos: [
      C('Plataforma', true, 'consola', 'compatible con'),
      C('Formato', false, 'fisico', 'digital'),
      C('Idioma', false, 'idiomas'),
    ],
  },
  {
    tipo: 'consola',
    titulo: 'Consola',
    reconocer: ['consola', 'playstation 5', 'ps5 slim', 'xbox series', 'nintendo switch oled', 'nintendo switch lite'],
    campos: [
      C('Modelo', true, 'version', 'edicion'),
      C('Almacenamiento', true, 'capacidad', 'memoria'),
      C('Estado', true, 'condicion'),
      C('Incluye', true, 'contenido', 'en la caja'),
    ],
  },
  {
    tipo: 'accesorio-consola',
    titulo: 'Accesorio (base, funda, protector)',
    reconocer: ['silicona para nintendo', 'maletin para nintendo', 'estuche', 'protector para', 'grip', 'trigger', 'base de carga', 'base para', 'soporte para', 'funda', 'skin'],
    campos: [
      C('Compatible con', true, 'compatibilidad', 'compatible', 'plataforma'),
      C('Material', false, 'materiales'),
    ],
  },
  {
    tipo: 'celular',
    titulo: 'Celular / tablet',
    reconocer: ['iphone', 'samsung galaxy', 'celular', 'smartphone', 'tablet', 'ipad', 'xiaomi redmi', 'poco '],
    campos: [
      C('Almacenamiento', true, 'capacidad', 'memoria interna', 'rom'),
      C('RAM', false, 'memoria ram'),
      C('Estado', true, 'condicion'),
      C('Salud de batería', false, 'salud de bateria', 'bateria'),
      C('Puerto de carga', true, 'conector', 'puerto', 'conector de carga'),
      C('Garantía', true, 'garantia'),
    ],
  },
  {
    tipo: 'computador',
    titulo: 'Computador / portátil',
    reconocer: ['portatil', 'laptop', 'notebook', 'pc gamer', 'computador', 'thinkpad', 'all in one', 'torre', 'macbook'],
    campos: [
      C('Procesador', true, 'cpu'),
      C('RAM', true, 'memoria ram', 'memoria'),
      C('Almacenamiento', true, 'disco', 'ssd', 'disco duro'),
      C('Pantalla', false, 'tamano de pantalla', 'resolucion'),
      C('Tarjeta de video', false, 'grafica', 'gpu', 'video'),
      C('Sistema operativo', false, 'so', 'windows'),
      C('Estado', true, 'condicion'),
    ],
  },
  {
    tipo: 'smartwatch',
    titulo: 'Reloj inteligente',
    reconocer: ['smart watch', 'smartwatch', 'reloj inteligente', 'smart band', 'manilla inteligente'],
    campos: [
      C('Compatible con', true, 'compatibilidad', 'sistema', 'compatible'),
      C('Batería', false, 'bateria', 'autonomia'),
      C('Resistencia al agua', false, 'resistencia al agua', 'ip'),
    ],
  },
  {
    tipo: 'almacenamiento',
    titulo: 'Almacenamiento (USB, SSD, memoria)',
    reconocer: ['memoria usb', 'usb mx', 'disco ssd', 'ssd', 'disco duro', 'micro sd', 'microsd', 'memoria micro', 'nvme'],
    campos: [
      C('Capacidad', true, 'almacenamiento'),
      C('Interfaz', true, 'conexion', 'conector', 'tipo', 'formato'),
      C('Velocidad', false, 'velocidad de lectura', 'lectura', 'escritura'),
    ],
  },
  {
    tipo: 'red',
    titulo: 'Redes (router, wifi, tarjeta de red)',
    reconocer: ['router', 'wifi usb', 'tarjeta de red', 'repetidor', 'access point', 'switch de red', 'adaptador wifi'],
    campos: [
      C('Velocidad', true, 'velocidad maxima', 'estandar'),
      C('Bandas', false, 'banda', 'frecuencia'),
      C('Conexión', true, 'interfaz', 'puertos', 'conector'),
    ],
  },
];

export const PLANTILLA_GENERAL = {
  tipo: 'general',
  titulo: 'General',
  reconocer: [],
  campos: [C('Marca', false), C('Modelo', false), C('Compatible con', false, 'compatibilidad'), C('Incluye', false, 'contenido')],
};

// Reconoce el tipo de un producto. El nombre manda (es lo más específico);
// la categoría y la subcategoría desempatan.
export function tipoDeProducto({ nombre, categoria, subcategoria } = {}) {
  const n = ` ${normalizarTexto(nombre)} `;
  const cat = ` ${normalizarTexto(`${categoria || ''} ${subcategoria || ''}`)} `;
  // El primer sustantivo del nombre suele decir qué es ("Cable USB...",
  // "Cargador para...", "Control inalámbrico...").
  const primera = normalizarTexto(nombre).split(' ').slice(0, 2).join(' ');
  for (const pl of PLANTILLAS) {
    if (pl.reconocer.some((r) => primera.startsWith(normalizarTexto(r)))) return pl;
  }
  for (const pl of PLANTILLAS) {
    if (pl.reconocer.some((r) => n.includes(` ${normalizarTexto(r)}`))) return pl;
  }
  for (const pl of PLANTILLAS) {
    if (pl.reconocer.some((r) => cat.includes(` ${normalizarTexto(r)}`))) return pl;
  }
  return PLANTILLA_GENERAL;
}

function coincideCampo(nombreFila, campo) {
  const f = normalizarTexto(nombreFila);
  const opciones = [campo.nombre, ...campo.alias].map(normalizarTexto);
  return opciones.some((o) => f === o || f.startsWith(`${o} `) || f.includes(o));
}

// Qué campos de la plantilla le faltan a una ficha.
export function camposFaltantes(plantilla, especificaciones = []) {
  const filas = Array.isArray(especificaciones) ? especificaciones.filter((e) => e && (e.nombre || e.name) && (e.valor || e.value)) : [];
  return plantilla.campos.filter((campo) => !filas.some((fila) => coincideCampo(fila.nombre ?? fila.name, campo)));
}

// Texto para la IA de "Nuevo producto": qué campos poner según el tipo.
export function guiaDeCamposParaIA() {
  return PLANTILLAS.map((p) => `- ${p.titulo}: ${p.campos.map((c) => c.nombre).join(', ')}`).join('\n');
}

// Valores escritos siempre igual (para que la búsqueda los encuentre):
// "tipo c", "type-c", "usb c" → "USB-C"; "lighting" → "Lightning"; etc.
export function normalizarValorFicha(valor) {
  return String(valor || '')
    .replace(/\b(?:usb[\s-]?tipo[\s-]?c|tipo[\s-]?c|type[\s-]?c|usb[\s-]?c)\b/gi, 'USB-C')
    // OJO: "usb a" (con espacio) NO se toca: en español "Cable USB a Lightning"
    // significa "de USB a Lightning".
    .replace(/\b(?:usb[\s-]?tipo[\s-]?a|tipo[\s-]?a|type[\s-]?a|usb-a)\b/gi, 'USB-A')
    .replace(/\b(?:lightning|lighning|lightining|ligthning|lighting)\b/gi, 'Lightning')
    .replace(/\bmicro[\s-]?usb\b/gi, 'Micro USB')
    .replace(/\bbluetooth\b/gi, 'Bluetooth')
    .replace(/(\d)\s?(?:watts?|w)\b/gi, '$1 W')
    .replace(/(\d)\s?mah\b/gi, '$1 mAh')
    .replace(/(\d)\s?gb\b/gi, '$1 GB')
    .replace(/(\d)\s?tb\b/gi, '$1 TB');
}
