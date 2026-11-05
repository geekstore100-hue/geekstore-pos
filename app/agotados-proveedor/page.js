'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

// Agotados por proveedor (nov 2026) — ver app/api/reportes/agotados-proveedor.
// Se elige el proveedor y salen sus productos agotados (de los últimos 2
// meses), los que están por agotarse, y aparte los que llevan más de 2 meses
// en cero (seguramente el proveedor ya no los trae).

function moneda(n) {
  return n != null ? `$${Math.round(Number(n)).toLocaleString('es-CO')}` : '—';
}
function fecha(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
function haceDias(d) {
  if (d == null) return '';
  if (d === 0) return 'hoy';
  if (d === 1) return 'hace 1 día';
  return `hace ${d} días`;
}

function Tabla({ filas, tipo, onAgregar, agregados }) {
  if (!filas.length) return <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '6px 0 0' }}>Ninguno.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={estilos.th}></th>
            <th style={estilos.th}>Producto</th>
            <th style={estilos.th}>Stock</th>
            <th style={estilos.th}>Vendidas 30 / 90 días</th>
            <th style={estilos.th}>{tipo === 'porAgotarse' ? 'Alcanza para' : 'Se agotó'}</th>
            <th style={estilos.th}>Última compra</th>
            <th style={estilos.th}></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={estilos.td}>
                {p.imagen_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={estilos.foto} />
                ) : (
                  <div style={{ ...estilos.foto, background: 'var(--bg)' }} />
                )}
              </td>
              <td style={estilos.td}>
                <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ref. {p.referencia}</div>
                {p.otroProveedor && (
                  <div style={{ fontSize: '12px', color: 'var(--warning-dark, #8a5a00)' }}>La última vez se le compró a {p.otroProveedor}</div>
                )}
              </td>
              <td style={{ ...estilos.td, fontWeight: 600, color: p.stock > 0 ? 'inherit' : 'var(--danger)' }}>{p.stock}</td>
              <td style={estilos.td}>
                {p.vendidas30} / {p.vendidas90}
              </td>
              <td style={estilos.td}>
                {tipo === 'porAgotarse' ? (
                  p.diasCobertura != null ? `${p.diasCobertura} día${p.diasCobertura === 1 ? '' : 's'}` : 'Quedan pocas'
                ) : (
                  <>
                    {fecha(p.agotadoDesde)}
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{haceDias(p.diasAgotado)}</div>
                  </>
                )}
              </td>
              <td style={estilos.td}>
                {fecha(p.ultimaCompra)}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {p.ultimaCantidad != null ? `${p.ultimaCantidad} und` : ''} · {moneda(p.ultimoCosto)}
                </div>
              </td>
              <td style={estilos.td}>
                {tipo !== 'viejos' &&
                  (agregados[p.id] ? (
                    <span style={{ fontSize: '12px', color: 'var(--teal-dark, #0f766e)', fontWeight: 600 }}>✓ En la lista</span>
                  ) : (
                    <button type="button" onClick={() => onAgregar(p)} style={estilos.btnChico}>
                      + Lista de compras
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AgotadosProveedorPage() {
  const [resumen, setResumen] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verViejos, setVerViejos] = useState(false);
  const [agregados, setAgregados] = useState({});
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/reportes/agotados-proveedor').then((r) => r.json()),
      fetch('/api/proveedores').then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (a.ok) setResumen(a.resumen || []);
        else setError(a.error || 'No se pudo cargar el resumen');
        if (b.ok) setProveedores(b.proveedores || []);
      })
      .catch(() => setError('Error de conexión'));
  }, []);

  useEffect(() => {
    setDatos(null);
    setVerViejos(false);
    setAgregados({});
    setCopiado(false);
    if (!proveedorId) return;
    setCargando(true);
    setError('');
    fetch(`/api/reportes/agotados-proveedor?proveedor_id=${proveedorId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setDatos(d);
        else setError(d.error || 'No se pudo cargar');
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false));
  }, [proveedorId]);

  const resumenDe = (id) => resumen.find((r) => String(r.id) === String(id));
  const nombreProveedor = proveedores.find((p) => String(p.id) === String(proveedorId))?.nombre || resumenDe(proveedorId)?.nombre || '';
  // Primero los que tienen algo pendiente, después el resto.
  const opciones = [
    ...resumen.filter((r) => r.agotados + r.porAgotarse > 0),
    ...proveedores
      .filter((p) => !resumen.some((r) => r.id === p.id && r.agotados + r.porAgotarse > 0))
      .map((p) => resumenDe(p.id) || { id: p.id, nombre: p.nombre, agotados: 0, porAgotarse: 0, viejos: 0 }),
  ];

  async function agregar(p) {
    const cantidad = Math.max(1, p.vendidas30 || p.ultimaCantidad || 1);
    try {
      const res = await fetch('/api/lista-compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: p.id, proveedor_id: Number(proveedorId), cantidad, precio_referencia: p.ultimoCosto }),
      });
      const d = await res.json();
      if (d.ok) setAgregados((a) => ({ ...a, [p.id]: true }));
      else setError(d.error || 'No se pudo agregar a la lista de compras');
    } catch {
      setError('Error de conexión');
    }
  }

  async function copiarPedido() {
    if (!datos) return;
    const lineas = [...datos.agotados, ...datos.porAgotarse].map((p) => `• ${p.nombre} (ref. ${p.referencia})`);
    const texto = `Hola, quiero saber si tienes disponible:\n${lineas.join('\n')}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setError('No se pudo copiar. Selecciona la lista a mano.');
    }
  }

  return (
    <Shell title="Agotados por proveedor">
      <p style={{ color: 'var(--text-secondary)', marginTop: '-8px', fontSize: '14px' }}>
        Productos que se le han comprado a cada proveedor y que ya se agotaron o están por agotarse (stock para {datos?.diasCobertura || 15} días o
        menos según las ventas del último mes). Los que llevan más de 2 meses en cero van aparte: seguramente el proveedor ya no los trae.
      </p>

      <label style={{ display: 'block', margin: '12px 0', maxWidth: '520px' }}>
        <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Proveedor</span>
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={estilos.select}>
          <option value="">Elige un proveedor…</option>
          {opciones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
              {r.agotados + r.porAgotarse > 0 ? ` — ${r.agotados} agotado${r.agotados === 1 ? '' : 's'}, ${r.porAgotarse} por agotarse` : ''}
            </option>
          ))}
        </select>
      </label>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {cargando && <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>}

      {datos && (
        <>
          {datos.agotados.length + datos.porAgotarse.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
              <button type="button" onClick={copiarPedido} style={estilos.btn}>
                📋 Copiar lista para preguntarle a {nombreProveedor || 'el proveedor'}
              </button>
              {copiado && <span style={{ fontSize: '13px', color: 'var(--teal-dark, #0f766e)' }}>Copiada. Pégala en WhatsApp.</span>}
              <a href="/lista-compras" style={{ fontSize: '13px' }}>Ver lista de compras →</a>
            </div>
          )}

          <section style={estilos.tarjeta}>
            <h3 style={estilos.h3}>🔴 Agotados ({datos.agotados.length})</h3>
            <Tabla filas={datos.agotados} tipo="agotados" onAgregar={agregar} agregados={agregados} />
          </section>

          <section style={estilos.tarjeta}>
            <h3 style={estilos.h3}>🟡 Por agotarse ({datos.porAgotarse.length})</h3>
            <Tabla filas={datos.porAgotarse} tipo="porAgotarse" onAgregar={agregar} agregados={agregados} />
          </section>

          <section style={{ ...estilos.tarjeta, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ ...estilos.h3, margin: 0 }}>⚪ En cero hace más de 2 meses ({datos.viejos.length})</h3>
              {datos.viejos.length > 0 && (
                <button type="button" onClick={() => setVerViejos((v) => !v)} style={estilos.btnChico}>
                  {verViejos ? 'Ocultar' : 'Ver'}
                </button>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              Seguramente el proveedor ya no los volvió a traer. Si ya no los vas a vender, puedes desactivarlos en Productos.
            </p>
            {verViejos && <Tabla filas={datos.viejos} tipo="viejos" onAgregar={agregar} agregados={agregados} />}
          </section>
        </>
      )}
    </Shell>
  );
}

const estilos = {
  select: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: '#fff' },
  tarjeta: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius, 12px)', padding: '12px 16px', marginBottom: '12px' },
  h3: { margin: '0 0 6px', fontSize: '16px' },
  th: { padding: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 },
  td: { padding: '8px', fontSize: '14px', verticalAlign: 'top' },
  foto: { width: '40px', height: '40px', objectFit: 'contain', borderRadius: '6px' },
  btn: { padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  btnChico: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' },
};
