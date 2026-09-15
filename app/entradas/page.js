'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

export default function EntradasPage() {
  const [productos, setProductos] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarTodo() {
    const [rProd, rEntradas] = await Promise.all([fetch('/api/productos'), fetch('/api/entradas')]);
    const dProd = await rProd.json();
    const dEntradas = await rEntradas.json();
    if (dProd.ok) setProductos(dProd.productos);
    if (dEntradas.ok) setEntradas(dEntradas.entradas);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q));
  }, [busqueda, productos]);

  const seleccionado = productos.find((p) => String(p.id) === String(productoId));

  async function confirmarEntrada(e) {
    e.preventDefault();
    setError('');
    setMensaje('');

    if (!productoId) {
      setError('Selecciona un producto');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/entradas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: Number(productoId), cantidad: Number(cantidad), nota }),
    });
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMensaje('Entrada registrada.');
      setProductoId('');
      setCantidad(1);
      setNota('');
      setBusqueda('');
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la entrada');
    }
  }

  return (
    <Shell title="Entradas">
      <div style={styles.formCard}>
        <h3 style={{ marginTop: 0 }}>Entrada de mercancía</h3>
        <form onSubmit={confirmarEntrada}>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            Buscar producto (referencia o nombre)
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setProductoId('');
              }}
              style={styles.input}
              placeholder="Escribe para buscar..."
            />
          </label>

          {busqueda && !productoId && (
            <div style={styles.listaResultados}>
              {filtrados.slice(0, 8).map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setProductoId(String(p.id));
                    setBusqueda(`${p.referencia} - ${p.nombre}`);
                  }}
                  style={styles.itemResultado}
                >
                  {p.referencia} — {p.nombre} (stock: {p.stock})
                </div>
              ))}
              {filtrados.length === 0 && <div style={styles.itemResultado}>Sin resultados</div>}
            </div>
          )}

          {seleccionado && (
            <p style={{ color: 'var(--text-secondary)' }}>
              Stock actual en Kennedy: <strong>{seleccionado.stock}</strong>
            </p>
          )}

          <label style={{ display: 'block', marginBottom: '10px' }}>
            Cantidad que llegó
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={styles.input} />
          </label>

          <label style={{ display: 'block', marginBottom: '10px' }}>
            Nota (opcional, ej: proveedor o factura)
            <input value={nota} onChange={(e) => setNota(e.target.value)} style={styles.input} />
          </label>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

          <button type="submit" disabled={guardando} style={styles.btnPrimario}>
            {guardando ? 'Registrando...' : 'Confirmar entrada'}
          </button>
        </form>
      </div>

      <h3>Entradas de hoy</h3>
      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Hora</th>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>Cantidad</th>
              <th style={styles.th}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {entradas.map((en) => (
              <tr key={en.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{new Date(en.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td style={styles.td}>{en.referencia} — {en.nombre}</td>
                <td style={styles.td}>{en.cantidad}</td>
                <td style={styles.td}>{en.nota || '-'}</td>
              </tr>
            ))}
            {entradas.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={4}>Sin entradas registradas hoy.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)', marginBottom: '24px', maxWidth: '500px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  listaResultados: { border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', marginBottom: '10px', maxHeight: '160px', overflowY: 'auto', background: '#fff' },
  itemResultado: { padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
};
