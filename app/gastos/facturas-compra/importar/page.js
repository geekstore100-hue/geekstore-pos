'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../../../../components/Shell';
import { abrirZip, buscarEnZip } from '../../../../lib/leerZip';
import {
  validarBorrador,
  emparejarLinea,
  costoParaPos,
  costoNetoParaPos,
  precioVentaAutomatico,
  precioDistribuidorAutomatico,
  DESCRIPCION_MINIMA,
  esGamerSugerido,
  reglaSugerida,
  normalizarRegla,
  REGLA_POR_DEFECTO,
  categoriaParecida,
  proveedorParecido,
  codigoParaAprender,
  sinTildes,
} from '../../../../lib/borradorFactura';
import { descargarExcelEtiquetas } from '../../../../lib/etiquetasOpenLabel';
import { quitarFondoFoto } from '../../../../lib/quitarFondoCliente';
import ModalProductoNuevo from '../../../../components/ModalProductoNuevo';
import { recortarEspaciosBlancos, redimensionarParaIA } from '../../../../lib/fotosNavegador';
import { tipoDeProducto, camposFaltantes } from '../../../../lib/plantillasFicha';
import { ajustarDescripcion, REGLAS_DESCRIPCION_IA, DESCRIPCION_MAXIMA } from '../../../../lib/descripcionProducto';
import { CAMPOS_CONFIGURABLES, OBLIGATORIOS_POR_DEFECTO } from '../../../../lib/camposFactura';

// ASISTENTE DE FACTURA DE COMPRA (oct 2026), con el diseño "Poder" de la
// tienda (oscuro, neón cian y magenta). Sirve para las dos formas de
// crear una factura de compra:
//   • Importar el borrador (ZIP) que prepara Claude desde la foto, o
//   • Factura manual (/gastos/facturas-compra/importar?manual=1).
// Pasos: 1 Factura → 2 Emparejar (o agregar productos) → 3 Productos nuevos
// (uno a la vez, con semáforo de lo que falta) → 4 Precios → 5 Revisar y
// aprobar. Los campos que se exigen se configuran en ⚙️ Campos obligatorios.
//
// Facturas de compra → "📥 Importar borrador" (octubre 2026).
// Claude lee la foto de la factura del proveedor (y su catálogo o la página
// del fabricante) y entrega un ZIP: factura.json + fotos/. Aquí se abre, se
// cruza con los productos del POS y queda como BORRADOR:
//   ✅ ya existe en el POS      ⚠️ hay que elegir      🆕 se va a crear
// Nada se guarda hasta darle "Aprobar". Ahí, en orden: proveedor (si es
// nuevo) → productos nuevos (con fotos y en Alegra) → factura de compra
// (suma el inventario) → códigos aprendidos del proveedor → Excel de stickers.
// Si algo falla a mitad, "Aprobar" otra vez sigue desde donde quedó (no
// duplica lo que ya se creó).

const TARIFAS_RETEICA = [
  [0, 'Sin retención'],
  [1.1, 'ReteICA 1,1 %'],
  [0.41, 'ReteICA 0,41 %'],
];

const FOTO_MAX_LADO = 1600;
const FOTO_MAX_BYTES = 1.2 * 1024 * 1024;

function moneda(n) {
  return Math.round(Number(n || 0)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function tipoImagen(ruta) {
  const r = ruta.toLowerCase();
  if (r.endsWith('.png')) return 'image/png';
  if (r.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function blobADataUri(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.onerror = mal;
    lector.readAsDataURL(blob);
  });
}

// Igual que en Productos: máximo 1600 px y ~1,2 MB; PNG transparente → fondo blanco.
function achicarFoto(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const bytes = Math.round(((dataUri.length - dataUri.indexOf(',') - 1) * 3) / 4);
      const esPng = dataUri.startsWith('data:image/png');
      if (!w || !h || (w <= FOTO_MAX_LADO && h <= FOTO_MAX_LADO && bytes <= FOTO_MAX_BYTES && !esPng)) {
        resolve(dataUri);
        return;
      }
      const escala = Math.min(1, FOTO_MAX_LADO / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * escala);
      canvas.height = Math.round(h * escala);
      try {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(dataUri);
      }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

async function dataUriAFile(dataUri, nombre) {
  const blob = await (await fetch(dataUri)).blob();
  return new File([blob], nombre, { type: blob.type || 'image/jpeg' });
}

async function pedirJson(url, opciones) {
  const res = await fetch(url, opciones);
  const data = await res.json().catch(() => ({ ok: false, error: `Error ${res.status}` }));
  return { status: res.status, ...data };
}

const ICONO = { ok: '✅', revisar: '⚠️', nuevo: '🆕', omitir: '⏭️' };

export default function ImportarBorradorPage() {
  const [cargandoBase, setCargandoBase] = useState(true);
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [facturas, setFacturas] = useState([]);

  const [errorArchivo, setErrorArchivo] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [borrador, setBorrador] = useState(null); // datos generales (proveedor, factura, avisos, prueba)
  const [lineas, setLineas] = useState([]);
  const [fotos, setFotos] = useState({}); // ruta → { url, blob }
  const [encabezado, setEncabezado] = useState(null);
  const [proveedorElegido, setProveedorElegido] = useState(''); // id o 'nuevo'
  const [aprendidos, setAprendidos] = useState({ alias: new Map(), comprados: new Set() });
  // Regla de precios del proveedor (ver lib/borradorFactura.js):
  // Innovall → IVA ignorado y venta = costo × 2; los demás → costo = precio
  // + IVA y la venta la pone Nelson. Se recuerda por proveedor.
  const [regla, setRegla] = useState(REGLA_POR_DEFECTO);
  const [reglaOrigen, setReglaOrigen] = useState(''); // 'guardada' | 'sugerida'
  const [recordarRegla, setRecordarRegla] = useState(true);
  const [fotoGrande, setFotoGrande] = useState(null); // url de la foto ampliada
  // Formulario COMPLETO de producto nuevo (el de Productos) para una línea,
  // prellenado con lo del borrador: { i, prefill } o null.
  const [formularioLinea, setFormularioLinea] = useState(null);
  const [preparandoFormulario, setPreparandoFormulario] = useState(null); // índice de línea

  const [aprobando, setAprobando] = useState(false);
  const [pasos, setPasos] = useState([]);
  const [errorAprobar, setErrorAprobar] = useState('');
  const [resultado, setResultado] = useState(null);
  const progreso = useRef({ proveedorId: null, facturaId: null, siguienteRef: null });
  const inputArchivo = useRef(null);
  // Asistente por pasos
  const [paso, setPaso] = useState(1);
  const [actual, setActual] = useState(null); // línea nueva abierta en el paso 3
  const [obligatorios, setObligatorios] = useState(OBLIGATORIOS_POR_DEFECTO);
  const [verConfig, setVerConfig] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [manualPendiente, setManualPendiente] = useState(false);

  useEffect(() => {
    async function cargar() {
      try {
        const [p, pr, b, c, f, sc, ob] = await Promise.all([
          pedirJson('/api/productos'),
          pedirJson('/api/proveedores'),
          pedirJson('/api/bodegas'),
          pedirJson('/api/categorias'),
          pedirJson('/api/facturas-compra'),
          pedirJson('/api/subcategorias').catch(() => ({ ok: false })),
          pedirJson('/api/configuracion/factura-obligatorios').catch(() => ({ ok: false })),
        ]);
        if (sc.ok) setSubcategorias(sc.subcategorias);
        if (ob.ok && Array.isArray(ob.campos)) setObligatorios(ob.campos);
        try {
          if (new URLSearchParams(window.location.search).get('manual') === '1') setManualPendiente(true);
        } catch {
          // sin URL: nada
        }
        if (p.ok) setProductos(p.productos);
        if (pr.ok) setProveedores(pr.proveedores);
        if (b.ok) setBodegas(b.bodegas);
        if (c.ok) setCategorias(c.categorias);
        if (f.ok) setFacturas(f.facturas);
      } finally {
        setCargandoBase(false);
      }
    }
    cargar();
  }, []);

  const productosPorId = useMemo(() => new Map(productos.map((p) => [Number(p.id), p])), [productos]);

  // ?manual=1 → arranca de una la factura manual (cuando ya cargó todo).
  useEffect(() => {
    if (!cargandoBase && manualPendiente) {
      setManualPendiente(false);
      iniciarManual();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoBase, manualPendiente]);

  // ─── Factura manual (sin borrador) ──────────────────────────────────
  // Es lo mismo que un borrador vacío: los productos se agregan en el paso 2
  // (buscando los que ya existen o creando nuevos, que se completan en el 3).
  function iniciarManual() {
    Object.values(fotos).forEach((f) => URL.revokeObjectURL(f.url));
    const principal = bodegas.find((x) => sinTildes(x.nombre).toLowerCase() === 'principal') || bodegas[0];
    progreso.current = { proveedorId: null, facturaId: null, siguienteRef: null };
    setErrorArchivo('');
    setResultado(null);
    setErrorAprobar('');
    setPasos([]);
    setFotos({});
    setLineas([]);
    setAprendidos({ alias: new Map(), comprados: new Set() });
    setRegla(REGLA_POR_DEFECTO);
    setReglaOrigen('sugerida');
    setRecordarRegla(true);
    setProveedorElegido('');
    setNombreArchivo('');
    setBorrador({
      manual: true,
      prueba: false,
      proveedor: { nombre: '', identificacion: '', telefono: '' },
      factura: { numero: '', fecha: '', fecha_vencimiento: '', subtotal: 0, iva: 0, total: 0, notas: '' },
      items: [],
      avisos: [],
    });
    setEncabezado({
      numero: '',
      fecha_creacion: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      fecha_vencimiento: '',
      bodega_id: principal ? String(principal.id) : '',
      retencion_porcentaje: 0,
      retencion_base: '',
      notas: '',
    });
    setPaso(1);
    setActual(null);
  }

  function itemManual(datos) {
    return {
      linea: 0,
      codigo_proveedor: '',
      descripcion_factura: datos.nombre || '',
      cantidad: 1,
      costo_unitario: datos.costo || '',
      descuento_porcentaje: 0,
      iva_porcentaje: 19,
      marca: '',
      modelo: '',
      confianza: 'alta',
      notas: '',
      manual: true,
      producto: datos.nuevo
        ? {
            nombre: datos.nombre || '',
            categoria: '',
            subcategoria: '',
            descripcion: '',
            especificaciones: [],
            precio_venta_sugerido: null,
            es_gamer: null,
            fotos: [],
            fuente: { tipo: 'factura', detalle: 'Agregado a mano', url: '' },
          }
        : null,
    };
  }

  // Producto que ya existe: el costo se sugiere del último (sin el IVA si la
  // regla lo va a sumar, para no sumarlo dos veces).
  function agregarExistente(p) {
    const ultimo = Number(p.precio_costo) || 0;
    const costo = ultimo ? Math.round((regla.iva === 'sumar' ? ultimo / 1.19 : ultimo) * 10000) / 10000 : '';
    const it = itemManual({ nombre: p.nombre, costo });
    const cruce = { estado: 'ok', producto_id: Number(p.id), candidatos: [], motivo: 'Agregado a mano' };
    setLineas((ls) => [...ls, { ...lineaDesdeItem({ ...it, linea: ls.length + 1 }, cruce, {}), decididaAMano: true }]);
  }

  function agregarNueva(nombre) {
    const it = itemManual({ nombre, nuevo: true });
    const cruce = { estado: 'nuevo', producto_id: null, candidatos: [], motivo: 'Producto nuevo agregado a mano' };
    setLineas((ls) => [...ls, { ...lineaDesdeItem({ ...it, linea: ls.length + 1 }, cruce, {}), decididaAMano: true }]);
  }

  function quitarLinea(i) {
    setLineas((ls) => ls.filter((_, j) => j !== i).map((l, j) => ({ ...l, linea: j + 1 })));
    setActual(null);
  }

  async function guardarObligatorios(campos) {
    setObligatorios(campos);
    setGuardandoConfig(true);
    await pedirJson('/api/configuracion/factura-obligatorios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campos }),
    }).catch(() => null);
    setGuardandoConfig(false);
  }

  // ─── Abrir el ZIP (o el JSON solo) ──────────────────────────────────
  async function abrirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setErrorArchivo('');
    setResultado(null);
    setErrorAprobar('');
    setPasos([]);
    setAbriendo(true);
    try {
      let json;
      const nuevasFotos = {};
      if (/\.json$/i.test(archivo.name)) {
        json = JSON.parse(await archivo.text());
      } else {
        const zip = await abrirZip(archivo);
        let entrada = buscarEnZip(zip, 'factura.json');
        if (!entrada) {
          const otro = [...zip.keys()].find((k) => k.toLowerCase().endsWith('.json'));
          entrada = otro ? zip.get(otro) : null;
        }
        if (!entrada) throw new Error('El ZIP no trae el archivo factura.json.');
        json = JSON.parse(new TextDecoder('utf-8').decode(await entrada.leer()));
        const rutas = new Set();
        for (const it of Array.isArray(json.items) ? json.items : []) {
          for (const r of Array.isArray(it?.producto?.fotos) ? it.producto.fotos : []) rutas.add(String(r));
        }
        for (const ruta of rutas) {
          const e2 = buscarEnZip(zip, ruta);
          if (!e2) continue;
          const blob = new Blob([await e2.leer()], { type: tipoImagen(ruta) });
          nuevasFotos[ruta] = { blob, url: URL.createObjectURL(blob) };
        }
      }
      const v = validarBorrador(json);
      if (!v.ok) throw new Error(v.error);
      await prepararBorrador(v.borrador, nuevasFotos);
      setNombreArchivo(archivo.name);
    } catch (err) {
      setErrorArchivo(err instanceof SyntaxError ? 'El factura.json está dañado (no es un JSON válido).' : err.message);
    } finally {
      setAbriendo(false);
    }
  }

  async function cargarAprendidos(proveedorId) {
    if (!proveedorId || proveedorId === 'nuevo') return { alias: new Map(), comprados: new Set() };
    const r = await pedirJson(`/api/proveedores/${proveedorId}/alias`).catch(() => ({ ok: false }));
    if (!r.ok) return { alias: new Map(), comprados: new Set() };
    return {
      alias: new Map(r.alias.map((a) => [a.codigo, Number(a.producto_id)])),
      comprados: new Set(r.comprados.map(Number)),
    };
  }

  async function cargarRegla(proveedorId, nombre) {
    if (proveedorId && proveedorId !== 'nuevo') {
      const r = await pedirJson(`/api/proveedores/${proveedorId}/regla-precio`).catch(() => ({ ok: false }));
      if (r.ok && r.regla) return { regla: normalizarRegla(r.regla), origen: 'guardada' };
    }
    return { regla: reglaSugerida(nombre), origen: 'sugerida' };
  }

  function lineaDesdeItem(item, cruce, fotosZip) {
    const p = item.producto;
    const cat = p ? categoriaParecida(p.categoria, categorias) : null;
    const subcat = cat && p?.subcategoria ? subcategoriaParecida(p.subcategoria, cat.id) : null;
    const rutas = (p?.fotos || []).filter((r) => fotosZip[r]);
    return {
      ...item,
      cruce,
      accion: cruce.estado === 'ok' ? 'existente' : cruce.estado === 'nuevo' ? 'nuevo' : null,
      producto_id: cruce.producto_id,
      fotosFaltantes: (p?.fotos || []).filter((r) => !fotosZip[r]),
      manual: !!item.manual,
      nuevo: {
        nombre: p?.nombre || item.descripcion_factura || item.modelo || '',
        categoria_id: cat ? String(cat.id) : '',
        categoriaSugerida: p?.categoria || '',
        subcategoria_id: subcat ? String(subcat.id) : '',
        subcategoriaSugerida: p?.subcategoria || '',
        descripcion: p?.descripcion || '',
        especificaciones: p?.especificaciones || [],
        precio_venta: p?.precio_venta_sugerido ? String(Math.round(p.precio_venta_sugerido)) : '',
        precioEditado: false, // true = Nelson lo escribió (no se recalcula con la regla)
        precioDistEditado: false,
        // Lo mismo que trae el formulario de Productos (oct 2026):
        infoIA: '', // comentarios para que la IA los tenga en cuenta
        enlace: p?.fuente?.url || '', // página del fabricante (IA y fotos)
        textoFabricante: '', // texto pegado de la página (si no se deja leer)
        referencia: '', // vacío = la siguiente automática
        precio_anterior: '', // "precio antes" (oferta en la tienda)
        video_youtube: '',
        activo: true,
        precio_distribuidor: '',
        con_iva: item.iva_porcentaje > 0,
        mostrar_en_tienda: true,
        // Gamer: si el borrador lo dice, ya está decidido; si no, queda la
        // pregunta Sí/No pendiente (con la sugerencia a la vista).
        es_gamer: typeof p?.es_gamer === 'boolean' ? p.es_gamer : null,
        gamerSugerido: esGamerSugerido(item),
        // Precio distribuidor: null = sin decidir | 'calcular' | 'manual' | 'no_aplica'
        modoDist: null,
        fotos: rutas,
        fuente: p?.fuente || { tipo: 'factura', detalle: '', url: '' },
      },
      creado: null, // { id, referencia } cuando ya se creó al aprobar
      fotosListas: false,
      alegraListo: false,
      avisos: [],
    };
  }

  function subcategoriaParecida(nombre, categoriaId) {
    return categoriaParecida(nombre, subcategorias.filter((sc) => String(sc.categoria_id) === String(categoriaId)));
  }

  async function prepararBorrador(b, fotosZip) {
    Object.values(fotos).forEach((f) => URL.revokeObjectURL(f.url));
    const prov = proveedorParecido(b.proveedor, proveedores);
    const provId = prov ? String(prov.id) : 'nuevo';
    const [ap, rg] = await Promise.all([cargarAprendidos(provId), cargarRegla(provId, prov?.nombre || b.proveedor.nombre)]);
    setRegla(rg.regla);
    setReglaOrigen(rg.origen);
    setRecordarRegla(true);
    const principal = bodegas.find((x) => sinTildes(x.nombre).toLowerCase() === 'principal') || bodegas[0];
    progreso.current = { proveedorId: null, facturaId: null, siguienteRef: null };
    setAprendidos(ap);
    setProveedorElegido(provId);
    setFotos(fotosZip);
    setBorrador(b);
    setEncabezado({
      numero: b.factura.numero,
      fecha_creacion: b.factura.fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      fecha_vencimiento: b.factura.fecha_vencimiento || '',
      bodega_id: principal ? String(principal.id) : '',
      retencion_porcentaje: 0,
      retencion_base: '',
      notas: [b.factura.notas, b.prueba ? 'PRUEBA' : '', 'Importada desde borrador (Claude)'].filter(Boolean).join(' · '),
    });
    setLineas(b.items.map((it) => lineaDesdeItem(it, emparejarLinea(it, productos, ap), fotosZip)));
    setPaso(1);
    setActual(null);
  }

  // Si Nelson cambia el proveedor, se vuelve a cruzar con lo aprendido de ese
  // proveedor (sin tocar las líneas que ya decidió a mano).
  async function cambiarProveedor(id) {
    setProveedorElegido(id);
    const nombre = id === 'nuevo' ? borrador?.proveedor?.nombre : proveedores.find((p) => String(p.id) === String(id))?.nombre;
    const [ap, rg] = await Promise.all([cargarAprendidos(id), cargarRegla(id, nombre)]);
    setRegla(rg.regla);
    setReglaOrigen(rg.origen);
    setAprendidos(ap);
    setLineas((ls) =>
      ls.map((l) => {
        if (l.creado || l.decididaAMano) return l;
        const cruce = emparejarLinea(l, productos, ap);
        return { ...l, cruce, accion: cruce.estado === 'ok' ? 'existente' : cruce.estado === 'nuevo' ? 'nuevo' : null, producto_id: cruce.producto_id };
      })
    );
  }

  function cambiarLinea(i, cambios) {
    setErrorAprobar('');
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }
  function cambiarNuevo(i, cambios) {
    setErrorAprobar('');
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, nuevo: { ...l.nuevo, ...cambios } } : l)));
  }

  // Fotos propias de Nelson para un producto nuevo (oct 2026): a veces la
  // del catálogo sale cortada o no sirve. Se suben desde el PC o el celular
  // (galería o cámara). Como portada quedan de primeras; como extra, al final.
  // Se guardan en el POS al aprobar, igual que las del ZIP (achicadas a 1600 px).
  function agregarFotosPropias(i, archivos, comoPortada) {
    const lista = [...(archivos || [])];
    if (!lista.length) return;
    const nuevas = {};
    const claves = [];
    const rechazadas = [];
    lista.forEach((f, k) => {
      const esHeic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
      if (esHeic || (f.type && !f.type.startsWith('image/'))) {
        rechazadas.push(f.name);
        return;
      }
      const clave = `propia/${Date.now()}-${k}-${f.name}`;
      nuevas[clave] = { blob: f, url: URL.createObjectURL(f), propia: true };
      claves.push(clave);
    });
    if (claves.length) setFotos((actual) => ({ ...actual, ...nuevas }));
    setLineas((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const fotosLinea = comoPortada ? [...claves, ...l.nuevo.fotos] : [...l.nuevo.fotos, ...claves];
        return {
          ...l,
          avisoFoto: rechazadas.length
            ? `No se pudo usar: ${rechazadas.join(', ')} (formato HEIC u otro). Toma la foto con la cámara desde aquí o pásala a JPG.`
            : '',
          nuevo: { ...l.nuevo, fotos: fotosLinea.slice(0, 10) },
        };
      })
    );
  }

  // Quitar el fondo de una foto de un producto nuevo (mismo sistema de la
  // pantalla de Productos: remove.bg si está la clave, si no la IA del
  // navegador). La foto queda en fondo blanco y reemplaza a la original en
  // el mismo lugar; "Deshacer" la devuelve.
  async function quitarFondoDeFoto(i, ruta) {
    const f = fotos[ruta];
    if (!f) return;
    cambiarLinea(i, { fondoEnCurso: ruta, mensajeFondo: 'Quitando el fondo…' });
    try {
      const r = await quitarFondoFoto(await blobADataUri(f.blob), {
        onProgreso: (m) => cambiarLinea(i, { mensajeFondo: m }),
      });
      const blob = await (await fetch(r.imagen)).blob();
      const clave = `sinfondo/${Date.now()}-${ruta.split('/').pop()}`;
      setFotos((actual) => ({ ...actual, [clave]: { blob, url: URL.createObjectURL(blob), propia: f.propia, sinFondo: true, antes: ruta } }));
      setLineas((ls) =>
        ls.map((l, j) =>
          j === i
            ? {
                ...l,
                fondoEnCurso: null,
                mensajeFondo: r.metodo === 'removebg' ? 'Listo: fondo quitado.' : 'Listo: fondo quitado con la IA del navegador. Si no quedó bien, dale Deshacer.',
                nuevo: { ...l.nuevo, fotos: l.nuevo.fotos.map((x) => (x === ruta ? clave : x)) },
              }
            : l
        )
      );
    } catch (e) {
      cambiarLinea(i, { fondoEnCurso: null, mensajeFondo: `No se pudo quitar el fondo: ${e?.message || 'error'}` });
    }
  }

  // Llama a la IA del POS (la misma de Productos). Si la descripción se pasa
  // de 600 letras, se le pide UNA vez más que la acorte; lo que llegue se
  // ajusta sin cortar a mitad de palabra (lib/descripcionProducto.js).
  async function pedirIA(cuerpo) {
    const llamar = (c) =>
      pedirJson('/api/productos/analizar-foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    let r = await llamar(cuerpo);
    const largo = String(r.descripcion || '').trim().length;
    if (r.ok && largo > DESCRIPCION_MAXIMA) {
      const r2 = await llamar({
        ...cuerpo,
        infoAdicional: `${cuerpo.infoAdicional || ''}\nOJO: tu descripción anterior tuvo ${largo} caracteres. Escríbela de nuevo con máximo ${DESCRIPCION_MAXIMA} (y mínimo ${DESCRIPCION_MINIMA}).`,
      }).catch(() => null);
      if (r2?.ok && r2.descripcion) r = r2;
    }
    if (r.ok && r.descripcion) r.descripcion = ajustarDescripcion(r.descripcion);
    return r;
  }

  // Recorta el espacio en blanco alrededor de una foto (como la casilla de
  // Productos). Se puede deshacer igual que "sin fondo".
  async function recortarFoto(i, ruta) {
    const f = fotos[ruta];
    if (!f) return;
    try {
      const dataUri = await recortarEspaciosBlancos(await blobADataUri(f.blob));
      const blob = await (await fetch(dataUri)).blob();
      const clave = `recorte/${Date.now()}-${ruta.split('/').pop()}`;
      setFotos((actual) => ({ ...actual, [clave]: { blob, url: URL.createObjectURL(blob), propia: f.propia, sinFondo: f.sinFondo, recortada: true, antes: ruta } }));
      setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, nuevo: { ...l.nuevo, fotos: l.nuevo.fotos.map((x) => (x === ruta ? clave : x)) } } : l)));
    } catch (e) {
      cambiarLinea(i, { mensajeFondo: `No se pudo recortar: ${e?.message || 'error'}` });
    }
  }

  // IA para un producto nuevo del borrador, igual que "🪄 Analizar con IA"
  // de Productos: usa el enlace del fabricante (o el texto pegado), la foto
  // de portada, lo que ya se sabe y los COMENTARIOS que escriba Nelson.
  // Reemplaza nombre, descripción, ficha, categoría y subcategoría (se puede
  // deshacer).
  async function analizarLineaConIA(i) {
    const l = lineas[i];
    cambiarLinea(i, { analizandoIA: true, mensajeIA: '' });
    try {
      // Foto para la IA: la que Nelson subió para eso (ej. la caja con las
      // especificaciones) o, si no, la portada.
      const portada =
        l.fotoIA ||
        (l.nuevo.fotos[0] && fotos[l.nuevo.fotos[0]]?.blob ? await redimensionarParaIA(await blobADataUri(fotos[l.nuevo.fotos[0]].blob)) : null);
      const ficha = l.nuevo.especificaciones.filter((f) => f.nombre && f.valor).map((f) => `${f.nombre}: ${f.valor}`).join('\n');
      const conocido = [
        `Producto: ${l.nuevo.nombre}`,
        l.marca ? `Marca: ${l.marca}` : '',
        l.modelo ? `Modelo: ${l.modelo}` : '',
        l.descripcion_factura ? `Como sale en la factura del proveedor: ${l.descripcion_factura}` : '',
        ficha ? `Ficha técnica que ya tenemos:\n${ficha}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const enlace = l.nuevo.enlace.trim();
      const texto = l.nuevo.textoFabricante.trim();
      // La descripción vieja NO se manda como base (la IA la estiraba y
      // perdía el formato de "✓"): se escribe desde los datos.
      const r = await pedirIA({
        imagenBase64: portada || undefined,
        enlaceFabricante: enlace || undefined,
        // Sin enlace ni texto pegado, la IA trabaja con lo que ya se sabe.
        textoFabricante: texto || (!enlace ? conocido : undefined),
        infoAdicional: [
          l.nuevo.infoIA.trim() ? `Comentarios de Nelson (tenlos muy en cuenta): ${l.nuevo.infoIA.trim()}` : '',
          enlace || texto ? conocido : '',
          REGLAS_DESCRIPCION_IA,
        ]
          .filter(Boolean)
          .join('\n'),
      });
      if (!r.ok) {
        cambiarLinea(i, {
          analizandoIA: false,
          mensajeIA: r.codigo === 'pagina_no_legible' ? 'La página no se dejó leer: copia su texto y pégalo en "Texto de la página".' : `No se pudo analizar: ${r.error || 'error'}`,
          verTextoFabricante: r.codigo === 'pagina_no_legible' ? true : l.verTextoFabricante,
        });
        return;
      }
      const cat = categoriaParecida(r.categoria, categorias);
      const sub = cat && r.subcategoria ? subcategoriaParecida(r.subcategoria, cat.id) : null;
      setLineas((ls) =>
        ls.map((x, j) => {
          if (j !== i) return x;
          const desc = r.descripcion || '';
          return {
            ...x,
            analizandoIA: false,
            nuevoAntesIA: x.nuevo,
            mensajeIA: `Listo (${r.iaUsada || 'IA'}). Revisa lo que cambió${desc.length < DESCRIPCION_MINIMA ? `; la descripción quedó de ${desc.length} letras, amplíala` : ''}.`,
            nuevo: {
              ...x.nuevo,
              nombre: r.nombre ? String(r.nombre).slice(0, 150) : x.nuevo.nombre,
              descripcion: desc || x.nuevo.descripcion,
              especificaciones: Array.isArray(r.especificaciones) && r.especificaciones.length ? r.especificaciones : x.nuevo.especificaciones,
              categoria_id: cat ? String(cat.id) : x.nuevo.categoria_id,
              subcategoria_id: cat ? (sub ? String(sub.id) : '') : x.nuevo.subcategoria_id,
              categoriaSugerida: r.categoria || x.nuevo.categoriaSugerida,
              subcategoriaSugerida: r.subcategoria || x.nuevo.subcategoriaSugerida,
            },
          };
        })
      );
      // Con enlace, de una vez se buscan las fotos de la página.
      if (enlace && !l.fotosPagina) traerFotosPagina(i);
    } catch (e) {
      cambiarLinea(i, { analizandoIA: false, mensajeIA: `No se pudo analizar: ${e.message}` });
    }
  }

  function deshacerIA(i) {
    setLineas((ls) => ls.map((l, j) => (j === i && l.nuevoAntesIA ? { ...l, nuevo: { ...l.nuevoAntesIA, fotos: l.nuevo.fotos }, nuevoAntesIA: null, mensajeIA: 'Se deshizo lo de la IA.' } : l)));
  }

  // Fotos de la página del fabricante (las mismas que busca Productos).
  async function traerFotosPagina(i) {
    const enlace = lineas[i]?.nuevo.enlace.trim();
    if (!enlace) return;
    cambiarLinea(i, { buscandoFotosPagina: true, mensajeFotosPagina: 'Buscando fotos en la página…' });
    const r = await pedirJson(`/api/productos/fotos-pagina?url=${encodeURIComponent(enlace)}`).catch(() => ({ ok: false }));
    cambiarLinea(i, {
      buscandoFotosPagina: false,
      fotosPagina: r.ok ? r.fotos || [] : [],
      mensajeFotosPagina: r.ok ? (r.fotos?.length ? '' : 'No se encontraron fotos del producto en esa página.') : `No se pudieron leer las fotos: ${r.error || 'error'}`,
    });
  }

  async function agregarFotoPagina(i, foto, comoPortada) {
    const enlace = lineas[i]?.nuevo.enlace.trim();
    try {
      const res = await fetch(`/api/productos/foto-remota?url=${encodeURIComponent(foto.url)}&ref=${encodeURIComponent(enlace)}`);
      if (!res.ok) throw new Error('no se pudo traer');
      const dataUri = await recortarEspaciosBlancos(await blobADataUri(await res.blob()));
      const blob = await (await fetch(dataUri)).blob();
      const clave = `pagina/${Date.now()}-${foto.url.split('/').pop().split('?')[0].slice(-40)}`;
      setFotos((actual) => ({ ...actual, [clave]: { blob, url: URL.createObjectURL(blob), deLaPagina: true } }));
      setLineas((ls) =>
        ls.map((l, j) =>
          j === i
            ? { ...l, nuevo: { ...l.nuevo, fotos: (comoPortada ? [clave, ...l.nuevo.fotos] : [...l.nuevo.fotos, clave]).slice(0, 10) } }
            : l
        )
      );
    } catch (e) {
      cambiarLinea(i, { mensajeFotosPagina: `No se pudo usar esa foto: ${e.message}` });
    }
  }

  function deshacerFondo(i, clave) {
    const antes = fotos[clave]?.antes;
    if (!antes) return;
    setLineas((ls) =>
      ls.map((l, j) => (j === i ? { ...l, mensajeFondo: '', nuevo: { ...l.nuevo, fotos: l.nuevo.fotos.map((x) => (x === clave ? antes : x)) } } : l))
    );
  }

  // Descripción de al menos 400 letras: la IA del POS (la misma de
  // Productos) la reescribe con lo que ya se sabe del producto.
  async function ampliarDescripcion(i) {
    const l = lineas[i];
    cambiarLinea(i, { ampliando: true, mensajeDescripcion: '' });
    const ficha = l.nuevo.especificaciones.map((f) => `${f.nombre}: ${f.valor}`).join('\n');
    const texto = [
      `Producto: ${l.nuevo.nombre}`,
      l.marca ? `Marca: ${l.marca}` : '',
      l.modelo ? `Modelo: ${l.modelo}` : '',
      l.descripcion_factura ? `Como sale en la factura del proveedor: ${l.descripcion_factura}` : '',
      ficha ? `Ficha técnica:\n${ficha}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const r = await pedirIA({
        textoFabricante: texto,
        infoAdicional: [l.nuevo.infoIA.trim() ? `Comentarios de Nelson (tenlos muy en cuenta): ${l.nuevo.infoIA.trim()}` : '', REGLAS_DESCRIPCION_IA]
          .filter(Boolean)
          .join('\n'),
      });
      if (!r.ok || !r.descripcion) throw new Error(r.error || 'la IA no devolvió descripción');
      const nueva = r.descripcion;
      setLineas((ls) =>
        ls.map((x, j) =>
          j === i
            ? {
                ...x,
                ampliando: false,
                mensajeDescripcion:
                  nueva.length < DESCRIPCION_MINIMA ? `La IA dejó ${nueva.length} letras: complétala a mano o dale otra vez.` : `Listo (${nueva.length} letras). Revísala.`,
                nuevo: { ...x.nuevo, descripcion: nueva },
              }
            : x
        )
      );
    } catch (e) {
      cambiarLinea(i, { ampliando: false, mensajeDescripcion: `No se pudo ampliar: ${e.message}` });
    }
  }

  // Abre el formulario completo de Productos con los datos de la línea
  // (nombre, descripción, categoría, ficha, costo, precios, Zona Gamer,
  // fotos…). Al guardarlo, el producto queda creado (con fotos y en Alegra)
  // y la línea pasa a ✅ con ese producto.
  async function abrirFormularioCompleto(i) {
    const l = lineas[i];
    setPreparandoFormulario(i);
    try {
      const fotosData = [];
      for (const r of l.nuevo.fotos) {
        if (fotos[r]?.blob) fotosData.push(await blobADataUri(fotos[r].blob));
      }
      const pv = precioVentaDe(l);
      const pd = precioDistDe(l);
      setFormularioLinea({
        i,
        prefill: {
          nombre: l.nuevo.nombre,
          descripcion: l.nuevo.descripcion,
          categoria_id: l.nuevo.categoria_id,
          subcategoria_id: l.nuevo.subcategoria_id,
          especificaciones: l.nuevo.especificaciones,
          precio_costo: Math.round(costoNetoParaPos(l, regla) * 100) / 100,
          precio_venta: Number(pv) > 0 ? Number(pv) : '',
          precio_distribuidor: Number(pd) > 0 ? Number(pd) : '',
          es_gamer: !!(gamerDe(l) ?? l.nuevo.gamerSugerido),
          mostrar_en_tienda: l.nuevo.mostrar_en_tienda,
          con_iva: l.nuevo.con_iva,
          enlace: l.nuevo.enlace || l.nuevo.fuente?.url || '',
          texto_fabricante: l.nuevo.textoFabricante,
          referencia: l.nuevo.referencia,
          precio_anterior: l.nuevo.precio_anterior,
          video_youtube: l.nuevo.video_youtube,
          activo: l.nuevo.activo,
          info: [l.nuevo.infoIA, l.marca ? `Marca: ${l.marca}` : '', l.modelo ? `Modelo: ${l.modelo}` : '', l.descripcion_factura ? `En la factura: ${l.descripcion_factura}` : '']
            .filter(Boolean)
            .join('. '),
          fotos: fotosData,
        },
      });
    } finally {
      setPreparandoFormulario(null);
    }
  }

  function productoCreadoConFormulario(i, p, aviso) {
    setFormularioLinea(null);
    setProductos((ps) => [{ ...p, stock: 0, es_inventariable: p.es_inventariable !== false, activo: p.activo !== false }, ...ps.filter((x) => Number(x.id) !== Number(p.id))]);
    setErrorAprobar('');
    setLineas((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              accion: 'existente',
              producto_id: Number(p.id),
              decididaAMano: true,
              creadoConFormulario: { id: Number(p.id), referencia: p.referencia },
              avisos: aviso ? [...(l.avisos || []), aviso] : l.avisos,
              cruce: { ...l.cruce, motivo: `Creado ahora con el formulario completo (${p.referencia})` },
            }
          : l
      )
    );
  }

  // ─── Cálculos y validaciones ────────────────────────────────────────
  const activas = lineas.filter((l) => l.accion !== 'omitir');
  const conteo = {
    ok: lineas.filter((l) => l.accion === 'existente').length,
    revisar: lineas.filter((l) => !l.accion).length,
    nuevo: lineas.filter((l) => l.accion === 'nuevo').length,
    omitir: lineas.filter((l) => l.accion === 'omitir').length,
  };
  const costoLinea = (l) => costoParaPos(l, regla);
  const subtotalLinea = (l) => costoNetoParaPos(l, regla) * (Number(l.cantidad) || 0);
  // Precio de venta de un producto nuevo: el que escribió Nelson o, si no
  // escribió nada, el automático de la regla del proveedor (ej. costo × 2).
  const precioAutoDe = (l) => precioVentaAutomatico(l, regla);
  const precioVentaDe = (l) => (l.nuevo.precioEditado ? l.nuevo.precio_venta : precioAutoDe(l) ?? l.nuevo.precio_venta);
  // Precio distribuidor según lo que decidió Nelson para ese producto:
  // calcular (costo + % de la regla), a mano o no aplica. Si el campo no es
  // obligatorio y no decidió, se usa la regla del proveedor.
  const obligatorio = (c) => obligatorios.includes(c);
  const precioDistAutoDe = (l) => precioDistribuidorAutomatico({ ...l }, { ...regla, distribuidor: regla.distribuidor ?? 40 });
  const modoDistDe = (l) => l.nuevo.modoDist ?? (obligatorio('distribuidor') ? null : regla.distribuidor !== null ? 'calcular' : 'no_aplica');
  const precioDistDe = (l) => {
    const m = modoDistDe(l);
    if (m === 'calcular') return precioDistAutoDe(l) ?? '';
    if (m === 'manual') return l.nuevo.precio_distribuidor;
    return '';
  };
  const gamerDe = (l) => l.nuevo.es_gamer ?? (obligatorio('gamer') ? null : l.nuevo.gamerSugerido);

  // Lo que le falta a un producto nuevo: obligatorios (rojo, no deja
  // aprobar) y recomendados (amarillo).
  function faltantesDe(l) {
    const ob = [];
    const rec = [];
    const n = l.nuevo;
    if (!n.nombre.trim()) ob.push('Nombre');
    if (obligatorio('categoria') && !n.categoria_id) ob.push('Categoría');
    const subs = subcategorias.filter((x) => String(x.categoria_id) === String(n.categoria_id));
    if (obligatorio('subcategoria') && n.categoria_id && subs.length && !n.subcategoria_id) ob.push('Subcategoría');
    if (obligatorio('subcategoria') && !n.categoria_id && obligatorio('categoria') === false) ob.push('Subcategoría');
    if (!(Number(precioVentaDe(l)) > 0)) ob.push('Precio de venta');
    const md = modoDistDe(l);
    if (obligatorio('distribuidor') && (md === null || (md === 'manual' && !(Number(n.precio_distribuidor) > 0)))) ob.push('Distribuidor');
    if (obligatorio('gamer') && gamerDe(l) === null) ob.push('Gamer');
    if (obligatorio('foto') && n.fotos.length === 0) ob.push('Foto');
    if (obligatorio('descripcion') && n.descripcion.trim().length < DESCRIPCION_MINIMA) ob.push('Descripción');
    const filas = n.especificaciones.filter((f) => String(f.nombre || '').trim() && String(f.valor || '').trim());
    if (obligatorio('ficha') && filas.length < 3) ob.push('Ficha técnica');
    const nombreCat = categorias.find((c) => String(c.id) === String(n.categoria_id))?.nombre;
    const nombreSub = subcategorias.find((x) => String(x.id) === String(n.subcategoria_id))?.nombre;
    const plantilla = tipoDeProducto({ nombre: n.nombre, categoria: nombreCat, subcategoria: nombreSub });
    camposFaltantes(plantilla, filas)
      .filter((c) => c.clave)
      .forEach((c) => rec.push(`Ficha: ${c.nombre}`));
    if (n.fotos.length === 1) rec.push('Solo 1 foto');
    return { obligatorios: ob, recomendados: rec };
  }
  const semaforoDe = (l) => {
    if (l.creado || l.creadoConFormulario) return 'verde';
    const f = faltantesDe(l);
    return f.obligatorios.length ? 'rojo' : f.recomendados.length ? 'amarillo' : 'verde';
  };
  const subtotal = activas.reduce((a, l) => a + subtotalLinea(l), 0);
  const retencionValor = (Number(encabezado?.retencion_base) || 0) * ((Number(encabezado?.retencion_porcentaje) || 0) / 100);

  const comparaFactura = useMemo(() => {
    if (!borrador) return null;
    const ref = regla.iva === 'sumar' ? borrador.factura.total || borrador.factura.subtotal * 1.19 : borrador.factura.subtotal;
    if (!(ref > 0) || conteo.omitir) return null;
    const dif = subtotal - ref;
    return Math.abs(dif) > Math.max(100, ref * 0.005) ? { ref, dif } : null;
  }, [borrador, regla, subtotal, conteo.omitir]);

  const proveedorIdNum = proveedorElegido && proveedorElegido !== 'nuevo' ? Number(proveedorElegido) : progreso.current.proveedorId;
  const duplicada = useMemo(() => {
    const n = sinTildes(encabezado?.numero || '').replace(/\W/g, '').toLowerCase();
    if (!n || !proveedorIdNum) return null;
    return facturas.find((f) => Number(f.proveedor_id) === Number(proveedorIdNum) && sinTildes(f.numero || '').replace(/\W/g, '').toLowerCase() === n) || null;
  }, [facturas, encabezado?.numero, proveedorIdNum]);

  function problemas() {
    const lista = [];
    if (!proveedorElegido) lista.push('Elige el proveedor.');
    if (proveedorElegido === 'nuevo' && !borrador?.proveedor?.nombre?.trim()) lista.push('Escribe el nombre del proveedor nuevo.');
    if (!encabezado?.bodega_id) lista.push('Elige la bodega que recibe la mercancía.');
    if (!encabezado?.fecha_creacion) lista.push('Falta la fecha de la factura.');
    if (Number(encabezado?.retencion_porcentaje) > 0 && !(Number(encabezado?.retencion_base) > 0)) lista.push('Escribe la base de la retención.');
    if (!activas.length) lista.push('No quedó ninguna línea para guardar.');
    lineas.forEach((l, i) => {
      const n = `Línea ${i + 1}`;
      if (l.accion === 'omitir') return;
      if (!l.accion) lista.push(`${n}: elige el producto o márcalo como nuevo.`);
      if (!(Number(l.cantidad) > 0)) lista.push(`${n}: la cantidad no es válida.`);
      if (!(costoLinea(l) > 0)) lista.push(`${n}: falta el costo.`);
      if (l.accion === 'existente' && !productosPorId.has(Number(l.producto_id))) lista.push(`${n}: el producto elegido ya no existe.`);
      if (l.accion === 'nuevo' && !l.creado) {
        const f = faltantesDe(l);
        if (f.obligatorios.length) lista.push(`${n}: falta ${f.obligatorios.join(', ')}.`);
        if (l.nuevo.descripcion.length > 600) lista.push(`${n}: la descripción pasa de 600 letras.`);
        if (Number(l.nuevo.precio_anterior) > 0 && Number(l.nuevo.precio_anterior) <= Number(precioVentaDe(l)))
          lista.push(`${n}: el "precio antes" debe ser mayor que el precio de venta (o déjalo vacío).`);
        if (l.nuevo.video_youtube.trim() && !/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(l.nuevo.video_youtube.trim()))
          lista.push(`${n}: el video debe ser un enlace de YouTube.`);
      }
    });
    return lista;
  }

  // ─── Aprobar ────────────────────────────────────────────────────────
  function anotar(texto, tipo = 'ok') {
    setPasos((p) => [...p, { texto, tipo }]);
  }

  async function siguienteReferencia() {
    if (progreso.current.siguienteRef == null) {
      const r = await pedirJson('/api/productos/siguiente-referencia');
      if (!r.ok) throw new Error(r.error || 'No se pudo calcular la referencia');
      progreso.current.siguienteRef = Number(r.siguiente);
    }
    return String(progreso.current.siguienteRef++);
  }

  async function aprobar() {
    const lista = problemas();
    if (lista.length) {
      setErrorAprobar(lista.join(' '));
      return;
    }
    if (duplicada && !window.confirm(`Ya hay una factura ${duplicada.numero} de este proveedor en el POS. ¿Guardarla otra vez?`)) return;

    setAprobando(true);
    setErrorAprobar('');
    // Copia de trabajo: se va anotando lo creado para poder reintentar (los
    // avisos de un intento anterior se conservan).
    const ls = lineas.map((l) => ({ ...l, avisos: [...(l.avisos || [])] }));
    const guardarLs = () => setLineas(ls.map((l) => ({ ...l })));
    try {
      // 1) Proveedor
      let proveedorId = proveedorElegido !== 'nuevo' ? Number(proveedorElegido) : progreso.current.proveedorId;
      if (!proveedorId) {
        const r = await pedirJson('/api/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...borrador.proveedor, nombre: borrador.proveedor.nombre.trim() }),
        });
        if (!r.ok) throw new Error(`No se pudo crear el proveedor: ${r.error}`);
        proveedorId = Number(r.proveedor.id);
        progreso.current.proveedorId = proveedorId;
        setProveedores((ps) => [...ps, r.proveedor]);
        anotar(`Proveedor creado: ${r.proveedor.nombre}`);
      }

      // Regla de precios de este proveedor (para la próxima factura).
      if (recordarRegla && !progreso.current.reglaGuardada) {
        const r = await pedirJson(`/api/proveedores/${proveedorId}/regla-precio`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regla),
        }).catch(() => ({ ok: false }));
        progreso.current.reglaGuardada = true;
        if (!r.ok) anotar('No se pudo guardar la regla de precios del proveedor (no afecta la factura).', 'aviso');
      }

      // 2) Productos nuevos (con fotos y en Alegra)
      for (const l of ls) {
        if (l.accion !== 'nuevo') continue;
        if (!l.creado) {
          let creado = null;
          for (let intento = 0; intento < 4 && !creado; intento++) {
            const referencia = l.nuevo.referencia.trim() && intento === 0 ? l.nuevo.referencia.trim() : await siguienteReferencia();
            const r = await pedirJson('/api/productos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                referencia,
                nombre: l.nuevo.nombre.trim(),
                descripcion: l.nuevo.descripcion.trim() || null,
                categoria_id: l.nuevo.categoria_id ? Number(l.nuevo.categoria_id) : null,
                subcategoria_id: l.nuevo.subcategoria_id ? Number(l.nuevo.subcategoria_id) : null,
                precio_venta: Number(precioVentaDe(l)),
                precio_costo: Math.round(costoNetoParaPos(l, regla) * 100) / 100,
                precio_distribuidor: Number(precioDistDe(l)) || null,
                activo: l.nuevo.activo !== false,
                es_inventariable: true,
                mostrar_en_tienda: l.nuevo.mostrar_en_tienda,
                video_youtube: l.nuevo.video_youtube.trim() || null,
                ...(Number(l.nuevo.precio_anterior) > 0 ? { precio_anterior: Number(l.nuevo.precio_anterior) } : {}),
                es_gamer: Boolean(gamerDe(l)),
                especificaciones: l.nuevo.especificaciones,
              }),
            });
            if (r.ok) creado = { id: Number(r.producto.id), referencia };
            else if (r.status === 409 && l.nuevo.referencia.trim()) throw new Error(`La referencia ${l.nuevo.referencia.trim()} ya existe (línea ${l.linea}): cámbiala o déjala vacía`);
            else if (r.status === 409) progreso.current.siguienteRef = null; // otra persona usó esa referencia
            else throw new Error(`No se pudo crear "${l.nuevo.nombre}": ${r.error}`);
          }
          if (!creado) throw new Error(`No se encontró una referencia libre para "${l.nuevo.nombre}"`);
          l.creado = creado;
          l.producto_id = creado.id;
          guardarLs();
          anotar(`Producto creado: ${creado.referencia} · ${l.nuevo.nombre}`);
        }
        if (!l.fotosListas) {
          let fallidas = 0;
          for (let k = 0; k < l.nuevo.fotos.length; k++) {
            const f = fotos[l.nuevo.fotos[k]];
            if (!f) continue;
            try {
              const dataUri = await achicarFoto(await blobADataUri(f.blob));
              const archivo = await dataUriAFile(dataUri, `${l.creado.referencia}-${k + 1}.jpg`);
              const cuerpo = new FormData();
              cuerpo.append('imagen', archivo);
              const r = await pedirJson(`/api/productos/${l.creado.id}/imagenes`, { method: 'POST', body: cuerpo });
              if (!r.ok) fallidas++;
            } catch {
              fallidas++;
            }
          }
          l.fotosListas = true;
          if (fallidas) l.avisos.push(`${fallidas} foto(s) no se pudieron subir: agrégalas en Productos.`);
          guardarLs();
        }
        if (!l.alegraListo) {
          const r = await pedirJson(`/api/productos/${l.creado.id}/alegra`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conIva: l.nuevo.con_iva }),
          }).catch(() => ({ ok: false, error: 'error de conexión' }));
          l.alegraListo = true; // no se reintenta solo: si falló, se avisa
          if (!r.ok) l.avisos.push(`No se creó en Alegra (${r.error}). Créalo a mano con la referencia ${l.creado.referencia}.`);
          guardarLs();
        }
      }

      // 3) Factura de compra (suma el inventario y recalcula el costo promedio)
      if (!progreso.current.facturaId) {
        const r = await pedirJson('/api/facturas-compra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numero: encabezado.numero,
            proveedor_id: proveedorId,
            bodega_id: Number(encabezado.bodega_id),
            fecha_creacion: encabezado.fecha_creacion,
            fecha_vencimiento: encabezado.fecha_vencimiento || null,
            retencion_porcentaje: Number(encabezado.retencion_porcentaje),
            retencion_base: Number(encabezado.retencion_base) || 0,
            notas: encabezado.notas,
            items: ls
              .filter((l) => l.accion !== 'omitir')
              .map((l) => ({
                producto_id: Number(l.producto_id),
                cantidad: Number(l.cantidad),
                precio: costoLinea(l),
                descuento_porcentaje: Number(l.descuento_porcentaje) || 0,
              })),
          }),
        });
        if (!r.ok) throw new Error(`No se pudo guardar la factura: ${r.error}`);
        progreso.current.facturaId = r.facturaId;
        anotar(`Factura de compra guardada (${moneda(r.total)}) y mercancía sumada al inventario.`);
      }

      // 4) Códigos aprendidos de este proveedor
      const pares = ls
        .filter((l) => l.accion !== 'omitir' && l.producto_id && !l.manual)
        .map((l) => ({ codigo: codigoParaAprender(l), producto_id: Number(l.producto_id) }))
        .filter((p) => p.codigo);
      if (pares.length) {
        const r = await pedirJson(`/api/proveedores/${proveedorId}/alias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pares }),
        }).catch(() => ({ ok: false }));
        if (r.ok) anotar(`Aprendidos ${pares.length} códigos de este proveedor para la próxima factura.`);
        else anotar('No se pudieron guardar los códigos aprendidos (no afecta la factura).', 'aviso');
      }

      // 5) Stickers
      const lineasEtiquetas = etiquetasDe(ls);
      let avisoStickers = '';
      try {
        const r = await descargarExcelEtiquetas(lineasEtiquetas, nombreExcel());
        avisoStickers = r.sinPrecio.length ? `Sin precio de venta (salen en $0): ${r.sinPrecio.join(', ')}.` : '';
        anotar(`Excel de stickers descargado (${r.filas} etiquetas).`);
      } catch {
        avisoStickers = 'No se pudo crear el Excel de stickers: descárgalo con el botón 🏷️ de la factura.';
      }

      setResultado({
        facturaId: progreso.current.facturaId,
        avisos: [...ls.flatMap((l) => l.avisos.map((a) => `Línea ${l.linea}: ${a}`)), ...(avisoStickers ? [avisoStickers] : [])],
        etiquetas: lineasEtiquetas,
      });
      guardarLs();
    } catch (err) {
      setErrorAprobar(`${err.message}. Lo que ya se hizo quedó guardado; dale "Aprobar" otra vez para seguir desde ahí.`);
      guardarLs();
    } finally {
      setAprobando(false);
    }
  }

  function etiquetasDe(ls) {
    return ls
      .filter((l) => l.accion !== 'omitir')
      .map((l) => {
        if (l.creado) return { referencia: l.creado.referencia, nombre: l.nuevo.nombre, cantidad: l.cantidad, precio_venta: precioVentaDe(l) };
        const p = productosPorId.get(Number(l.producto_id));
        return { referencia: p?.referencia, nombre: p?.nombre, cantidad: l.cantidad, precio_venta: p?.precio_venta };
      });
  }
  function nombreExcel() {
    const n = encabezado?.numero ? String(encabezado.numero).replace(/[^\w-]+/g, '_') : progreso.current.facturaId;
    return `etiquetas_openlabel_compra_${n}.xlsx`;
  }

  // ─── Estado de cada paso del asistente ──────────────────────────────
  const nuevas = lineas.map((l, i) => ({ l, i })).filter(({ l }) => l.accion === 'nuevo');
  const pendientesPaso = {
    1: [
      !proveedorElegido ? 'Proveedor' : '',
      proveedorElegido === 'nuevo' && !borrador?.proveedor?.nombre?.trim() ? 'Nombre del proveedor' : '',
      !encabezado?.bodega_id ? 'Bodega' : '',
      !encabezado?.fecha_creacion ? 'Fecha' : '',
      Number(encabezado?.retencion_porcentaje) > 0 && !(Number(encabezado?.retencion_base) > 0) ? 'Base de la retención' : '',
    ].filter(Boolean),
    2: [
      ...(activas.length ? [] : ['Al menos un producto']),
      ...lineas.filter((l) => !l.accion).map((l) => `Línea ${l.linea}: elegir`),
      ...activas.filter((l) => !(Number(l.cantidad) > 0) || !(costoLinea(l) > 0)).map((l) => `Línea ${l.linea}: cantidad o costo`),
    ],
    3: nuevas.filter(({ l }) => !l.creado && semaforoDe(l) === 'rojo').map(({ l }) => l.nuevo.nombre || `Línea ${l.linea}`),
    4: nuevas
      .filter(({ l }) => !l.creado && (!(Number(precioVentaDe(l)) > 0) || (obligatorio('distribuidor') && faltantesDe(l).obligatorios.includes('Distribuidor'))))
      .map(({ l }) => l.nuevo.nombre || `Línea ${l.linea}`),
  };
  const PASOS = [
    { n: 1, t: 'Factura' },
    { n: 2, t: borrador?.manual ? 'Productos' : 'Emparejar' },
    { n: 3, t: 'Productos nuevos' },
    { n: 4, t: 'Precios' },
    { n: 5, t: 'Revisar y aprobar' },
  ];

  function irAPaso(n) {
    setErrorAprobar('');
    setPaso(n);
    if (n === 3 && (actual === null || lineas[actual]?.accion !== 'nuevo')) setActual(nuevas[0]?.i ?? null);
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // nada
    }
  }
  function siguientePendiente() {
    const orden = nuevas.map(({ i }) => i);
    const desde = orden.indexOf(actual !== null && lineas[actual]?.accion === 'nuevo' ? actual : orden[0]);
    const rotado = [...orden.slice(desde + 1), ...orden.slice(0, desde + 1)];
    const sig = rotado.find((i) => !lineas[i].creado && semaforoDe(lineas[i]) !== 'verde');
    if (sig !== undefined) setActual(sig);
    else irAPaso(4);
  }

  // ─── Pantalla final ─────────────────────────────────────────────────
  if (resultado) {
    return (
      <Shell title="Factura de compra">
        <EstiloPoder />
        <div className="gs">
          <div className="gs-card" style={{ maxWidth: '760px', margin: '0 auto' }}>
            <div className="gs-eyebrow">Listo</div>
            <h2 className="gs-h2">Factura de compra guardada</h2>
            <ul className="gs-lista">
              {pasos.map((p, i) => (
                <li key={i} className={p.tipo === 'aviso' ? 'gs-txt-amarillo' : ''}>{p.texto}</li>
              ))}
            </ul>
            {resultado.avisos.length ? (
              <div className="gs-aviso">
                <strong>Pendiente por revisar:</strong>
                <ul className="gs-lista">
                  {resultado.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="gs-fila" style={{ marginTop: '16px' }}>
              <a href="/gastos/facturas-compra" className="gs-btn gs-btn-pri">Ver facturas de compra</a>
              <a href={`/gastos/facturas-compra/${resultado.facturaId}/imprimir`} target="_blank" rel="noopener noreferrer" className="gs-btn">🖨️ Imprimir</a>
              <button type="button" className="gs-btn" onClick={() => descargarExcelEtiquetas(resultado.etiquetas, nombreExcel())}>🏷️ Stickers otra vez</button>
              <button
                type="button"
                className="gs-btn"
                onClick={() => {
                  setResultado(null);
                  setBorrador(null);
                  setLineas([]);
                  setPasos([]);
                }}
              >
                Otra factura
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Producto abierto en el paso 3 (si el elegido ya no es nuevo —ej. se creó
  // con el formulario completo—, se abre el primero que quede).
  const actualEf = actual !== null && lineas[actual]?.accion === 'nuevo' ? actual : nuevas[0]?.i ?? null;
  const lineaActual = actualEf !== null ? lineas[actualEf] : null;

  return (
    <Shell title="Factura de compra">
      <EstiloPoder />
      <div className="gs">
        <div className="gs-cabecera">
          <div>
            <div className="gs-eyebrow">{borrador ? (borrador.manual ? 'Factura manual' : 'Borrador de Claude') : 'Asistente'}</div>
            <h2 className="gs-h1">Factura de compra</h2>
          </div>
          <div className="gs-fila">
            <button type="button" className="gs-btn" onClick={() => setVerConfig(true)}>⚙️ Campos obligatorios</button>
            <a href="/gastos/facturas-compra" className="gs-btn">← Facturas de compra</a>
          </div>
        </div>

        {/* Inicio: subir borrador o factura manual */}
        {!borrador ? (
          <div className="gs-inicio">
            <input ref={inputArchivo} type="file" accept=".zip,.json,application/zip,application/json" onChange={abrirArchivo} style={{ display: 'none' }} />
            <button type="button" className="gs-opcion" disabled={cargandoBase || abriendo} onClick={() => inputArchivo.current?.click()}>
              <span className="gs-opcion-icono">📥</span>
              <span className="gs-opcion-titulo">{abriendo ? 'Abriendo…' : 'Subir borrador'}</span>
              <span className="gs-ayuda">El ZIP que te preparó Claude desde la foto de la factura.</span>
            </button>
            <button type="button" className="gs-opcion" disabled={cargandoBase} onClick={iniciarManual}>
              <span className="gs-opcion-icono">✍️</span>
              <span className="gs-opcion-titulo">Factura manual</span>
              <span className="gs-ayuda">Agregas tú los productos (los que ya existen o nuevos).</span>
            </button>
            {cargandoBase ? <p className="gs-ayuda">Cargando productos…</p> : null}
            {errorArchivo ? <p className="gs-txt-rojo">{errorArchivo}</p> : null}
          </div>
        ) : null}

        {borrador && encabezado ? (
          <>
            {/* Pasos */}
            <div className="gs-pasos">
              {PASOS.map((p) => {
                const pend = p.n === 5 ? [] : pendientesPaso[p.n] || [];
                const estado = paso === p.n ? 'activo' : pend.length ? 'pendiente' : p.n < paso ? 'hecho' : '';
                return (
                  <button key={p.n} type="button" className={`gs-paso ${estado}`} onClick={() => irAPaso(p.n)}>
                    <span className="gs-paso-num">{estado === 'hecho' ? '✓' : p.n}</span>
                    <span className="gs-paso-txt">{p.t}</span>
                    {pend.length && paso !== p.n ? <span className="gs-paso-badge">{pend.length}</span> : null}
                  </button>
                );
              })}
            </div>

            {borrador.prueba ? <div className="gs-aviso gs-aviso-azul">🧪 Borrador de PRUEBA: la factura es inventada. Si lo apruebas, se guarda de verdad.</div> : null}
            {borrador.avisos?.length && paso <= 2 ? (
              <div className="gs-aviso">
                <strong>Claude avisa:</strong>
                <ul className="gs-lista">
                  {borrador.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {paso === 1 ? (
              <PasoFactura
                borrador={borrador}
                setBorrador={setBorrador}
                encabezado={encabezado}
                setEncabezado={setEncabezado}
                proveedores={proveedores}
                proveedorElegido={proveedorElegido}
                cambiarProveedor={cambiarProveedor}
                bloqueadoProveedor={aprobando || !!progreso.current.proveedorId}
                duplicada={duplicada}
                bodegas={bodegas}
                regla={regla}
                setRegla={setRegla}
                reglaOrigen={reglaOrigen}
                recordarRegla={recordarRegla}
                setRecordarRegla={setRecordarRegla}
                aprobando={aprobando}
              />
            ) : null}

            {paso === 2 ? (
              <PasoEmparejar
                borrador={borrador}
                lineas={lineas}
                productos={productos}
                productosPorId={productosPorId}
                costoLinea={costoLinea}
                costoNetoDe={(l) => costoNetoParaPos(l, regla)}
                subtotalLinea={subtotalLinea}
                cambiarLinea={cambiarLinea}
                agregarExistente={agregarExistente}
                agregarNueva={agregarNueva}
                quitarLinea={quitarLinea}
                conteo={conteo}
                bloqueada={aprobando}
              />
            ) : null}

            {paso === 3 ? (
              nuevas.length === 0 ? (
                <div className="gs-card">
                  <p style={{ margin: 0 }}>Esta factura no tiene productos nuevos: todos ya existen en el POS. Sigue a <b>Revisar y aprobar</b>.</p>
                </div>
              ) : (
                <div className="gs-dos">
                  <div className="gs-lista-nuevos">
                    <div className="gs-eyebrow" style={{ marginBottom: '8px' }}>
                      {nuevas.filter(({ l }) => semaforoDe(l) !== 'rojo').length} de {nuevas.length} listos
                    </div>
                    {nuevas.map(({ l, i }) => {
                      const sem = semaforoDe(l);
                      const f = faltantesDe(l);
                      return (
                        <button key={i} type="button" className={`gs-item ${actualEf === i ? 'activo' : ''}`} onClick={() => setActual(i)}>
                          <span className={`gs-sem gs-sem-${sem}`} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span className="gs-item-nombre">{l.nuevo.nombre || `Línea ${l.linea}`}</span>
                            {l.creado || l.creadoConFormulario ? (
                              <span className="gs-ayuda">Ya creado</span>
                            ) : f.obligatorios.length ? (
                              <span className="gs-chips">
                                {f.obligatorios.slice(0, 4).map((x) => (
                                  <span key={x} className="gs-chip gs-chip-rojo">{x}</span>
                                ))}
                                {f.obligatorios.length > 4 ? <span className="gs-chip gs-chip-rojo">+{f.obligatorios.length - 4}</span> : null}
                              </span>
                            ) : f.recomendados.length ? (
                              <span className="gs-chips">
                                {f.recomendados.slice(0, 3).map((x) => (
                                  <span key={x} className="gs-chip gs-chip-amarillo">{x}</span>
                                ))}
                              </span>
                            ) : (
                              <span className="gs-ayuda gs-txt-verde">Completo</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {lineaActual && lineaActual.accion === 'nuevo' ? (
                      <EditorNuevo
                        key={actualEf}
                        l={lineaActual}
                        i={actualEf}
                        posicion={nuevas.findIndex(({ i }) => i === actualEf) + 1}
                        total={nuevas.length}
                        faltantes={faltantesDe(lineaActual)}
                        obligatorio={obligatorio}
                        categorias={categorias}
                        subcategorias={subcategorias}
                        fotos={fotos}
                        regla={regla}
                        costoNeto={costoNetoParaPos(lineaActual, regla)}
                        precioVenta={precioVentaDe(lineaActual)}
                        precioAuto={precioAutoDe(lineaActual)}
                        modoDist={modoDistDe(lineaActual)}
                        precioDist={precioDistDe(lineaActual)}
                        precioDistAuto={precioDistAutoDe(lineaActual)}
                        gamer={gamerDe(lineaActual)}
                        bloqueada={aprobando}
                        cambiarLinea={cambiarLinea}
                        cambiarNuevo={cambiarNuevo}
                        agregarFotosPropias={agregarFotosPropias}
                        quitarFondoDeFoto={quitarFondoDeFoto}
                        deshacerFondo={deshacerFondo}
                        recortarFoto={recortarFoto}
                        ampliarDescripcion={ampliarDescripcion}
                        analizarLineaConIA={analizarLineaConIA}
                        deshacerIA={deshacerIA}
                        traerFotosPagina={traerFotosPagina}
                        agregarFotoPagina={agregarFotoPagina}
                        verFoto={setFotoGrande}
                        abrirFormularioCompleto={abrirFormularioCompleto}
                        preparandoFormulario={preparandoFormulario === actualEf}
                        anterior={() => {
                          const k = nuevas.findIndex(({ i }) => i === actualEf);
                          if (k > 0) setActual(nuevas[k - 1].i);
                        }}
                        siguiente={() => {
                          const k = nuevas.findIndex(({ i }) => i === actualEf);
                          if (k < nuevas.length - 1) setActual(nuevas[k + 1].i);
                          else irAPaso(4);
                        }}
                        siguientePendiente={siguientePendiente}
                      />
                    ) : (
                      <div className="gs-card">Elige un producto de la lista.</div>
                    )}
                  </div>
                </div>
              )
            ) : null}

            {paso === 4 ? (
              <PasoPrecios
                nuevas={nuevas}
                regla={regla}
                costoNetoDe={(l) => costoNetoParaPos(l, regla)}
                precioVentaDe={precioVentaDe}
                precioAutoDe={precioAutoDe}
                modoDistDe={modoDistDe}
                precioDistDe={precioDistDe}
                precioDistAutoDe={precioDistAutoDe}
                cambiarNuevo={cambiarNuevo}
                bloqueada={aprobando}
              />
            ) : null}

            {paso === 5 ? (
              <PasoRevisar
                borrador={borrador}
                encabezado={encabezado}
                proveedores={proveedores}
                proveedorElegido={proveedorElegido}
                bodegas={bodegas}
                lineas={lineas}
                nuevas={nuevas}
                activas={activas}
                conteo={conteo}
                categorias={categorias}
                subcategorias={subcategorias}
                productosPorId={productosPorId}
                faltantesDe={faltantesDe}
                obligatorio={obligatorio}
                precioVentaDe={precioVentaDe}
                precioDistDe={precioDistDe}
                modoDistDe={modoDistDe}
                gamerDe={gamerDe}
                subtotal={subtotal}
                retencionValor={retencionValor}
                comparaFactura={comparaFactura}
                regla={regla}
                duplicada={duplicada}
                problemas={problemas()}
                pasos={pasos}
                errorAprobar={errorAprobar}
                aprobando={aprobando}
                aprobar={aprobar}
                irAProducto={(i) => {
                  setActual(i);
                  irAPaso(3);
                }}
                irAPaso={irAPaso}
              />
            ) : null}

            {/* Navegación de abajo */}
            <div className="gs-nav">
              <button type="button" className="gs-btn" disabled={paso === 1} onClick={() => irAPaso(paso - 1)}>
                ← Anterior
              </button>
              {paso < 5 ? (
                <div className="gs-fila" style={{ alignItems: 'center' }}>
                  {pendientesPaso[paso]?.length ? (
                    <span className="gs-ayuda gs-txt-amarillo">
                      Falta: {pendientesPaso[paso].slice(0, 3).join(' · ')}
                      {pendientesPaso[paso].length > 3 ? ` y ${pendientesPaso[paso].length - 3} más` : ''}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="gs-btn gs-btn-pri"
                    onClick={() => {
                      if (paso === 2 && lineas.some((l) => !l.accion)) {
                        setErrorAprobar('Antes de seguir, decide las líneas ⚠️: elige el producto o márcalas como nuevas.');
                        return;
                      }
                      irAPaso(paso === 2 && nuevas.length === 0 ? 5 : paso + 1);
                    }}
                  >
                    Siguiente →
                  </button>
                </div>
              ) : null}
            </div>
            {errorAprobar && paso !== 5 ? <p className="gs-txt-rojo" style={{ textAlign: 'right' }}>{errorAprobar}</p> : null}
          </>
        ) : null}

        {formularioLinea ? (
          <ModalProductoNuevo
            prefill={formularioLinea.prefill}
            onCerrar={() => setFormularioLinea(null)}
            onCreado={(p, aviso) => productoCreadoConFormulario(formularioLinea.i, p, aviso)}
          />
        ) : null}

        {fotoGrande ? (
          <div className="gs-overlay" onClick={() => setFotoGrande(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoGrande} alt="" className="gs-foto-grande" />
          </div>
        ) : null}

        {verConfig ? (
          <div className="gs-overlay" onClick={() => setVerConfig(false)} style={{ cursor: 'default' }}>
            <div className="gs-card gs-modal" onClick={(e) => e.stopPropagation()}>
              <div className="gs-eyebrow">Configuración</div>
              <h3 className="gs-h2" style={{ fontSize: '22px' }}>Campos obligatorios</h3>
              <p className="gs-ayuda">
                Lo que marques se exige en CADA producto nuevo antes de dejar aprobar la factura. Nombre, cantidad, costo y precio de venta siempre
                son obligatorios.
              </p>
              {CAMPOS_CONFIGURABLES.map((c) => (
                <label key={c.clave} className="gs-check">
                  <input
                    type="checkbox"
                    checked={obligatorios.includes(c.clave)}
                    onChange={(e) =>
                      guardarObligatorios(e.target.checked ? [...obligatorios, c.clave] : obligatorios.filter((x) => x !== c.clave))
                    }
                  />
                  <span>{c.texto}</span>
                </label>
              ))}
              <div className="gs-fila" style={{ marginTop: '12px', justifyContent: 'space-between' }}>
                <span className="gs-ayuda">{guardandoConfig ? 'Guardando…' : 'Se guarda solo.'}</span>
                <button type="button" className="gs-btn gs-btn-pri" onClick={() => setVerConfig(false)}>Listo</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

// ═══════════════════════════ PASO 1: FACTURA ═══════════════════════════
function PasoFactura({
  borrador,
  setBorrador,
  encabezado,
  setEncabezado,
  proveedores,
  proveedorElegido,
  cambiarProveedor,
  bloqueadoProveedor,
  duplicada,
  bodegas,
  regla,
  setRegla,
  reglaOrigen,
  recordarRegla,
  setRecordarRegla,
  aprobando,
}) {
  const multis = [1.3, 1.5, 1.8, 2, 2.5, 3];
  const dists = [20, 30, 40, 50, 60];
  return (
    <div className="gs-dos-iguales">
      <div className="gs-card">
        <Seccion n="1" titulo="Datos de la factura" />
        <div className="gs-grid2">
          <label className="gs-campo">
            <span className="gs-label">Proveedor *</span>
            <select value={proveedorElegido} onChange={(e) => cambiarProveedor(e.target.value)} disabled={bloqueadoProveedor}>
              <option value="">— Elegir —</option>
              <option value="nuevo">＋ Proveedor nuevo{!borrador.manual && borrador.proveedor.nombre ? `: ${borrador.proveedor.nombre}` : ''}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                  {p.identificacion ? ` — ${p.identificacion}` : ''}
                </option>
              ))}
            </select>
            {!borrador.manual && borrador.proveedor.nombre ? (
              <span className="gs-ayuda">
                En la factura: {borrador.proveedor.nombre}
                {borrador.proveedor.identificacion ? ` · NIT ${borrador.proveedor.identificacion}` : ''}
              </span>
            ) : null}
          </label>
          <label className="gs-campo">
            <span className="gs-label">Número de factura</span>
            <input value={encabezado.numero} onChange={(e) => setEncabezado({ ...encabezado, numero: e.target.value })} placeholder="Ej: FE-1234" />
            {duplicada ? <span className="gs-ayuda gs-txt-rojo">⚠️ Ya existe una factura con ese número de este proveedor.</span> : null}
          </label>
          {proveedorElegido === 'nuevo' ? (
            <>
              <label className="gs-campo">
                <span className="gs-label">Nombre del proveedor nuevo *</span>
                <input
                  value={borrador.proveedor.nombre}
                  disabled={bloqueadoProveedor}
                  onChange={(e) => setBorrador({ ...borrador, proveedor: { ...borrador.proveedor, nombre: e.target.value } })}
                />
              </label>
              <label className="gs-campo">
                <span className="gs-label">NIT / cédula</span>
                <input
                  value={borrador.proveedor.identificacion}
                  disabled={bloqueadoProveedor}
                  onChange={(e) => setBorrador({ ...borrador, proveedor: { ...borrador.proveedor, identificacion: e.target.value } })}
                />
              </label>
            </>
          ) : null}
          <label className="gs-campo">
            <span className="gs-label">Fecha *</span>
            <input type="date" value={encabezado.fecha_creacion} onChange={(e) => setEncabezado({ ...encabezado, fecha_creacion: e.target.value })} />
          </label>
          <label className="gs-campo">
            <span className="gs-label">Vence</span>
            <input type="date" value={encabezado.fecha_vencimiento} onChange={(e) => setEncabezado({ ...encabezado, fecha_vencimiento: e.target.value })} />
          </label>
          <label className="gs-campo">
            <span className="gs-label">Bodega que recibe *</span>
            <select value={encabezado.bodega_id} onChange={(e) => setEncabezado({ ...encabezado, bodega_id: e.target.value })}>
              <option value="">— Elegir —</option>
              {bodegas.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.nombre}</option>
              ))}
            </select>
          </label>
          <label className="gs-campo">
            <span className="gs-label">Retención</span>
            <select value={encabezado.retencion_porcentaje} onChange={(e) => setEncabezado({ ...encabezado, retencion_porcentaje: Number(e.target.value) })}>
              {TARIFAS_RETEICA.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </label>
          {Number(encabezado.retencion_porcentaje) > 0 ? (
            <label className="gs-campo">
              <span className="gs-label">Base de la retención *</span>
              <input type="number" value={encabezado.retencion_base} onChange={(e) => setEncabezado({ ...encabezado, retencion_base: e.target.value })} />
            </label>
          ) : null}
        </div>
        <label className="gs-campo" style={{ marginTop: '10px' }}>
          <span className="gs-label">Notas</span>
          <input value={encabezado.notas} onChange={(e) => setEncabezado({ ...encabezado, notas: e.target.value })} />
        </label>
      </div>

      <div className="gs-card">
        <Seccion n="$" titulo="Regla de precios del proveedor" />
        <div className="gs-grid1">
          <label className="gs-campo">
            <span className="gs-label">IVA en el costo</span>
            <select value={regla.iva} disabled={aprobando} onChange={(e) => setRegla({ ...regla, iva: e.target.value })}>
              <option value="sumar">Sumar el IVA (precio de factura + IVA)</option>
              <option value="ignorar">No tener en cuenta el IVA</option>
            </select>
          </label>
          <label className="gs-campo">
            <span className="gs-label">Precio de venta de los nuevos</span>
            <select
              value={regla.multiplicador ? String(regla.multiplicador) : ''}
              disabled={aprobando}
              onChange={(e) => setRegla({ ...regla, multiplicador: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Lo pongo yo</option>
              {multis.concat(regla.multiplicador && !multis.includes(regla.multiplicador) ? [regla.multiplicador] : []).map((m) => (
                <option key={m} value={String(m)}>Costo × {String(m).replace('.', ',')}</option>
              ))}
            </select>
          </label>
          <label className="gs-campo">
            <span className="gs-label">Precio distribuidor (sugerido)</span>
            <select
              value={regla.distribuidor === null ? '' : String(regla.distribuidor)}
              disabled={aprobando}
              onChange={(e) => setRegla({ ...regla, distribuidor: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">No calcular</option>
              {dists.concat(regla.distribuidor !== null && !dists.includes(regla.distribuidor) ? [regla.distribuidor] : []).map((d) => (
                <option key={d} value={String(d)}>Costo + {d} %</option>
              ))}
            </select>
          </label>
          <label className="gs-check">
            <input type="checkbox" checked={recordarRegla} disabled={aprobando} onChange={(e) => setRecordarRegla(e.target.checked)} />
            <span>Recordar esta regla para este proveedor</span>
          </label>
          <span className="gs-ayuda">
            {reglaOrigen === 'guardada' ? 'Regla guardada de este proveedor.' : 'Regla sugerida (este proveedor aún no tiene una guardada).'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════ PASO 2: EMPAREJAR / PRODUCTOS ══════════════════════
function PasoEmparejar({ borrador, lineas, productos, productosPorId, costoNetoDe, subtotalLinea, cambiarLinea, agregarExistente, agregarNueva, quitarLinea, conteo, bloqueada }) {
  const [texto, setTexto] = useState('');
  const resultados = useBuscarProductos(texto, productos);
  return (
    <div>
      <div className="gs-fila" style={{ marginBottom: '12px' }}>
        <span className="gs-chip gs-chip-verde">✅ {conteo.ok} ya existen</span>
        <span className="gs-chip gs-chip-amarillo">⚠️ {conteo.revisar} por elegir</span>
        <span className="gs-chip gs-chip-azul">🆕 {conteo.nuevo} nuevos</span>
        {conteo.omitir ? <span className="gs-chip">⏭️ {conteo.omitir} sin guardar</span> : null}
      </div>

      {borrador.manual ? (
        <div className="gs-card" style={{ position: 'relative' }}>
          <Seccion n="+" titulo="Agregar producto a la factura" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busca por nombre o referencia… (o escribe el nombre de uno nuevo)" style={{ width: '100%' }} />
          {texto.trim() ? (
            <div className="gs-dropdown">
              {resultados.map((p) => (
                <div
                  key={p.id}
                  className="gs-opcion-lista"
                  onClick={() => {
                    agregarExistente(p);
                    setTexto('');
                  }}
                >
                  <b>{p.referencia}</b> · {p.nombre} <span className="gs-ayuda">· stock {Number(p.stock)}</span>
                </div>
              ))}
              <div
                className="gs-opcion-lista gs-txt-cian"
                onClick={() => {
                  agregarNueva(texto.trim());
                  setTexto('');
                }}
              >
                ＋ Producto NUEVO: «{texto.trim()}» (lo completas en el paso 3)
              </div>
            </div>
          ) : null}
          <span className="gs-ayuda">El costo es el de la factura del proveedor; la regla de precios le suma el IVA si aplica.</span>
        </div>
      ) : null}

      {lineas.length === 0 ? <div className="gs-card gs-ayuda">Todavía no hay productos en la factura.</div> : null}

      {lineas.map((l, i) => (
        <LineaEmparejar
          key={i}
          l={l}
          i={i}
          productos={productos}
          productosPorId={productosPorId}
          costoNeto={costoNetoDe(l)}
          subtotal={subtotalLinea(l)}
          cambiarLinea={cambiarLinea}
          quitarLinea={quitarLinea}
          bloqueada={bloqueada}
        />
      ))}
    </div>
  );
}

function useBuscarProductos(texto, productos) {
  return useMemo(() => {
    const ps = sinTildes(texto).toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!ps.length) return [];
    return productos
      .filter((p) => p.es_inventariable !== false)
      .filter((p) => {
        const t = sinTildes(`${p.nombre} ${p.referencia}`).toLowerCase();
        return ps.every((w) => t.includes(w));
      })
      .slice(0, 8);
  }, [texto, productos]);
}

function LineaEmparejar({ l, i, productos, productosPorId, costoNeto, subtotal, cambiarLinea, quitarLinea, bloqueada }) {
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');
  const resultados = useBuscarProductos(texto, productos);
  const estado = l.accion === 'existente' ? 'ok' : l.accion === 'nuevo' ? 'nuevo' : l.accion === 'omitir' ? 'omitir' : 'revisar';
  const elegido = l.accion === 'existente' ? productosPorId.get(Number(l.producto_id)) : null;
  function usar(id) {
    cambiarLinea(i, { accion: 'existente', producto_id: Number(id), decididaAMano: true });
    setBuscando(false);
    setTexto('');
  }
  return (
    <div className={`gs-card gs-linea gs-linea-${estado}`}>
      <div className="gs-linea-top">
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div className="gs-linea-titulo">
            {ICONO[estado]} Línea {l.linea}
            {l.codigo_proveedor ? <span className="gs-codigo">{l.codigo_proveedor}</span> : null}
            {l.confianza === 'baja' ? <span className="gs-chip gs-chip-rojo" style={{ marginLeft: '6px' }}>Claude no está seguro</span> : null}
          </div>
          <div className="gs-ayuda" style={{ fontSize: '14px' }}>{l.descripcion_factura || l.modelo}</div>
          {l.notas ? <div className="gs-ayuda gs-txt-amarillo">📝 {l.notas}</div> : null}
        </div>
        <div className="gs-fila" style={{ alignItems: 'flex-end' }}>
          <label className="gs-campo">
            <span className="gs-label">Cant.</span>
            <input type="number" min="0" value={l.cantidad} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} style={{ width: '70px' }} />
          </label>
          <label className="gs-campo">
            <span className="gs-label">Costo factura</span>
            <input type="number" min="0" value={l.costo_unitario} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { costo_unitario: e.target.value })} style={{ width: '108px' }} />
          </label>
          <label className="gs-campo">
            <span className="gs-label">Desc. %</span>
            <input type="number" min="0" max="100" value={l.descuento_porcentaje} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { descuento_porcentaje: e.target.value })} style={{ width: '62px' }} />
          </label>
          <label className="gs-campo">
            <span className="gs-label">IVA %</span>
            <input type="number" min="0" value={l.iva_porcentaje} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { iva_porcentaje: e.target.value })} style={{ width: '58px' }} />
          </label>
          <div style={{ textAlign: 'right', minWidth: '104px' }}>
            <div className="gs-label">Subtotal</div>
            <div className="gs-monto">{moneda(subtotal)}</div>
            <div className="gs-ayuda">POS c/u {moneda(costoNeto)}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '10px', fontSize: '14px' }}>
        {estado === 'ok' && elegido ? (
          <div>
            → <b>{elegido.referencia}</b> · {elegido.nombre}
            <span className="gs-ayuda"> · venta {moneda(elegido.precio_venta)} · costo actual {moneda(elegido.precio_costo)}</span>
            {l.cruce?.motivo ? <div className="gs-ayuda">{l.cruce.motivo}</div> : null}
            {Number(elegido.precio_costo) > 0 && Math.abs(costoNeto - Number(elegido.precio_costo)) / Number(elegido.precio_costo) > 0.15 ? (
              <div className="gs-ayuda gs-txt-amarillo">⚠️ El costo cambió más de 15 % frente al actual. ¿Es el mismo producto?</div>
            ) : null}
          </div>
        ) : null}
        {estado === 'revisar' ? <div className="gs-txt-amarillo">{l.cruce?.motivo}</div> : null}
        {estado === 'nuevo' ? <div className="gs-txt-cian">🆕 Producto nuevo: {l.nuevo.nombre} — se completa en el paso 3.</div> : null}
        {estado === 'omitir' ? <div className="gs-ayuda">No se va a guardar esta línea.</div> : null}
      </div>

      {!l.creado && !bloqueada ? (
        <div className="gs-fila" style={{ marginTop: '8px' }}>
          {estado !== 'ok'
            ? (l.cruce?.candidatos || [])
                .filter((c) => productosPorId.has(c.id))
                .map((c) => {
                  const p = productosPorId.get(c.id);
                  return (
                    <button key={c.id} type="button" className="gs-btn gs-btn-chico gs-btn-amarillo" onClick={() => usar(c.id)} title={c.motivo}>
                      Es: <b>{p.referencia}</b> · {p.nombre}
                    </button>
                  );
                })
            : null}
          {estado !== 'nuevo' && !l.creadoConFormulario ? (
            <button type="button" className="gs-btn gs-btn-chico" onClick={() => cambiarLinea(i, { accion: 'nuevo', decididaAMano: true })}>
              🆕 Es nuevo
            </button>
          ) : null}
          <button type="button" className="gs-btn gs-btn-chico" onClick={() => setBuscando(!buscando)}>
            🔎 {estado === 'ok' ? 'Cambiar producto' : 'Buscar en el POS'}
          </button>
          {l.manual ? (
            <button type="button" className="gs-btn gs-btn-chico gs-txt-rojo" onClick={() => quitarLinea(i)}>
              ✕ Quitar
            </button>
          ) : estado !== 'omitir' ? (
            <button type="button" className="gs-btn gs-btn-chico" onClick={() => cambiarLinea(i, { accion: 'omitir', decididaAMano: true })}>
              ⏭️ No guardar
            </button>
          ) : (
            <button
              type="button"
              className="gs-btn gs-btn-chico"
              onClick={() =>
                cambiarLinea(i, {
                  accion: l.cruce?.estado === 'ok' ? 'existente' : l.cruce?.estado === 'nuevo' ? 'nuevo' : null,
                  producto_id: l.cruce?.producto_id,
                  decididaAMano: false,
                })
              }
            >
              ↩️ Volver a incluirla
            </button>
          )}
        </div>
      ) : null}
      {buscando ? (
        <div style={{ marginTop: '8px', position: 'relative', maxWidth: '560px' }}>
          <input autoFocus placeholder="Busca por nombre o referencia…" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: '100%' }} />
          {resultados.length ? (
            <div className="gs-dropdown" style={{ left: 0, right: 0, top: '100%' }}>
              {resultados.map((p) => (
                <div key={p.id} className="gs-opcion-lista" onClick={() => usar(p.id)}>
                  <b>{p.referencia}</b> · {p.nombre} <span className="gs-ayuda">· stock {Number(p.stock)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ══════════════════════ PASO 3: UN PRODUCTO NUEVO ══════════════════════
function Seccion({ n, titulo, ok, falta }) {
  return (
    <div className="gs-seccion">
      <span className={`gs-seccion-num ${ok ? 'ok' : falta ? 'falta' : ''}`}>{ok ? '✓' : n}</span>
      <span className="gs-seccion-titulo">{titulo}</span>
      {falta ? <span className="gs-chip gs-chip-rojo" style={{ marginLeft: 'auto' }}>{falta}</span> : null}
    </div>
  );
}

function EditorNuevo({
  l,
  i,
  posicion,
  total,
  faltantes,
  obligatorio,
  categorias,
  subcategorias,
  fotos,
  regla,
  costoNeto,
  precioVenta,
  precioAuto,
  modoDist,
  precioDist,
  precioDistAuto,
  gamer,
  bloqueada,
  cambiarLinea,
  cambiarNuevo,
  agregarFotosPropias,
  quitarFondoDeFoto,
  deshacerFondo,
  recortarFoto,
  ampliarDescripcion,
  analizarLineaConIA,
  deshacerIA,
  traerFotosPagina,
  agregarFotoPagina,
  verFoto,
  abrirFormularioCompleto,
  preparandoFormulario,
  anterior,
  siguiente,
  siguientePendiente,
}) {
  const inputPortada = useRef(null);
  const inputExtra = useRef(null);
  const [verMas, setVerMas] = useState(false);
  const n = l.nuevo;
  const bloqueo = !!l.creado || bloqueada;
  const falta = new Set(faltantes.obligatorios);
  const subsDeCat = subcategorias.filter((x) => String(x.categoria_id) === String(n.categoria_id));
  const nombreCat = categorias.find((c) => String(c.id) === String(n.categoria_id))?.nombre;
  const nombreSub = subcategorias.find((x) => String(x.id) === String(n.subcategoria_id))?.nombre;
  const plantilla = tipoDeProducto({ nombre: n.nombre, categoria: nombreCat, subcategoria: nombreSub });
  const faltantesFicha = camposFaltantes(plantilla, n.especificaciones);
  const pv = Number(precioVenta) || 0;
  const margen = pv > 0 ? ((pv - costoNeto) / pv) * 100 : null;
  const largoDesc = n.descripcion.trim().length;

  function elegirCategoria(id) {
    const subs = subcategorias.filter((x) => String(x.categoria_id) === String(id));
    const parecida = n.subcategoriaSugerida ? categoriaParecida(n.subcategoriaSugerida, subs) : null;
    cambiarNuevo(i, { categoria_id: id, subcategoria_id: parecida ? String(parecida.id) : '' });
  }
  function cambiarFila(k, campo, valor) {
    cambiarNuevo(i, { especificaciones: n.especificaciones.map((f, j) => (j === k ? { ...f, [campo]: valor } : f)) });
  }
  function agregarFilas(campos) {
    const nombres = new Set(n.especificaciones.map((f) => String(f.nombre).toLowerCase()));
    cambiarNuevo(i, { especificaciones: [...n.especificaciones, ...campos.filter((c) => !nombres.has(c.nombre.toLowerCase())).map((c) => ({ nombre: c.nombre, valor: '' }))] });
  }

  return (
    <div>
      <div className="gs-card gs-editor-cabeza">
        <div style={{ minWidth: 0 }}>
          <div className="gs-eyebrow">
            Producto {posicion} de {total} · Línea {l.linea}
            {l.codigo_proveedor ? ` · ${l.codigo_proveedor}` : ''}
          </div>
          <div className="gs-h2" style={{ fontSize: '22px' }}>{n.nombre || 'Producto nuevo'}</div>
          <div className="gs-ayuda">
            {l.cantidad} und · costo POS c/u {moneda(costoNeto)}
            {l.descripcion_factura ? ` · factura: ${l.descripcion_factura}` : ''}
          </div>
        </div>
        {l.creado || l.creadoConFormulario ? (
          <span className="gs-chip gs-chip-verde">✔ Ya creado</span>
        ) : !bloqueada ? (
          <button type="button" className="gs-btn gs-btn-chico" disabled={preparandoFormulario} onClick={() => abrirFormularioCompleto(i)}>
            {preparandoFormulario ? 'Abriendo…' : '📝 Formulario completo'}
          </button>
        ) : null}
      </div>

      {/* 1 · Datos básicos + IA */}
      <div className="gs-card">
        <Seccion n="1" titulo="Datos básicos" ok={!falta.has('Nombre')} falta={falta.has('Nombre') ? 'Nombre' : ''} />
        <label className="gs-campo">
          <span className="gs-label">Nombre del producto *</span>
          <input value={n.nombre} disabled={bloqueo} maxLength={150} onChange={(e) => cambiarNuevo(i, { nombre: e.target.value })} />
        </label>
        {!bloqueo ? (
          <div className="gs-ia">
            <div className="gs-ia-titulo">🪄 Ayuda de IA</div>
            <label className="gs-campo">
              <span className="gs-label">Comentarios para la IA (los tiene en cuenta)</span>
              <textarea rows={2} value={n.infoIA} onChange={(e) => cambiarNuevo(i, { infoIA: e.target.value })} placeholder="Ej: es para PS5, trae cable de 2 m, color negro, resalta que es inalámbrico…" />
            </label>
            <label className="gs-campo" style={{ marginTop: '8px' }}>
              <span className="gs-label">Enlace del fabricante (opcional)</span>
              <input type="url" value={n.enlace} onChange={(e) => cambiarNuevo(i, { enlace: e.target.value })} placeholder="https://www.marca.com/producto/..." />
            </label>
            {l.verTextoFabricante ? (
              <label className="gs-campo" style={{ marginTop: '8px' }}>
                <span className="gs-label">Texto de la página (se usa en vez del enlace)</span>
                <textarea rows={3} value={n.textoFabricante} onChange={(e) => cambiarNuevo(i, { textoFabricante: e.target.value })} />
              </label>
            ) : null}
            <div className="gs-fila" style={{ marginTop: '8px' }}>
              <button type="button" className="gs-btn gs-btn-pri gs-btn-chico" disabled={l.analizandoIA} onClick={() => analizarLineaConIA(i)}>
                {l.analizandoIA ? 'Analizando…' : '🪄 Analizar con IA'}
              </button>
              {n.enlace.trim() ? (
                <button type="button" className="gs-btn gs-btn-chico" disabled={l.buscandoFotosPagina} onClick={() => traerFotosPagina(i)}>
                  {l.buscandoFotosPagina ? 'Buscando…' : '🖼️ Fotos de la página'}
                </button>
              ) : null}
              {!l.verTextoFabricante ? (
                <button type="button" className="gs-btn gs-btn-chico" onClick={() => cambiarLinea(i, { verTextoFabricante: true })}>
                  Pegar texto de la página
                </button>
              ) : null}
              <label className="gs-btn gs-btn-chico" title="Solo la mira la IA (no se guarda como foto del producto)">
                {l.fotoIA ? '📷 Cambiar foto para la IA' : '📷 Foto para la IA (ej. la caja)'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const dataUri = await blobADataUri(f);
                    cambiarLinea(i, { fotoIA: await redimensionarParaIA(dataUri) });
                  }}
                />
              </label>
              {l.fotoIA ? (
                <button type="button" className="gs-btn gs-btn-chico gs-txt-rojo" onClick={() => cambiarLinea(i, { fotoIA: null })}>
                  Quitar foto IA
                </button>
              ) : null}
              {l.nuevoAntesIA ? (
                <button type="button" className="gs-btn gs-btn-chico" onClick={() => deshacerIA(i)}>
                  ↩️ Deshacer IA
                </button>
              ) : null}
            </div>
            <div className="gs-ayuda">Cambia nombre, descripción, ficha, categoría y subcategoría. No toca fotos ni precios.</div>
            {l.mensajeIA ? <div className={`gs-ayuda ${/No se pudo|no se dejó/.test(l.mensajeIA) ? 'gs-txt-rojo' : ''}`}>{l.mensajeIA}</div> : null}
            {l.mensajeFotosPagina ? <div className="gs-ayuda">{l.mensajeFotosPagina}</div> : null}
            {l.fotosPagina?.length ? (
              <div className="gs-fila" style={{ marginTop: '8px' }}>
                {l.fotosPagina.slice(0, 8).map((f) => (
                  <div key={f.url} style={{ width: '112px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/productos/foto-remota?url=${encodeURIComponent(f.url)}&ref=${encodeURIComponent(n.enlace.trim())}`} alt="" className="gs-foto gs-foto-mini" />
                    <div className="gs-fila" style={{ gap: '8px' }}>
                      <button type="button" className="gs-link" onClick={() => agregarFotoPagina(i, f, true)}>Portada</button>
                      <button type="button" className="gs-link" onClick={() => agregarFotoPagina(i, f, false)}>+ Agregar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="gs-ayuda" style={{ marginTop: '8px' }}>
          Fuente: {n.fuente?.tipo === 'catalogo' ? '📘 Catálogo del proveedor' : n.fuente?.tipo === 'web' ? '🌐 Página web' : '🧾 Factura / a mano'}
          {n.fuente?.detalle ? ` · ${n.fuente.detalle}` : ''}
          {n.fuente?.url ? (
            <>
              {' · '}
              <a href={n.fuente.url} target="_blank" rel="noopener noreferrer" className="gs-txt-cian">ver página</a>
            </>
          ) : null}
        </div>
      </div>

      {/* 2 · Categoría */}
      <div className="gs-card">
        <Seccion
          n="2"
          titulo="Categoría"
          ok={!falta.has('Categoría') && !falta.has('Subcategoría') && !!n.categoria_id}
          falta={[falta.has('Categoría') ? 'Categoría' : '', falta.has('Subcategoría') ? 'Subcategoría' : ''].filter(Boolean).join(' · ')}
        />
        <div className="gs-grid2">
          <label className="gs-campo">
            <span className="gs-label">Categoría{obligatorio('categoria') ? ' *' : ''}{n.categoriaSugerida ? ` (sugerida: ${n.categoriaSugerida})` : ''}</span>
            <select value={n.categoria_id} disabled={bloqueo} onChange={(e) => elegirCategoria(e.target.value)} className={falta.has('Categoría') ? 'gs-falta' : ''}>
              <option value="">— Elegir —</option>
              {categorias.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="gs-campo">
            <span className="gs-label">Subcategoría{obligatorio('subcategoria') ? ' *' : ''}{n.subcategoriaSugerida ? ` (sugerida: ${n.subcategoriaSugerida})` : ''}</span>
            <select value={n.subcategoria_id} disabled={bloqueo || !n.categoria_id} onChange={(e) => cambiarNuevo(i, { subcategoria_id: e.target.value })} className={falta.has('Subcategoría') ? 'gs-falta' : ''}>
              <option value="">{n.categoria_id ? (subsDeCat.length ? '— Elegir —' : 'Esta categoría no tiene subcategorías') : 'Elige primero la categoría'}</option>
              {subsDeCat.map((x) => (
                <option key={x.id} value={String(x.id)}>{x.nombre}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 3 · Precios */}
      <div className="gs-card">
        <Seccion
          n="3"
          titulo="Precios"
          ok={!falta.has('Precio de venta') && !falta.has('Distribuidor')}
          falta={[falta.has('Precio de venta') ? 'Venta' : '', falta.has('Distribuidor') ? 'Distribuidor' : ''].filter(Boolean).join(' · ')}
        />
        <div className="gs-grid2">
          <label className="gs-campo">
            <span className="gs-label">Precio de venta (al público) *</span>
            <input
              type="number"
              min="0"
              value={precioVenta ?? ''}
              disabled={bloqueo}
              className={falta.has('Precio de venta') ? 'gs-falta' : ''}
              onChange={(e) => cambiarNuevo(i, { precio_venta: e.target.value, precioEditado: true })}
            />
            <span className="gs-ayuda">
              Costo POS {moneda(costoNeto)}
              {margen !== null ? <span className={margen < 15 ? 'gs-txt-rojo' : 'gs-txt-verde'}> · margen {margen.toFixed(0)} %</span> : null}
              {precioAuto && !n.precioEditado ? ' · calculado con la regla' : ''}
              {precioAuto && n.precioEditado && !bloqueo ? (
                <>
                  {' · '}
                  <button type="button" className="gs-link" onClick={() => cambiarNuevo(i, { precioEditado: false })}>↺ volver a {moneda(precioAuto)}</button>
                </>
              ) : null}
            </span>
          </label>
          <label className="gs-campo">
            <span className="gs-label">IVA en la venta (Alegra)</span>
            <select value={n.con_iva ? 'si' : 'no'} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { con_iva: e.target.value === 'si' })}>
              <option value="si">Con IVA 19 %</option>
              <option value="no">Sin IVA</option>
            </select>
          </label>
        </div>
        <div className="gs-campo" style={{ marginTop: '10px' }}>
          <span className="gs-label">Precio distribuidor{obligatorio('distribuidor') ? ' * (decide uno)' : ''}</span>
          <div className="gs-segmentado">
            {[
              ['calcular', `Calcular (costo + ${regla.distribuidor ?? 40} %)`],
              ['manual', 'Lo pongo yo'],
              ['no_aplica', 'No aplica'],
            ].map(([v, t]) => (
              <button key={v} type="button" disabled={bloqueo} className={modoDist === v ? 'activo' : ''} onClick={() => cambiarNuevo(i, { modoDist: v })}>
                {t}
              </button>
            ))}
          </div>
          {modoDist === 'calcular' ? <span className="gs-ayuda">Distribuidor: <b>{moneda(precioDistAuto)}</b></span> : null}
          {modoDist === 'manual' ? (
            <input
              type="number"
              min="0"
              value={n.precio_distribuidor}
              disabled={bloqueo}
              placeholder="Precio distribuidor"
              className={falta.has('Distribuidor') ? 'gs-falta' : ''}
              onChange={(e) => cambiarNuevo(i, { precio_distribuidor: e.target.value })}
              style={{ marginTop: '6px', maxWidth: '240px' }}
            />
          ) : null}
          {modoDist === null ? <span className="gs-ayuda gs-txt-amarillo">Sin decidir.</span> : null}
        </div>
      </div>

      {/* 4 · Tienda */}
      <div className="gs-card">
        <Seccion n="4" titulo="Tienda" ok={!falta.has('Gamer')} falta={falta.has('Gamer') ? 'Gamer' : ''} />
        <div className="gs-campo">
          <span className="gs-label">
            🎮 ¿Es artículo gamer (Zona Gamer)?{obligatorio('gamer') ? ' *' : ''}
            {n.es_gamer === null ? <span className="gs-txt-cian"> · sugerido: {n.gamerSugerido ? 'Sí' : 'No'}</span> : null}
          </span>
          <div className="gs-segmentado">
            {[
              [true, 'Sí'],
              [false, 'No'],
            ].map(([v, t]) => (
              <button key={t} type="button" disabled={bloqueo} className={gamer === v ? 'activo' : ''} onClick={() => cambiarNuevo(i, { es_gamer: v })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-fila" style={{ marginTop: '10px' }}>
          <label className="gs-check">
            <input type="checkbox" checked={n.mostrar_en_tienda} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { mostrar_en_tienda: e.target.checked })} />
            <span>Mostrar en la tienda web</span>
          </label>
          <label className="gs-check">
            <input type="checkbox" checked={n.activo !== false} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { activo: e.target.checked })} />
            <span>Activo</span>
          </label>
        </div>
        <button type="button" className="gs-link" style={{ marginTop: '8px' }} onClick={() => setVerMas(!verMas)}>
          {verMas ? '▾ Menos' : '▸ Oferta, video y referencia'}
        </button>
        {verMas ? (
          <div className="gs-grid2" style={{ marginTop: '8px' }}>
            <label className="gs-campo">
              <span className="gs-label">Precio antes (oferta)</span>
              <input type="number" min="0" value={n.precio_anterior} placeholder="Vacío = sin oferta" disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { precio_anterior: e.target.value })} />
            </label>
            <label className="gs-campo">
              <span className="gs-label">Video de YouTube</span>
              <input value={n.video_youtube} placeholder="https://youtu.be/..." disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { video_youtube: e.target.value })} />
            </label>
            <label className="gs-campo">
              <span className="gs-label">Referencia (vacío = la siguiente automática)</span>
              <input value={n.referencia} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { referencia: e.target.value })} />
            </label>
          </div>
        ) : null}
      </div>

      {/* 5 · Fotos */}
      <div className="gs-card">
        <Seccion n="5" titulo="Fotos" ok={n.fotos.length > 0} falta={falta.has('Foto') ? 'Foto' : ''} />
        {n.fotos.length ? (
          <div className="gs-fotos">
            {n.fotos.map((r, k) => (
              <div key={r} className="gs-foto-caja">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotos[r]?.url}
                  alt=""
                  title="Clic para verla en grande"
                  onClick={() => verFoto(fotos[r]?.url)}
                  className={`gs-foto ${k === 0 ? 'portada' : ''}`}
                  style={{ opacity: l.fondoEnCurso === r ? 0.4 : 1 }}
                />
                <div className="gs-foto-tags">
                  {k === 0 ? <span className="gs-tag gs-tag-cian">Portada</span> : null}
                  {fotos[r]?.propia ? <span className="gs-tag">Tuya</span> : null}
                  {fotos[r]?.sinFondo ? <span className="gs-tag gs-tag-verde">Sin fondo</span> : null}
                  {fotos[r]?.recortada && !fotos[r]?.sinFondo ? <span className="gs-tag gs-tag-mag">Recortada</span> : null}
                </div>
                {!bloqueo ? (
                  <div className="gs-fila" style={{ gap: '8px', marginTop: '4px' }}>
                    {fotos[r]?.antes ? <button type="button" className="gs-link" onClick={() => deshacerFondo(i, r)}>Deshacer</button> : null}
                    {!fotos[r]?.sinFondo ? (
                      <button type="button" className="gs-link" disabled={!!l.fondoEnCurso} onClick={() => quitarFondoDeFoto(i, r)}>
                        {l.fondoEnCurso === r ? 'Quitando…' : '🪄 Sin fondo'}
                      </button>
                    ) : null}
                    {!fotos[r]?.recortada && !fotos[r]?.sinFondo ? (
                      <button type="button" className="gs-link" onClick={() => recortarFoto(i, r)}>✂️ Recortar</button>
                    ) : null}
                    {k > 0 ? (
                      <button type="button" className="gs-link" onClick={() => cambiarNuevo(i, { fotos: [r, ...n.fotos.filter((x) => x !== r)] })}>
                        Portada
                      </button>
                    ) : null}
                    <button type="button" className="gs-link gs-txt-rojo" onClick={() => cambiarNuevo(i, { fotos: n.fotos.filter((x) => x !== r) })}>
                      Quitar
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="gs-ayuda gs-txt-amarillo">Sin fotos todavía.</p>
        )}
        {!bloqueo ? (
          <div className="gs-fila" style={{ marginTop: '10px' }}>
            <input
              ref={inputPortada}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                agregarFotosPropias(i, e.target.files, true);
                e.target.value = '';
              }}
            />
            <input
              ref={inputExtra}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                agregarFotosPropias(i, e.target.files, false);
                e.target.value = '';
              }}
            />
            <button type="button" className="gs-btn gs-btn-chico" onClick={() => inputPortada.current?.click()}>📷 Subir mi foto de portada</button>
            <button type="button" className="gs-btn gs-btn-chico" onClick={() => inputExtra.current?.click()}>＋ Agregar fotos extra</button>
          </div>
        ) : null}
        {l.mensajeFondo ? <p className={`gs-ayuda ${/No se pudo/.test(l.mensajeFondo) ? 'gs-txt-rojo' : ''}`}>{l.mensajeFondo}</p> : null}
        {l.avisoFoto ? <p className="gs-ayuda gs-txt-rojo">{l.avisoFoto}</p> : null}
        {l.fotosFaltantes?.length ? <p className="gs-ayuda gs-txt-amarillo">No vinieron en el ZIP: {l.fotosFaltantes.join(', ')}</p> : null}
      </div>

      {/* 6 · Descripción y ficha */}
      <div className="gs-card">
        <Seccion
          n="6"
          titulo="Descripción y ficha técnica"
          ok={!falta.has('Descripción') && !falta.has('Ficha técnica')}
          falta={[falta.has('Descripción') ? 'Descripción' : '', falta.has('Ficha técnica') ? 'Ficha' : ''].filter(Boolean).join(' · ')}
        />
        <textarea
          value={n.descripcion}
          disabled={bloqueo}
          onChange={(e) => cambiarNuevo(i, { descripcion: e.target.value })}
          rows={7}
          maxLength={600}
          className={falta.has('Descripción') ? 'gs-falta' : ''}
          style={{ width: '100%' }}
        />
        <div className="gs-fila" style={{ alignItems: 'center', marginTop: '4px' }}>
          <span className={`gs-ayuda ${largoDesc < DESCRIPCION_MINIMA ? 'gs-txt-rojo' : 'gs-txt-verde'}`}>
            {n.descripcion.length}/600 · mínimo {DESCRIPCION_MINIMA}
          </span>
          {!bloqueo ? (
            <button type="button" className="gs-btn gs-btn-chico" disabled={l.ampliando} onClick={() => ampliarDescripcion(i)}>
              {l.ampliando ? 'Escribiendo…' : '✨ Escribir con IA'}
            </button>
          ) : null}
          {l.mensajeDescripcion ? <span className="gs-ayuda">{l.mensajeDescripcion}</span> : null}
        </div>

        <div className="gs-label" style={{ marginTop: '14px' }}>Ficha técnica{obligatorio('ficha') ? ' * (mínimo 3 datos)' : ''}</div>
        {!bloqueo && faltantesFicha.length ? (
          <div className="gs-plantilla">
            <div className="gs-ayuda" style={{ marginBottom: '6px' }}>
              Tipo detectado: <b>{plantilla.titulo}</b>. Campos recomendados que faltan{faltantesFicha.some((c) => c.clave) ? ' (los de * los usa el chat de la tienda)' : ''}:
            </div>
            <div className="gs-fila" style={{ gap: '6px' }}>
              {faltantesFicha.map((c) => (
                <button key={c.nombre} type="button" className={`gs-chip-btn ${c.clave ? 'clave' : ''}`} onClick={() => agregarFilas([c])}>
                  + {c.nombre}
                  {c.clave ? ' *' : ''}
                </button>
              ))}
              {faltantesFicha.length > 1 ? (
                <button type="button" className="gs-chip-btn" onClick={() => agregarFilas(faltantesFicha)}>Agregar los que faltan</button>
              ) : null}
            </div>
          </div>
        ) : null}
        {n.especificaciones.map((f, k) => (
          <div key={k} className="gs-fila-ficha">
            <input value={f.nombre} placeholder="Ej. Potencia" maxLength={60} disabled={bloqueo} onChange={(e) => cambiarFila(k, 'nombre', e.target.value)} />
            <input value={f.valor} placeholder="Ej. 20 W" maxLength={200} disabled={bloqueo} onChange={(e) => cambiarFila(k, 'valor', e.target.value)} />
            {!bloqueo ? (
              <button type="button" className="gs-btn gs-btn-chico gs-txt-rojo" title="Quitar fila" onClick={() => cambiarNuevo(i, { especificaciones: n.especificaciones.filter((_, j) => j !== k) })}>
                ✕
              </button>
            ) : null}
          </div>
        ))}
        {!bloqueo && n.especificaciones.length < 30 ? (
          <button type="button" className="gs-btn gs-btn-chico" style={{ marginTop: '6px' }} onClick={() => cambiarNuevo(i, { especificaciones: [...n.especificaciones, { nombre: '', valor: '' }] })}>
            + Agregar fila
          </button>
        ) : null}
      </div>

      {/* Navegación entre productos */}
      <div className="gs-nav-producto">
        <button type="button" className="gs-btn" disabled={posicion === 1} onClick={anterior}>← Producto anterior</button>
        <div className="gs-fila">
          <button type="button" className="gs-btn gs-btn-mag" onClick={siguientePendiente}>⏭ Siguiente pendiente</button>
          <button type="button" className="gs-btn gs-btn-pri" onClick={siguiente}>{posicion === total ? 'Ir a precios →' : 'Siguiente producto →'}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ PASO 4: PRECIOS ═══════════════════════════
function PasoPrecios({ nuevas, regla, costoNetoDe, precioVentaDe, precioAutoDe, modoDistDe, precioDistDe, precioDistAutoDe, cambiarNuevo, bloqueada }) {
  if (!nuevas.length) {
    return <div className="gs-card">No hay productos nuevos: los precios de los que ya existen no se cambian aquí.</div>;
  }
  return (
    <div className="gs-card">
      <Seccion n="$" titulo="Precios de los productos nuevos" />
      <p className="gs-ayuda" style={{ marginTop: 0 }}>
        Todo en una sola tabla para llenarlo de corrido. Costo POS = costo de la factura con la regla del proveedor ({regla.iva === 'sumar' ? 'con IVA sumado' : 'sin IVA'}).
      </p>
      <div className="gs-tabla-scroll">
        <table className="gs-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="der">Costo POS</th>
              <th>Venta *</th>
              <th className="der">Margen</th>
              <th>Distribuidor</th>
              <th>IVA venta</th>
            </tr>
          </thead>
          <tbody>
            {nuevas.map(({ l, i }) => {
              const bloqueo = !!l.creado || bloqueada;
              const costo = costoNetoDe(l);
              const pv = Number(precioVentaDe(l)) || 0;
              const margen = pv > 0 ? ((pv - costo) / pv) * 100 : null;
              const md = modoDistDe(l);
              return (
                <tr key={i}>
                  <td style={{ maxWidth: '260px' }}>
                    <div className="gs-item-nombre">{l.nuevo.nombre}</div>
                    <div className="gs-ayuda">{l.cantidad} und</div>
                  </td>
                  <td className="der">{moneda(costo)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={precioVentaDe(l) ?? ''}
                      disabled={bloqueo}
                      className={pv > 0 ? '' : 'gs-falta'}
                      onChange={(e) => cambiarNuevo(i, { precio_venta: e.target.value, precioEditado: true })}
                      style={{ width: '120px' }}
                    />
                    {precioAutoDe(l) && l.nuevo.precioEditado ? (
                      <button type="button" className="gs-link" onClick={() => cambiarNuevo(i, { precioEditado: false })}>↺</button>
                    ) : null}
                  </td>
                  <td className={`der ${margen !== null && margen < 15 ? 'gs-txt-rojo' : 'gs-txt-verde'}`}>{margen !== null ? `${margen.toFixed(0)} %` : '—'}</td>
                  <td>
                    <div className="gs-fila" style={{ gap: '6px', flexWrap: 'nowrap' }}>
                      <select value={md ?? ''} disabled={bloqueo} className={md === null ? 'gs-falta' : ''} onChange={(e) => cambiarNuevo(i, { modoDist: e.target.value || null })}>
                        <option value="">— Decidir —</option>
                        <option value="calcular">Costo + {regla.distribuidor ?? 40} %</option>
                        <option value="manual">A mano</option>
                        <option value="no_aplica">No aplica</option>
                      </select>
                      {md === 'manual' ? (
                        <input type="number" min="0" value={l.nuevo.precio_distribuidor} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { precio_distribuidor: e.target.value })} style={{ width: '110px' }} />
                      ) : md === 'calcular' ? (
                        <span className="gs-monto-chico">{moneda(precioDistAutoDe(l))}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <select value={l.nuevo.con_iva ? 'si' : 'no'} disabled={bloqueo} onChange={(e) => cambiarNuevo(i, { con_iva: e.target.value === 'si' })}>
                      <option value="si">Con IVA</option>
                      <option value="no">Sin IVA</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="gs-ayuda">Para todos a la vez: el precio distribuidor sugerido se cambia en el paso 1 (regla del proveedor).</p>
    </div>
  );
}

// ═══════════════════════ PASO 5: REVISAR Y APROBAR ═══════════════════════
function PasoRevisar({
  borrador,
  encabezado,
  proveedores,
  proveedorElegido,
  bodegas,
  nuevas,
  activas,
  conteo,
  categorias,
  subcategorias,
  faltantesDe,
  obligatorio,
  precioVentaDe,
  precioDistDe,
  modoDistDe,
  gamerDe,
  subtotal,
  retencionValor,
  comparaFactura,
  regla,
  duplicada,
  problemas,
  pasos,
  errorAprobar,
  aprobando,
  aprobar,
  irAProducto,
  irAPaso,
}) {
  const nombreProveedor =
    proveedorElegido === 'nuevo' ? `${borrador.proveedor.nombre} (nuevo)` : proveedores.find((p) => String(p.id) === String(proveedorElegido))?.nombre || '—';
  const bodega = bodegas.find((b) => String(b.id) === String(encabezado.bodega_id))?.nombre || '—';
  const celda = (texto, falta, i) =>
    falta ? (
      <td>
        <button type="button" className="gs-falta-celda" onClick={() => irAProducto(i)}>Falta</button>
      </td>
    ) : (
      <td>{texto}</td>
    );
  return (
    <div>
      <div className="gs-dos-iguales">
        <div className="gs-card">
          <Seccion n="1" titulo="Factura" />
          <div className="gs-resumen">
            <span>Proveedor</span>
            <b>{nombreProveedor}</b>
            <span>Número</span>
            <b>{encabezado.numero || '—'}</b>
            <span>Fecha</span>
            <b>{encabezado.fecha_creacion || '—'}</b>
            <span>Bodega</span>
            <b>{bodega}</b>
            <span>Líneas</span>
            <b>
              {activas.length} ({conteo.ok} existen · {conteo.nuevo} nuevas{conteo.omitir ? ` · ${conteo.omitir} sin guardar` : ''})
            </b>
          </div>
          <button type="button" className="gs-link" onClick={() => irAPaso(1)}>Editar factura</button>
          {duplicada ? <p className="gs-txt-rojo">⚠️ Ya existe una factura {duplicada.numero} de este proveedor.</p> : null}
        </div>
        <div className="gs-card">
          <Seccion n="$" titulo="Totales" />
          <div className="gs-resumen">
            <span>Subtotal ({regla.iva === 'sumar' ? 'costo con IVA' : 'sin tener en cuenta el IVA'})</span>
            <b className="gs-monto">{moneda(subtotal)}</b>
            {borrador.factura.total > 0 ? (
              <>
                <span>La factura dice</span>
                <b>{moneda(borrador.factura.total)} (subtotal {moneda(borrador.factura.subtotal)})</b>
              </>
            ) : null}
            {retencionValor > 0 ? (
              <>
                <span>Retención</span>
                <b className="gs-txt-rojo">-{moneda(retencionValor)}</b>
              </>
            ) : null}
          </div>
          {comparaFactura ? (
            <p className="gs-txt-amarillo">⚠️ La suma no cuadra con la factura ({comparaFactura.dif > 0 ? '+' : ''}{moneda(comparaFactura.dif)}). Revisa cantidades y costos.</p>
          ) : null}
        </div>
      </div>

      {nuevas.length ? (
        <div className="gs-card">
          <Seccion n="🆕" titulo="Productos nuevos — última revisión" />
          <div className="gs-tabla-scroll">
            <table className="gs-tabla">
              <thead>
                <tr>
                  <th></th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Subcat.</th>
                  <th className="der">Venta</th>
                  <th className="der">Distrib.</th>
                  <th>Gamer</th>
                  <th>Fotos</th>
                  <th>Descr.</th>
                  <th>Ficha</th>
                </tr>
              </thead>
              <tbody>
                {nuevas.map(({ l, i }) => {
                  const f = new Set(faltantesDe(l).obligatorios);
                  const listo = l.creado || l.creadoConFormulario;
                  const cat = categorias.find((c) => String(c.id) === String(l.nuevo.categoria_id))?.nombre;
                  const sub = subcategorias.find((x) => String(x.id) === String(l.nuevo.subcategoria_id))?.nombre;
                  const md = modoDistDe(l);
                  const g = gamerDe(l);
                  const filas = l.nuevo.especificaciones.filter((x) => String(x.nombre || '').trim() && String(x.valor || '').trim()).length;
                  return (
                    <tr key={i}>
                      <td><span className={`gs-sem gs-sem-${listo ? 'verde' : f.size ? 'rojo' : 'verde'}`} /></td>
                      <td style={{ maxWidth: '240px' }}>
                        <button type="button" className="gs-link" style={{ textAlign: 'left' }} onClick={() => irAProducto(i)}>{l.nuevo.nombre || `Línea ${l.linea}`}</button>
                      </td>
                      {celda(cat || '—', !listo && f.has('Categoría'), i)}
                      {celda(sub || '—', !listo && f.has('Subcategoría'), i)}
                      {celda(<span className="der">{moneda(precioVentaDe(l))}</span>, !listo && f.has('Precio de venta'), i)}
                      {celda(md === 'no_aplica' ? 'No aplica' : precioDistDe(l) ? moneda(precioDistDe(l)) : '—', !listo && f.has('Distribuidor'), i)}
                      {celda(g === null ? '—' : g ? 'Sí 🎮' : 'No', !listo && f.has('Gamer'), i)}
                      {celda(l.nuevo.fotos.length, !listo && f.has('Foto'), i)}
                      {celda(`${l.nuevo.descripcion.trim().length}`, !listo && f.has('Descripción'), i)}
                      {celda(filas, !listo && f.has('Ficha técnica'), i)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="gs-ayuda">“Falta” en rojo = obligatorio (⚙️ Campos obligatorios). Haz clic para ir directo a ese producto.</p>
        </div>
      ) : null}

      <div className="gs-card gs-aprobar">
        {problemas.length ? (
          <div className="gs-aviso">
            <strong>Antes de aprobar:</strong>
            <ul className="gs-lista">
              {problemas.slice(0, 12).map((p, k) => (
                <li key={k}>{p}</li>
              ))}
              {problemas.length > 12 ? <li>… y {problemas.length - 12} más</li> : null}
            </ul>
          </div>
        ) : (
          <p className="gs-txt-verde" style={{ marginTop: 0 }}>✓ Todo listo para aprobar.</p>
        )}
        {pasos.length ? (
          <ul className="gs-lista">
            {pasos.map((p, k) => (
              <li key={k} className={p.tipo === 'aviso' ? 'gs-txt-amarillo' : ''}>{p.texto}</li>
            ))}
          </ul>
        ) : null}
        {errorAprobar ? <p className="gs-txt-rojo">{errorAprobar}</p> : null}
        <button type="button" className="gs-btn gs-btn-pri gs-btn-grande" onClick={aprobar} disabled={aprobando}>
          {aprobando ? 'Guardando…' : `✅ Aprobar factura${nuevas.filter(({ l }) => !l.creado && !l.creadoConFormulario).length ? ` (crea ${nuevas.filter(({ l }) => !l.creado && !l.creadoConFormulario).length} productos)` : ''}`}
        </button>
        <p className="gs-ayuda">
          Al aprobar: se crean los productos nuevos (con fotos y en Alegra), se guarda la factura, se suma el inventario, el POS aprende los códigos del
          proveedor y se descarga el Excel de stickers.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════ ESTILO "PODER" ═══════════════════════════
// El mismo look oscuro de geekstore.com.co (neón cian y magenta, letras
// Chakra Petch y Barlow). Solo aplica dentro del asistente (.gs).
function EstiloPoder() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&display=swap');
      .gs {
        --negro:#06080E; --panel:#0B0F1A; --panel2:#0F1626; --linea:#1A2236; --linea2:#2A3550;
        --cian:#19C3FF; --cian2:#7FE3FF; --mag:#FF2E88; --mag2:#FF6FAE; --gris:#A3AEC2; --gris2:#7C89A3;
        --verde:#2EE59D; --amarillo:#FFC24B; --rojo:#FF5470;
        background: radial-gradient(1200px 500px at 85% -10%, rgba(25,195,255,.10), transparent 60%),
                    radial-gradient(900px 400px at -10% 10%, rgba(255,46,136,.08), transparent 60%), var(--negro);
        color:#E8EEF8; font-family:'Barlow', system-ui, sans-serif; font-size:15px;
        margin:-24px; padding:22px 24px 40px; min-height:calc(100vh - 56px);
      }
      @media (max-width:640px){ .gs{ margin:-12px; padding:14px 12px 30px; } }
      .gs *{ box-sizing:border-box; }
      .gs input, .gs select, .gs textarea {
        background:var(--panel2); color:#E8EEF8; border:1px solid var(--linea2); border-radius:10px;
        padding:9px 11px; font:inherit; font-size:14px; outline:none; max-width:100%;
      }
      .gs textarea{ font-family:inherit; resize:vertical; }
      .gs input:focus, .gs select:focus, .gs textarea:focus{ border-color:var(--cian); box-shadow:0 0 0 3px rgba(25,195,255,.18); }
      .gs input:disabled, .gs select:disabled, .gs textarea:disabled{ opacity:.55; }
      .gs input::placeholder, .gs textarea::placeholder{ color:var(--gris2); }
      .gs option{ background:var(--panel2); color:#E8EEF8; }
      .gs input[type=checkbox]{ accent-color:var(--cian); width:17px; height:17px; padding:0; }
      .gs input[type=date]{ color-scheme:dark; }
      .gs a{ color:inherit; }
      .gs .gs-falta{ border-color:var(--rojo) !important; box-shadow:0 0 0 3px rgba(255,84,112,.15); }

      .gs-eyebrow{ font-family:'Chakra Petch',sans-serif; font-weight:600; letter-spacing:.2em; font-size:11.5px; color:var(--cian2); text-transform:uppercase; display:flex; align-items:center; gap:8px; }
      .gs-eyebrow::before{ content:''; width:20px; height:3px; background:var(--mag); box-shadow:0 0 10px rgba(255,46,136,.6); border-radius:2px; }
      .gs-h1{ font-family:'Chakra Petch',sans-serif; font-style:italic; text-transform:uppercase; font-weight:700; font-size:clamp(24px,3.4vw,36px); margin:4px 0 0; letter-spacing:-.005em; }
      .gs-h2{ font-family:'Chakra Petch',sans-serif; font-weight:700; font-size:24px; margin:4px 0 6px; color:#fff; }
      .gs-cabecera{ display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
      .gs-fila{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .gs-ayuda{ font-size:12.5px; color:var(--gris); display:block; margin-top:3px; }
      .gs-label{ font-size:12px; color:var(--gris); margin-bottom:4px; letter-spacing:.02em; }
      .gs-campo{ display:flex; flex-direction:column; min-width:0; }
      .gs-check{ display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; padding:4px 0; }
      .gs-txt-rojo{ color:var(--rojo) !important; } .gs-txt-verde{ color:var(--verde) !important; } .gs-txt-amarillo{ color:var(--amarillo) !important; } .gs-txt-cian{ color:var(--cian2) !important; }
      .gs-lista{ margin:6px 0 0; padding-left:18px; font-size:14px; line-height:1.55; }

      .gs-card{ background:linear-gradient(180deg, rgba(15,22,38,.92), rgba(11,15,26,.92)); border:1px solid var(--linea); border-radius:16px; padding:16px; margin-bottom:12px; }
      .gs-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .gs-grid1{ display:grid; gap:12px; }
      .gs-dos-iguales{ display:grid; grid-template-columns:1.4fr 1fr; gap:12px; align-items:start; }
      .gs-dos{ display:grid; grid-template-columns:300px 1fr; gap:14px; align-items:start; }
      @media (max-width:900px){ .gs-dos, .gs-dos-iguales{ grid-template-columns:1fr; } }
      @media (max-width:640px){ .gs-grid2{ grid-template-columns:1fr; } }

      .gs-btn{ display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:9px 15px; border-radius:10px; border:1px solid var(--linea2);
        background:var(--panel2); color:#E8EEF8; cursor:pointer; text-decoration:none; font-family:'Chakra Petch',sans-serif; font-weight:600; font-size:14px; letter-spacing:.02em; }
      .gs-btn:hover{ border-color:var(--cian); }
      .gs-btn:disabled{ opacity:.45; cursor:not-allowed; }
      .gs-btn-pri{ background:linear-gradient(90deg, var(--cian), #0E8FC2); border-color:transparent; color:#04121C; box-shadow:0 0 18px rgba(25,195,255,.35); }
      .gs-btn-pri:hover{ box-shadow:0 0 26px rgba(25,195,255,.55); }
      .gs-btn-mag{ background:rgba(255,46,136,.12); border-color:rgba(255,46,136,.6); color:#FFD3E5; }
      .gs-btn-amarillo{ border-color:rgba(255,194,75,.6); background:rgba(255,194,75,.08); text-align:left; }
      .gs-btn-chico{ padding:6px 11px; font-size:12.5px; border-radius:8px; }
      .gs-btn-grande{ padding:14px 26px; font-size:17px; margin-top:6px; }
      .gs-link{ background:none; border:none; padding:0; color:var(--cian2); cursor:pointer; font:inherit; font-size:12.5px; font-weight:600; }
      .gs-link:disabled{ opacity:.5; }

      .gs-chip{ display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid var(--linea2); background:rgba(255,255,255,.04); white-space:nowrap; }
      .gs-chip-rojo{ color:#FFC2CD; border-color:rgba(255,84,112,.55); background:rgba(255,84,112,.12); }
      .gs-chip-amarillo{ color:#FFE3A8; border-color:rgba(255,194,75,.5); background:rgba(255,194,75,.1); }
      .gs-chip-verde{ color:#B6F7DC; border-color:rgba(46,229,157,.5); background:rgba(46,229,157,.1); }
      .gs-chip-azul{ color:var(--cian2); border-color:rgba(25,195,255,.5); background:rgba(25,195,255,.1); }
      .gs-chips{ display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
      .gs-chip-btn{ padding:4px 10px; border-radius:999px; border:1px solid var(--linea2); background:var(--panel2); color:#E8EEF8; cursor:pointer; font-size:12px; }
      .gs-chip-btn.clave{ border-color:var(--cian); color:var(--cian2); font-weight:700; }
      .gs-codigo{ margin-left:8px; padding:1px 8px; border-radius:6px; background:rgba(25,195,255,.1); color:var(--cian2); font-size:12px; font-family:'Chakra Petch',sans-serif; }
      .gs-tag{ font-size:10.5px; padding:1px 6px; border-radius:5px; background:rgba(255,255,255,.12); font-weight:700; }
      .gs-tag-cian{ background:var(--cian); color:#04121C; } .gs-tag-verde{ background:var(--verde); color:#04121C; } .gs-tag-mag{ background:var(--mag); color:#fff; }

      .gs-aviso{ background:rgba(255,194,75,.08); border:1px solid rgba(255,194,75,.4); color:#FFE3A8; padding:10px 12px; border-radius:12px; margin-bottom:12px; font-size:14px; }
      .gs-aviso-azul{ background:rgba(25,195,255,.08); border-color:rgba(25,195,255,.4); color:var(--cian2); }

      .gs-inicio{ display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; max-width:760px; }
      .gs-opcion{ display:flex; flex-direction:column; align-items:flex-start; gap:4px; text-align:left; padding:22px; border-radius:18px; cursor:pointer; color:#E8EEF8;
        border:1px solid var(--linea2); background:linear-gradient(160deg, rgba(25,195,255,.08), rgba(255,46,136,.06)); font:inherit; }
      .gs-opcion:hover{ border-color:var(--cian); box-shadow:0 0 24px rgba(25,195,255,.25); }
      .gs-opcion-icono{ font-size:30px; }
      .gs-opcion-titulo{ font-family:'Chakra Petch',sans-serif; font-weight:700; font-size:20px; text-transform:uppercase; font-style:italic; }

      .gs-pasos{ display:flex; gap:8px; margin-bottom:14px; overflow-x:auto; padding-bottom:4px; }
      .gs-paso{ display:flex; align-items:center; gap:8px; padding:9px 14px; border-radius:12px; border:1px solid var(--linea); background:var(--panel); color:var(--gris);
        cursor:pointer; white-space:nowrap; font-family:'Chakra Petch',sans-serif; font-weight:600; font-size:14px; position:relative; flex:1 0 auto; }
      .gs-paso-num{ width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--linea2); font-size:12.5px; }
      .gs-paso.activo{ border-color:var(--cian); color:#fff; box-shadow:0 0 18px rgba(25,195,255,.25), inset 0 -3px 0 var(--mag); }
      .gs-paso.activo .gs-paso-num{ background:var(--cian); color:#04121C; border-color:var(--cian); }
      .gs-paso.hecho{ color:var(--verde); } .gs-paso.hecho .gs-paso-num{ border-color:var(--verde); }
      .gs-paso.pendiente .gs-paso-num{ border-color:var(--amarillo); color:var(--amarillo); }
      .gs-paso-badge{ background:var(--mag); color:#fff; font-size:11px; border-radius:999px; padding:0 7px; margin-left:2px; }

      .gs-seccion{ display:flex; align-items:center; gap:10px; margin-bottom:12px; }
      .gs-seccion-num{ width:28px; height:28px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-family:'Chakra Petch',sans-serif; font-weight:700;
        background:rgba(25,195,255,.12); color:var(--cian2); border:1px solid rgba(25,195,255,.4); font-size:13px; }
      .gs-seccion-num.ok{ background:rgba(46,229,157,.15); color:var(--verde); border-color:rgba(46,229,157,.5); }
      .gs-seccion-num.falta{ background:rgba(255,84,112,.15); color:var(--rojo); border-color:rgba(255,84,112,.5); }
      .gs-seccion-titulo{ font-family:'Chakra Petch',sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:14.5px; }

      .gs-linea{ border-left:4px solid var(--linea2); }
      .gs-linea-ok{ border-left-color:var(--verde); } .gs-linea-revisar{ border-left-color:var(--amarillo); } .gs-linea-nuevo{ border-left-color:var(--cian); } .gs-linea-omitir{ opacity:.55; }
      .gs-linea-top{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .gs-linea-titulo{ font-family:'Chakra Petch',sans-serif; font-weight:700; font-size:15px; }
      .gs-monto{ font-family:'Chakra Petch',sans-serif; font-weight:700; font-size:17px; color:#fff; }
      .gs-monto-chico{ font-family:'Chakra Petch',sans-serif; font-weight:700; white-space:nowrap; }
      .gs-dropdown{ position:absolute; left:16px; right:16px; top:calc(100% - 26px); background:var(--panel2); border:1px solid var(--linea2); border-radius:12px; z-index:30; max-height:280px; overflow-y:auto; box-shadow:0 12px 30px rgba(0,0,0,.5); }
      .gs-opcion-lista{ padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--linea); font-size:14px; }
      .gs-opcion-lista:hover{ background:rgba(25,195,255,.08); }

      .gs-lista-nuevos{ position:sticky; top:12px; background:var(--panel); border:1px solid var(--linea); border-radius:16px; padding:12px; max-height:calc(100vh - 120px); overflow-y:auto; }
      @media (max-width:900px){ .gs-lista-nuevos{ position:static; max-height:none; } }
      .gs-item{ display:flex; gap:10px; align-items:flex-start; width:100%; text-align:left; padding:10px; border-radius:12px; border:1px solid transparent; background:none; color:#E8EEF8; cursor:pointer; font:inherit; margin-bottom:4px; }
      .gs-item:hover{ background:rgba(255,255,255,.03); }
      .gs-item.activo{ border-color:var(--cian); background:rgba(25,195,255,.07); }
      .gs-item-nombre{ display:block; font-weight:600; font-size:14px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; }
      .gs-sem{ display:inline-block; width:11px; height:11px; border-radius:50%; flex:0 0 11px; margin-top:4px; }
      .gs-sem-rojo{ background:var(--rojo); box-shadow:0 0 10px var(--rojo); } .gs-sem-amarillo{ background:var(--amarillo); box-shadow:0 0 10px var(--amarillo); } .gs-sem-verde{ background:var(--verde); box-shadow:0 0 10px var(--verde); }

      .gs-editor-cabeza{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; border-color:rgba(25,195,255,.35); }
      .gs-ia{ border:1px solid rgba(255,46,136,.35); background:rgba(255,46,136,.05); border-radius:12px; padding:12px; margin-top:12px; }
      .gs-ia-titulo{ font-family:'Chakra Petch',sans-serif; font-weight:700; margin-bottom:8px; color:var(--mag2); }
      .gs-segmentado{ display:inline-flex; align-self:flex-start; border:1px solid var(--linea2); border-radius:10px; overflow:hidden; flex-wrap:wrap; max-width:100%; }
      .gs-segmentado button{ background:var(--panel2); color:var(--gris); border:none; border-right:1px solid var(--linea2); padding:8px 14px; cursor:pointer; font:inherit; font-size:13.5px; font-weight:600; }
      .gs-segmentado button:last-child{ border-right:none; }
      .gs-segmentado button.activo{ background:var(--cian); color:#04121C; }
      .gs-fotos{ display:flex; gap:12px; flex-wrap:wrap; }
      .gs-foto-caja{ position:relative; width:170px; }
      .gs-foto{ width:170px; height:170px; object-fit:contain; background:#fff; border-radius:12px; border:1px solid var(--linea2); display:block; cursor:zoom-in; }
      .gs-foto.portada{ outline:3px solid var(--cian); box-shadow:0 0 18px rgba(25,195,255,.4); }
      .gs-foto-mini{ width:112px; height:112px; }
      .gs-foto-tags{ position:absolute; top:6px; left:6px; right:6px; display:flex; gap:4px; flex-wrap:wrap; }
      .gs-plantilla{ border:1px dashed var(--linea2); border-radius:10px; padding:10px; margin:6px 0 10px; }
      .gs-fila-ficha{ display:flex; gap:6px; margin-bottom:6px; align-items:center; }
      .gs-fila-ficha input:first-child{ flex:0 0 38%; min-width:0; } .gs-fila-ficha input:nth-child(2){ flex:1; min-width:0; }
      .gs-nav-producto{ display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin:4px 0 16px; }

      .gs-tabla-scroll{ overflow-x:auto; }
      .gs-tabla{ width:100%; border-collapse:collapse; font-size:14px; }
      .gs-tabla th{ text-align:left; font-family:'Chakra Petch',sans-serif; font-weight:600; color:var(--gris); font-size:12px; text-transform:uppercase; letter-spacing:.06em; padding:8px; border-bottom:1px solid var(--linea2); white-space:nowrap; }
      .gs-tabla td{ padding:8px; border-bottom:1px solid var(--linea); vertical-align:middle; }
      .gs-tabla .der{ text-align:right; }
      .gs-falta-celda{ background:rgba(255,84,112,.15); color:#FFC2CD; border:1px solid rgba(255,84,112,.55); border-radius:8px; padding:3px 9px; font-weight:700; font-size:12px; cursor:pointer; }
      .gs-resumen{ display:grid; grid-template-columns:auto 1fr; gap:6px 14px; font-size:14px; margin-bottom:8px; }
      .gs-resumen span{ color:var(--gris); }
      .gs-aprobar{ border-color:rgba(25,195,255,.35); }
      .gs-nav{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px; padding-top:12px; border-top:1px solid var(--linea); }

      .gs-overlay{ position:fixed; inset:0; background:rgba(3,5,10,.82); z-index:250; display:flex; align-items:center; justify-content:center; padding:16px; cursor:zoom-out; }
      .gs-foto-grande{ max-width:min(92vw, 900px); max-height:88vh; object-fit:contain; background:#fff; border-radius:14px; box-shadow:0 0 40px rgba(25,195,255,.35); }
      .gs-modal{ max-width:520px; width:100%; }
    `}</style>
  );
}
