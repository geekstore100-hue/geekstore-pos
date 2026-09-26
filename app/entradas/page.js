'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

export default function EntradasPage() {
  const [productos, setProductos] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precioCompra, setPrecioCompra] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Para elegir cuáles "entradas de hoy" van al Excel de etiquetas (por defecto
  // se marcan todas apenas se cargan).
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [errorEtiquetas, setErrorEtiquetas] = useState('');
  const [generandoExcel, setGenerandoExcel] = useState(false);

  async function cargarTodo() {
    const [rProd, rEntradas] = await Promise.all([fetch('/api/productos'), fetch('/api/entradas')]);
    const dProd = await rProd.json();
    const dEntradas = await rEntradas.json();
    if (dProd.ok) setProductos(dProd.productos);
    if (dEntradas.ok) {
      setEntradas(dEntradas.entradas);
      setSeleccionadas(new Set(dEntradas.entradas.map((en) => en.id)));
    }
  }

  function alternarSeleccion(id) {
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function seleccionarTodas() {
    setSeleccionadas(new Set(entradas.map((en) => en.id)));
  }

  function deseleccionarTodas() {
    setSeleccionadas(new Set());
  }

  // Al principio del Excel se agregan 3 filas de prueba (ver FILAS_PRUEBA
  // más abajo): la impresora de etiquetas de Nelson daña la primera fila
  // física al imprimir, así que esas 3 se sacrifican en vez de perder
  // etiquetas de productos reales.
  const FILAS_PRUEBA = [
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
  ];

  // Genera un Excel (.xlsx) para importar en OpenLabel e imprimir etiquetas de
  // precio: una fila POR CADA UNIDAD que entró (si llegaron 5 unidades de un
  // artículo, se repiten 5 filas iguales), con columnas Referencia, Artículo
  // y Precio. El precio se escribe como texto ya formateado al estilo
  // colombiano (con punto de miles, ej. "90.000"), tal como lo pidió Nelson,
  // para que OpenLabel lo tome tal cual sin tener que reformatear nada.
  async function descargarExcelEtiquetas() {
    setErrorEtiquetas('');

    const entradasElegidas = entradas.filter((en) => seleccionadas.has(en.id));
    if (entradasElegidas.length === 0) {
      setErrorEtiquetas('Selecciona al menos una entrada para generar el Excel');
      return;
    }

    const filas = [];
    const sinPrecio = new Set();

    entradasElegidas.forEach((en) => {
      const producto = productos.find(
        (p) => (en.producto_id && p.id === en.producto_id) || p.referencia === en.referencia
      );
      const precio = Number(producto?.precio_venta) || 0;
      if (!producto || !producto.precio_venta) sinPrecio.add(en.referencia);

      const precioFormateado = precio.toLocaleString('es-CO', { maximumFractionDigits: 0 });
      const cantidad = Math.max(1, Number(en.cantidad) || 0);

      for (let i = 0; i < cantidad; i++) {
        filas.push([en.referencia, en.nombre, precioFormateado]);
      }
    });

    if (sinPrecio.size > 0) {
      setErrorEtiquetas(
        `Ojo: no se encontró precio de venta para: ${Array.from(sinPrecio).join(', ')}. Se generó el Excel igual, con $0 para esos productos.`
      );
    }

    setGenerandoExcel(true);
    try {
      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.aoa_to_sheet([['Referencia', 'Artículo', 'Precio'], ...FILAS_PRUEBA, ...filas]);
      hoja['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 12 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Etiquetas');

      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(libro, `etiquetas_openlabel_${fecha}.xlsx`);
    } finally {
      setGenerandoExcel(false);
    }
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
      body: JSON.stringify({
        producto_id: Number(productoId),
        cantidad: Number(cantidad),
        nota,
        precio_compra: precioCompra ? Number(precioCompra) : undefined,
      }),
    });
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMensaje('Entrada registrada.');
      setProductoId('');
      setCantidad(1);
      setPrecioCompra('');
      setNota('');
      setBusqueda('');
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la entrada');
    }
  }

  function moneda(n) {
    return n || n === 0 ? `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : '-';
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
              Stock actual: <strong>{seleccionado.stock}</strong> · Costo promedio actual: <strong>{moneda(seleccionado.precio_costo)}</strong>
            </p>
          )}

          <label style={{ display: 'block', marginBottom: '10px' }}>
            Cantidad que llegó
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={styles.input} />
          </label>

          <label style={{ display: 'block', marginBottom: '10px' }}>
            Precio de compra (por unidad)
            <input
              type="number"
              min="0"
              step="0.01"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
              style={styles.input}
              placeholder="Ej: 8500"
            />
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Si lo llenas, el costo promedio del producto se actualiza solo con esta compra. Si lo dejas vacío, la
              entrada solo corrige la cantidad y el costo promedio queda igual.
            </span>
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0 }}>Entradas de hoy</h3>
        {entradas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={seleccionarTodas} style={styles.btnLink}>Marcar todas</button>
            <button onClick={deseleccionarTodas} style={styles.btnLink}>Ninguna</button>
            <button onClick={descargarExcelEtiquetas} disabled={generandoExcel} style={styles.btnSecundario}>
              {generandoExcel ? 'Generando...' : 'Descargar Excel para etiquetas (OpenLabel)'}
            </button>
          </div>
        )}
      </div>
      {errorEtiquetas && <p style={{ color: 'var(--danger)', marginTop: '8px' }}>{errorEtiquetas}</p>}
      <div style={{ ...styles.tableCard, marginTop: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}></th>
              <th style={styles.th}>Hora</th>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>Cantidad</th>
              <th style={styles.th}>Precio de compra</th>
              <th style={styles.th}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {entradas.map((en) => (
              <tr key={en.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(en.id)}
                    onChange={() => alternarSeleccion(en.id)}
                  />
                </td>
                <td style={styles.td}>{new Date(en.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td style={styles.td}>{en.referencia} — {en.nombre}</td>
                <td style={styles.td}>{en.cantidad}</td>
                <td style={styles.td}>{moneda(en.precio_compra)}</td>
                <td style={styles.td}>{en.nota || '-'}</td>
              </tr>
            ))}
            {entradas.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={6}>Sin entradas registradas hoy.</td>
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
  btnLink: { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--teal-dark)', fontSize: '13px', fontWeight: 600, padding: '4px 2px' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
};
