'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';

// Productos → "Fichas incompletas".
//
// Lista los productos de la tienda a los que les falta algún dato clave de
// su ficha técnica según su tipo (cargador: potencia, puertos, si trae cable
// y con qué es compatible; control: compatible con y conexión; etc. — ver
// lib/plantillasFicha.js). Con esos datos el chat de la tienda puede saber
// si un producto le sirve a un cliente; sin ellos, no lo recomienda.
//
// "Completar" abre el producto en Productos, donde aparecen los campos que
// faltan como botones para agregarlos.

export default function FichasIncompletasPage() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloConStock, setSoloConStock] = useState(true);
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    fetch('/api/productos/fichas-incompletas')
      .then((r) => r.json())
      .then((d) => (d.ok ? setDatos(d) : setError(d.error || 'No se pudo cargar el reporte')))
      .catch(() => setError('No se pudo cargar el reporte'));
  }, []);

  const lista = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLowerCase();
    return datos.productos.filter(
      (p) =>
        (!tipo || p.tipo === tipo) &&
        (!soloConStock || p.stock > 0) &&
        (!q || `${p.referencia} ${p.nombre}`.toLowerCase().includes(q))
    );
  }, [datos, tipo, soloConStock, buscar]);

  const porcentaje = datos && datos.total ? Math.round((datos.completos / datos.total) * 100) : 0;

  return (
    <Shell title="Fichas incompletas">
      <div style={styles.card}>
        <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
          El chat de la tienda solo recomienda un producto cuando su ficha dice lo que el cliente necesita (por ejemplo, que el cargador trae
          cable USB-C a Lightning y sirve para iPhone). Aquí ves los productos de la tienda a los que les falta algún dato clave.
        </p>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {!datos && !error && <p>Cargando…</p>}
        {datos && (
          <>
            <div style={styles.resumen}>
              <div>
                <div style={styles.numero}>{porcentaje}%</div>
                <div style={styles.etiqueta}>fichas completas</div>
              </div>
              <div>
                <div style={styles.numero}>{datos.completos}</div>
                <div style={styles.etiqueta}>completas</div>
              </div>
              <div>
                <div style={{ ...styles.numero, color: 'var(--danger)' }}>{datos.incompletos}</div>
                <div style={styles.etiqueta}>por completar</div>
              </div>
            </div>
            <div style={styles.barra}>
              <div style={{ ...styles.barraLlena, width: `${porcentaje}%` }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '14px' }}>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={styles.select}>
                <option value="">Todos los tipos</option>
                {datos.tipos.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.titulo} ({t.cantidad})
                  </option>
                ))}
              </select>
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre o referencia"
                style={{ ...styles.select, flex: '1 1 200px' }}
              />
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14px' }}>
                <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
                Solo con stock
              </label>
            </div>
          </>
        )}
      </div>

      {datos && (
        <div style={styles.card}>
          {lista.length === 0 && <p style={{ margin: 0 }}>No hay productos con la ficha incompleta en este filtro. 🎉</p>}
          {lista.map((p) => (
            <div key={p.id} style={styles.fila}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{p.referencia}</span> · {p.nombre}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {p.tipoTitulo} · stock {p.stock} · {p.filas === 0 ? 'sin ficha' : `${p.filas} fila${p.filas === 1 ? '' : 's'}`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                  {p.faltanClave.map((c) => (
                    <span key={c} style={styles.chipClave}>
                      {c} *
                    </span>
                  ))}
                  {p.faltanOpcionales.map((c) => (
                    <span key={c} style={styles.chip}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <Link href={`/productos?editar=${p.id}`} style={styles.btnPrimario}>
                Completar
              </Link>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' },
  resumen: { display: 'flex', gap: '28px', flexWrap: 'wrap' },
  numero: { fontSize: '26px', fontWeight: 700 },
  etiqueta: { fontSize: '13px', color: 'var(--text-secondary)' },
  barra: { height: '8px', background: 'var(--bg)', borderRadius: '999px', marginTop: '10px', overflow: 'hidden' },
  barraLlena: { height: '100%', background: 'var(--teal)' },
  select: { padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  fila: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' },
  btnPrimario: {
    padding: '8px 14px',
    borderRadius: '8px',
    background: 'var(--teal)',
    color: '#fff',
    fontWeight: 600,
    textDecoration: 'none',
    fontSize: '14px',
    whiteSpace: 'nowrap',
  },
  chip: { padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' },
  chipClave: { padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--danger)', fontSize: '12px', color: 'var(--danger)', fontWeight: 600 },
};
