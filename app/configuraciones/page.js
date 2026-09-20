'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

const SECCIONES = [
  { id: 'vendedores', label: 'Vendedores', descripcion: 'Quién vende' },
  { id: 'categorias', label: 'Categorías y subcategorías', descripcion: 'Cómo se organiza el inventario' },
  { id: 'seguridad', label: 'Seguridad', descripcion: 'Clave de administrador' },
];

export default function ConfiguracionesPage() {
  const [seccionActiva, setSeccionActiva] = useState('vendedores');
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEdicion, setNombreEdicion] = useState('');

  // Categorías y subcategorías
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [subcategorias, setSubcategorias] = useState([]);
  const [nombreCategoriaNueva, setNombreCategoriaNueva] = useState('');
  const [nombreSubcategoriaNueva, setNombreSubcategoriaNueva] = useState('');
  const [errorCategoria, setErrorCategoria] = useState('');
  const [errorSubcategoria, setErrorSubcategoria] = useState('');
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);
  const [guardandoSubcategoria, setGuardandoSubcategoria] = useState(false);

  // Seguridad: clave de administrador
  const [claveConfigurada, setClaveConfigurada] = useState(null);
  const [claveActualInput, setClaveActualInput] = useState('');
  const [claveNuevaInput, setClaveNuevaInput] = useState('');
  const [claveConfirmarInput, setClaveConfirmarInput] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [mensajeClave, setMensajeClave] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);

  async function cargar() {
    setCargando(true);
    const res = await fetch('/api/vendedores');
    const data = await res.json();
    if (data.ok) setVendedores(data.vendedores);
    setCargando(false);
  }

  async function cargarCategorias() {
    const res = await fetch('/api/categorias');
    const data = await res.json();
    if (data.ok) setCategorias(data.categorias);
  }

  async function cargarSubcategorias(categoriaId) {
    const res = await fetch(`/api/subcategorias?categoria_id=${categoriaId}`);
    const data = await res.json();
    if (data.ok) setSubcategorias(data.subcategorias);
  }

  async function cargarClaveConfigurada() {
    const res = await fetch('/api/configuracion/clave-admin');
    const data = await res.json();
    if (data.ok) setClaveConfigurada(data.configurada);
  }

  useEffect(() => {
    cargar();
    cargarCategorias();
    cargarClaveConfigurada();
  }, []);

  useEffect(() => {
    if (categoriaSeleccionada) {
      cargarSubcategorias(categoriaSeleccionada.id);
    } else {
      setSubcategorias([]);
    }
  }, [categoriaSeleccionada]);

  async function crearCategoria(e) {
    e.preventDefault();
    setErrorCategoria('');
    if (!nombreCategoriaNueva.trim()) {
      setErrorCategoria('Escribe un nombre');
      return;
    }
    setGuardandoCategoria(true);
    const res = await fetch('/api/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreCategoriaNueva }),
    });
    const data = await res.json();
    setGuardandoCategoria(false);
    if (data.ok) {
      setNombreCategoriaNueva('');
      cargarCategorias();
    } else {
      setErrorCategoria(data.error || 'No se pudo crear la categoría');
    }
  }

  async function crearSubcategoria(e) {
    e.preventDefault();
    setErrorSubcategoria('');
    if (!categoriaSeleccionada) {
      setErrorSubcategoria('Selecciona primero una categoría');
      return;
    }
    if (!nombreSubcategoriaNueva.trim()) {
      setErrorSubcategoria('Escribe un nombre');
      return;
    }
    setGuardandoSubcategoria(true);
    const res = await fetch('/api/subcategorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria_id: categoriaSeleccionada.id, nombre: nombreSubcategoriaNueva }),
    });
    const data = await res.json();
    setGuardandoSubcategoria(false);
    if (data.ok) {
      setNombreSubcategoriaNueva('');
      cargarSubcategorias(categoriaSeleccionada.id);
    } else {
      setErrorSubcategoria(data.error || 'No se pudo crear la subcategoría');
    }
  }

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

  async function guardarClaveAdmin(e) {
    e.preventDefault();
    setErrorClave('');
    setMensajeClave('');

    if (!claveNuevaInput || claveNuevaInput.trim().length < 4) {
      setErrorClave('La clave nueva debe tener al menos 4 caracteres');
      return;
    }
    if (claveNuevaInput !== claveConfirmarInput) {
      setErrorClave('La confirmación no coincide con la clave nueva');
      return;
    }

    setGuardandoClave(true);
    const res = await fetch('/api/configuracion/clave-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave_actual: claveActualInput, clave_nueva: claveNuevaInput }),
    });
    const data = await res.json();
    setGuardandoClave(false);

    if (data.ok) {
      setMensajeClave(claveConfigurada ? 'Clave de administrador actualizada.' : 'Clave de administrador creada.');
      setClaveConfigurada(true);
      setClaveActualInput('');
      setClaveNuevaInput('');
      setClaveConfirmarInput('');
    } else {
      setErrorClave(data.error || 'No se pudo guardar la clave');
    }
  }

  return (
    <Shell title="Configuraciones">
      <div style={styles.layout}>
        <div style={styles.menu}>
          {SECCIONES.map((s) => (
            <div
              key={s.id}
              onClick={() => setSeccionActiva(s.id)}
              style={{ ...styles.menuItem, ...(seccionActiva === s.id ? styles.menuItemActivo : {}) }}
            >
              <div style={{ fontWeight: 600 }}>{s.label}</div>
              <div style={styles.menuItemDesc}>{s.descripcion}</div>
            </div>
          ))}
        </div>

        <div style={styles.contenido}>
          {seccionActiva === 'vendedores' && (
            <>
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
            </>
          )}

          {seccionActiva === 'categorias' && (
            <>
              <h2 style={{ marginTop: 0 }}>Categorías y subcategorías</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Las opciones que aparecen en el campo "Categoría" de la ficha de un producto.
              </p>

              <div style={styles.grid2Cat}>
                <div>
                  <form onSubmit={crearCategoria} style={styles.formCard}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      Nueva categoría
                      <input
                        value={nombreCategoriaNueva}
                        onChange={(e) => setNombreCategoriaNueva(e.target.value)}
                        placeholder="Ej: Computadores"
                        style={styles.input}
                      />
                    </label>
                    {errorCategoria && <p style={{ color: 'var(--danger)' }}>{errorCategoria}</p>}
                    <button type="submit" disabled={guardandoCategoria} style={styles.btnPrimario}>
                      {guardandoCategoria ? 'Guardando...' : '+ Agregar categoría'}
                    </button>
                  </form>

                  <div style={styles.tableCard}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={styles.th}>Categoría</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categorias.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setCategoriaSeleccionada(c)}
                            style={{
                              ...styles.filaClickeable,
                              background: categoriaSeleccionada?.id === c.id ? 'var(--teal-bg, #e6faf7)' : 'transparent',
                            }}
                          >
                            <td style={styles.td}>{c.nombre}</td>
                          </tr>
                        ))}
                        {categorias.length === 0 && (
                          <tr>
                            <td style={styles.td}>No hay categorías creadas todavía.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <form onSubmit={crearSubcategoria} style={styles.formCard}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      Nueva subcategoría {categoriaSeleccionada ? `de "${categoriaSeleccionada.nombre}"` : ''}
                      <input
                        value={nombreSubcategoriaNueva}
                        onChange={(e) => setNombreSubcategoriaNueva(e.target.value)}
                        placeholder={categoriaSeleccionada ? 'Ej: Portátiles' : 'Selecciona una categoría primero'}
                        style={styles.input}
                        disabled={!categoriaSeleccionada}
                      />
                    </label>
                    {errorSubcategoria && <p style={{ color: 'var(--danger)' }}>{errorSubcategoria}</p>}
                    <button type="submit" disabled={guardandoSubcategoria || !categoriaSeleccionada} style={styles.btnPrimario}>
                      {guardandoSubcategoria ? 'Guardando...' : '+ Agregar subcategoría'}
                    </button>
                  </form>

                  <div style={styles.tableCard}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={styles.th}>Subcategoría</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!categoriaSeleccionada && (
                          <tr>
                            <td style={styles.td}>Elige una categoría a la izquierda para ver sus subcategorías.</td>
                          </tr>
                        )}
                        {categoriaSeleccionada && subcategorias.map((s) => (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={styles.td}>{s.nombre}</td>
                          </tr>
                        ))}
                        {categoriaSeleccionada && subcategorias.length === 0 && (
                          <tr>
                            <td style={styles.td}>Esta categoría no tiene subcategorías todavía.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {seccionActiva === 'seguridad' && (
            <>
              <h2 style={{ marginTop: 0 }}>Seguridad</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Define una clave de administrador para restringir pantallas sensibles, como Ajustes de inventario,
                para que solo quien tenga la clave pueda entrar a hacerlos.
              </p>

              <form onSubmit={guardarClaveAdmin} style={styles.formCard}>
                {claveConfigurada && (
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Clave actual
                    <input
                      type="password"
                      value={claveActualInput}
                      onChange={(e) => setClaveActualInput(e.target.value)}
                      style={styles.input}
                    />
                  </label>
                )}
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  {claveConfigurada ? 'Clave nueva' : 'Clave de administrador'}
                  <input
                    type="password"
                    value={claveNuevaInput}
                    onChange={(e) => setClaveNuevaInput(e.target.value)}
                    style={styles.input}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  Confirmar clave
                  <input
                    type="password"
                    value={claveConfirmarInput}
                    onChange={(e) => setClaveConfirmarInput(e.target.value)}
                    style={styles.input}
                  />
                </label>
                {errorClave && <p style={{ color: 'var(--danger)' }}>{errorClave}</p>}
                {mensajeClave && <p style={{ color: 'var(--teal-dark)' }}>{mensajeClave}</p>}
                <button type="submit" disabled={guardandoClave} style={styles.btnPrimario}>
                  {guardandoClave ? 'Guardando...' : claveConfigurada ? 'Cambiar clave' : '+ Crear clave'}
                </button>
              </form>

              {claveConfigurada === false && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Todavía no has creado una clave de administrador: por ahora, cualquiera puede entrar a Ajustes de
                  inventario. En cuanto la crees, esa pantalla pedirá la clave antes de dejar entrar.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

const styles = {
  layout: { display: 'flex', gap: '24px', alignItems: 'flex-start' },
  menu: {
    width: '240px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px',
  },
  menuItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  menuItemActivo: {
    background: 'var(--teal-light)',
    color: 'var(--teal-dark)',
  },
  menuItemDesc: { fontSize: '12px', marginTop: '2px' },
  contenido: { flex: 1, minWidth: 0 },
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)', marginBottom: '24px', maxWidth: '400px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  inputChico: { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', marginLeft: '8px', cursor: 'pointer', fontSize: '13px' },
  grid2Cat: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' },
  filaClickeable: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
};
