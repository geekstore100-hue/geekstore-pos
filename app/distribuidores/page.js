'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

// Administración de quién puede entrar al portal de mayoristas de la
// tienda online (geekstore.com.co/distribuidores). El acceso ahí sigue
// siendo solo con la cédula (sin contraseña aparte) — lo único que hace
// falta es que la cédula esté acá, activa.
export default function DistribuidoresPage() {
  const [distribuidores, setDistribuidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  function cargar() {
    setCargando(true);
    fetch('/api/distribuidores')
      .then((r) => r.json())
      .then((d) => setDistribuidores(d.distribuidores || []))
      .catch(() => setMensaje('Error de conexión al cargar los distribuidores.'))
      .finally(() => setCargando(false));
  }

  useEffect(() => { cargar(); }, []);

  async function agregar(e) {
    e.preventDefault();
    if (!cedula.trim() || !nombre.trim()) return;
    setGuardando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/distribuidores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, nombre }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error || 'No se pudo agregar el distribuidor.');
      } else {
        setCedula('');
        setNombre('');
        cargar();
      }
    } catch {
      setMensaje('Error de conexión al guardar.');
    }
    setGuardando(false);
  }

  async function cambiarActivo(d) {
    await fetch(`/api/distribuidores/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !d.activo }),
    });
    cargar();
  }

  async function eliminar(d) {
    if (!confirm(`¿Eliminar a ${d.nombre}? No podrá volver a entrar al portal de distribuidores.`)) return;
    await fetch(`/api/distribuidores/${d.id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <Shell title="Distribuidores">
    <div style={{ maxWidth: 720 }}>
      <p style={{ color: '#667', fontSize: '0.9rem', marginBottom: 20 }}>
        Quién puede entrar al portal de mayoristas de la tienda online. Entran solo con su
        cédula — para que vean precios, necesitas además haberle puesto un "Precio distribuidor"
        al producto en Inventario.
      </p>

      <form onSubmit={agregar} style={styles.form}>
        <input
          type="text"
          placeholder="Cédula"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={{ ...styles.input, flex: 1 }}
        />
        <button type="submit" disabled={guardando} style={styles.boton}>
          {guardando ? 'Agregando…' : '+ Agregar'}
        </button>
      </form>
      {mensaje ? <p style={{ color: '#b42318', fontSize: '0.85rem', marginBottom: 12 }}>{mensaje}</p> : null}

      {cargando ? (
        <p>Cargando…</p>
      ) : distribuidores.length === 0 ? (
        <p style={{ color: '#889' }}>Todavía no hay distribuidores registrados.</p>
      ) : (
        <table style={styles.tabla}>
          <thead>
            <tr>
              <th style={styles.th}>Cédula</th>
              <th style={styles.th}>Nombre</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {distribuidores.map((d) => (
              <tr key={d.id}>
                <td style={styles.td}>{d.cedula}</td>
                <td style={styles.td}>{d.nombre}</td>
                <td style={styles.td}>
                  <span style={{ color: d.activo ? '#067647' : '#b42318' }}>
                    {d.activo ? '✓ Activo' : '✗ Inactivo'}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => cambiarActivo(d)} style={styles.botonChico}>
                    {d.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => eliminar(d)} style={{ ...styles.botonChico, color: '#b42318' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </Shell>
  );
}

const styles = {
  form: { display: 'flex', gap: 8, marginBottom: 12 },
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.9rem' },
  boton: {
    padding: '8px 14px', borderRadius: 6, border: 'none',
    background: 'var(--teal, #0d9488)', color: '#fff', fontWeight: 600, cursor: 'pointer',
  },
  botonChico: {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fff',
    fontSize: '0.8rem', cursor: 'pointer', marginLeft: 6,
  },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #eee', color: '#667' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' },
};
