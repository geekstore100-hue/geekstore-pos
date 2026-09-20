'use client';

import { useEffect, useState, Fragment } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

export default function DevolucionesPage() {
  const [ventaIdBuscar, setVentaIdBuscar] = useState('');
  const [cargandoVenta, setCargandoVenta] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [venta, setVenta] = useState(null);
  const [items, setItems] = useState([]);

  const [itemActivo, setItemActivo] = useState(null);
  const [cantidadDevolver, setCantidadDevolver] = useState('');
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorDevolucion, setErrorDevolucion] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [devoluciones, setDevoluciones] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  async function buscarVenta(e) {
    if (e) e.preventDefault();
    setErrorBusqueda('');
    setMensaje('');
    setVenta(null);
    setItems([]);
    if (!ventaIdBuscar.trim()) {
      setErrorBusqueda('Ingresa el número de venta');
      return;
    }
    setCargandoVenta(true);
    const res = await fetch(`/api/ventas/${ventaIdBuscar.trim()}`);
    const data = await res.json();
    setCargandoVenta(false);
    if (data.ok) {
      setVenta(data.venta);
      setItems(data.items);
    } else {
      setErrorBusqueda(data.error || 'No se encontró esa venta');
    }
  }

  async function cargarDevoluciones() {
    setCargandoLista(true);
    const res = await fetch(`/api/devoluciones?desde=${desde}&hasta=${hasta}`);
    const data = await res.json();
    if (data.ok) setDevoluciones(data.devoluciones);
    setCargandoLista(false);
  }

  useEffect(() => {
    cargarDevoluciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirDevolucion(item) {
    setItemActivo(item.producto_id);
    setCantidadDevolver('');
    setMotivo('');
    setErrorDevolucion('');
  }

  async function confirmarDevolucion(item) {
    const disponible = Number(item.cantidad) - Number(item.ya_devuelta);
    const cant = Number(cantidadDevolver);
    if (!cant || cant <= 0) {
      setErrorDevolucion('Ingresa una cantidad válida');
      return;
    }
    if (cant > disponible) {
      setErrorDevolucion(`Solo puedes devolver hasta ${disponible} unidad(es)`);
      return;
    }
    setProcesando(true);
    setErrorDevolucion('');
    const res = await fetch('/api/devoluciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venta_id: venta.id,
        producto_id: item.producto_id,
        cantidad: cant,
        motivo,
      }),
    });
    const data = await res.json();
    setProcesando(false);
    if (data.ok) {
      setMensaje(`Devolución registrada: ${moneda(data.monto)} en efectivo.`);
      setItemActivo(null);
      const rVenta = await fetch(`/api/ventas/${venta.id}`);
      const dVenta = await rVenta.json();
      if (dVenta.ok) setItems(dVenta.items);
      cargarDevoluciones();
    } else {
      setErrorDevolucion(data.error || 'No se pudo procesar la devolución');
    }
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
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

  return (
    <Shell title="Devoluciones">
      <div style={styles.buscarCard}>
        <h3 style={{ marginTop: 0 }}>Buscar venta para devolver</h3>
        <form onSubmit={buscarVenta} style={{ display: 'flex', gap: '8px' }}>
          <input
            value={ventaIdBuscar}
            onChange={(e) => setVentaIdBuscar(e.target.value)}
            placeholder="Número de venta (ej: 128)"
            style={styles.input}
          />
          <button type="submit" disabled={cargandoVenta} style={styles.btnPrimario}>
            {cargandoVenta ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
        {errorBusqueda && <p style={{ color: 'var(--danger)' }}>{errorBusqueda}</p>}
      </div>

      {venta && (
        <div style={styles.tableCard}>
          <div style={styles.filaResumen}><span>Venta #{venta.id}</span><span>{fechaHora(venta.creado_en)}</span></div>
          <div style={styles.filaResumen}><span>Medio de pago</span><strong>{venta.medio_pago || '-'}</strong></div>

          {venta.anulada && (
            <p style={styles.avisoAnulada}>Esta venta está anulada; no se pueden hacer devoluciones sobre ella.</p>
          )}
          {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Vendido</th>
                <th style={styles.th}>Ya devuelto</th>
                <th style={styles.th}>Disponible</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const disponible = Number(item.cantidad) - Number(item.ya_devuelta);
                return (
                  <Fragment key={item.producto_id}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={styles.td}>{item.nombre}</td>
                      <td style={styles.td}>{item.cantidad}</td>
                      <td style={styles.td}>{item.ya_devuelta}</td>
                      <td style={styles.td}>{disponible}</td>
                      <td style={styles.td}>
                        {!venta.anulada && disponible > 0 && (
                          <button onClick={() => abrirDevolucion(item)} style={styles.btnSecundario}>Devolver</button>
                        )}
                      </td>
                    </tr>
                    {itemActivo === item.producto_id && (
                      <tr>
                        <td style={styles.td} colSpan={5}>
                          <div style={styles.formDevolucion}>
                            <label style={styles.labelCampo}>
                              Cantidad a devolver (máx {disponible})
                              <input
                                type="number"
                                min="1"
                                max={disponible}
                                value={cantidadDevolver}
                                onChange={(e) => setCantidadDevolver(e.target.value)}
                                style={styles.inputCampo}
                              />
                            </label>
                            <label style={styles.labelCampo}>
                              Motivo
                              <input
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                style={styles.inputCampo}
                                placeholder="Ej: producto defectuoso"
                              />
                            </label>
                            {errorDevolucion && <p style={{ color: 'var(--danger)' }}>{errorDevolucion}</p>}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => confirmarDevolucion(item)} disabled={procesando} style={styles.btnPrimario}>
                                {procesando ? 'Procesando...' : 'Confirmar devolución en efectivo'}
                              </button>
                              <button onClick={() => setItemActivo(null)} style={styles.btnSecundario}>Cancelar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {items.length === 0 && (
                <tr><td style={styles.td} colSpan={5}>Esta venta no tiene ítems.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: '32px' }}>Devoluciones recientes</h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button onClick={cargarDevoluciones} style={styles.btnPrimario}>Consultar</button>
      </div>

      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Venta</th>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>Cantidad</th>
              <th style={styles.th}>Monto</th>
              <th style={styles.th}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {devoluciones.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{fechaHora(d.creado_en)}</td>
                <td style={styles.td}>#{d.venta_id}</td>
                <td style={styles.td}>{d.nombre}</td>
                <td style={styles.td}>{d.cantidad}</td>
                <td style={styles.td}>{moneda(d.monto)}</td>
                <td style={styles.td}>{d.motivo || '-'}</td>
              </tr>
            ))}
            {devoluciones.length === 0 && !cargandoLista && (
              <tr><td style={styles.td} colSpan={6}>Sin devoluciones en ese rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  buscarCard: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '20px',
    marginBottom: '20px',
  },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' },
  avisoAnulada: {
    background: '#fdecea',
    color: 'var(--danger)',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    marginTop: '10px',
  },
  formDevolucion: {
    background: 'var(--bg)',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '340px',
  },
  labelCampo: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)' },
  inputCampo: {
    display: 'block',
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    fontSize: '13px',
  },
};
