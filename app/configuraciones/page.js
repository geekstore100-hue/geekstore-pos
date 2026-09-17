'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

export default function ConfiguracionesPage() {
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEdicion, setNombreEdicion] = useState('');

  async function cargar() {
    setCargando(true);
    const res = await fetch('/api/vendedores');
    const data = await res.json();
    if (data.ok) setVendedores(data.vendedores);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crearVendedor(e) {
    e.preventDefault();
    setError('');
    if (!nombreNuevo.trim()) {
      setError('Escribe un nombre');
      return;
    }
    setGuardando(true);
    const res = await fetch('/api/vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreNuevo }),
    });
    const data = await res.json();
    setGuardando(false);
    if (data.ok) {
      setNombreNuevo('');
      cargar();
    } else {
      setError(data.error || 'No se pudo crear el vendedor');
    }
  }

  function empezarEdicion(v) {
    setEditandoId(v.id);
    setNombreEdicion(v.nombre);
  }

  async function guardarEdicion(v) {
    if (!nombreEdicion.trim()) return;
    await fetch(`/api/vendedores/${v.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreEdicion.trim(), activo: v.activo }),
    });
    setEditandoId(null);
    cargar();
  }

  async function alternarActivo(v) {
    await fetch(`/api/vendedores/${v.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: v.nombre, activo: !v.activo }),
    });
    cargar();
  }

  return (
    <Shell title="Configuraciones">
      <h2 style={{ marginTop: 0 }}>Vendedores</h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
        Los nombres que aparecen para elegir en el campo "Vendedor" al registrar una venta.
      </p>

      <form onSubmit={crearVendedor} style={styles.formCard}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Nuevo vendedor
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del vendedor"
            style={styles.input}
          />
        </label>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button type="submit" disabled={guardando} style={styles.btnPrimario}>
          {guardando ? 'Guardando...' : '+ Agregar vendedor'}
        </button>
      </form>

      <div style={styles.tableCard}>
        {cargando ? (
          <p>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    {editandoId === v.id ? (
                      <input
                        value={nombreEdicion}
                        onChange={(e) => setNombreEdicion(e.target.value)}
                        style={styles.inputChico}
                        autoFocus
                      />
                    ) : (
                      v.nombre
                    )}
                  </td>
                  <td style={styles.td}>{v.activo ? 'Activo' : 'Inactivo'}</td>
                  <td style={styles.td}>
                    {editandoId === v.id ? (
                      <>
                        <button onClick={() => guardarEdicion(v)} style={styles.btnSecundario}>Guardar</button>
                        <button onClick={() => setEditandoId(null)} style={styles.btnSecundario}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => empezarEdicion(v)} style={styles.btnSecundario}>Editar</button>
                        <button onClick={() => alternarActivo(v)} style={styles.btnSecundario}>
                          {v.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {vendedores.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={3}>No hay vendedores creados todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

const styles = {
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)', marginBottom: '24px', maxWidth: '400px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  inputChico: { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', marginLeft: '8px', cursor: 'pointer', fontSize: '13px' },
};
