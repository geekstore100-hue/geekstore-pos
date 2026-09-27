'use client';

import { useEffect, useState } from 'react';

// Chequeo semanal de inventario (ver app/api/conteo-rutinario): muestra un
// aviso mientras haya productos de esta semana sin contar, y un formulario
// para que el vendedor escriba cuántas unidades encontró en la bodega
// Principal. El conteo es "a ciegas": no se le muestra lo que dice el
// sistema hasta después de guardar, para que de verdad tenga que contar.
//
// Se usa en Vender (aviso arriba) y en Inventario > Chequeo semanal.
export default function ChequeoSemanal({ vendedores: vendedoresProp, enLinea = true, alGuardar, siempreVisible = false }) {
  const [datos, setDatos] = useState(null); // { semana, items, pendientes }
  const [vendedores, setVendedores] = useState(vendedoresProp || []);
  const [abierto, setAbierto] = useState(false);
  const [cantidades, setCantidades] = useState({});
  const [vendedorId, setVendedorId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultados, setResultados] = useState(null);

  async function cargar() {
    try {
      const res = await fetch('/api/conteo-rutinario');
      const data = await res.json();
      if (data.ok) setDatos(data);
    } catch {
      // Sin conexión: simplemente no se muestra el aviso.
    }
  }

  useEffect(() => {
    if (enLinea) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea]);

  useEffect(() => {
    if (vendedoresProp) {
      setVendedores(vendedoresProp);
      return;
    }
    fetch('/api/vendedores')
      .then((r) => r.json())
      .then((d) => d.ok && setVendedores(d.vendedores.filter((v) => v.activo)))
      .catch(() => {});
  }, [vendedoresProp]);

  const pendientes = datos?.items?.filter((it) => !it.contado) || [];

  function abrir() {
    setCantidades({});
    setVendedorId('');
    setObservaciones('');
    setError('');
    setResultados(null);
    setAbierto(true);
  }

  async function guardar() {
    setError('');
    const faltante = pendientes.find((it) => cantidades[it.id] === undefined || cantidades[it.id] === '');
    if (faltante) {
      setError(`Escribe cuántas unidades contaste de "${faltante.nombre}" (0 si no encontraste ninguna)`);
      return;
    }
    if (vendedores.length > 0 && !vendedorId) {
      setError('Selecciona quién hizo el conteo');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch('/api/conteo-rutinario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: pendientes.map((it) => ({ id: it.id, cantidad_contada: Number(cantidades[it.id]) })),
          vendedor_id: vendedorId ? Number(vendedorId) : null,
          observaciones,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'No se pudo guardar el conteo');
        return;
      }
      setResultados(data.resultados);
      cargar();
      if (alGuardar) alGuardar();
    } catch {
      setError('No hay conexión. Intenta de nuevo cuando vuelva el internet.');
    } finally {
      setGuardando(false);
    }
  }

  if (!datos || (pendientes.length === 0 && !abierto && !siempreVisible)) return null;

  return (
    <>
      {pendientes.length > 0 ? (
        <div style={styles.aviso}>
          <span>
            <strong>Chequeo semanal de inventario:</strong> cuenta {pendientes.length === 1 ? 'esta referencia' : `estas ${pendientes.length} referencias`} en la bodega Principal —{' '}
            {pendientes.map((it) => `${it.referencia} (${it.nombre})`).join(', ')}.
          </span>
          <button onClick={abrir} style={styles.btn}>Hacer chequeo</button>
        </div>
      ) : (
        siempreVisible && (
          <div style={{ ...styles.aviso, background: 'var(--teal-light)', color: 'var(--teal-dark)' }}>
            El chequeo de esta semana ya está hecho.
          </div>
        )
      )}

      {abierto && (
        <div style={styles.overlay} onMouseDown={() => !guardando && setAbierto(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Chequeo semanal de inventario</h3>

            {!resultados ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '-6px' }}>
                  Ve a la bodega Principal (lo que está en exhibición y en el depósito de este local), cuenta cuántas
                  unidades hay de cada producto y escríbelo. Si no encuentras ninguna, escribe 0.
                </p>
                {pendientes.map((it) => (
                  <label key={it.id} style={styles.fila}>
                    <span style={{ flex: 1 }}>
                      <strong>{it.nombre}</strong>
                      <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>Ref. {it.referencia}</span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="Cantidad"
                      value={cantidades[it.id] ?? ''}
                      onChange={(e) => setCantidades((c) => ({ ...c, [it.id]: e.target.value }))}
                      style={{ ...styles.input, width: '100px' }}
                    />
                  </label>
                ))}
                {vendedores.length > 0 && (
                  <label style={styles.etiqueta}>
                    ¿Quién contó? *
                    <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} style={styles.input}>
                      <option value="">Seleccionar</option>
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.id}>{v.nombre}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={styles.etiqueta}>
                  Observaciones (opcional)
                  <input
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej: 2 estaban en la vitrina, 1 en el depósito"
                    style={styles.input}
                  />
                </label>
                {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
                <div style={styles.botones}>
                  <button onClick={guardar} disabled={guardando} style={styles.btnPrimario}>
                    {guardando ? 'Guardando...' : 'Guardar conteo'}
                  </button>
                  <button onClick={() => setAbierto(false)} disabled={guardando} style={styles.btnSecundario}>Después</button>
                </div>
              </>
            ) : (
              <>
                {resultados.map((r) => (
                  <div key={r.id} style={{ ...styles.resultado, ...(r.coincide ? styles.resultadoOk : styles.resultadoMal) }}>
                    <strong>{r.nombre}</strong>
                    {r.coincide ? (
                      <div>Coincide: contaste {r.cantidad_contada} y el sistema dice {r.stock_sistema}.</div>
                    ) : (
                      <div>
                        No coincide: contaste {r.cantidad_contada} y el sistema dice {r.stock_sistema} (
                        {r.diferencia > 0 ? `sobran ${r.diferencia}` : `faltan ${Math.abs(r.diferencia)}`}). Quedó registrado para
                        que el administrador lo revise.
                      </div>
                    )}
                  </div>
                ))}
                <div style={styles.botones}>
                  <button onClick={() => setAbierto(false)} style={styles.btnPrimario}>Aceptar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  aviso: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    background: '#e0f2fe',
    color: '#075985',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '12px',
  },
  btn: { padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#0369a1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: '#fff',
    borderRadius: 'var(--radius)',
    padding: '20px',
    width: '440px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  fila: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' },
  etiqueta: { display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: '14px' },
  botones: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  resultado: { borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', fontSize: '13px' },
  resultadoOk: { background: 'var(--teal-light)', color: 'var(--teal-dark)' },
  resultadoMal: { background: '#fee2e2', color: '#991b1b' },
};
