'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

// Lista de compras para resurtir, agrupada por proveedor: se va llenando
// sola desde Reabastecimiento (cuando un producto hay que comprarlo y no
// solo trasladarlo, ya con el proveedor más barato sugerido) y también se
// puede agregar un producto a mano. La idea es armar un solo pedido por
// proveedor: se revisan las cantidades, se ajustan si hace falta, y cuando
// ya se hizo la compra se marca el grupo completo (o un producto suelto)
// como comprado.
export default function ListaComprasPage() {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [proveedores, setProveedores] = useState([]);
  const [productosTodos, setProductosTodos] = useState([]);
  const [buscarTexto, setBuscarTexto] = useState('');
  const [agregando, setAgregando] = useState(false);

  const [guardandoId, setGuardandoId] = useState(null);

  async function cargarLista() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/lista-compras');
      const data = await res.json();
      if (data.ok) setGrupos(data.grupos);
      else setError(data.error || 'No se pudo cargar la lista de compras');
    } catch {
      setError('Error de conexión al cargar la lista');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarLista();
    fetch('/api/proveedores').then((r) => r.json()).then((d) => { if (d.ok) setProveedores(d.proveedores); });
    fetch('/api/productos').then((r) => r.json()).then((d) => { if (d.ok) setProductosTodos(d.productos || []); });
  }, []);

  const resultadosBusqueda = useMemo(() => {
    const texto = buscarTexto.trim().toLowerCase();
    if (!texto) return [];
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false)
      .filter((p) => (p.nombre || '').toLowerCase().includes(texto) || (p.referencia || '').toLowerCase().includes(texto))
      .slice(0, 8);
  }, [buscarTexto, productosTodos]);

  async function agregarProducto(producto) {
    setAgregando(true);
    setBuscarTexto('');
    try {
      await fetch('/api/lista-compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: producto.id, cantidad: 1, precio_referencia: producto.precio_costo }),
      });
      cargarLista();
    } finally {
      setAgregando(false);
    }
  }

  async function actualizarCantidad(itemId, cantidad) {
    setGrupos((actual) =>
      actual.map((g) => ({
        ...g,
        items: g.items.map((it) => (it.id === itemId ? { ...it, cantidad } : it)),
      }))
    );
  }

  async function guardarCantidad(itemId, cantidad) {
    const num = Number(cantidad);
    if (!(num > 0)) return;
    setGuardandoId(itemId);
    try {
      await fetch(`/api/lista-compras/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantidad: num }),
      });
    } finally {
      setGuardandoId(null);
    }
  }

  async function cambiarProveedor(itemId, proveedorId) {
    setGuardandoId(itemId);
    try {
      await fetch(`/api/lista-compras/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedor_id: proveedorId || null }),
      });
      cargarLista();
    } finally {
      setGuardandoId(null);
    }
  }

  async function marcarComprado(itemId) {
    setGuardandoId(itemId);
    try {
      await fetch(`/api/lista-compras/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marcarComprado: true }),
      });
      cargarLista();
    } finally {
      setGuardandoId(null);
    }
  }

  async function quitarItem(itemId) {
    setGuardandoId(itemId);
    try {
      await fetch(`/api/lista-compras/${itemId}`, { method: 'DELETE' });
      cargarLista();
    } finally {
      setGuardandoId(null);
    }
  }

  async function marcarGrupoComprado(grupo) {
    if (!window.confirm(`¿Marcar como comprados los ${grupo.items.length} producto(s) de "${grupo.proveedor_nombre}"?`)) return;
    setGuardandoId(`grupo-${grupo.proveedor_id || 'sin_proveedor'}`);
    try {
      await Promise.all(
        grupo.items.map((it) =>
          fetch(`/api/lista-compras/${it.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marcarComprado: true }),
          })
        )
      );
      cargarLista();
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <Shell title="Lista de compras">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0, flex: 1, minWidth: '260px' }}>
          Productos por resurtir, agrupados por proveedor. Se va llenando sola desde Reabastecimiento (con el proveedor
          más barato ya sugerido) y también puedes agregar productos a mano acá. Cuando hagas el pedido, marca el
          producto (o todo el grupo) como comprado.
        </p>
        {grupos.length > 0 && (
          <a
            href="/lista-compras/imprimir"
            target="_blank"
            rel="noreferrer"
            style={{ ...styles.btnSecundario, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Imprimir todo
          </a>
        )}
      </div>

      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '420px' }}>
        <input
          value={buscarTexto}
          onChange={(e) => setBuscarTexto(e.target.value)}
          placeholder="Agregar un producto a mano — buscar por nombre o referencia..."
          style={{ ...styles.input, width: '100%' }}
          disabled={agregando}
        />
        {resultadosBusqueda.length > 0 && (
          <div style={styles.dropdownBusqueda}>
            {resultadosBusqueda.map((p) => (
              <div key={p.id} style={styles.opcionBusqueda} onClick={() => agregarProducto(p)}>
                <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>{p.referencia}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : grupos.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No hay nada pendiente por comprar.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {grupos.map((grupo) => (
            <div key={grupo.proveedor_id || 'sin_proveedor'} style={styles.tarjeta}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={!grupo.proveedor_id ? { color: 'var(--text-secondary)', fontStyle: 'italic' } : undefined}>
                  {grupo.proveedor_nombre}
                </strong>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {grupo.total > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Total aprox: {moneda(grupo.total)}</span>}
                  <a
                    href={`/lista-compras/imprimir${grupo.proveedor_id ? `?proveedor_id=${grupo.proveedor_id}` : ''}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...styles.btnSecundario, textDecoration: 'none', display: 'inline-block' }}
                  >
                    Imprimir
                  </a>
                  <button
                    onClick={() => marcarGrupoComprado(grupo)}
                    disabled={guardandoId === `grupo-${grupo.proveedor_id || 'sin_proveedor'}`}
                    style={styles.btnSecundario}
                  >
                    Marcar todo como comprado
                  </button>
                </div>
              </div>

              <div className="pos-tabla-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={styles.th}>Producto</th>
                      <th style={styles.th}>Cantidad</th>
                      <th style={styles.th}>Precio ref.</th>
                      <th style={styles.th}>Proveedor</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.items.map((it) => (
                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={styles.td}>
                          {it.producto_nombre}
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="1"
                            value={it.cantidad}
                            onChange={(e) => actualizarCantidad(it.id, e.target.value)}
                            onBlur={(e) => guardarCantidad(it.id, e.target.value)}
                            style={{ ...styles.input, width: '80px' }}
                          />
                        </td>
                        <td style={styles.td}>{it.precio_referencia ? moneda(it.precio_referencia) : '—'}</td>
                        <td style={styles.td}>
                          <select
                            value={it.proveedor_id || ''}
                            onChange={(e) => cambiarProveedor(it.id, e.target.value ? Number(e.target.value) : null)}
                            style={styles.input}
                          >
                            <option value="">Sin proveedor</option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => marcarComprado(it.id)} disabled={guardandoId === it.id} style={styles.btnPrimario}>
                              Comprado
                            </button>
                            <button onClick={() => quitarItem(it.id)} disabled={guardandoId === it.id} style={styles.btnQuitar}>
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

const styles = {
  tarjeta: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' },
  input: { padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' },
  th: { padding: '8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '8px' },
  btnPrimario: { padding: '7px 12px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  btnQuitar: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--danger)', cursor: 'pointer', fontSize: '13px' },
  dropdownBusqueda: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '240px', overflowY: 'auto', zIndex: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  opcionBusqueda: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' },
};
