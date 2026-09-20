'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

export default function ReabastecimientoPage() {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [bodegas, setBodegas] = useState([]);
  const [traspasos, setTraspasos] = useState([]);
  const [cargandoTraspasos, setCargandoTraspasos] = useState(true);

  const [itemActivo, setItemActivo] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorTraspaso, setErrorTraspaso] = useState('');
  const [mensaje, setMensaje] = useState('');

  const bodegaPrincipal = useMemo(() => bodegas.find((b) => b.nombre === 'Principal'), [bodegas]);
  const bodegaDistribuidor = useMemo(() => bodegas.find((b) => b.nombre === 'Bodega Distribuidor'), [bodegas]);

  async function cargarAlertas() {
    setCargando(true);
    setError('');
    const res = await fetch('/api/reabastecimiento');
    const data = await res.json();
    if (data.ok) setAlertas(data.alertas);
    else setError(data.error || 'No se pudo cargar el análisis');
    setCargando(false);
  }

  async function cargarBodegas() {
    const res = await fetch('/api/bodegas');
    const data = await res.json();
    if (data.ok) setBodegas(data.bodegas);
  }

  async function cargarTraspasos() {
    setCargandoTraspasos(true);
    const res = await fetch('/api/traspasos');
    const data = await res.json();
    if (data.ok) setTraspasos(data.traspasos);
    setCargandoTraspasos(false);
  }

  useEffect(() => {
    cargarAlertas();
    cargarBodegas();
    cargarTraspasos();
  }, []);

  function abrirTraslado(item) {
    setItemActivo(item.id);
    setCantidadInput(String(item.cantidad_sugerida || ''));
    setErrorTraspaso('');
    setMensaje('');
  }

  async function confirmarTraslado(item) {
    const cantidad = Number(cantidadInput);
    if (!cantidad || cantidad <= 0) {
      setErrorTraspaso('Ingresa una cantidad válida');
      return;
    }
    if (cantidad > item.stock_distribuidor) {
      setErrorTraspaso(`Solo hay ${item.stock_distribuidor} unidad(es) disponibles en Distribuidor`);
      return;
    }
    if (!bodegaPrincipal || !bodegaDistribuidor) {
      setErrorTraspaso('No se encontraron las bodegas Principal y Distribuidor');
      return;
    }

    setProcesando(true);
    setErrorTraspaso('');
    const res = await fetch('/api/traspasos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: item.id,
        bodega_origen_id: bodegaDistribuidor.id,
        bodega_destino_id: bodegaPrincipal.id,
        cantidad,
        observaciones: 'Sugerido por Reabastecimiento',
      }),
    });
    const data = await res.json();
    setProcesando(false);

    if (data.ok) {
      setMensaje(`Se trasladaron ${cantidad} unidad(es) de "${item.nombre}" a Principal.`);
      setItemActivo(null);
      cargarAlertas();
      cargarTraspasos();
    } else {
      setErrorTraspaso(data.error || 'No se pudo hacer el traslado');
    }
  }

  function moneda0(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function fechaHora(iso) {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const agotados = alertas.filter((a) => a.prioridad === 1);
  const porAgotarse = alertas.filter((a) => a.prioridad === 2);

  function renderFila(item) {
    return (
      <div key={item.id} style={styles.fila}>
        <div style={styles.filaInfo}>
          {item.imagen_key ? (
            <img src={`/api/imagenes/${item.imagen_key}`} alt="" style={styles.miniatura} />
          ) : (
            <div style={styles.miniaturaVacia} />
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{item.nombre}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.referencia}</div>
          </div>
        </div>

        <div style={styles.filaStock}>
          <span style={styles.badgeStock}>Principal: {moneda0(item.stock_principal)}</span>
          <span style={styles.badgeStock}>Distribuidor: {moneda0(item.stock_distribuidor)}</span>
        </div>

        <div style={styles.filaVelocidad}>
          {item.venta_diaria_promedio > 0 ? (
            <>
              <div>{item.venta_diaria_promedio.toFixed(2)} u/día (30 días)</div>
              {item.dias_cobertura !== null && (
                <div style={{ color: 'var(--text-secondary)' }}>~{Math.floor(item.dias_cobertura)} día(s) de cobertura</div>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>Sin ventas recientes</span>
          )}
        </div>

        <div style={styles.filaAccion}>
          {item.accion === 'trasladar' ? (
            itemActivo === item.id ? (
              <div style={styles.formTraslado}>
                <input
                  type="number"
                  min="1"
                  max={item.stock_distribuidor}
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
                  style={styles.inputCantidad}
                />
                <button onClick={() => confirmarTraslado(item)} disabled={procesando} style={styles.btnPrimario}>
                  {procesando ? 'Moviendo...' : 'Confirmar'}
                </button>
                <button onClick={() => setItemActivo(null)} style={styles.btnSecundario}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => abrirTraslado(item)} style={styles.btnPrimario}>
                Trasladar {item.cantidad_sugerida} {item.estimado ? '(estimado)' : ''}
              </button>
            )
          ) : (
            <span style={styles.badgeComprar}>Comprar más (sin stock en Distribuidor)</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Shell title="Reabastecimiento">
      <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
        Productos agotados en Principal, y productos que según su ritmo de venta se van a agotar pronto. Se calcula
        con las ventas de los últimos 30 días.
      </p>

      {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}
      {errorTraspaso && itemActivo === null && <p style={{ color: 'var(--danger)' }}>{errorTraspaso}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <>
          <h3 style={{ marginTop: '20px' }}>Agotados en Principal ({agotados.length})</h3>
          <div style={styles.tableCard}>
            {agotados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No hay productos agotados en Principal. 🎉</p>}
            {agotados.map(renderFila)}
          </div>

          <h3 style={{ marginTop: '28px' }}>Por agotarse pronto ({porAgotarse.length})</h3>
          <div style={styles.tableCard}>
            {porAgotarse.length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>Ningún producto está por agotarse según su ritmo de venta.</p>
            )}
            {porAgotarse.map(renderFila)}
          </div>
        </>
      )}

      <h3 style={{ marginTop: '28px' }}>Traspasos recientes</h3>
      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>De</th>
              <th style={styles.th}>A</th>
              <th style={styles.th}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {traspasos.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{fechaHora(t.creado_en)}</td>
                <td style={styles.td}>{t.producto_nombre}</td>
                <td style={styles.td}>{t.bodega_origen_nombre}</td>
                <td style={styles.td}>{t.bodega_destino_nombre}</td>
                <td style={styles.td}>{moneda0(t.cantidad)}</td>
              </tr>
            ))}
            {traspasos.length === 0 && !cargandoTraspasos && (
              <tr><td style={styles.td} colSpan={5}>Todavía no se ha hecho ningún traspaso.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', marginBottom: '8px' },
  fila: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 4px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  filaInfo: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: 1 },
  miniatura: { width: '44px', height: '44px', objectFit: 'contain', background: 'var(--bg)', borderRadius: '8px' },
  miniaturaVacia: { width: '44px', height: '44px', borderRadius: '8px', background: 'var(--bg)' },
  filaStock: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '140px' },
  badgeStock: {
    fontSize: '11px',
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
    width: 'fit-content',
  },
  filaVelocidad: { fontSize: '13px', minWidth: '160px' },
  filaAccion: { minWidth: '180px' },
  formTraslado: { display: 'flex', gap: '6px', alignItems: 'center' },
  inputCantidad: { width: '70px', padding: '7px', borderRadius: '6px', border: '1px solid var(--border)' },
  btnPrimario: { padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  btnSecundario: { padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  badgeComprar: { fontSize: '12px', color: 'var(--warning)', fontWeight: 600 },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
};
