'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

// Administración de quién puede entrar al portal de mayoristas de la
// tienda online (geekstore.com.co/distribuidores). El acceso ahí sigue
// siendo solo con la cédula (sin contraseña aparte) — lo único que hace
// falta es que la cédula esté acá, activa.
const EDICION_VACIA = { nombre: '', cedula: '', telefono: '', direccion: '', email: '' };

export default function DistribuidoresPage() {
  const [distribuidores, setDistribuidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState(EDICION_VACIA);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState('');

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

  function abrirEdicion(d) {
    setEditandoId(d.id);
    setErrorEdicion('');
    setFormEdicion({
      nombre: d.nombre || '',
      cedula: d.cedula || '',
      telefono: d.telefono || '',
      direccion: d.direccion || '',
      email: d.email || '',
    });
  }

  function cerrarEdicion() {
    setEditandoId(null);
    setErrorEdicion('');
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorEdicion('');
    if (!formEdicion.nombre.trim() || !formEdicion.cedula.trim()) {
      setErrorEdicion('El nombre y la cédula son obligatorios');
      return;
    }
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`/api/distribuidores/${editandoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formEdicion.nombre,
          cedula: formEdicion.cedula,
          telefono: formEdicion.telefono,
          direccion: formEdicion.direccion,
          email: formEdicion.email,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorEdicion(data.error || 'No se pudo guardar');
        return;
      }
      setEditandoId(null);
      cargar();
    } catch {
      setErrorEdicion('Error de conexión al guardar');
    } finally {
      setGuardandoEdicion(false);
    }
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
              <th style={styles.th}>Contacto</th>
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
                  {d.telefono || d.direccion || d.email ? (
                    <>
                      {d.telefono && <div>{d.telefono}</div>}
                      {d.email && <div>{d.email}</div>}
                      {d.direccion && <div style={{ color: '#889' }}>{d.direccion}</div>}
                    </>
                  ) : (
                    <span style={{ color: '#aab' }}>Sin datos</span>
                  )}
                </td>
                <td style={styles.td}>
                  <span style={{ color: d.activo ? '#067647' : '#b42318' }}>
                    {d.activo ? '✓ Activo' : '✗ Inactivo'}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => abrirEdicion(d)} style={styles.botonChico}>Editar</button>
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

      {editandoId && (
        <div style={styles.overlay} onMouseDown={cerrarEdicion}>
          <form onSubmit={guardarEdicion} onMouseDown={(e) => e.stopPropagation()} style={styles.modal}>
            <h3 style={{ marginTop: 0 }}>Editar distribuidor</h3>
            <label style={styles.etiqueta}>
              Nombre
              <input
                value={formEdicion.nombre}
                onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
                style={styles.inputModal}
              />
            </label>
            <label style={styles.etiqueta}>
              Cédula
              <input
                value={formEdicion.cedula}
                onChange={(e) => setFormEdicion({ ...formEdicion, cedula: e.target.value })}
                style={styles.inputModal}
              />
            </label>
            <label style={styles.etiqueta}>
              Teléfono
              <input
                value={formEdicion.telefono}
                onChange={(e) => setFormEdicion({ ...formEdicion, telefono: e.target.value })}
                style={styles.inputModal}
              />
            </label>
            <label style={styles.etiqueta}>
              Dirección
              <input
                value={formEdicion.direccion}
                onChange={(e) => setFormEdicion({ ...formEdicion, direccion: e.target.value })}
                style={styles.inputModal}
              />
            </label>
            <label style={styles.etiqueta}>
              Correo
              <input
                type="email"
                value={formEdicion.email}
                onChange={(e) => setFormEdicion({ ...formEdicion, email: e.target.value })}
                style={styles.inputModal}
              />
            </label>
            {errorEdicion && <p style={{ color: '#b42318', fontSize: '0.85rem' }}>{errorEdicion}</p>}
            <div style={{ marginTop: '14px' }}>
              <button type="submit" disabled={guardandoEdicion} style={styles.boton}>
                {guardandoEdicion ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={cerrarEdicion} style={{ ...styles.botonChico, marginLeft: 8 }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </Shell>
  );
}

const styles = {
  form: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
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
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: 10,
    padding: '20px',
    width: '420px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  etiqueta: { display: 'block', fontSize: '0.85rem', color: '#667', marginTop: '12px' },
  inputModal: {
    display: 'block',
    width: '100%',
    padding: '9px',
    marginTop: '4px',
    borderRadius: 8,
    border: '1px solid #ddd',
    boxSizing: 'border-box',
    fontSize: '0.9rem',
  },
};
