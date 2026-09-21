'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

let contadorKey = 0;
function nuevaLinea() {
  contadorKey += 1;
  return {
    _key: contadorKey,
    producto_id: '',
    busquedaProducto: '',
    costo: 0,
    objetivo: 'incrementar',
    cantidad: '',
  };
}

export default function AjustesInventarioPage() {
  const [productos, setProductos] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [bodegaId, setBodegaId] = useState('');
  const [stockPorProducto, setStockPorProducto] = useState({});
  const [ajustesRecientes, setAjustesRecientes] = useState([]);
  const [filas, setFilas] = useState([nuevaLinea()]);
  const [filaBuscando, setFilaBuscando] = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Cuando se llega aquí desde "Confirmar" en Reabastecimiento, este ajuste
  // en realidad es la mitad de un traspaso: la mercancía sale de esta otra
  // bodega y llega a la que se seleccione abajo. Se guarda para mandarlo al
  // servidor al guardar, y para mostrar el aviso en pantalla.
  const [traspasoOrigen, setTraspasoOrigen] = useState(null); // {id, nombre}

  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem('geekstore_traspaso_pendiente');
      if (!crudo) return;
      sessionStorage.removeItem('geekstore_traspaso_pendiente');
      const datos = JSON.parse(crudo);
      if (!datos || !Array.isArray(datos.items) || datos.items.length === 0) return;

      setBodegaId(String(datos.bodega_destino_id));
      setObservaciones(datos.observaciones || '');
      setTraspasoOrigen({ id: datos.bodega_origen_id, nombre: datos.bodega_origen_nombre });
      setFilas(
        datos.items.map((it) => {
          contadorKey += 1;
          return {
            _key: contadorKey,
            producto_id: String(it.producto_id),
            busquedaProducto: `${it.referencia} - ${it.nombre}`,
            costo: Number(it.costo) || 0,
            objetivo: 'incrementar',
            cantidad: String(it.cantidad),
          };
        })
      );
    } catch {
      // Si el contenido guardado está corrupto, simplemente se ignora y la
      // pantalla arranca vacía como siempre.
    }
  }, []);

  // Acceso restringido con la clave de administrador (Configuraciones >
  // Seguridad). Si todavía no se ha creado ninguna clave, no se bloquea nada.
  const [verificandoAcceso, setVerificandoAcceso] = useState(true);
  const [accesoPermitido, setAccesoPermitido] = useState(false);
  const [claveIngresada, setClaveIngresada] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [verificandoClave, setVerificandoClave] = useState(false);

  async function verificarAcceso(e) {
    if (e) e.preventDefault();
    setErrorClave('');
    setVerificandoClave(true);
    const res = await fetch('/api/configuracion/clave-admin/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: claveIngresada }),
    });
    const data = await res.json();
    setVerificandoClave(false);
    if (data.ok && data.valida) {
      setAccesoPermitido(true);
    } else {
      setErrorClave('Clave incorrecta');
    }
  }

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/configuracion/clave-admin/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: '' }),
      });
      const data = await res.json();
      // Si no hay clave configurada, la verificación con clave vacía ya viene
      // como válida (no hay nada que bloquear todavía).
      if (data.ok && data.valida) setAccesoPermitido(true);
      setVerificandoAcceso(false);
    })();
  }, []);

  async function cargarTodo() {
    const [rProd, rBod, rAjustes] = await Promise.all([
      fetch('/api/productos'),
      fetch('/api/bodegas'),
      fetch('/api/ajustes-inventario'),
    ]);
    const dProd = await rProd.json();
    const dBod = await rBod.json();
    const dAjustes = await rAjustes.json();
    if (dProd.ok) setProductos(dProd.productos.filter((p) => p.activo));
    if (dBod.ok) {
      setBodegas(dBod.bodegas);
      setBodegaId((actual) => {
        if (actual) return actual;
        const principal = dBod.bodegas.find((b) => b.nombre === 'Principal');
        return String((principal || dBod.bodegas[0])?.id || '');
      });
    }
    if (dAjustes.ok) setAjustesRecientes(dAjustes.ajustes);
  }

  async function cargarStock(bId) {
    if (!bId) {
      setStockPorProducto({});
      return;
    }
    const res = await fetch(`/api/stock?bodega_id=${bId}`);
    const data = await res.json();
    if (data.ok) {
      const mapa = {};
      data.stock.forEach((s) => {
        mapa[s.producto_id] = Number(s.cantidad);
      });
      setStockPorProducto(mapa);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    if (bodegaId) cargarStock(bodegaId);
  }, [bodegaId]);

  function actualizarFila(key, campo, valor) {
    setFilas((prev) => prev.map((f) => (f._key === key ? { ...f, [campo]: valor } : f)));
  }

  function buscarEnFila(key, texto) {
    setFilas((prev) => prev.map((f) => (f._key === key ? { ...f, busquedaProducto: texto, producto_id: '' } : f)));
    setFilaBuscando(key);
  }

  function resultadosPara(texto) {
    const q = texto.trim().toLowerCase();
    if (!q) return productos.slice(0, 8);
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)).slice(0, 8);
  }

  function seleccionarProducto(key, producto) {
    setFilas((prev) =>
      prev.map((f) =>
        f._key === key
          ? {
              ...f,
              producto_id: String(producto.id),
              busquedaProducto: `${producto.referencia} - ${producto.nombre}`,
              costo: Number(producto.precio_costo) || 0,
            }
          : f
      )
    );
    setFilaBuscando(null);
  }

  function agregarFila() {
    setFilas((prev) => [...prev, nuevaLinea()]);
  }

  function quitarFila(key) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f._key !== key) : prev));
  }

  function cantidadActualDe(fila) {
    if (!fila.producto_id) return 0;
    return stockPorProducto[fila.producto_id] ?? 0;
  }

  function cantidadFinalDe(fila) {
    const actual = cantidadActualDe(fila);
    const cambio = Number(fila.cantidad) || 0;
    return fila.objetivo === 'incrementar' ? actual + cambio : actual - cambio;
  }

  function totalAjustadoDe(fila) {
    const cambio = Number(fila.cantidad) || 0;
    return fila.costo * cambio;
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  const totalGeneral = filas.reduce((acc, f) => acc + totalAjustadoDe(f), 0);

  // Si este ajuste viene de un traspaso, la ventana para imprimir el
  // documento se abre ANTES del await (dentro del clic) para que el
  // navegador no la bloquee como popup; por eso se recibe ya abierta acá.
  async function guardar(ventanaImpresion) {
    setError('');
    setMensaje('');

    if (!bodegaId) {
      setError('Selecciona la bodega');
      if (ventanaImpresion) ventanaImpresion.close();
      return;
    }
    if (traspasoOrigen && String(traspasoOrigen.id) === String(bodegaId)) {
      setError('La bodega de destino no puede ser igual a la bodega de origen del traspaso');
      if (ventanaImpresion) ventanaImpresion.close();
      return;
    }
    const lineasValidas = filas.filter((f) => f.producto_id && Number(f.cantidad) > 0);
    if (lineasValidas.length === 0) {
      setError('Agrega al menos un producto con una cantidad mayor a 0');
      if (ventanaImpresion) ventanaImpresion.close();
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/ajustes-inventario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bodega_id: bodegaId,
        observaciones,
        bodega_origen_id: traspasoOrigen ? traspasoOrigen.id : undefined,
        items: lineasValidas.map((f) => ({
          producto_id: f.producto_id,
          objetivo: f.objetivo,
          cantidad: Number(f.cantidad),
        })),
      }),
    });
    const data = await res.json();
    setGuardando(false);

    if (!data.ok) {
      setError(data.error || 'No se pudo guardar el ajuste');
      if (ventanaImpresion) ventanaImpresion.close();
      return;
    }

    if (ventanaImpresion && data.traspasoId) {
      ventanaImpresion.location = `/traspasos/${data.traspasoId}/imprimir`;
    } else if (ventanaImpresion) {
      ventanaImpresion.close();
    }

    setMensaje(
      data.traspasoId
        ? 'Ajuste guardado. Se abrió el documento del traspaso para imprimir y entregar al vendedor.'
        : 'Ajuste guardado correctamente'
    );
    setFilas([nuevaLinea()]);
    setObservaciones('');
    setTraspasoOrigen(null);
    cargarTodo();
    cargarStock(bodegaId);
  }

  function onClickGuardar() {
    // La ventana se abre de forma síncrona dentro del clic (antes del
    // fetch), que es la única manera de que el navegador no la bloquee.
    const ventanaImpresion = traspasoOrigen ? window.open('', '_blank') : null;
    guardar(ventanaImpresion);
  }

  function cancelar() {
    setFilas([nuevaLinea()]);
    setObservaciones('');
    setTraspasoOrigen(null);
    setError('');
    setMensaje('');
  }

  if (verificandoAcceso) {
    return (
      <Shell title="Ajustes de inventario">
        <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
      </Shell>
    );
  }

  if (!accesoPermitido) {
    return (
      <Shell title="Ajustes de inventario">
        <div style={styles.candadoCard}>
          <h2 style={{ marginTop: 0 }}>Acceso restringido</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Esta pantalla está protegida con la clave de administrador. Pídesela a quien la tenga para poder entrar.
          </p>
          <form onSubmit={verificarAcceso}>
            <label style={styles.labelCampo}>
              Clave de administrador
              <input
                type="password"
                value={claveIngresada}
                onChange={(e) => setClaveIngresada(e.target.value)}
                style={styles.inputCampo}
                autoFocus
              />
            </label>
            {errorClave && <p style={{ color: 'var(--danger)' }}>{errorClave}</p>}
            <button type="submit" disabled={verificandoClave} style={styles.btnPrimario}>
              {verificandoClave ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Ajustes de inventario">
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Nuevo ajuste de inventario</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
          Modifica las cantidades de los productos que tienes en la bodega seleccionada.
        </p>

        {traspasoOrigen && (
          <div style={styles.avisoTraspaso}>
            Este ajuste viene de un traspaso desde <strong>{traspasoOrigen.nombre}</strong>. Verifica las cantidades
            que realmente llegaron (columna "Cantidad actual" muestra lo que ya hay) antes de guardar — al guardar se
            descuenta el stock de esa bodega y se abre el documento para imprimir.
          </div>
        )}

        <div style={styles.grid2}>
          <label style={styles.labelCampo}>
            Bodega *
            <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} style={styles.inputCampo}>
              <option value="">Seleccionar</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </label>
          <label style={styles.labelCampo}>
            Numeración
            <select value="ajuste" style={styles.inputCampo} disabled>
              <option value="ajuste">Ajuste de Inventario</option>
            </select>
          </label>
        </div>

        <label style={styles.labelCampo}>
          Observaciones
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ ...styles.inputCampo, minHeight: '50px' }}
          />
        </label>

        <h3 style={styles.subtitulo}>Productos a ajustar</h3>
        <div>
          <table style={styles.tabla}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Costo</th>
                <th style={styles.th}>Cantidad actual</th>
                <th style={styles.th}>Objetivo</th>
                <th style={styles.th}>Cantidad</th>
                <th style={styles.th}>Cantidad final</th>
                <th style={styles.th}>Total ajustado</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f._key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...styles.td, minWidth: '220px', position: 'relative' }}>
                    <input
                      value={f.busquedaProducto}
                      onChange={(e) => buscarEnFila(f._key, e.target.value)}
                      onFocus={() => setFilaBuscando(f._key)}
                      onBlur={() => setTimeout(() => setFilaBuscando((actual) => (actual === f._key ? null : actual)), 150)}
                      placeholder="Escribe referencia o nombre..."
                      style={styles.inputCampo}
                      disabled={!bodegaId}
                    />
                    {filaBuscando === f._key && (
                      <div style={styles.listaResultados}>
                        {resultadosPara(f.busquedaProducto).map((p) => (
                          <div key={p.id} onMouseDown={() => seleccionarProducto(f._key, p)} style={styles.itemResultado}>
                            {p.referencia} — {p.nombre}
                          </div>
                        ))}
                        {resultadosPara(f.busquedaProducto).length === 0 && (
                          <div style={{ ...styles.itemResultado, color: 'var(--text-secondary)' }}>Sin resultados</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>{f.producto_id ? moneda(f.costo) : '-'}</td>
                  <td style={styles.td}>{f.producto_id ? cantidadActualDe(f) : '-'}</td>
                  <td style={styles.td}>
                    <select
                      value={f.objetivo}
                      onChange={(e) => actualizarFila(f._key, 'objetivo', e.target.value)}
                      style={styles.inputCelda}
                    >
                      <option value="incrementar">Incrementar</option>
                      <option value="disminuir">Disminuir</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      min="0"
                      value={f.cantidad}
                      onChange={(e) => actualizarFila(f._key, 'cantidad', e.target.value)}
                      style={styles.inputCelda}
                    />
                  </td>
                  <td style={styles.td}>{f.producto_id ? cantidadFinalDe(f) : '-'}</td>
                  <td style={styles.td}>{f.producto_id ? moneda(totalAjustadoDe(f)) : '-'}</td>
                  <td style={styles.td}>
                    <button type="button" onClick={() => quitarFila(f._key)} style={styles.btnQuitar}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={agregarFila} style={styles.linkBtn}>+ Agregar producto</button>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

        <div style={styles.filaInferior}>
          <div style={{ flex: 1 }} />
          <div style={styles.resumen}>
            <div style={{ ...styles.filaResumen, fontWeight: 700 }}>
              <span>Total del ajuste</span>
              <span>{moneda(totalGeneral)}</span>
            </div>
          </div>
        </div>

        <div style={styles.filaBotones}>
          <button type="button" onClick={cancelar} style={styles.btnSecundario}>Cancelar</button>
          <button type="button" onClick={onClickGuardar} disabled={guardando} style={styles.btnPrimario}>
            {guardando ? 'Guardando...' : traspasoOrigen ? 'Guardar e imprimir' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <h3 style={{ marginBottom: '10px' }}>Ajustes recientes</h3>
      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Bodega</th>
              <th style={styles.th}>Observaciones</th>
              <th style={styles.th}>Ítems</th>
              <th style={styles.th}>Total</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {ajustesRecientes.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{new Date(a.creado_en).toLocaleString('es-CO')}</td>
                <td style={styles.td}>
                  {a.bodega_nombre || '-'}
                  {a.traspaso_origen_nombre && (
                    <div style={{ fontSize: '11px', color: 'var(--teal-dark)' }}>Traspaso desde {a.traspaso_origen_nombre}</div>
                  )}
                </td>
                <td style={styles.td}>{a.observaciones || '-'}</td>
                <td style={styles.td}>{a.items}</td>
                <td style={styles.td}>{moneda(a.total)}</td>
                <td style={styles.td}>
                  {a.traspaso_id && (
                    <a href={`/traspasos/${a.traspaso_id}/imprimir`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal-dark)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                      Ver / imprimir
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {ajustesRecientes.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={6}>Sin ajustes registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', marginBottom: '28px' },
  candadoCard: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '24px',
    maxWidth: '380px',
  },
  subtitulo: { marginBottom: '10px' },
  avisoTraspaso: {
    background: 'var(--teal-light)',
    color: 'var(--teal-dark)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '4px', maxWidth: '600px' },
  labelCampo: { display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' },
  inputCampo: {
    display: 'block',
    width: '100%',
    padding: '9px',
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    fontSize: '14px',
  },
  linkBtn: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', padding: 0, marginTop: '8px' },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' },
  td: { padding: '8px', fontSize: '14px', verticalAlign: 'top' },
  inputCelda: { width: '110px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  listaResultados: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    marginTop: '2px',
    maxHeight: '220px',
    overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  itemResultado: { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13px' },
  btnQuitar: { border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' },
  filaInferior: { display: 'flex', gap: '24px', marginTop: '24px', alignItems: 'flex-start' },
  resumen: { width: '280px', flexShrink: 0, background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '16px' },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' },
  filaBotones: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' },
  btnSecundario: { padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  btnPrimario: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
};
