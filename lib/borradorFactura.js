// lib/borradorFactura.js
// "Importar borrador" de Facturas de compra (oct 2026).
//
// Claude lee la foto de la factura del proveedor (y el catálogo PDF de ESE
// proveedor, o la página del fabricante) y entrega un ZIP con:
//   factura.json   → el borrador (formato abajo)
//   fotos/...      → fotos de los productos nuevos (la primera es la portada)
// El POS lo abre, cruza cada línea con los productos que ya existen y
// muestra el borrador (✅ / ⚠️ / 🆕) para revisarlo y darle "Aprobar".
//
// ─── FORMATO factura.json (versión 1) ───────────────────────────────────
// {
//   "formato": "geekstore-borrador-factura",
//   "version": 1,
//   "prueba": false,                       // true = datos inventados para probar
//   "proveedor": { "nombre": "Movisun", "identificacion": "900123456-7", "telefono": "" },
//   "factura": {
//     "numero": "FE-1234",
//     "fecha": "2026-10-20",                // AAAA-MM-DD
//     "fecha_vencimiento": "2026-11-19",    // o null
//     "subtotal": 1000000,                  // como dice la factura (para comparar)
//     "iva": 190000,
//     "total": 1190000,
//     "notas": "",
//     "precios_con_iva": true               // ¿los precios de los artículos ya traen el IVA incluido?
//   },                                      // (si falta: false = vienen sin IVA, como la versión anterior)
//   "items": [
//     {
//       "codigo_proveedor": "TL-4",         // código tal cual sale en la factura
//       "descripcion_factura": "AUDIFONO TL-4 NEGRO",
//       "cantidad": 10,
//       "costo_unitario": 35000,            // precio unitario TAL COMO sale en la factura, antes de descuento
//       "descuento_porcentaje": 0,
//       "iva_porcentaje": 19,
//       "marca": "Movisun",
//       "modelo": "TL-4",
//       "producto": {                       // para crearlo si no existe en el POS
//         "nombre": "Audífonos Bluetooth Movisun TL-4 con pantalla LED",
//         "categoria": "Audio",
//         "subcategoria": "Audífonos",
//         "descripcion": "… (máx. 600 letras)",
//         "especificaciones": [{ "nombre": "Bluetooth", "valor": "5.3" }],
//         "precio_venta_sugerido": null,
//         "fotos": ["fotos/tl-4-1.jpg", "fotos/tl-4-2.jpg"],
//         "fuente": { "tipo": "catalogo", "detalle": "PRODUCTOS NUEVOS pág. 12", "url": null }
//       },                                  // tipo: "catalogo" | "web" | "factura"
//       "confianza": "alta",                // alta | media | baja (qué tan seguro está Claude)
//       "notas": ""
//     }
//   ],
//   "avisos": ["La línea 3 se leía borrosa, revisa la cantidad"]
// }
// ────────────────────────────────────────────────────────────────────────

export const FORMATO = 'geekstore-borrador-factura';
export const VERSION = 1;

function texto(v, max = 300) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // "35.000" o "35,000.50" o "35000,5" → número
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fechaISO(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// Revisa y limpia el JSON. Devuelve { ok, error, borrador }.
export function validarBorrador(json) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'El archivo no tiene un borrador válido.' };
  if (json.formato && json.formato !== FORMATO) {
    return { ok: false, error: `Este JSON no es un borrador de factura (formato "${json.formato}").` };
  }
  if (Number(json.version || 1) > VERSION) {
    return { ok: false, error: 'El borrador es de una versión más nueva. Actualiza el POS.' };
  }
  const itemsCrudos = Array.isArray(json.items) ? json.items : [];
  if (!itemsCrudos.length) return { ok: false, error: 'El borrador no trae productos.' };

  const items = itemsCrudos.map((it, i) => {
    const p = it?.producto && typeof it.producto === 'object' ? it.producto : null;
    const fuente = p?.fuente && typeof p.fuente === 'object' ? p.fuente : {};
    return {
      linea: i + 1,
      codigo_proveedor: texto(it?.codigo_proveedor, 80),
      descripcion_factura: texto(it?.descripcion_factura, 200),
      cantidad: numero(it?.cantidad),
      costo_unitario: numero(it?.costo_unitario),
      descuento_porcentaje: Math.min(100, Math.max(0, numero(it?.descuento_porcentaje))),
      iva_porcentaje: Math.max(0, numero(it?.iva_porcentaje)),
      marca: texto(it?.marca, 60),
      modelo: texto(it?.modelo, 80),
      confianza: ['alta', 'media', 'baja'].includes(it?.confianza) ? it.confianza : 'media',
      notas: texto(it?.notas, 400),
      producto: p
        ? {
            nombre: texto(p.nombre, 150),
            categoria: texto(p.categoria, 80),
            subcategoria: texto(p.subcategoria, 80),
            descripcion: String(p.descripcion ?? '').trim().slice(0, 600),
            especificaciones: Array.isArray(p.especificaciones)
              ? p.especificaciones
                  .map((f) => ({ nombre: texto(f?.nombre, 60), valor: texto(f?.valor, 200) }))
                  .filter((f) => f.nombre && f.valor)
                  .slice(0, 30)
              : [],
            precio_venta_sugerido: numero(p.precio_venta_sugerido) || null,
            // Zona Gamer: true/false si Claude lo dice; null = el POS lo
            // sugiere por el nombre/categoría (ver esGamerSugerido).
            es_gamer: typeof p.es_gamer === 'boolean' ? p.es_gamer : null,
            fotos: Array.isArray(p.fotos) ? p.fotos.map((f) => texto(f, 200)).filter(Boolean).slice(0, 10) : [],
            fuente: {
              tipo: ['catalogo', 'web', 'factura'].includes(fuente.tipo) ? fuente.tipo : 'factura',
              detalle: texto(fuente.detalle, 200),
              url: /^https?:\/\//i.test(String(fuente.url || '')) ? texto(fuente.url, 500) : '',
            },
          }
        : null,
    };
  });

  const f = json.factura && typeof json.factura === 'object' ? json.factura : {};
  const pr = json.proveedor && typeof json.proveedor === 'object' ? json.proveedor : {};
  return {
    ok: true,
    borrador: {
      prueba: json.prueba === true,
      proveedor: { nombre: texto(pr.nombre, 120), identificacion: texto(pr.identificacion, 40), telefono: texto(pr.telefono, 40) },
      factura: {
        numero: texto(f.numero, 60),
        fecha: fechaISO(f.fecha),
        fecha_vencimiento: fechaISO(f.fecha_vencimiento),
        subtotal: numero(f.subtotal),
        iva: numero(f.iva),
        total: numero(f.total),
        notas: texto(f.notas, 500),
        // true/false si Claude lo dice; si no viene (borradores viejos), los
        // precios venían sin IVA.
        precios_con_iva: typeof f.precios_con_iva === 'boolean' ? f.precios_con_iva : false,
      },
      items,
      avisos: Array.isArray(json.avisos) ? json.avisos.map((a) => texto(a, 300)).filter(Boolean).slice(0, 20) : [],
    },
  };
}

// ─── Cruce con los productos del POS ─────────────────────────────────────

export function sinTildes(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// "TL-4" → "TL4"; "Chacha B2 TC" → "CHACHAB2TC"
export function normalizarCodigo(t) {
  return sinTildes(t).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function tokens(t) {
  return sinTildes(t).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

// Un código sirve para buscar si tiene letras Y números y al menos 3
// caracteres (ej. "TL4", "QM80", "CX10A"). "B2" o "8" solos son muy cortos y
// darían falsos positivos.
export function esCodigoUtil(c) {
  return c.length >= 3 && /\d/.test(c) && /[A-Z]/.test(c);
}

// Palabras que, pegadas a un modelo, lo vuelven OTRO producto
// ("CHACHA B2" ≠ "CHACHA B2 TC", "TL-4" ≠ "TL-4 PRO").
const SUFIJOS_VARIANTE = new Set([
  'PRO', 'MAX', 'PLUS', 'MINI', 'LITE', 'ULTRA', 'SE', 'TC', 'C', 'A', 'B', 'S', 'X', 'NEO', 'AIR', 'II', 'III', 'V2', 'V3', 'GT', 'RS',
]);

// ¿El nombre del producto contiene el código como modelo? Devuelve
// 'exacto' (el modelo y nada más pegado), 'parecido' (seguido de algo que
// podría ser otra versión) o null.
export function coincidenciaModelo(codigo, nombreProducto) {
  const t = tokens(nombreProducto);
  for (let i = 0; i < t.length; i++) {
    let acumulado = '';
    for (let j = i; j < Math.min(t.length, i + 4); j++) {
      acumulado += t[j];
      if (!codigo.startsWith(acumulado)) break;
      if (acumulado === codigo) {
        const siguiente = t[j + 1];
        if (!siguiente || VACIAS.has(siguiente)) return 'exacto';
        if (SUFIJOS_VARIANTE.has(siguiente) || /^\d+$/.test(siguiente) || siguiente.length <= 2) return 'parecido';
        return 'exacto';
      }
    }
  }
  return null;
}

const VACIAS = new Set(['DE', 'LA', 'EL', 'CON', 'PARA', 'Y', 'EN', 'POR', 'LOS', 'LAS', 'DEL', 'UN', 'UNA', 'REF', 'X']);
function palabras(t) {
  return new Set(tokens(t).filter((w) => w.length >= 2 && !VACIAS.has(w)));
}
function parecido(a, b) {
  const A = palabras(a);
  const B = palabras(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / Math.min(A.size, B.size);
}

// item: línea validada; productos: lista del POS; opciones:
//   alias: Map(codigo normalizado → producto_id) aprendidos de ESE proveedor
//   comprados: Set(producto_id) ya comprados antes a ese proveedor
// Devuelve { estado: 'ok'|'revisar'|'nuevo', producto_id, candidatos:[{id, motivo}], motivo }
export function emparejarLinea(item, productos, { alias = new Map(), comprados = new Set() } = {}) {
  const activos = productos.filter((p) => p.es_inventariable !== false);
  const porId = new Map(activos.map((p) => [Number(p.id), p]));

  // 1) Aprendido de una factura anterior de este proveedor (por su código,
  //    o por la descripción completa si la factura no trae código).
  for (const c of [item.codigo_proveedor, item.descripcion_factura]) {
    const cod = normalizarCodigo(c).slice(0, 80);
    if (cod && alias.has(cod) && porId.has(Number(alias.get(cod)))) {
      return { estado: 'ok', producto_id: Number(alias.get(cod)), candidatos: [], motivo: 'Ya se había emparejado en una factura anterior de este proveedor' };
    }
  }

  // 2) Código de modelo dentro del nombre o la referencia del producto.
  const codigos = [...new Set([item.modelo, item.codigo_proveedor].map(normalizarCodigo).filter(esCodigoUtil))];
  const exactos = new Map();
  const parecidos = new Map();
  for (const cod of codigos) {
    for (const p of activos) {
      if (normalizarCodigo(p.referencia) === cod) {
        exactos.set(Number(p.id), `Misma referencia ${p.referencia}`);
        continue;
      }
      const r = coincidenciaModelo(cod, p.nombre);
      if (r === 'exacto') exactos.set(Number(p.id), `El modelo ${item.modelo || item.codigo_proveedor} está en el nombre`);
      else if (r === 'parecido' && !exactos.has(Number(p.id))) parecidos.set(Number(p.id), 'Modelo parecido (¿otra versión?)');
    }
  }
  for (const id of exactos.keys()) parecidos.delete(id);

  const descripcion = `${item.descripcion_factura} ${item.producto?.nombre || ''}`;
  const ordenar = (ids) =>
    [...ids].sort((a, b) => {
      const ca = comprados.has(a) ? 1 : 0;
      const cb = comprados.has(b) ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return parecido(descripcion, porId.get(b).nombre) - parecido(descripcion, porId.get(a).nombre);
    });

  if (exactos.size === 1) {
    const [id] = exactos.keys();
    return { estado: 'ok', producto_id: id, candidatos: ordenar(parecidos.keys()).slice(0, 4).map((x) => ({ id: x, motivo: parecidos.get(x) })), motivo: exactos.get(id) };
  }
  if (exactos.size > 1) {
    // Varios (ej. el mismo modelo en varios colores): si solo UNO ya se le
    // compró a este proveedor, es ese; si no, que Nelson elija.
    const yaComprados = [...exactos.keys()].filter((id) => comprados.has(id));
    if (yaComprados.length === 1) {
      return {
        estado: 'ok',
        producto_id: yaComprados[0],
        candidatos: ordenar([...exactos.keys()].filter((x) => x !== yaComprados[0])).slice(0, 4).map((x) => ({ id: x, motivo: exactos.get(x) })),
        motivo: 'El modelo coincide y ya se le había comprado a este proveedor',
      };
    }
    const lista = ordenar(exactos.keys());
    return {
      estado: 'revisar',
      producto_id: null,
      candidatos: lista.slice(0, 6).map((x) => ({ id: x, motivo: exactos.get(x) })),
      motivo: `Hay ${exactos.size} productos con el modelo ${item.modelo || item.codigo_proveedor}: elige cuál es`,
    };
  }

  // 3) Sin código: por parecido del nombre (nunca se toma solo; Nelson confirma).
  const porNombre = activos
    .map((p) => ({ id: Number(p.id), s: parecido(descripcion, p.nombre) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4);
  const candidatos = [
    ...ordenar(parecidos.keys()).map((x) => ({ id: x, motivo: parecidos.get(x) })),
    ...porNombre.filter((x) => !parecidos.has(x.id)).map((x) => ({ id: x.id, motivo: 'Nombre parecido' })),
  ].slice(0, 5);
  if (candidatos.length) {
    return { estado: 'revisar', producto_id: null, candidatos, motivo: 'No hay coincidencia segura: ¿es alguno de estos o es nuevo?' };
  }
  return { estado: 'nuevo', producto_id: null, candidatos: [], motivo: 'No existe en el POS' };
}

// Qué se guarda como "código aprendido" de una línea al aprobar: el código
// del proveedor (cada color suele tener el suyo) o, si no trae, la
// descripción de la factura. Nunca solo el modelo (varios colores lo comparten).
export function codigoParaAprender(item) {
  const c = normalizarCodigo(item.codigo_proveedor);
  if (c.length >= 2) return c.slice(0, 80);
  const d = normalizarCodigo(item.descripcion_factura);
  return d.length >= 4 ? d.slice(0, 80) : '';
}

// Costo que se guarda en el POS (por unidad, antes del descuento de línea).
//
// Regla de precios POR PROVEEDOR (oct 2026, la define Nelson y queda
// guardada para ese proveedor):
//   iva: 'sumar'   → la factura viene antes de IVA: el costo del POS es
//                    precio + IVA de la línea (se guarda así, sin discriminar)
//        'ignorar' → el IVA no existe para efectos de costo/precio (Innovall)
//   multiplicador: null → el precio de venta de los nuevos lo pone Nelson
//                  2    → precio de venta = costo × 2 (Innovall)
//   distribuidor:  40   → precio distribuidor = costo + 40 % (igual que la
//                         sugerencia de la pantalla de Productos)
//                  null → no se calcula (lo pone Nelson o queda vacío)
export const DISTRIBUIDOR_POR_DEFECTO = 40;
export const REGLA_POR_DEFECTO = { iva: 'sumar', multiplicador: null, distribuidor: DISTRIBUIDOR_POR_DEFECTO };

export function normalizarRegla(r) {
  const m = Number(r?.multiplicador);
  const d = r?.distribuidor === undefined ? DISTRIBUIDOR_POR_DEFECTO : r?.distribuidor === null || r?.distribuidor === '' ? null : Number(r.distribuidor);
  return {
    iva: r?.iva === 'ignorar' ? 'ignorar' : 'sumar',
    multiplicador: Number.isFinite(m) && m > 0 && m <= 20 ? Math.round(m * 100) / 100 : null,
    distribuidor: d !== null && Number.isFinite(d) && d >= 0 && d <= 500 ? Math.round(d * 100) / 100 : null,
  };
}

// Si el proveedor todavía no tiene regla guardada.
export function reglaSugerida(nombreProveedor) {
  if (/innovall/i.test(sinTildes(nombreProveedor))) return { iva: 'ignorar', multiplicador: 2, distribuidor: DISTRIBUIDOR_POR_DEFECTO };
  return { ...REGLA_POR_DEFECTO };
}

// Costo por unidad que se guarda en el POS (antes del descuento de línea).
// En el POS el costo es SIEMPRE el valor final (con IVA): el IVA solo se
// usa para llegar a ese valor cuando la factura trae los precios sin IVA.
//   regla.preciosConIva = true  → el precio de la factura ya es el final
//   regla.iva = 'ignorar'        → el IVA no existe (Innovall): tal cual
export function costoParaPos(item, regla) {
  const base = Number(item.costo_unitario) || 0;
  if (regla?.preciosConIva === true || normalizarRegla(regla).iva === 'ignorar') return base;
  return Math.round(base * (1 + (Number(item.iva_porcentaje) || 0) / 100) * 100) / 100;
}

// Costo por unidad ya con el descuento de la línea.
export function costoNetoParaPos(item, regla) {
  return costoParaPos(item, regla) * (1 - (Number(item.descuento_porcentaje) || 0) / 100);
}

// Precio distribuidor automático de un producto nuevo (costo + %), o null.
export function precioDistribuidorAutomatico(item, regla) {
  const { distribuidor } = normalizarRegla(regla);
  if (distribuidor === null) return null;
  const v = Math.round(costoNetoParaPos(item, regla) * (1 + distribuidor / 100));
  return v > 0 ? v : null;
}

// ¿Marcar el producto nuevo como artículo de Zona Gamer? Lo que diga el
// borrador o, si no dice, si "gamer" aparece en el nombre, la categoría o
// la subcategoría sugeridas.
export function esGamerSugerido(item) {
  const p = item.producto;
  if (typeof p?.es_gamer === 'boolean') return p.es_gamer;
  return /gamer|gaming/i.test(sinTildes(`${p?.nombre || ''} ${p?.categoria || ''} ${p?.subcategoria || ''} ${item.descripcion_factura || ''}`));
}

// Mínimo de letras de la descripción de un producto nuevo (Nelson, oct 2026).
export const DESCRIPCION_MINIMA = 400;

// Precio de venta automático de un producto nuevo (null = lo pone Nelson).
export function precioVentaAutomatico(item, regla) {
  const { multiplicador } = normalizarRegla(regla);
  if (!multiplicador) return null;
  const v = Math.round(costoNetoParaPos(item, regla) * multiplicador);
  return v > 0 ? v : null;
}

// Busca la categoría del POS que más se parece al nombre que sugiere Claude.
export function categoriaParecida(nombre, categorias) {
  const n = normalizarCodigo(nombre);
  if (!n) return null;
  const exacta = categorias.find((c) => normalizarCodigo(c.nombre) === n);
  if (exacta) return exacta;
  const contiene = categorias.find((c) => {
    const cn = normalizarCodigo(c.nombre);
    return cn.length >= 4 && (cn.includes(n) || n.includes(cn));
  });
  if (contiene) return contiene;
  let mejor = null;
  let puntaje = 0;
  for (const c of categorias) {
    const s = parecido(nombre, c.nombre);
    if (s > puntaje) {
      puntaje = s;
      mejor = c;
    }
  }
  return puntaje >= 0.5 ? mejor : null;
}

export function proveedorParecido(prov, proveedores) {
  const nit = String(prov.identificacion || '').replace(/\D/g, '').slice(0, 9);
  if (nit.length >= 6) {
    const p = proveedores.find((x) => String(x.identificacion || '').replace(/\D/g, '').slice(0, 9) === nit);
    if (p) return p;
  }
  const n = normalizarCodigo(prov.nombre);
  if (!n) return null;
  return (
    proveedores.find((x) => normalizarCodigo(x.nombre) === n) ||
    proveedores.find((x) => {
      const xn = normalizarCodigo(x.nombre);
      return xn.length >= 4 && (xn.includes(n) || n.includes(xn));
    }) ||
    null
  );
}
