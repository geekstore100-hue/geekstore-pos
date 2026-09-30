'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

const SECCIONES = [
  { id: 'vendedores', label: 'Vendedores', descripcion: 'Quién vende' },
  { id: 'categorias', label: 'Categorías y subcategorías', descripcion: 'Cómo se organiza el inventario' },
  { id: 'etiquetas', label: 'Etiquetas de producto', descripcion: 'Logo que se imprime en las etiquetas' },
  { id: 'caja', label: 'Caja', descripcion: 'Hora del arqueo de caja' },
  { id: 'ia', label: 'Inteligencia artificial', descripcion: 'Modelo y prompt de "Nuevo producto"' },
  { id: 'empresa', label: 'Datos de la empresa', descripcion: 'Razón social y NIT para certificados' },
  { id: 'seguridad', label: 'Seguridad', descripcion: 'Clave de administrador' },
  { id: 'respaldos', label: 'Respaldos', descripcion: 'Copias de la base de datos' },
];

function formatearTamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConfiguracionesPage() {
  const [seccionActiva, setSeccionActiva] = useState('vendedores');

  // Arqueo de caja programado
  const [arqueoActivo, setArqueoActivo] = useState(false);
  const [horaArqueo, setHoraArqueo] = useState('14:00');
  const [cargandoArqueo, setCargandoArqueo] = useState(true);
  const [guardandoArqueo, setGuardandoArqueo] = useState(false);
  const [mensajeArqueo, setMensajeArqueo] = useState('');
  const [errorArqueo, setErrorArqueo] = useState('');
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

  // Etiquetas de producto: logo y tamaño físico de la etiqueta que se
  // imprime desde /etiquetas
  const [logoKey, setLogoKey] = useState(null);
  const [cargandoLogo, setCargandoLogo] = useState(true);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState('');

  const [anchoEtiqueta, setAnchoEtiqueta] = useState(74);
  const [altoEtiqueta, setAltoEtiqueta] = useState(45);
  const [cargandoTamano, setCargandoTamano] = useState(true);
  const [guardandoTamano, setGuardandoTamano] = useState(false);
  const [errorTamano, setErrorTamano] = useState('');
  const [mensajeTamano, setMensajeTamano] = useState('');

  // Inteligencia artificial: modelo y prompt para "Nuevo producto"
  const [modeloIA, setModeloIA] = useState('');
  const [modeloGeminiIA, setModeloGeminiIA] = useState('');
  const [modeloGroqIA, setModeloGroqIA] = useState('');
  const [proveedorIA, setProveedorIA] = useState('mistral');
  const [promptIA, setPromptIA] = useState('');
  const [cargandoIA, setCargandoIA] = useState(true);
  const [guardandoIA, setGuardandoIA] = useState(false);
  const [mensajeIA, setMensajeIA] = useState('');
  const [errorIA, setErrorIA] = useState('');

  // Datos de la empresa: razón social/NIT/dirección para el encabezado del
  // certificado de retención de ReteICA (Certificados ReteICA)
  const [razonSocialEmpresa, setRazonSocialEmpresa] = useState('');
  const [nitEmpresa, setNitEmpresa] = useState('');
  const [direccionEmpresa, setDireccionEmpresa] = useState('');
  const [ciudadEmpresa, setCiudadEmpresa] = useState('Bogotá D.C.');
  const [telefonoEmpresa, setTelefonoEmpresa] = useState('');
  const [cargandoEmpresa, setCargandoEmpresa] = useState(true);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [mensajeEmpresa, setMensajeEmpresa] = useState('');
  const [errorEmpresa, setErrorEmpresa] = useState('');

  // Seguridad: clave de administrador
  const [claveConfigurada, setClaveConfigurada] = useState(null);
  const [claveActualInput, setClaveActualInput] = useState('');
  const [claveNuevaInput, setClaveNuevaInput] = useState('');
  const [claveConfirmarInput, setClaveConfirmarInput] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [mensajeClave, setMensajeClave] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);

  // Respaldos de la base de datos
  const [respaldos, setRespaldos] = useState([]);
  const [cargandoRespaldos, setCargandoRespaldos] = useState(true);
  const [generandoRespaldo, setGenerandoRespaldo] = useState(false);
  const [errorRespaldos, setErrorRespaldos] = useState('');
  const [mensajeRespaldos, setMensajeRespaldos] = useState('');

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

  async function cargarLogoEtiqueta() {
    setCargandoLogo(true);
    const res = await fetch('/api/configuracion/logo-etiqueta');
    const data = await res.json();
    if (data.ok) setLogoKey(data.imagen_key);
    setCargandoLogo(false);
  }

  async function cargarTamanoEtiqueta() {
    setCargandoTamano(true);
    const res = await fetch('/api/configuracion/tamano-etiqueta');
    const data = await res.json();
    if (data.ok) {
      setAnchoEtiqueta(data.ancho_mm);
      setAltoEtiqueta(data.alto_mm);
    }
    setCargandoTamano(false);
  }

  async function cargarHoraArqueo() {
    setCargandoArqueo(true);
    try {
      const res = await fetch('/api/configuracion/hora-arqueo');
      const data = await res.json();
      if (data.ok) {
        setArqueoActivo(Boolean(data.activo));
        setHoraArqueo(data.hora);
      }
    } finally {
      setCargandoArqueo(false);
    }
  }

  async function guardarHoraArqueo(e) {
    e.preventDefault();
    setErrorArqueo('');
    setMensajeArqueo('');
    setGuardandoArqueo(true);
    try {
      const res = await fetch('/api/configuracion/hora-arqueo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: arqueoActivo, hora: horaArqueo }),
      });
      const data = await res.json();
      if (data.ok) {
        setMensajeArqueo(data.activo ? `Listo: el sistema pedirá el arqueo todos los días a las ${data.hora}.` : 'Arqueo programado desactivado.');
      } else {
        setErrorArqueo(data.error || 'No se pudo guardar');
      }
    } catch {
      setErrorArqueo('No se pudo guardar');
    } finally {
      setGuardandoArqueo(false);
    }
  }

  async function cargarConfigIA() {
    setCargandoIA(true);
    try {
      const res = await fetch('/api/productos/ia-config');
      const data = await res.json();
      if (data.ok) {
        setModeloIA(data.modelo || '');
        setModeloGeminiIA(data.modeloGemini || '');
        setModeloGroqIA(data.modeloGroq || '');
        setProveedorIA(data.proveedor || 'mistral');
        setPromptIA(data.prompt || '');
      }
    } finally {
      setCargandoIA(false);
    }
  }

  async function guardarConfigIA(e) {
    e.preventDefault();
    setErrorIA('');
    setMensajeIA('');
    setGuardandoIA(true);
    try {
      const res = await fetch('/api/productos/ia-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo: modeloIA, modeloGemini: modeloGeminiIA, modeloGroq: modeloGroqIA, proveedor: proveedorIA, prompt: promptIA }),
      });
      const data = await res.json();
      if (data.ok) {
        setModeloIA(data.modelo);
        setModeloGeminiIA(data.modeloGemini);
        setModeloGroqIA(data.modeloGroq);
        setProveedorIA(data.proveedor);
        setPromptIA(data.prompt);
        setMensajeIA('Guardado. Se usa desde el próximo análisis en "Nuevo producto".');
      } else {
        setErrorIA(data.error || 'No se pudo guardar');
      }
    } catch {
      setErrorIA('No se pudo guardar');
    } finally {
      setGuardandoIA(false);
    }
  }

  async function cargarDatosEmpresa() {
    setCargandoEmpresa(true);
    try {
      const res = await fetch('/api/configuracion/datos-empresa');
      const data = await res.json();
      if (data.ok) {
        setRazonSocialEmpresa(data.razonSocial || '');
        setNitEmpresa(data.nit || '');
        setDireccionEmpresa(data.direccion || '');
        setCiudadEmpresa(data.ciudad || 'Bogotá D.C.');
        setTelefonoEmpresa(data.telefono || '');
      }
    } finally {
      setCargandoEmpresa(false);
    }
  }

  async function guardarDatosEmpresa(e) {
    e.preventDefault();
    setErrorEmpresa('');
    setMensajeEmpresa('');
    setGuardandoEmpresa(true);
    try {
      const res = await fetch('/api/configuracion/datos-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial: razonSocialEmpresa,
          nit: nitEmpresa,
          direccion: direccionEmpresa,
          ciudad: ciudadEmpresa,
          telefono: telefonoEmpresa,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMensajeEmpresa('Guardado. Se usa en el encabezado de Certificados ReteICA.');
      } else {
        setErrorEmpresa(data.error || 'No se pudo guardar');
      }
    } catch {
      setErrorEmpresa('No se pudo guardar');
    } finally {
      setGuardandoEmpresa(false);
    }
  }

  async function cargarRespaldos() {
    setCargandoRespaldos(true);
    try {
      const res = await fetch('/api/respaldos');
      const data = await res.json();
      if (data.ok) setRespaldos(data.respaldos);
      else setErrorRespaldos(data.error || 'No se pudo cargar la lista de respaldos');
    } catch {
      setErrorRespaldos('No hay conexión con el servidor');
    } finally {
      setCargandoRespaldos(false);
    }
  }

  async function generarRespaldoAhora() {
    setErrorRespaldos('');
    setMensajeRespaldos('');
    setGenerandoRespaldo(true);
    try {
      const res = await fetch('/api/respaldos', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setMensajeRespaldos(`Listo: respaldo generado (${data.respaldo.tablas} tablas, ${formatearTamano(data.respaldo.tamanoBytes)}).`);
        cargarRespaldos();
      } else {
        setErrorRespaldos(data.error || 'No se pudo generar el respaldo');
      }
    } catch {
      setErrorRespaldos('No hay conexión con el servidor');
    } finally {
      setGenerandoRespaldo(false);
    }
  }

  useEffect(() => {
    cargar();
    cargarCategorias();
    cargarClaveConfigurada();
    cargarLogoEtiqueta();
    cargarTamanoEtiqueta();
    cargarHoraArqueo();
    cargarConfigIA();
    cargarDatosEmpresa();
    cargarRespaldos();
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

  async function subirLogoEtiqueta(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setErrorLogo('');
    setSubiendoLogo(true);
    try {
      const formData = new FormData();
      formData.append('imagen', archivo);
      const res = await fetch('/api/configuracion/logo-etiqueta', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        setLogoKey(data.imagen_key);
      } else {
        setErrorLogo(data.error || 'No se pudo subir el logo');
      }
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function quitarLogoEtiqueta() {
    setErrorLogo('');
    setSubiendoLogo(true);
    try {
      const res = await fetch('/api/configuracion/logo-etiqueta', { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setLogoKey(null);
      } else {
        setErrorLogo(data.error || 'No se pudo quitar el logo');
      }
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function guardarTamanoEtiqueta(e) {
    e.preventDefault();
    setErrorTamano('');
    setMensajeTamano('');
    setGuardandoTamano(true);
    try {
      const res = await fetch('/api/configuracion/tamano-etiqueta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ancho_mm: Number(anchoEtiqueta), alto_mm: Number(altoEtiqueta) }),
      });
      const data = await res.json();
      if (data.ok) {
        setAnchoEtiqueta(data.ancho_mm);
        setAltoEtiqueta(data.alto_mm);
        setMensajeTamano('Tamaño guardado.');
      } else {
        setErrorTamano(data.error || 'No se pudo guardar el tamaño');
      }
    } finally {
      setGuardandoTamano(false);
    }
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
      <div className="pos-stack-900" style={styles.layout}>
        <div className="pos-panel-lateral" style={styles.menu}>
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

              <div className="pos-tabla-scroll" style={styles.tableCard}>
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

              <div className="pos-grid2" style={styles.grid2Cat}>
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

                  <div className="pos-tabla-scroll" style={styles.tableCard}>
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

                  <div className="pos-tabla-scroll" style={styles.tableCard}>
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

          {seccionActiva === 'etiquetas' && (
            <>
              <h2 style={{ marginTop: 0 }}>Etiquetas de producto</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Logo y tamaño de las etiquetas que se imprimen desde "Etiquetas" (menú de Inventario). Cámbialos
                aquí cuando quieras, sin tocar código.
              </p>

              <div style={{ ...styles.formCard, maxWidth: '420px' }}>
                {cargandoLogo ? (
                  <p>Cargando...</p>
                ) : (
                  <>
                    <div style={styles.previewLogo}>
                      {logoKey ? (
                        <img src={`/api/imagenes/${logoKey}`} alt="Logo de etiqueta" style={styles.imgLogo} />
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                          No has configurado un logo todavía — las etiquetas se imprimirán sin logo.
                        </span>
                      )}
                    </div>

                    <label style={{ ...styles.btnPrimario, display: 'inline-block' }}>
                      {subiendoLogo ? 'Subiendo...' : logoKey ? 'Cambiar logo' : '+ Subir logo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={subirLogoEtiqueta}
                        disabled={subiendoLogo}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {logoKey && (
                      <button
                        onClick={quitarLogoEtiqueta}
                        disabled={subiendoLogo}
                        style={{ ...styles.btnSecundario, marginLeft: '8px' }}
                      >
                        Quitar logo
                      </button>
                    )}
                    {errorLogo && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorLogo}</p>}
                  </>
                )}
              </div>

              <h3 style={{ marginBottom: '4px' }}>Tamaño de la etiqueta</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0, fontSize: '13px' }}>
                Por si cambias de hojas de etiquetas. El valor de fábrica es 74mm x 45mm.
              </p>
              <div style={{ ...styles.formCard, maxWidth: '420px' }}>
                {cargandoTamano ? (
                  <p>Cargando...</p>
                ) : (
                  <form onSubmit={guardarTamanoEtiqueta}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <label style={{ flex: 1 }}>
                        Ancho (mm)
                        <input
                          type="number"
                          min={10}
                          max={300}
                          value={anchoEtiqueta}
                          onChange={(e) => setAnchoEtiqueta(e.target.value)}
                          style={styles.input}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        Alto (mm)
                        <input
                          type="number"
                          min={10}
                          max={300}
                          value={altoEtiqueta}
                          onChange={(e) => setAltoEtiqueta(e.target.value)}
                          style={styles.input}
                        />
                      </label>
                    </div>
                    <button type="submit" disabled={guardandoTamano} style={{ ...styles.btnPrimario, marginTop: '12px' }}>
                      {guardandoTamano ? 'Guardando...' : 'Guardar tamaño'}
                    </button>
                    {mensajeTamano && <p style={{ color: 'var(--teal-dark)', marginTop: '10px' }}>{mensajeTamano}</p>}
                    {errorTamano && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorTamano}</p>}
                  </form>
                )}
              </div>
            </>
          )}

          {seccionActiva === 'caja' && (
            <>
              <h2 style={{ marginTop: 0 }}>Caja</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Arqueo de caja programado: todos los días, a la hora que elijas, la pantalla de Vender le pedirá al
                vendedor contar el efectivo de la caja. El sistema lo compara con lo que debería haber y lo deja
                registrado en Historial &gt; Turnos. Solo se pide si hay un turno abierto desde antes de esa hora.
              </p>
              <div style={{ ...styles.formCard, maxWidth: '420px' }}>
                {cargandoArqueo ? (
                  <p>Cargando...</p>
                ) : (
                  <form onSubmit={guardarHoraArqueo}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={arqueoActivo} onChange={(e) => setArqueoActivo(e.target.checked)} />
                      Pedir arqueo de caja todos los días
                    </label>
                    <label style={{ display: 'block', marginTop: '12px', opacity: arqueoActivo ? 1 : 0.5 }}>
                      Hora del arqueo
                      <input
                        type="time"
                        value={horaArqueo}
                        onChange={(e) => setHoraArqueo(e.target.value)}
                        disabled={!arqueoActivo}
                        style={{ ...styles.input, maxWidth: '160px' }}
                      />
                    </label>
                    <button type="submit" disabled={guardandoArqueo} style={{ ...styles.btnPrimario, marginTop: '12px' }}>
                      {guardandoArqueo ? 'Guardando...' : 'Guardar'}
                    </button>
                    {mensajeArqueo && <p style={{ color: 'var(--teal-dark)', marginTop: '10px' }}>{mensajeArqueo}</p>}
                    {errorArqueo && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorArqueo}</p>}
                  </form>
                )}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Además, en cualquier momento se puede hacer un arqueo con el botón &quot;Arqueo&quot; que aparece junto al turno
                en la pantalla de Vender.
              </p>
            </>
          )}

          {seccionActiva === 'ia' && (
            <>
              <h2 style={{ marginTop: 0 }}>Inteligencia artificial</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                En Productos &gt; Nuevo producto se puede subir una foto para que la IA sugiera el nombre y la
                descripción. Acá se configura qué modelo usa y las instrucciones (prompt) que sigue. Necesita que
                hayas configurado la variable de entorno correspondiente en Netlify, en el proyecto de este POS:
                MISTRAL_API_KEY, GEMINI_API_KEY o GROQ_API_KEY según el proveedor que elijas abajo.
              </p>

              {cargandoIA ? (
                <p>Cargando...</p>
              ) : (
                <form onSubmit={guardarConfigIA} style={{ ...styles.formCard, maxWidth: '640px' }}>
                  <label style={{ display: 'block', marginBottom: '10px' }}>Proveedor de IA</label>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="radio" name="proveedor-ia" checked={proveedorIA === 'mistral'} onChange={() => setProveedorIA('mistral')} />
                      Mistral
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="radio" name="proveedor-ia" checked={proveedorIA === 'gemini'} onChange={() => setProveedorIA('gemini')} />
                      Google Gemini (respaldo)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="radio" name="proveedor-ia" checked={proveedorIA === 'groq'} onChange={() => setProveedorIA('groq')} />
                      Groq (respaldo, gratis sin tarjeta)
                    </label>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-10px', marginBottom: '14px' }}>
                    Si se te acaban los créditos de uno, cambia acá a otro — usan el mismo prompt de abajo.
                  </p>

                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Modelo de Mistral
                    <input value={modeloIA} onChange={(e) => setModeloIA(e.target.value)} style={styles.input} />
                    <small style={{ color: 'var(--text-secondary)' }}>Ej. mistral-small-latest — tiene que ser un modelo con visión.</small>
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Modelo de Gemini
                    <input value={modeloGeminiIA} onChange={(e) => setModeloGeminiIA(e.target.value)} style={styles.input} />
                    <small style={{ color: 'var(--text-secondary)' }}>Ej. gemini-2.5-flash.</small>
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Modelo de Groq
                    <input value={modeloGroqIA} onChange={(e) => setModeloGroqIA(e.target.value)} style={styles.input} />
                    <small style={{ color: 'var(--text-secondary)' }}>Ej. meta-llama/llama-4-scout-17b-16e-instruct — tiene que ser un modelo con visión.</small>
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Prompt (instrucciones para la IA)
                    <textarea
                      value={promptIA}
                      onChange={(e) => setPromptIA(e.target.value)}
                      rows={14}
                      style={{ ...styles.input, width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                    <small style={{ color: 'var(--text-secondary)' }}>
                      Tiene que seguir pidiendo la respuesta en JSON con las claves &quot;nombre&quot;, &quot;descripcion&quot; y
                      &quot;categoria&quot; — si cambias eso, la IA puede dejar de funcionar bien en Productos.
                    </small>
                  </label>
                  {errorIA && <p style={{ color: 'var(--danger)' }}>{errorIA}</p>}
                  {mensajeIA && <p style={{ color: 'var(--teal-dark)' }}>{mensajeIA}</p>}
                  <button type="submit" disabled={guardandoIA} style={styles.btnPrimario}>
                    {guardandoIA ? 'Guardando...' : 'Guardar configuración de la IA'}
                  </button>
                </form>
              )}
            </>
          )}

          {seccionActiva === 'empresa' && (
            <>
              <h2 style={{ marginTop: 0 }}>Datos de la empresa</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Razón social, NIT y dirección de Geek Store. Por ahora se usan en el encabezado del certificado de
                retención de ReteICA (menú &quot;Certificados ReteICA&quot;) — más adelante se pueden reutilizar en otros
                documentos.
              </p>

              {cargandoEmpresa ? (
                <p>Cargando...</p>
              ) : (
                <form onSubmit={guardarDatosEmpresa} style={{ ...styles.formCard, maxWidth: '480px' }}>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Razón social
                    <input value={razonSocialEmpresa} onChange={(e) => setRazonSocialEmpresa(e.target.value)} style={styles.input} />
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    NIT
                    <input value={nitEmpresa} onChange={(e) => setNitEmpresa(e.target.value)} style={styles.input} />
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Dirección
                    <input value={direccionEmpresa} onChange={(e) => setDireccionEmpresa(e.target.value)} style={styles.input} />
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Ciudad
                    <input value={ciudadEmpresa} onChange={(e) => setCiudadEmpresa(e.target.value)} style={styles.input} />
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    Teléfono
                    <input value={telefonoEmpresa} onChange={(e) => setTelefonoEmpresa(e.target.value)} style={styles.input} />
                  </label>
                  {errorEmpresa && <p style={{ color: 'var(--danger)' }}>{errorEmpresa}</p>}
                  {mensajeEmpresa && <p style={{ color: 'var(--teal-dark)' }}>{mensajeEmpresa}</p>}
                  <button type="submit" disabled={guardandoEmpresa} style={styles.btnPrimario}>
                    {guardandoEmpresa ? 'Guardando...' : 'Guardar'}
                  </button>
                </form>
              )}
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

          {seccionActiva === 'respaldos' && (
            <>
              <h2 style={{ marginTop: 0 }}>Respaldos</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Todos los días, solo, el sistema guarda una copia de todos los datos (productos, ventas, facturas de
                compra, garantías, etc.) por si algo se borra o se daña por error. Se guardan los últimos 30 días —
                los más viejos se van borrando solos. Esto es un respaldo de los DATOS, no reemplaza los archivos de
                migración que ya se van guardando en el repositorio para la estructura de las tablas.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <button onClick={generarRespaldoAhora} disabled={generandoRespaldo} style={styles.btnPrimario}>
                  {generandoRespaldo ? 'Generando...' : 'Generar respaldo ahora'}
                </button>
              </div>

              {errorRespaldos && <p style={{ color: 'var(--danger)' }}>{errorRespaldos}</p>}
              {mensajeRespaldos && <p style={{ color: 'var(--teal-dark)' }}>{mensajeRespaldos}</p>}

              {cargandoRespaldos ? (
                <p>Cargando...</p>
              ) : respaldos.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>
                  Todavía no hay ningún respaldo generado. El primero sale solo en la próxima madrugada, o puedes
                  generar uno ahora mismo con el botón de arriba.
                </p>
              ) : (
                <div style={styles.tableCard}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={styles.th}>Fecha</th>
                        <th style={styles.th}>Tablas</th>
                        <th style={styles.th}>Tamaño</th>
                        <th style={styles.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {respaldos.map((r) => (
                        <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={styles.td}>{formatearFechaHora(r.creadoEn)}</td>
                          <td style={styles.td}>{r.tablas}</td>
                          <td style={styles.td}>{formatearTamano(r.tamanoBytes)}</td>
                          <td style={styles.td}>
                            <a
                              href={`/api/respaldos/${r.key}`}
                              style={{ ...styles.btnSecundario, marginLeft: 0, textDecoration: 'none', display: 'inline-block' }}
                            >
                              Descargar
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
  // gridTemplateColumns viene de la clase CSS "pos-grid2" (globals.css),
  // que en celular pasa a una sola columna.
  grid2Cat: { gap: '24px', alignItems: 'start' },
  filaClickeable: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  previewLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '90px',
    marginBottom: '14px',
    padding: '12px',
    border: '1px dashed var(--border)',
    borderRadius: '8px',
    background: '#fafafa',
  },
  imgLogo: { maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' },
};
