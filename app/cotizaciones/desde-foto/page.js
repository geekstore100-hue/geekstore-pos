'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Shell from '../../../components/Shell';
import { pesos } from '../../../lib/cotizacionPdf';
import { redimensionarParaIA } from '../../../lib/fotosNavegador';

// COTIZAR DESDE FOTO (nov 2026). El cliente manda la lista de lo que
// necesita (foto de una tabla, captura o texto):
//   1) la IA lee cada línea (ítem, qué es, características y cantidad);
//   2) el POS busca en el catálogo y la IA deja hasta 3 opciones por línea,
//      con aviso de lo que no cumple;
//   3) Nelson marca una o varias opciones por línea (varias = el cliente
//      escoge: "Opción A / B" en la cotización; solo la A suma al total).
//      Lo que no se maneja queda marcado "No lo tenemos".
//   4) "Crear cotización" la guarda y abre el editor de siempre (PDF,
//      WhatsApp...).
// El avance queda guardado en este navegador por si se cierra la página.

const BORRADOR = 'cotizarDesdeFotoBorrador';
const POR_LOTE = 6;
const NOTAS_POR_DEFECTO = 'Precios sujetos a disponibilidad de inventario. Garantía según el producto.';
const ENCAJA = { alto: { texto: 'Cumple', color: '#0b7a3e', fondo: '#e6f6ec' }, medio: { texto: 'Revisar', color: '#8a5a00', fondo: '#fff4e5' }, bajo: { texto: 'Parecido', color: '#5b6577', fondo: '#f3f5f9' } };

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function leerArchivo(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer la imagen'));
    r.readAsDataURL(f);
  });
}

async function api(body) {
  const res = await fetch('/api/cotizaciones/desde-pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || 'No se pudo');
  return d;
}

function grupoDe(l) {
  return `${l.ref ? `${l.ref} · ` : ''}${l.nombre || 'Producto'}`.slice(0, 120);
}

export default function CotizarDesdeFotoPage() {
  const router = useRouter();
  const [fotos, setFotos] = useState([]); // dataURLs
  const [texto, setTexto] = useState('');
  const [lineas, setLineas] = useState(null); // [{ n, ref, nombre, descripcion, cantidad, buscar, opciones, otros, elegidos:[ids], buscada }]
  const [cliente, setCliente] = useState('');
  const [paso, setPaso] = useState(''); // texto de lo que se está haciendo
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [abiertas, setAbiertas] = useState({}); // n → { mas, buscar, desc }
  const camaraRef = useRef(null);
  const galeriaRef = useRef(null);

  // Borrador guardado (por si se cerró la página a mitad).
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BORRADOR) || 'null');
      if (b?.lineas?.length) {
        setLineas(b.lineas);
        setCliente(b.cliente || '');
      }
    } catch {
      /* sin borrador */
    }
    fetch('/api/productos?para=venta')
      .then((r) => r.json())
      .then((d) => d.ok && setCatalogo(d.productos || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      if (lineas) localStorage.setItem(BORRADOR, JSON.stringify({ lineas, cliente }));
    } catch {
      /* sin almacenamiento */
    }
  }, [lineas, cliente]);

  async function agregarFotos(e) {
    const archivos = [...(e.target.files || [])].slice(0, 4);
    e.target.value = '';
    setError('');
    for (const f of archivos) {
      if (!f.type.startsWith('image/')) {
        setError('Sube fotos o capturas (JPG o PNG). Si es un PDF, tómale captura a la tabla.');
        continue;
      }
      const url = await redimensionarParaIA(await leerArchivo(f), 1800, 0.85);
      setFotos((fs) => [...fs, url].slice(0, 4));
    }
  }

  async function leer() {
    setError('');
    setAviso('');
    if (!fotos.length && !texto.trim()) return setError('Sube la foto o pega el texto de lo que pide el cliente.');
    try {
      let todas = [];
      if (fotos.length) {
        for (let i = 0; i < fotos.length; i++) {
          setPaso(`Leyendo la foto ${i + 1} de ${fotos.length}…`);
          const d = await api({ accion: 'leer', imagen: fotos[i] });
          todas = todas.concat(d.lineas);
        }
      }
      if (texto.trim()) {
        setPaso('Leyendo el texto…');
        const d = await api({ accion: 'leer', texto });
        todas = todas.concat(d.lineas);
      }
      const nuevas = todas.map((l, i) => ({ ...l, n: i + 1, opciones: [], otros: [], elegidos: [], buscada: false }));
      setLineas(nuevas);
      await buscarOpciones(nuevas);
    } catch (e) {
      setError(e.message);
    } finally {
      setPaso('');
    }
  }

  async function buscarOpciones(base, soloN = null) {
    const pendientes = base.filter((l) => (soloN ? soloN.includes(l.n) : true));
    let avisoIA = '';
    for (let i = 0; i < pendientes.length; i += POR_LOTE) {
      const lote = pendientes.slice(i, i + POR_LOTE);
      setPaso(`Buscando en el catálogo ${i + 1}–${i + lote.length} de ${pendientes.length}…`);
      try {
        const d = await api({ accion: 'opciones', lineas: lote.map(({ n, nombre, descripcion, cantidad, buscar }) => ({ n, nombre, descripcion, cantidad, buscar })) });
        if (d.avisoIA) avisoIA = d.avisoIA;
        const porN = new Map(d.lineas.map((x) => [x.n, x]));
        setLineas((ls) =>
          ls.map((l) => {
            const r = porN.get(l.n);
            if (!r) return l;
            const primera = r.opciones.find((o) => o.encaja !== 'bajo') || null;
            return { ...l, opciones: r.opciones, otros: r.otros, elegidos: primera ? [primera.producto_id] : [], buscada: true, fallo: false };
          })
        );
      } catch (e) {
        avisoIA = `No se pudo buscar una parte (${e.message}). Toca "Buscar de nuevo" en esas líneas.`;
        setLineas((ls) => ls.map((l) => (lote.some((x) => x.n === l.n) ? { ...l, buscada: true, fallo: true } : l)));
      }
    }
    setAviso(avisoIA);
    setPaso('');
  }

  function cambiar(n, cambio) {
    setLineas((ls) => ls.map((l) => (l.n === n ? { ...l, ...cambio } : l)));
  }
  function alternar(n, id) {
    setLineas((ls) =>
      ls.map((l) => (l.n === n ? { ...l, elegidos: l.elegidos.includes(id) ? l.elegidos.filter((x) => x !== id) : [...l.elegidos, id] } : l))
    );
  }
  // Producto agregado a mano (de "Ver más" o del buscador): queda elegido.
  function agregarOpcion(n, o) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.n !== n) return l;
        const ya = l.opciones.some((x) => x.producto_id === o.producto_id);
        return {
          ...l,
          opciones: ya ? l.opciones : [...l.opciones, o],
          otros: (l.otros || []).filter((x) => x.producto_id !== o.producto_id),
          elegidos: l.elegidos.includes(o.producto_id) ? l.elegidos : [...l.elegidos, o.producto_id],
        };
      })
    );
  }
  function quitarLinea(n) {
    setLineas((ls) => ls.filter((l) => l.n !== n));
  }
  function empezarDeNuevo() {
    if (lineas?.length && !window.confirm('¿Borrar este pedido y empezar uno nuevo?')) return;
    setLineas(null);
    setFotos([]);
    setTexto('');
    setCliente('');
    setAviso('');
    setError('');
    try { localStorage.removeItem(BORRADOR); } catch { /* */ }
  }

  const resumen = useMemo(() => {
    if (!lineas) return null;
    let total = 0;
    let conProducto = 0;
    const faltan = [];
    for (const l of lineas) {
      const elegidas = l.elegidos.map((id) => l.opciones.find((o) => o.producto_id === id)).filter(Boolean);
      if (elegidas.length) {
        conProducto++;
        total += elegidas[0].precio_venta * l.cantidad;
      } else faltan.push(l);
    }
    return { total, conProducto, faltan };
  }, [lineas]);

  async function crear() {
    setError('');
    const items = [];
    for (const l of lineas) {
      const elegidas = l.elegidos.map((id) => l.opciones.find((o) => o.producto_id === id)).filter(Boolean);
      for (const o of elegidas) {
        items.push({
          producto_id: o.producto_id,
          referencia: o.referencia,
          nombre: o.nombre,
          cantidad: l.cantidad,
          precio_unitario: o.precio_venta,
          descuento_pct: 0,
          grupo: grupoDe(l),
        });
      }
    }
    if (!items.length) return setError('Elige al menos un producto.');
    setPaso('Creando la cotización…');
    try {
      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nombre: cliente, notas: NOTAS_POR_DEFECTO, items }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'No se pudo crear la cotización');
      try { localStorage.removeItem(BORRADOR); } catch { /* */ }
      router.push(`/cotizaciones/${d.cotizacion.id}`);
    } catch (e) {
      setError(e.message);
      setPaso('');
    }
  }

  function resultadosBusqueda(q) {
    const palabras = sinTildes(q).trim().split(/\s+/).filter(Boolean);
    if (!palabras.length || palabras.join('').length < 2) return [];
    return catalogo
      .filter((p) => palabras.every((w) => sinTildes(`${p.nombre} ${p.referencia}`).includes(w)))
      .slice(0, 8)
      .map((p) => ({
        producto_id: Number(p.id),
        referencia: p.referencia,
        nombre: p.nombre,
        imagen_key: p.imagen_key,
        precio_venta: Math.round(Number(p.precio_venta) || 0),
        stock: Number(p.stock) || 0,
        inventariable: p.es_inventariable !== false,
        encaja: '',
        nota: 'Agregado a mano',
      }));
  }

  const ocupado = Boolean(paso);

  return (
    <Shell title="Cotizar desde foto">
      <style>{`
        .cdf { max-width: 860px; margin: 0 auto; padding-bottom: 120px; }
        .cdf-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; }
        .cdf-btn { border: none; background: var(--teal); color: #fff; font-weight: 700; padding: 11px 16px; border-radius: 10px; font-size: 15px; cursor: pointer; }
        .cdf-btn:disabled { opacity: .5; }
        .cdf-sec { border: 1px solid var(--border); background: #fff; color: var(--text); font-weight: 600; padding: 9px 13px; border-radius: 10px; font-size: 14px; cursor: pointer; }
        .cdf-link { border: none; background: none; padding: 0; color: var(--teal-dark); font-weight: 600; font-size: 13px; cursor: pointer; }
        .cdf-input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1px solid var(--border); font-size: 15px; background: #fff; }
        .cdf-fotos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .cdf-fotos div { position: relative; }
        .cdf-fotos img { width: 96px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
        .cdf-fotos button { position: absolute; top: -6px; right: -6px; border: none; background: #c0392b; color: #fff; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 12px; }
        .cdf-cab { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
        .cdf-ref { display: inline-block; font-size: 12px; font-weight: 700; color: var(--teal-dark); background: var(--teal-light); border-radius: 6px; padding: 1px 7px; margin-right: 6px; }
        .cdf-desc { font-size: 13px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; }
        .cdf-desc.corta { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .cdf-op { display: flex; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 10px; padding: 8px; margin-top: 8px; cursor: pointer; background: #fff; }
        .cdf-op.on { border-color: var(--teal); box-shadow: 0 0 0 2px var(--teal-light); }
        .cdf-op img, .cdf-op .sinfoto { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; background: #f3f5f9; flex-shrink: 0; }
        .cdf-op input { width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--teal); }
        .cdf-op-nombre { font-size: 14px; font-weight: 600; line-height: 1.25; }
        .cdf-op-datos { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
        .cdf-chip { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 1px 8px; margin-right: 4px; }
        .cdf-nota { font-size: 12px; color: #8a5a00; margin-top: 3px; }
        .cdf-no { display: inline-block; margin-top: 8px; font-size: 13px; font-weight: 700; color: #c0392b; background: #fdecea; border-radius: 8px; padding: 4px 10px; }
        .cdf-barra { position: fixed; left: 0; right: 0; bottom: 0; background: #0b0f1a; color: #fff; padding: 10px 16px; border-top: 3px solid #ff2e88; z-index: 30; }
        .cdf-barra-in { max-width: 860px; margin: 0 auto; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
        .cdf-barra input { flex: 1 1 160px; min-width: 0; padding: 9px; border-radius: 8px; border: 1px solid #2a3550; background: #0f1626; color: #fff; font-size: 14px; }
        .cdf-drop { border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; background: #fff; max-height: 280px; overflow: auto; }
        .cdf-drop button { display: flex; gap: 8px; width: 100%; text-align: left; align-items: center; border: none; border-bottom: 1px solid var(--border); background: #fff; padding: 8px; cursor: pointer; font-size: 13px; }
        .cdf-drop img, .cdf-drop span.sinfoto { width: 36px; height: 36px; object-fit: contain; border-radius: 6px; background: #f3f5f9; flex-shrink: 0; }
      `}</style>
      <div className="cdf">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
          <Link href="/cotizaciones" style={{ color: 'var(--teal-dark)', fontSize: '14px' }}>← Cotizaciones</Link>
          {lineas && <button type="button" className="cdf-link" onClick={empezarDeNuevo}>Empezar otro pedido</button>}
        </div>

        {!lineas && (
          <div className="cdf-card">
            <h3 style={{ margin: '0 0 6px' }}>📷 ¿Qué pidió el cliente?</h3>
            <p style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Sube la foto o captura de la lista (hasta 4 si es larga) o pega el texto. El POS lee cada línea y busca en tu catálogo.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="cdf-sec" onClick={() => camaraRef.current?.click()} disabled={ocupado}>📷 Tomar foto</button>
              <button type="button" className="cdf-sec" onClick={() => galeriaRef.current?.click()} disabled={ocupado}>🖼 Elegir imagen</button>
              <input ref={camaraRef} type="file" accept="image/*" capture="environment" onChange={agregarFotos} hidden />
              <input ref={galeriaRef} type="file" accept="image/*" multiple onChange={agregarFotos} hidden aria-label="Elegir imagen" />
            </div>
            {fotos.length > 0 && (
              <div className="cdf-fotos">
                {fotos.map((f, i) => (
                  <div key={i}>
                    <img src={f} alt={`Foto ${i + 1}`} />
                    <button type="button" onClick={() => setFotos((fs) => fs.filter((_, j) => j !== i))} aria-label="Quitar foto">✕</button>
                  </div>
                ))}
              </div>
            )}
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', margin: '12px 0 4px' }}>O pega el texto (WhatsApp, correo…)</label>
            <textarea className="cdf-input" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. 5 trípodes para celular, 4 aros de luz de 12 pulgadas…" />
            {error && <p style={{ color: '#c0392b', margin: '10px 0 0' }}>{error}</p>}
            <button type="button" className="cdf-btn" style={{ marginTop: '12px', width: '100%' }} onClick={leer} disabled={ocupado}>
              {paso || 'Leer pedido y buscar'}
            </button>
          </div>
        )}

        {lineas && (
          <>
            {paso && <div className="cdf-card" style={{ background: '#e0f7ff', borderColor: '#9ad8f0' }}>⏳ {paso}</div>}
            {aviso && <div className="cdf-card" style={{ background: '#fff4e5', borderColor: '#f5c377', color: '#8a5a00', fontSize: '14px' }}>{aviso}</div>}
            {error && <div className="cdf-card" style={{ color: '#c0392b' }}>{error}</div>}
            {!paso && resumen && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                {lineas.length} líneas · {resumen.conProducto} con producto · {resumen.faltan.length} sin producto. Marca una o varias opciones por línea (varias = el cliente escoge).
              </p>
            )}
            {lineas.map((l) => {
              const ab = abiertas[l.n] || {};
              const setAb = (c) => setAbiertas((a) => ({ ...a, [l.n]: { ...ab, ...c } }));
              const buscados = ab.buscar ? resultadosBusqueda(ab.buscar) : [];
              return (
                <div className="cdf-card" key={l.n}>
                  <div className="cdf-cab">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px' }}>
                        {l.ref ? <span className="cdf-ref">{l.ref}</span> : null}
                        {l.nombre}
                      </div>
                      {l.descripcion ? (
                        <div className={`cdf-desc${ab.desc ? '' : ' corta'}`} onClick={() => setAb({ desc: !ab.desc })}>{l.descripcion}</div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Cant.
                        <input type="number" min="1" value={l.cantidad} onChange={(e) => cambiar(l.n, { cantidad: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="cdf-input" style={{ width: '64px', padding: '6px', marginLeft: '4px', fontSize: '14px' }} aria-label={`Cantidad ${l.nombre}`} />
                      </label>
                      <button type="button" className="cdf-link" style={{ color: '#c0392b' }} onClick={() => quitarLinea(l.n)} aria-label={`Quitar ${l.nombre}`}>✕</button>
                    </div>
                  </div>

                  {!l.buscada ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Buscando…</div>
                  ) : (
                    <>
                      {l.opciones.map((o) => {
                        const on = l.elegidos.includes(o.producto_id);
                        const orden = on ? l.elegidos.indexOf(o.producto_id) : -1;
                        const e = ENCAJA[o.encaja];
                        const falta = o.inventariable && o.stock < l.cantidad;
                        return (
                          <label key={o.producto_id} className={`cdf-op${on ? ' on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => alternar(l.n, o.producto_id)} aria-label={o.nombre} />
                            {o.imagen_key ? <img src={`/api/imagenes/${o.imagen_key}`} alt="" /> : <span className="sinfoto" />}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="cdf-op-nombre">{o.nombre}</div>
                              <div className="cdf-op-datos">
                                {e ? <span className="cdf-chip" style={{ color: e.color, background: e.fondo }}>{e.texto}</span> : null}
                                {on && l.elegidos.length > 1 ? <span className="cdf-chip" style={{ color: '#0b6b8f', background: '#e0f7ff' }}>Opción {String.fromCharCode(65 + orden)}</span> : null}
                                <strong style={{ color: 'var(--text)' }}>{pesos(o.precio_venta)}</strong> · Ref. {o.referencia}
                                {o.inventariable ? <span style={{ color: falta ? '#c0392b' : undefined, fontWeight: falta ? 700 : 400 }}> · Stock {o.stock}{falta ? ` (piden ${l.cantidad})` : ''}</span> : ' · Servicio'}
                              </div>
                              {o.nota ? <div className="cdf-nota">⚠️ {o.nota}</div> : null}
                            </div>
                          </label>
                        );
                      })}
                      {!l.opciones.length && <span className="cdf-no">No lo tenemos</span>}
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px' }}>
                        {l.otros?.length > 0 && (
                          <button type="button" className="cdf-link" onClick={() => setAb({ mas: !ab.mas })}>{ab.mas ? 'Ocultar parecidos' : `Ver más parecidos (${l.otros.length})`}</button>
                        )}
                        <button type="button" className="cdf-link" onClick={() => setAb({ buscar: ab.buscar === undefined || ab.buscar === null ? '' : null })}>🔎 Buscar otro</button>
                        {l.fallo && <button type="button" className="cdf-link" onClick={() => buscarOpciones(lineas, [l.n])} disabled={ocupado}>Buscar de nuevo</button>}
                      </div>
                      {ab.mas && l.otros?.length > 0 && (
                        <div className="cdf-drop">
                          {l.otros.map((o) => (
                            <button type="button" key={o.producto_id} onClick={() => agregarOpcion(l.n, o)}>
                              {o.imagen_key ? <img src={`/api/imagenes/${o.imagen_key}`} alt="" /> : <span className="sinfoto" />}
                              <span style={{ flex: 1 }}>{o.nombre}<br /><small style={{ color: 'var(--text-secondary)' }}>{pesos(o.precio_venta)} · Stock {o.stock}</small></span>
                              <span style={{ color: 'var(--teal-dark)', fontWeight: 700 }}>+ Agregar</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {typeof ab.buscar === 'string' && (
                        <div style={{ marginTop: '8px' }}>
                          <input className="cdf-input" autoFocus value={ab.buscar} onChange={(e) => setAb({ buscar: e.target.value })} placeholder="Nombre o referencia" />
                          {buscados.length > 0 && (
                            <div className="cdf-drop">
                              {buscados.map((o) => (
                                <button type="button" key={o.producto_id} onClick={() => { agregarOpcion(l.n, o); setAb({ buscar: null }); }}>
                                  {o.imagen_key ? <img src={`/api/imagenes/${o.imagen_key}`} alt="" /> : <span className="sinfoto" />}
                                  <span style={{ flex: 1 }}>{o.nombre}<br /><small style={{ color: 'var(--text-secondary)' }}>{pesos(o.precio_venta)} · Stock {o.stock}</small></span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {resumen && resumen.faltan.length > 0 && !paso && (
              <div className="cdf-card">
                <strong>No lo tenemos ({resumen.faltan.length})</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '14px' }}>
                  {resumen.faltan.map((l) => (
                    <li key={l.n}>{l.ref ? `${l.ref} · ` : ''}{l.nombre} — {l.cantidad} und.</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {lineas && resumen && (
        <div className="cdf-barra">
          <div className="cdf-barra-in">
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente (opcional)" aria-label="Cliente" />
            <div style={{ fontSize: '13px' }}>
              Total <strong style={{ color: '#19c3ff', fontSize: '17px' }}>{pesos(resumen.total)}</strong>
            </div>
            <button type="button" className="cdf-btn" onClick={crear} disabled={ocupado || !resumen.conProducto}>
              Crear cotización
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
