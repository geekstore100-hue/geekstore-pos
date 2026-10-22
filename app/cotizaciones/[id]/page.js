'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Shell from '../../../components/Shell';
import { generarPdfCotizacion, numeroCotizacion, pesos } from '../../../lib/cotizacionPdf';

// Cotizaciones → nueva / editar (octubre 2026).
// Se buscan productos del POS, se ajustan cantidades, precios y descuentos,
// y se descarga el PDF con el diseño "Poder" (lib/cotizacionPdf.js).

const NOTAS_POR_DEFECTO = 'Precios sujetos a disponibilidad de inventario. Garantía según el producto.';

function normalizar(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/.,;:()]+/g, ' ')
    .replace(/(\d+)\s*(?:en|in|x)\s*(\d+)/g, '$1en$2')
    .replace(/\b(?:play\s*station|playstation|play|ps)\s*([1-5])\b/g, 'ps$1 playstation $1')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineaDesdeProducto(p) {
  return {
    clave: `${p.id}-${Math.random().toString(36).slice(2, 7)}`,
    producto_id: p.id,
    referencia: p.referencia,
    nombre: p.nombre,
    imagen_key: p.imagen_key,
    cantidad: 1,
    precio_unitario: Math.round(Number(p.precio_venta) || 0),
    descuento_pct: 0,
    stock: Number(p.stock) || 0,
    inventariable: p.es_inventariable !== false,
  };
}

function totalLinea(l) {
  const bruto = (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0);
  return Math.round(bruto * (1 - Math.min(100, Math.max(0, Number(l.descuento_pct) || 0)) / 100));
}

export default function EditarCotizacionPage() {
  const { id } = useParams();
  const router = useRouter();
  const esNueva = id === 'nueva';

  const [productos, setProductos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [empresa, setEmpresa] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState([]);
  const [cliente, setCliente] = useState({ cliente_nombre: '', cliente_documento: '', cliente_telefono: '', cliente_email: '' });
  const [vendedor, setVendedor] = useState('');
  const [validez, setValidez] = useState(8);
  const [notas, setNotas] = useState(NOTAS_POR_DEFECTO);
  const [guardada, setGuardada] = useState(null); // la cotización tal como quedó en la base
  const [cambios, setCambios] = useState(false);
  const [cargando, setCargando] = useState(!esNueva);
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const buscadorRef = useRef(null);

  useEffect(() => {
    fetch('/api/productos?para=venta')
      .then((r) => r.json())
      .then((d) => d.ok && setProductos(d.productos || []))
      .catch(() => {});
    fetch('/api/vendedores')
      .then((r) => r.json())
      .then((d) => d.ok && setVendedores((d.vendedores || []).filter((v) => v.activo !== false)))
      .catch(() => {});
    fetch('/api/configuracion/datos-empresa')
      .then((r) => r.json())
      .then((d) => d.ok && setEmpresa(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (esNueva) return;
    setCargando(true);
    fetch(`/api/cotizaciones/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'No se pudo cargar');
        cargarEnFormulario(d.cotizacion);
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function cargarEnFormulario(c) {
    setGuardada(c);
    setCliente({
      cliente_nombre: c.cliente_nombre || '',
      cliente_documento: c.cliente_documento || '',
      cliente_telefono: c.cliente_telefono || '',
      cliente_email: c.cliente_email || '',
    });
    setVendedor(c.vendedor || '');
    setValidez(c.validez_dias || 8);
    setNotas(c.notas || '');
    setLineas((c.items || []).map((it, i) => ({ ...it, clave: `g${i}-${it.producto_id || 'libre'}` })));
    setCambios(false);
  }

  // Stock actual de cada producto (para avisar si no alcanza).
  const stockPorId = useMemo(() => new Map(productos.map((p) => [Number(p.id), p])), [productos]);

  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    if (q.length < 2) return [];
    const palabras = q.split(' ').filter(Boolean);
    const frase = q;
    const puntuados = [];
    for (const p of productos) {
      const texto = normalizar(`${p.nombre} ${p.referencia}`);
      if (!palabras.every((w) => texto.includes(w))) continue;
      let puntos = texto.includes(frase) ? 10 : 0;
      if (String(p.referencia) === busqueda.trim()) puntos += 50;
      if (Number(p.stock) > 0 || p.es_inventariable === false) puntos += 2;
      puntuados.push({ p, puntos });
    }
    return puntuados.sort((a, b) => b.puntos - a.puntos).slice(0, 12).map((x) => x.p);
  }, [busqueda, productos]);

  function marcar() {
    setCambios(true);
    setMensaje('');
  }

  function agregar(p) {
    setLineas((ls) => {
      const existente = ls.find((l) => l.producto_id === p.id && Number(l.descuento_pct) === 0);
      if (existente) return ls.map((l) => (l === existente ? { ...l, cantidad: Number(l.cantidad) + 1 } : l));
      return [...ls, lineaDesdeProducto(p)];
    });
    setBusqueda('');
    marcar();
    buscadorRef.current?.focus();
  }

  function agregarLibre() {
    setLineas((ls) => [
      ...ls,
      { clave: `libre-${Date.now()}`, producto_id: null, referencia: '', nombre: '', imagen_key: null, cantidad: 1, precio_unitario: 0, descuento_pct: 0 },
    ]);
    marcar();
  }

  function cambiarLinea(clave, cambio) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
    marcar();
  }

  function quitarLinea(clave) {
    setLineas((ls) => ls.filter((l) => l.clave !== clave));
    marcar();
  }

  function mover(clave, dir) {
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.clave === clave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const copia = [...ls];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
    marcar();
  }

  const subtotal = lineas.reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);
  const total = lineas.reduce((a, l) => a + totalLinea(l), 0);

  async function guardar() {
    setError('');
    setMensaje('');
    if (!lineas.length) {
      setError('Agrega al menos un producto.');
      return null;
    }
    if (lineas.some((l) => !String(l.nombre || '').trim())) {
      setError('Hay una línea sin nombre.');
      return null;
    }
    setTrabajando('guardar');
    try {
      const cuerpo = {
        ...cliente,
        vendedor,
        validez_dias: Number(validez) || 8,
        notas,
        items: lineas.map(({ producto_id, referencia, nombre, cantidad, precio_unitario, descuento_pct }) => ({
          producto_id,
          referencia,
          nombre,
          cantidad: Number(cantidad),
          precio_unitario: Number(precio_unitario),
          descuento_pct: Number(descuento_pct) || 0,
        })),
      };
      const res = await fetch(esNueva || !guardada ? '/api/cotizaciones' : `/api/cotizaciones/${guardada.id}`, {
        method: esNueva || !guardada ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      cargarEnFormulario(data.cotizacion);
      setMensaje(`✅ Cotización ${numeroCotizacion(data.cotizacion.id)} guardada.`);
      if (esNueva) router.replace(`/cotizaciones/${data.cotizacion.id}`);
      return data.cotizacion;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setTrabajando('');
    }
  }

  // Guarda si hay cambios y devuelve la cotización lista para el PDF.
  async function cotizacionAlDia() {
    if (guardada && !cambios) return guardada;
    return guardar();
  }

  async function pdf(accion) {
    const c = await cotizacionAlDia();
    if (!c) return;
    setTrabajando(accion);
    setError('');
    try {
      const doc = await generarPdfCotizacion(c, empresa);
      const nombreArchivo = `Cotizacion-${numeroCotizacion(c.id)}-GeekStore.pdf`;
      if (accion === 'compartir') {
        const archivo = new File([doc.output('blob')], nombreArchivo, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: `Cotización ${numeroCotizacion(c.id)}` }).catch(() => {});
          return;
        }
        doc.save(nombreArchivo);
        setMensaje('Este navegador no permite compartir archivos: se descargó el PDF para que lo adjuntes.');
        return;
      }
      if (accion === 'ver') {
        window.open(doc.output('bloburl'), '_blank');
        return;
      }
      doc.save(nombreArchivo);
    } catch (e) {
      setError(`No se pudo crear el PDF: ${e.message}`);
    } finally {
      setTrabajando('');
    }
  }

  function enlaceWhatsapp() {
    const tel = String(cliente.cliente_telefono || '').replace(/\D/g, '');
    if (!tel || !guardada) return null;
    const numero = tel.length === 10 ? `57${tel}` : tel;
    const nombre = cliente.cliente_nombre ? ` ${cliente.cliente_nombre.split(' ')[0]}` : '';
    const texto = `Hola${nombre}, te comparto la cotización ${numeroCotizacion(guardada.id)} de Geek Store por ${pesos(guardada.total)}. ¡Quedo atento!`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }

  const wa = enlaceWhatsapp();

  return (
    <Shell title={esNueva ? 'Nueva cotización' : guardada ? `Cotización ${numeroCotizacion(guardada.id)}` : 'Cotización'}>
      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/cotizaciones" style={{ color: 'var(--teal-dark)', fontSize: '14px' }}>← Todas las cotizaciones</Link>
        {cambios && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Hay cambios sin guardar</span>}
      </div>

      {cargando ? (
        <div style={s.card}>Cargando…</div>
      ) : (
        <div className="cot-rejilla" style={s.rejilla}>
          <div style={{ minWidth: 0 }}>
            <div style={s.card}>
              <h3 style={s.titulo}>Productos</h3>
              <div style={{ position: 'relative' }}>
                <input
                  ref={buscadorRef}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && resultados[0]) {
                      e.preventDefault();
                      agregar(resultados[0]);
                    }
                  }}
                  placeholder="Buscar producto por nombre o referencia…"
                  style={s.input}
                  autoFocus={esNueva}
                />
                {resultados.length > 0 && (
                  <div style={s.resultados}>
                    {resultados.map((p) => (
                      <button key={p.id} type="button" onClick={() => agregar(p)} style={s.resultado}>
                        {p.imagen_key ? <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={s.mini} /> : <span style={s.mini} />}
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>{p.nombre}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Ref. {p.referencia} · {p.es_inventariable === false ? 'Servicio' : `Stock ${Number(p.stock) || 0}`}
                          </span>
                        </span>
                        <strong style={{ fontSize: '14px' }}>{pesos(p.precio_venta)}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={agregarLibre} style={{ ...s.btnLink, marginTop: '8px' }}>
                + Agregar línea libre (servicio, envío, algo que no está en el POS)
              </button>

              {lineas.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '16px 0 0' }}>
                  Busca un producto arriba y tócalo para agregarlo (Enter agrega el primero).
                </p>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  {lineas.map((l, i) => {
                    const prod = l.producto_id ? stockPorId.get(Number(l.producto_id)) : null;
                    const sinStock = prod && prod.es_inventariable !== false && Number(prod.stock) < Number(l.cantidad);
                    return (
                      <div key={l.clave} style={s.linea}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          {l.imagen_key ? <img src={`/api/imagenes/${l.imagen_key}`} alt="" style={s.foto} /> : <span style={{ ...s.foto, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>{l.producto_id ? '' : 'Libre'}</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <input
                              value={l.nombre}
                              onChange={(e) => cambiarLinea(l.clave, { nombre: e.target.value })}
                              placeholder="Descripción"
                              style={{ ...s.input, fontWeight: 600 }}
                              aria-label="Nombre en la cotización"
                            />
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              {l.producto_id ? `Ref. ${l.referencia}` : 'Línea libre'}
                              {prod && prod.es_inventariable !== false ? ` · Stock ${Number(prod.stock) || 0}` : ''}
                              {sinStock && <span style={{ color: '#c0392b', fontWeight: 600 }}> · No alcanza el stock</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button type="button" onClick={() => mover(l.clave, -1)} disabled={i === 0} style={s.btnMini} aria-label="Subir">▲</button>
                            <button type="button" onClick={() => mover(l.clave, 1)} disabled={i === lineas.length - 1} style={s.btnMini} aria-label="Bajar">▼</button>
                          </div>
                          <button type="button" onClick={() => quitarLinea(l.clave)} style={{ ...s.btnMini, color: '#c0392b' }} aria-label="Quitar">✕</button>
                        </div>
                        <div className="cot-numeros" style={s.numeros}>
                          <label style={s.etiqueta}>
                            Cant.
                            <input type="number" min="1" step="1" value={l.cantidad} onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })} style={s.input} />
                          </label>
                          <label style={s.etiqueta}>
                            Precio unit.
                            <input type="number" min="0" step="1" value={l.precio_unitario} onChange={(e) => cambiarLinea(l.clave, { precio_unitario: e.target.value })} style={s.input} />
                          </label>
                          <label style={s.etiqueta}>
                            Desc. %
                            <input type="number" min="0" max="100" step="1" value={l.descuento_pct} onChange={(e) => cambiarLinea(l.clave, { descuento_pct: e.target.value })} style={s.input} />
                          </label>
                          <div style={{ ...s.etiqueta, textAlign: 'right' }}>
                            Total
                            <strong style={{ display: 'block', fontSize: '16px', marginTop: '8px' }}>{pesos(totalLinea(l))}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={s.card}>
              <h3 style={s.titulo}>Cliente</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                <input value={cliente.cliente_nombre} onChange={(e) => { setCliente({ ...cliente, cliente_nombre: e.target.value }); marcar(); }} placeholder="Nombre o empresa" style={s.input} />
                <input value={cliente.cliente_documento} onChange={(e) => { setCliente({ ...cliente, cliente_documento: e.target.value }); marcar(); }} placeholder="Cédula / NIT (opcional)" style={s.input} />
                <input value={cliente.cliente_telefono} onChange={(e) => { setCliente({ ...cliente, cliente_telefono: e.target.value }); marcar(); }} placeholder="Celular (opcional)" inputMode="tel" style={s.input} />
                <input value={cliente.cliente_email} onChange={(e) => { setCliente({ ...cliente, cliente_email: e.target.value }); marcar(); }} placeholder="Correo (opcional)" inputMode="email" style={s.input} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '8px', marginTop: '10px' }}>
                <label style={s.etiqueta}>
                  Atendido por
                  <select value={vendedor} onChange={(e) => { setVendedor(e.target.value); marcar(); }} style={s.input}>
                    <option value="">—</option>
                    {vendedor && !vendedores.some((v) => v.nombre === vendedor) && <option value={vendedor}>{vendedor}</option>}
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.nombre}>{v.nombre}</option>
                    ))}
                  </select>
                </label>
                <label style={s.etiqueta}>
                  Válida (días)
                  <input type="number" min="1" max="365" value={validez} onChange={(e) => { setValidez(e.target.value); marcar(); }} style={s.input} />
                </label>
              </div>
              <label style={{ ...s.etiqueta, display: 'block', marginTop: '10px' }}>
                Condiciones / notas (salen en el PDF)
                <textarea value={notas} onChange={(e) => { setNotas(e.target.value); marcar(); }} rows={3} style={{ ...s.input, resize: 'vertical' }} />
              </label>
            </div>

            <div style={{ ...s.card, ...s.tarjetaTotal }}>
              <div style={s.filaTotal}><span>Subtotal</span><span>{pesos(subtotal)}</span></div>
              {subtotal - total > 0 && (
                <div style={{ ...s.filaTotal, color: '#ff6fae' }}><span>Descuentos</span><span>- {pesos(subtotal - total)}</span></div>
              )}
              <div style={{ ...s.filaTotal, fontSize: '22px', fontWeight: 800, marginTop: '6px' }}>
                <span>TOTAL</span>
                <span style={{ color: '#19c3ff' }}>{pesos(total)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#a3aec2', marginTop: '4px' }}>{lineas.length} producto{lineas.length === 1 ? '' : 's'} · IVA incluido</div>
            </div>

            <div style={s.card}>
              {error && <p style={{ color: '#c0392b', margin: '0 0 10px' }}>{error}</p>}
              {mensaje && <p style={{ color: '#0b7a3e', margin: '0 0 10px' }}>{mensaje}</p>}
              <div style={{ display: 'grid', gap: '8px' }}>
                <button type="button" onClick={guardar} disabled={!!trabajando || (!cambios && !!guardada)} style={s.btnSecundario}>
                  {trabajando === 'guardar' ? 'Guardando…' : guardada && !cambios ? '✓ Guardada' : '💾 Guardar'}
                </button>
                <button type="button" onClick={() => pdf('descargar')} disabled={!!trabajando || !lineas.length} style={s.btnPrimario}>
                  {trabajando === 'descargar' ? 'Creando PDF…' : '📄 Descargar PDF'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button type="button" onClick={() => pdf('ver')} disabled={!!trabajando || !lineas.length} style={s.btnSecundario}>
                    👁 Ver PDF
                  </button>
                  <button type="button" onClick={() => pdf('compartir')} disabled={!!trabajando || !lineas.length} style={s.btnSecundario}>
                    📤 Compartir
                  </button>
                </div>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...s.btnSecundario, textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                    💬 Abrir chat de WhatsApp del cliente
                  </a>
                )}
              </div>
              {!empresa.telefono && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '10px 0 0' }}>
                  Tip: en Configuraciones → Datos de la empresa pon el teléfono/WhatsApp para que salga en el PDF.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @media (min-width: 1000px) { .cot-rejilla { grid-template-columns: minmax(0, 1fr) 360px !important; } }
        @media (max-width: 600px) { .cot-numeros { padding-left: 0 !important; grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </Shell>
  );
}

const s = {
  rejilla: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0 20px', alignItems: 'start' },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', marginBottom: '16px' },
  titulo: { margin: '0 0 12px', fontSize: '16px' },
  input: { width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box', background: '#fff', marginTop: '0' },
  etiqueta: { fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' },
  resultados: { position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,.12)', maxHeight: '420px', overflowY: 'auto' },
  resultado: { display: 'flex', gap: '10px', alignItems: 'center', width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  mini: { width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: '#f3f5f9', flexShrink: 0, display: 'inline-block' },
  foto: { width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--border)', flexShrink: 0 },
  linea: { padding: '12px 0', borderTop: '1px solid var(--border)' },
  numeros: { display: 'grid', gridTemplateColumns: '70px 1fr 70px 1fr', gap: '8px', marginTop: '8px', paddingLeft: '62px' },
  btnMini: { border: '1px solid var(--border)', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', padding: '3px 7px', lineHeight: 1 },
  btnLink: { border: 'none', background: 'none', padding: 0, color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', textAlign: 'left' },
  btnPrimario: { padding: '11px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '15px' },
  btnSecundario: { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '14px' },
  tarjetaTotal: { background: '#0b0f1a', color: '#fff', borderColor: '#0b0f1a', borderBottom: '3px solid #ff2e88' },
  filaTotal: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '14px', padding: '2px 0' },
};
