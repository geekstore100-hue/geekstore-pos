'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../../../../components/Shell';
import { abrirZip, buscarEnZip } from '../../../../lib/leerZip';
import {
  validarBorrador,
  emparejarLinea,
  costoParaPos,
  categoriaParecida,
  proveedorParecido,
  codigoParaAprender,
  sinTildes,
} from '../../../../lib/borradorFactura';
import { descargarExcelEtiquetas } from '../../../../lib/etiquetasOpenLabel';

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
  const [costoConIva, setCostoConIva] = useState(false);

  const [aprobando, setAprobando] = useState(false);
  const [pasos, setPasos] = useState([]);
  const [errorAprobar, setErrorAprobar] = useState('');
  const [resultado, setResultado] = useState(null);
  const progreso = useRef({ proveedorId: null, facturaId: null, siguienteRef: null });
  const inputArchivo = useRef(null);

  useEffect(() => {
    async function cargar() {
      try {
        const [p, pr, b, c, f] = await Promise.all([
          pedirJson('/api/productos'),
          pedirJson('/api/proveedores'),
          pedirJson('/api/bodegas'),
          pedirJson('/api/categorias'),
          pedirJson('/api/facturas-compra'),
        ]);
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

  function lineaDesdeItem(item, cruce, fotosZip) {
    const p = item.producto;
    const cat = p ? categoriaParecida(p.categoria, categorias) : null;
    const rutas = (p?.fotos || []).filter((r) => fotosZip[r]);
    return {
      ...item,
      cruce,
      accion: cruce.estado === 'ok' ? 'existente' : cruce.estado === 'nuevo' ? 'nuevo' : null,
      producto_id: cruce.producto_id,
      fotosFaltantes: (p?.fotos || []).filter((r) => !fotosZip[r]),
      nuevo: {
        nombre: p?.nombre || item.descripcion_factura || item.modelo || '',
        categoria_id: cat ? String(cat.id) : '',
        categoriaSugerida: p?.categoria || '',
        descripcion: p?.descripcion || '',
        especificaciones: p?.especificaciones || [],
        precio_venta: p?.precio_venta_sugerido ? String(Math.round(p.precio_venta_sugerido)) : '',
        precio_distribuidor: '',
        con_iva: item.iva_porcentaje > 0,
        mostrar_en_tienda: true,
        fotos: rutas,
        fuente: p?.fuente || { tipo: 'factura', detalle: '', url: '' },
      },
      creado: null, // { id, referencia } cuando ya se creó al aprobar
      fotosListas: false,
      alegraListo: false,
      avisos: [],
    };
  }

  async function prepararBorrador(b, fotosZip) {
    Object.values(fotos).forEach((f) => URL.revokeObjectURL(f.url));
    const prov = proveedorParecido(b.proveedor, proveedores);
    const provId = prov ? String(prov.id) : 'nuevo';
    const ap = await cargarAprendidos(provId);
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
  }

  // Si Nelson cambia el proveedor, se vuelve a cruzar con lo aprendido de ese
  // proveedor (sin tocar las líneas que ya decidió a mano).
  async function cambiarProveedor(id) {
    setProveedorElegido(id);
    const ap = await cargarAprendidos(id);
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

  // ─── Cálculos y validaciones ────────────────────────────────────────
  const activas = lineas.filter((l) => l.accion !== 'omitir');
  const conteo = {
    ok: lineas.filter((l) => l.accion === 'existente').length,
    revisar: lineas.filter((l) => !l.accion).length,
    nuevo: lineas.filter((l) => l.accion === 'nuevo').length,
    omitir: lineas.filter((l) => l.accion === 'omitir').length,
  };
  const costoLinea = (l) => costoParaPos(l, { costoConIva });
  const subtotalLinea = (l) => costoLinea(l) * (Number(l.cantidad) || 0) * (1 - (Number(l.descuento_porcentaje) || 0) / 100);
  const subtotal = activas.reduce((a, l) => a + subtotalLinea(l), 0);
  const retencionValor = (Number(encabezado?.retencion_base) || 0) * ((Number(encabezado?.retencion_porcentaje) || 0) / 100);

  const comparaFactura = useMemo(() => {
    if (!borrador) return null;
    const ref = costoConIva ? borrador.factura.total : borrador.factura.subtotal;
    if (!(ref > 0) || conteo.omitir) return null;
    const dif = subtotal - ref;
    return Math.abs(dif) > Math.max(100, ref * 0.005) ? { ref, dif } : null;
  }, [borrador, costoConIva, subtotal, conteo.omitir]);

  const proveedorIdNum = proveedorElegido && proveedorElegido !== 'nuevo' ? Number(proveedorElegido) : progreso.current.proveedorId;
  const duplicada = useMemo(() => {
    const n = sinTildes(encabezado?.numero || '').replace(/\W/g, '').toLowerCase();
    if (!n || !proveedorIdNum) return null;
    return facturas.find((f) => Number(f.proveedor_id) === Number(proveedorIdNum) && sinTildes(f.numero || '').replace(/\W/g, '').toLowerCase() === n) || null;
  }, [facturas, encabezado?.numero, proveedorIdNum]);

  function problemas() {
    const lista = [];
    if (!proveedorElegido) lista.push('Elige el proveedor.');
    if (proveedorElegido === 'nuevo' && !borrador?.proveedor?.nombre) lista.push('El borrador no trae el nombre del proveedor: elige uno de la lista.');
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
        if (!l.nuevo.nombre.trim()) lista.push(`${n}: escribe el nombre del producto nuevo.`);
        if (!(Number(l.nuevo.precio_venta) > 0)) lista.push(`${n}: pon el precio de venta del producto nuevo.`);
        if (l.nuevo.descripcion.length > 600) lista.push(`${n}: la descripción pasa de 600 letras.`);
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
          body: JSON.stringify(borrador.proveedor),
        });
        if (!r.ok) throw new Error(`No se pudo crear el proveedor: ${r.error}`);
        proveedorId = Number(r.proveedor.id);
        progreso.current.proveedorId = proveedorId;
        setProveedores((ps) => [...ps, r.proveedor]);
        anotar(`Proveedor creado: ${r.proveedor.nombre}`);
      }

      // 2) Productos nuevos (con fotos y en Alegra)
      for (const l of ls) {
        if (l.accion !== 'nuevo') continue;
        if (!l.creado) {
          let creado = null;
          for (let intento = 0; intento < 4 && !creado; intento++) {
            const referencia = await siguienteReferencia();
            const r = await pedirJson('/api/productos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                referencia,
                nombre: l.nuevo.nombre.trim(),
                descripcion: l.nuevo.descripcion.trim() || null,
                categoria_id: l.nuevo.categoria_id ? Number(l.nuevo.categoria_id) : null,
                subcategoria_id: null,
                precio_venta: Number(l.nuevo.precio_venta),
                precio_costo: Math.round(costoLinea(l) * (1 - (Number(l.descuento_porcentaje) || 0) / 100) * 100) / 100,
                precio_distribuidor: Number(l.nuevo.precio_distribuidor) || null,
                activo: true,
                es_inventariable: true,
                mostrar_en_tienda: l.nuevo.mostrar_en_tienda,
                es_gamer: false,
                especificaciones: l.nuevo.especificaciones,
              }),
            });
            if (r.ok) creado = { id: Number(r.producto.id), referencia };
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
        .filter((l) => l.accion !== 'omitir' && l.producto_id)
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
        if (l.creado) return { referencia: l.creado.referencia, nombre: l.nuevo.nombre, cantidad: l.cantidad, precio_venta: l.nuevo.precio_venta };
        const p = productosPorId.get(Number(l.producto_id));
        return { referencia: p?.referencia, nombre: p?.nombre, cantidad: l.cantidad, precio_venta: p?.precio_venta };
      });
  }
  function nombreExcel() {
    const n = encabezado?.numero ? String(encabezado.numero).replace(/[^\w-]+/g, '_') : progreso.current.facturaId;
    return `etiquetas_openlabel_compra_${n}.xlsx`;
  }

  // ─── Pantalla ───────────────────────────────────────────────────────
  if (resultado) {
    return (
      <Shell title="Importar borrador">
        <div style={s.card}>
          <h2 style={{ marginTop: 0 }}>✅ Factura de compra guardada</h2>
          <ul style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '14px' }}>
            {pasos.map((p, i) => (
              <li key={i} style={{ color: p.tipo === 'aviso' ? '#b54708' : 'inherit' }}>{p.texto}</li>
            ))}
          </ul>
          {resultado.avisos.length ? (
            <div style={s.avisoCaja}>
              <strong>Pendiente por revisar:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {resultado.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
            <a href="/gastos/facturas-compra" style={s.btnPrimario}>Ver facturas de compra</a>
            <a href={`/gastos/facturas-compra/${resultado.facturaId}/imprimir`} target="_blank" rel="noopener noreferrer" style={s.btn}>🖨️ Imprimir</a>
            <button type="button" style={s.btn} onClick={() => descargarExcelEtiquetas(resultado.etiquetas, nombreExcel())}>🏷️ Stickers otra vez</button>
            <button
              type="button"
              style={s.btn}
              onClick={() => {
                setResultado(null);
                setBorrador(null);
                setLineas([]);
                setPasos([]);
              }}
            >
              Importar otro
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Importar borrador">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <h2 style={{ margin: 0 }}>📥 Importar borrador de factura</h2>
        <a href="/gastos/facturas-compra" style={s.btn}>← Facturas de compra</a>
      </div>

      <div style={s.card}>
        <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
          Sube el <strong>ZIP</strong> que te preparó Claude a partir de la foto de la factura (trae <code>factura.json</code> y las fotos). Nada se
          guarda hasta que revises y le des <strong>Aprobar</strong>.
        </p>
        <input ref={inputArchivo} type="file" accept=".zip,.json,application/zip,application/json" onChange={abrirArchivo} style={{ display: 'none' }} />
        <button type="button" style={s.btnPrimario} disabled={cargandoBase || abriendo || aprobando} onClick={() => inputArchivo.current?.click()}>
          {cargandoBase ? 'Cargando productos…' : abriendo ? 'Abriendo…' : borrador ? 'Abrir otro archivo' : 'Elegir archivo ZIP'}
        </button>
        {nombreArchivo && borrador ? <span style={{ marginLeft: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>{nombreArchivo}</span> : null}
        {errorArchivo ? <p style={{ color: 'var(--danger)', margin: '10px 0 0' }}>{errorArchivo}</p> : null}
      </div>

      {borrador && encabezado ? (
        <>
          {borrador.prueba ? (
            <div style={{ ...s.avisoCaja, background: '#eef4ff', borderColor: '#b2ccff', color: '#1d3a8a' }}>
              🧪 <strong>Borrador de PRUEBA</strong>: la factura es inventada. Si lo apruebas, se guarda de verdad (crea productos, factura e inventario).
            </div>
          ) : null}
          {borrador.avisos.length ? (
            <div style={s.avisoCaja}>
              <strong>Claude avisa:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {borrador.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Encabezado de la factura */}
          <div style={s.card}>
            <h3 style={{ marginTop: 0 }}>Factura</h3>
            <div className="pos-grid2" style={s.grid}>
              <label style={s.campo}>
                <span style={s.etiqueta}>Proveedor</span>
                <select value={proveedorElegido} onChange={(e) => cambiarProveedor(e.target.value)} style={s.input} disabled={aprobando || !!progreso.current.proveedorId}>
                  <option value="">— Elegir —</option>
                  {borrador.proveedor.nombre && !progreso.current.proveedorId ? (
                    <option value="nuevo">＋ Crear nuevo: {borrador.proveedor.nombre}{borrador.proveedor.identificacion ? ` (${borrador.proveedor.identificacion})` : ''}</option>
                  ) : null}
                  {proveedores.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nombre}{p.identificacion ? ` — ${p.identificacion}` : ''}
                    </option>
                  ))}
                </select>
                {borrador.proveedor.nombre ? (
                  <span style={s.ayuda}>En la factura: {borrador.proveedor.nombre}{borrador.proveedor.identificacion ? ` · NIT ${borrador.proveedor.identificacion}` : ''}</span>
                ) : null}
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Número de factura</span>
                <input value={encabezado.numero} onChange={(e) => setEncabezado({ ...encabezado, numero: e.target.value })} style={s.input} />
                {duplicada ? <span style={{ ...s.ayuda, color: 'var(--danger)' }}>⚠️ Ya existe una factura con ese número de este proveedor.</span> : null}
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Fecha</span>
                <input type="date" value={encabezado.fecha_creacion} onChange={(e) => setEncabezado({ ...encabezado, fecha_creacion: e.target.value })} style={s.input} />
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Vence</span>
                <input type="date" value={encabezado.fecha_vencimiento} onChange={(e) => setEncabezado({ ...encabezado, fecha_vencimiento: e.target.value })} style={s.input} />
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Bodega que recibe</span>
                <select value={encabezado.bodega_id} onChange={(e) => setEncabezado({ ...encabezado, bodega_id: e.target.value })} style={s.input}>
                  <option value="">— Elegir —</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Costo que se guarda en el POS</span>
                <select value={costoConIva ? 'con' : 'sin'} onChange={(e) => setCostoConIva(e.target.value === 'con')} style={s.input}>
                  <option value="sin">Sin IVA (el IVA se descuenta)</option>
                  <option value="con">Con IVA incluido</option>
                </select>
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Retención</span>
                <select value={encabezado.retencion_porcentaje} onChange={(e) => setEncabezado({ ...encabezado, retencion_porcentaje: Number(e.target.value) })} style={s.input}>
                  {TARIFAS_RETEICA.map(([v, t]) => (
                    <option key={v} value={v}>{t}</option>
                  ))}
                </select>
              </label>
              {Number(encabezado.retencion_porcentaje) > 0 ? (
                <label style={s.campo}>
                  <span style={s.etiqueta}>Base de la retención</span>
                  <input type="number" value={encabezado.retencion_base} onChange={(e) => setEncabezado({ ...encabezado, retencion_base: e.target.value })} style={s.input} />
                </label>
              ) : null}
            </div>
            <label style={{ ...s.campo, marginTop: '10px' }}>
              <span style={s.etiqueta}>Notas</span>
              <input value={encabezado.notas} onChange={(e) => setEncabezado({ ...encabezado, notas: e.target.value })} style={s.input} />
            </label>
          </div>

          {/* Resumen */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 12px' }}>
            <span style={{ ...s.chip, background: '#ecfdf3', color: '#067647' }}>✅ {conteo.ok} ya existen</span>
            <span style={{ ...s.chip, background: '#fffaeb', color: '#b54708' }}>⚠️ {conteo.revisar} por elegir</span>
            <span style={{ ...s.chip, background: '#eef4ff', color: '#3538cd' }}>🆕 {conteo.nuevo} nuevos</span>
            {conteo.omitir ? <span style={{ ...s.chip, background: '#f2f4f7', color: '#475467' }}>⏭️ {conteo.omitir} omitidas</span> : null}
          </div>

          {lineas.map((l, i) => (
            <Linea
              key={i}
              l={l}
              i={i}
              productos={productos}
              productosPorId={productosPorId}
              categorias={categorias}
              fotos={fotos}
              costo={costoLinea(l)}
              subtotal={subtotalLinea(l)}
              bloqueada={aprobando}
              cambiarLinea={cambiarLinea}
              cambiarNuevo={cambiarNuevo}
              agregarFotosPropias={agregarFotosPropias}
            />
          ))}

          {/* Totales y aprobar */}
          <div style={s.card}>
            <div style={s.filaTotal}>
              <span>Subtotal ({activas.length} línea{activas.length === 1 ? '' : 's'}, costo {costoConIva ? 'con' : 'sin'} IVA)</span>
              <strong>{moneda(subtotal)}</strong>
            </div>
            {borrador.factura.total > 0 ? (
              <div style={{ ...s.filaTotal, color: 'var(--text-secondary)', fontSize: '13px' }}>
                <span>La factura dice: subtotal {moneda(borrador.factura.subtotal)} · IVA {moneda(borrador.factura.iva)} · total {moneda(borrador.factura.total)}</span>
              </div>
            ) : null}
            {comparaFactura ? (
              <p style={{ color: '#b54708', fontSize: '13px', margin: '4px 0' }}>
                ⚠️ La suma de las líneas no cuadra con la factura ({comparaFactura.dif > 0 ? '+' : ''}{moneda(comparaFactura.dif)}). Revisa cantidades y costos.
              </p>
            ) : null}
            {retencionValor > 0 ? (
              <div style={s.filaTotal}>
                <span>Retención</span>
                <span style={{ color: 'var(--danger)' }}>-{moneda(retencionValor)}</span>
              </div>
            ) : null}

            {pasos.length ? (
              <ul style={{ margin: '10px 0', paddingLeft: '18px', fontSize: '13px' }}>
                {pasos.map((p, k) => (
                  <li key={k} style={{ color: p.tipo === 'aviso' ? '#b54708' : 'inherit' }}>{p.texto}</li>
                ))}
              </ul>
            ) : null}
            {errorAprobar ? <p style={{ color: 'var(--danger)', fontSize: '14px' }}>{errorAprobar}</p> : null}

            <button type="button" onClick={aprobar} disabled={aprobando} style={{ ...s.btnPrimario, marginTop: '10px', fontSize: '16px', padding: '12px 22px' }}>
              {aprobando ? 'Guardando…' : `✅ Aprobar${conteo.nuevo ? ` (crea ${conteo.nuevo} producto${conteo.nuevo === 1 ? '' : 's'})` : ''}`}
            </button>
            <p style={{ ...s.ayuda, marginTop: '8px' }}>
              Al aprobar: se crean los productos nuevos (con sus fotos y en Alegra), se guarda la factura, se suma el inventario a la bodega elegida, el POS
              aprende los códigos de este proveedor y se descarga el Excel de stickers.
            </p>
          </div>
        </>
      ) : null}
    </Shell>
  );
}

// ─── Una línea del borrador ───────────────────────────────────────────
function Linea({ l, i, productos, productosPorId, categorias, fotos, costo, subtotal, bloqueada, cambiarLinea, cambiarNuevo, agregarFotosPropias }) {
  const inputPortada = useRef(null);
  const inputExtra = useRef(null);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');
  const [verDescripcion, setVerDescripcion] = useState(false);

  const estado = l.accion === 'existente' ? 'ok' : l.accion === 'nuevo' ? 'nuevo' : l.accion === 'omitir' ? 'omitir' : 'revisar';
  const elegido = l.accion === 'existente' ? productosPorId.get(Number(l.producto_id)) : null;
  const bloqueoCreado = !!l.creado || bloqueada;

  const resultados = useMemo(() => {
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

  function usar(id) {
    cambiarLinea(i, { accion: 'existente', producto_id: Number(id), decididaAMano: true });
    setBuscando(false);
    setTexto('');
  }

  const precioVenta = Number(l.nuevo.precio_venta) || 0;
  const costoNeto = costo * (1 - (Number(l.descuento_porcentaje) || 0) / 100);
  const margen = precioVenta > 0 ? ((precioVenta / (l.nuevo.con_iva ? 1.19 : 1) - costoNeto) / (precioVenta / (l.nuevo.con_iva ? 1.19 : 1))) * 100 : null;

  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${COLOR[estado]}`, opacity: estado === 'omitir' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontWeight: 700 }}>
            {ICONO[estado]} Línea {i + 1}
            {l.codigo_proveedor ? <span style={s.codigo}>{l.codigo_proveedor}</span> : null}
            {l.confianza === 'baja' ? <span style={{ ...s.chip, background: '#fef3f2', color: '#b42318', marginLeft: '6px' }}>Claude no está seguro</span> : null}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{l.descripcion_factura || l.modelo}</div>
          {l.notas ? <div style={{ fontSize: '13px', color: '#b54708' }}>📝 {l.notas}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.campoChico}>
            <span style={s.etiqueta}>Cant.</span>
            <input type="number" min="0" value={l.cantidad} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} style={{ ...s.input, width: '72px' }} />
          </label>
          <label style={s.campoChico}>
            <span style={s.etiqueta}>Costo sin IVA</span>
            <input type="number" min="0" value={l.costo_unitario} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { costo_unitario: e.target.value })} style={{ ...s.input, width: '110px' }} />
          </label>
          <label style={s.campoChico}>
            <span style={s.etiqueta}>Desc. %</span>
            <input type="number" min="0" max="100" value={l.descuento_porcentaje} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { descuento_porcentaje: e.target.value })} style={{ ...s.input, width: '64px' }} />
          </label>
          <label style={s.campoChico}>
            <span style={s.etiqueta}>IVA %</span>
            <input type="number" min="0" value={l.iva_porcentaje} disabled={bloqueada} onChange={(e) => cambiarLinea(i, { iva_porcentaje: e.target.value })} style={{ ...s.input, width: '60px' }} />
          </label>
          <div style={{ textAlign: 'right', minWidth: '100px' }}>
            <div style={s.etiqueta}>Subtotal</div>
            <strong>{moneda(subtotal)}</strong>
          </div>
        </div>
      </div>

      {/* Qué producto del POS es */}
      <div style={{ marginTop: '10px', fontSize: '14px' }}>
        {estado === 'ok' && elegido ? (
          <div>
            → <strong>{elegido.referencia}</strong> · {elegido.nombre}
            <span style={{ color: 'var(--text-secondary)' }}>
              {' '}· venta {moneda(elegido.precio_venta)} · costo actual {moneda(elegido.precio_costo)}
            </span>
            {l.cruce.motivo && !l.decididaAMano ? <div style={s.ayuda}>{l.cruce.motivo}</div> : null}
            {Number(elegido.precio_costo) > 0 && Math.abs(costo - Number(elegido.precio_costo)) / Number(elegido.precio_costo) > 0.15 ? (
              <div style={{ ...s.ayuda, color: '#b54708' }}>⚠️ El costo cambió más de 15 % frente al actual. ¿Es el mismo producto?</div>
            ) : null}
          </div>
        ) : null}
        {estado === 'revisar' ? <div style={{ color: '#b54708', marginBottom: '6px' }}>{l.cruce.motivo}</div> : null}

        {estado === 'nuevo' ? (
          <div style={s.cajaNuevo}>
            {l.creado ? (
              <div style={{ marginBottom: '6px', color: '#067647' }}>✔ Ya creado: {l.creado.referencia}</div>
            ) : null}
            <div className="pos-grid2" style={s.grid}>
              <label style={s.campo}>
                <span style={s.etiqueta}>Nombre del producto nuevo</span>
                <input value={l.nuevo.nombre} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { nombre: e.target.value })} style={s.input} maxLength={150} />
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Categoría{l.nuevo.categoriaSugerida ? ` (Claude sugiere: ${l.nuevo.categoriaSugerida})` : ''}</span>
                <select value={l.nuevo.categoria_id} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { categoria_id: e.target.value })} style={s.input}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Precio de venta (al público)</span>
                <input type="number" min="0" value={l.nuevo.precio_venta} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { precio_venta: e.target.value })} style={s.input} />
                {margen !== null ? (
                  <span style={{ ...s.ayuda, color: margen < 15 ? 'var(--danger)' : 'var(--text-secondary)' }}>Margen ≈ {margen.toFixed(0)} %</span>
                ) : null}
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>Precio distribuidor (opcional)</span>
                <input type="number" min="0" value={l.nuevo.precio_distribuidor} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { precio_distribuidor: e.target.value })} style={s.input} />
              </label>
              <label style={s.campo}>
                <span style={s.etiqueta}>IVA en la venta (Alegra)</span>
                <select value={l.nuevo.con_iva ? 'si' : 'no'} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { con_iva: e.target.value === 'si' })} style={s.input}>
                  <option value="si">Con IVA 19 %</option>
                  <option value="no">Sin IVA</option>
                </select>
              </label>
              <label style={{ ...s.campo, flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '18px' }}>
                <input type="checkbox" checked={l.nuevo.mostrar_en_tienda} disabled={bloqueoCreado} onChange={(e) => cambiarNuevo(i, { mostrar_en_tienda: e.target.checked })} />
                <span>Mostrar en la tienda web</span>
              </label>
            </div>

            {l.nuevo.fotos.length ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {l.nuevo.fotos.map((r, k) => (
                  <div key={r} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotos[r]?.url} alt="" style={{ ...s.foto, outline: k === 0 ? '3px solid var(--teal)' : 'none' }} />
                    {k === 0 ? <span style={s.etiquetaPortada}>Portada</span> : null}
                    {fotos[r]?.propia ? <span style={s.etiquetaPropia}>Tuya</span> : null}
                    {!bloqueoCreado ? (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                        {k > 0 ? (
                          <button type="button" style={s.btnMini} onClick={() => cambiarNuevo(i, { fotos: [r, ...l.nuevo.fotos.filter((x) => x !== r)] })}>
                            Portada
                          </button>
                        ) : null}
                        <button type="button" style={{ ...s.btnMini, color: 'var(--danger)' }} onClick={() => cambiarNuevo(i, { fotos: l.nuevo.fotos.filter((x) => x !== r) })}>
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...s.ayuda, color: '#b54708' }}>Sin fotos: sube la tuya aquí abajo (o agrégala después en Productos).</p>
            )}
            {!bloqueoCreado ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
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
                <button type="button" style={s.btnChico} onClick={() => inputPortada.current?.click()}>
                  📷 Subir mi foto de portada
                </button>
                <button type="button" style={s.btnChico} onClick={() => inputExtra.current?.click()}>
                  ＋ Agregar fotos extra
                </button>
              </div>
            ) : null}
            {l.avisoFoto ? <p style={{ ...s.ayuda, color: 'var(--danger)' }}>{l.avisoFoto}</p> : null}
            {l.fotosFaltantes.length ? <p style={{ ...s.ayuda, color: '#b54708' }}>No vinieron en el ZIP: {l.fotosFaltantes.join(', ')}</p> : null}

            <div style={{ ...s.ayuda, marginTop: '8px' }}>
              Fuente: {l.nuevo.fuente.tipo === 'catalogo' ? '📘 Catálogo del proveedor' : l.nuevo.fuente.tipo === 'web' ? '🌐 Página web' : '🧾 Solo la factura'}
              {l.nuevo.fuente.detalle ? ` · ${l.nuevo.fuente.detalle}` : ''}
              {l.nuevo.fuente.url ? (
                <>
                  {' · '}
                  <a href={l.nuevo.fuente.url} target="_blank" rel="noopener noreferrer">ver página</a>
                </>
              ) : null}
              {' · '}
              {l.nuevo.especificaciones.length} datos de ficha técnica ·{' '}
              <button type="button" style={s.btnMini} onClick={() => setVerDescripcion(!verDescripcion)}>
                {verDescripcion ? 'Ocultar descripción' : 'Ver / editar descripción'}
              </button>
            </div>
            {verDescripcion ? (
              <div style={{ marginTop: '8px' }}>
                <textarea
                  value={l.nuevo.descripcion}
                  disabled={bloqueoCreado}
                  onChange={(e) => cambiarNuevo(i, { descripcion: e.target.value })}
                  rows={4}
                  maxLength={600}
                  style={{ ...s.input, width: '100%', fontFamily: 'inherit' }}
                />
                <div style={s.ayuda}>{l.nuevo.descripcion.length}/600</div>
                {l.nuevo.especificaciones.length ? (
                  <table style={{ fontSize: '13px', borderCollapse: 'collapse', marginTop: '6px' }}>
                    <tbody>
                      {l.nuevo.especificaciones.map((f, k) => (
                        <tr key={k}>
                          <td style={{ padding: '2px 10px 2px 0', color: 'var(--text-secondary)' }}>{f.nombre}</td>
                          <td style={{ padding: '2px 0' }}>{f.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Candidatos y acciones */}
        {!l.creado && !bloqueada ? (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {estado !== 'ok'
              ? l.cruce.candidatos
                  .filter((c) => productosPorId.has(c.id))
                  .map((c) => {
                    const p = productosPorId.get(c.id);
                    return (
                      <button key={c.id} type="button" style={s.btnCandidato} onClick={() => usar(c.id)} title={c.motivo}>
                        Es: <strong>{p.referencia}</strong> · {p.nombre}
                      </button>
                    );
                  })
              : null}
            {estado !== 'nuevo' && l.producto ? (
              <button type="button" style={s.btnChico} onClick={() => cambiarLinea(i, { accion: 'nuevo', decididaAMano: true })}>
                🆕 Es nuevo, crearlo
              </button>
            ) : null}
            {estado !== 'nuevo' && !l.producto ? (
              <button type="button" style={s.btnChico} onClick={() => cambiarLinea(i, { accion: 'nuevo', decididaAMano: true })}>
                🆕 Crearlo (solo con datos de la factura)
              </button>
            ) : null}
            <button type="button" style={s.btnChico} onClick={() => setBuscando(!buscando)}>
              🔎 {estado === 'ok' ? 'Cambiar producto' : 'Buscar en el POS'}
            </button>
            {estado !== 'omitir' ? (
              <button type="button" style={s.btnChico} onClick={() => cambiarLinea(i, { accion: 'omitir', decididaAMano: true })}>
                ⏭️ No guardar esta línea
              </button>
            ) : (
              <button
                type="button"
                style={s.btnChico}
                onClick={() =>
                  cambiarLinea(i, {
                    accion: l.cruce.estado === 'ok' ? 'existente' : l.cruce.estado === 'nuevo' ? 'nuevo' : null,
                    producto_id: l.cruce.producto_id,
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
          <div style={{ marginTop: '8px', position: 'relative', maxWidth: '520px' }}>
            <input autoFocus placeholder="Busca por nombre o referencia…" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ ...s.input, width: '100%' }} />
            {resultados.length ? (
              <div style={s.dropdown}>
                {resultados.map((p) => (
                  <div key={p.id} style={s.opcion} onClick={() => usar(p.id)}>
                    <strong>{p.referencia}</strong> · {p.nombre}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}> · stock {Number(p.stock)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const COLOR = { ok: '#12b76a', revisar: '#f79009', nuevo: '#6172f3', omitir: '#98a2b3' };

const s = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px' },
  avisoCaja: { background: '#fffaeb', border: '1px solid #fedf89', color: '#93370d', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
  grid: { gap: '10px' },
  campo: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  campoChico: { display: 'flex', flexDirection: 'column' },
  etiqueta: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' },
  ayuda: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' },
  input: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box', background: '#fff' },
  btnPrimario: { display: 'inline-block', padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, textDecoration: 'none', fontSize: '14px' },
  btn: { display: 'inline-block', padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'inherit', cursor: 'pointer', textDecoration: 'none', fontSize: '14px' },
  btnChico: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnCandidato: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #f79009', background: '#fffaeb', cursor: 'pointer', fontSize: '13px', textAlign: 'left' },
  btnMini: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: 0 },
  chip: { padding: '4px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 600 },
  codigo: { marginLeft: '8px', padding: '1px 8px', borderRadius: '6px', background: '#f2f4f7', fontSize: '12px', fontFamily: 'monospace', fontWeight: 600 },
  cajaNuevo: { border: '1px dashed #a4bcfd', borderRadius: '8px', padding: '10px', background: '#f8f9ff' },
  foto: { width: '96px', height: '96px', objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', display: 'block' },
  etiquetaPortada: { position: 'absolute', top: '4px', left: '4px', background: 'var(--teal)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '4px' },
  etiquetaPropia: { position: 'absolute', top: '4px', right: '4px', background: '#6172f3', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '4px' },
  filaTotal: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0', fontSize: '15px' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: '260px', overflowY: 'auto' },
  opcion: { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '14px' },
};
