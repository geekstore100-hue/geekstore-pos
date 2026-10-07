'use client';

import { useEffect, useMemo, useState } from 'react';

// Retenciones de ReteICA SIN factura de compra (octubre 2026): para las
// compras de Eve Jeans (ropa), que declaran con el mismo NIT que Geek
// Store pero NO deben entrar al inventario del POS. Aquí se registra solo
// la retención: proveedor, factura del proveedor, base, tarifa y valor.
// No mueve stock, ni el valor del inventario, ni cuentas por pagar. Se
// suman solas al resumen y a los certificados de arriba.

const NEGOCIOS = ['Eve Jeans', 'Geek Store'];
const TARIFAS = [
  { valor: '1.1', texto: '1,1 %' },
  { valor: '0.41', texto: '0,41 %' },
  { valor: 'otra', texto: 'Otra' },
];

function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}
function soloNumero(v) {
  return String(v ?? '').replace(/[^\d]/g, '');
}

const formVacio = () => ({
  id: null,
  negocio: 'Eve Jeans',
  proveedor_id: '',
  fecha: hoyISO(),
  numero_factura: '',
  concepto: '',
  base: '',
  tarifa: '1.1',
  otraTarifa: '',
  valor: '',
  valorManual: false,
  notas: '',
});

export default function RetencionesSinFactura({ desde, hasta, proveedores, setProveedores, onCambio }) {
  const [lista, setLista] = useState([]);
  const [faltaMigracion, setFaltaMigracion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [buscar, setBuscar] = useState('');
  const [nuevoProv, setNuevoProv] = useState(null);
  const [creandoProv, setCreandoProv] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`/api/reteica/retenciones?desde=${desde}&hasta=${hasta}`);
      const d = await r.json();
      if (d.ok) {
        setLista(d.retenciones);
        setFaltaMigracion(d.faltaMigracion ? d.mensaje : '');
      } else setError(d.error || 'No se pudieron cargar las retenciones');
    } catch {
      setError('Error de conexión al cargar las retenciones');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (desde && hasta) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const porcentaje = form ? Number(form.tarifa === 'otra' ? String(form.otraTarifa).replace(',', '.') : form.tarifa) : 0;
  const valorCalculado = form && Number(form.base) > 0 && porcentaje > 0 ? Math.round((Number(form.base) * porcentaje) / 100) : 0;
  const valorFinal = form ? (form.valorManual ? Number(form.valor || 0) : valorCalculado) : 0;

  const coincidencias = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return [];
    return proveedores
      .filter((p) => p.nombre.toLowerCase().includes(t) || String(p.identificacion || '').includes(t))
      .slice(0, 8);
  }, [buscar, proveedores]);

  function abrirNueva() {
    setForm(formVacio());
    setErrorForm('');
    setBuscar('');
    setNuevoProv(null);
  }

  function abrirEdicion(r) {
    const t = String(Number(r.porcentaje));
    const conocida = TARIFAS.some((x) => x.valor === t);
    setForm({
      id: r.id,
      negocio: r.negocio,
      proveedor_id: String(r.proveedor_id),
      fecha: r.fecha,
      numero_factura: r.numero_factura || '',
      concepto: r.concepto || '',
      base: String(Math.round(Number(r.base))),
      tarifa: conocida ? t : 'otra',
      otraTarifa: conocida ? '' : t,
      valor: String(Math.round(Number(r.valor))),
      valorManual: Math.round(Number(r.valor)) !== Math.round((Number(r.base) * Number(r.porcentaje)) / 100),
      notas: r.notas || '',
    });
    setErrorForm('');
    setBuscar('');
    setNuevoProv(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: document.getElementById('retenciones-sin-factura')?.offsetTop || 0, behavior: 'smooth' });
  }

  async function crearProveedor() {
    if (!nuevoProv?.nombre?.trim()) {
      setErrorForm('Escribe el nombre del proveedor');
      return;
    }
    setCreandoProv(true);
    setErrorForm('');
    try {
      const r = await fetch('/api/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoProv),
      });
      const d = await r.json();
      if (!d.ok) {
        setErrorForm(d.error || 'No se pudo crear el proveedor');
        return;
      }
      setProveedores((a) => [...a, d.proveedor].sort((x, y) => x.nombre.localeCompare(y.nombre)));
      setForm((f) => ({ ...f, proveedor_id: String(d.proveedor.id) }));
      setNuevoProv(null);
      setBuscar('');
    } catch {
      setErrorForm('No se pudo crear el proveedor');
    } finally {
      setCreandoProv(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorForm('');
    if (!form.proveedor_id) return setErrorForm('Selecciona el proveedor');
    if (!(Number(form.base) > 0)) return setErrorForm('Escribe la base de la retención');
    if (!(porcentaje > 0)) return setErrorForm('Escribe la tarifa');
    if (!(valorFinal > 0)) return setErrorForm('El valor retenido debe ser mayor a 0');
    setGuardando(true);
    try {
      const r = await fetch(form.id ? `/api/reteica/retenciones/${form.id}` : '/api/reteica/retenciones', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negocio: form.negocio,
          proveedor_id: Number(form.proveedor_id),
          fecha: form.fecha,
          numero_factura: form.numero_factura,
          concepto: form.concepto,
          base: Number(form.base),
          porcentaje,
          valor: valorFinal,
          notas: form.notas,
        }),
      });
      const d = await r.json();
      if (!d.ok) {
        setErrorForm(d.error || 'No se pudo guardar');
        return;
      }
      setForm(null);
      await cargar();
      onCambio?.();
    } catch {
      setErrorForm('Error de conexión al guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(r) {
    if (!window.confirm(`¿Borrar la retención de ${moneda(r.valor)} a ${r.proveedor_nombre}?`)) return;
    try {
      const res = await fetch(`/api/reteica/retenciones/${r.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || 'No se pudo borrar');
        return;
      }
      await cargar();
      onCambio?.();
    } catch {
      setError('Error de conexión al borrar');
    }
  }

  const proveedorElegido = form?.proveedor_id ? proveedores.find((p) => String(p.id) === String(form.proveedor_id)) : null;
  const totalLista = lista.reduce((a, r) => a + Number(r.valor || 0), 0);

  return (
    <div id="retenciones-sin-factura" style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <strong>Retenciones sin factura de compra (Eve Jeans)</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '640px' }}>
            Registra aquí la ReteICA que practicas en compras que no van al inventario del POS, como la ropa de Eve Jeans.
            No mueve stock ni el valor del inventario, y se suma al resumen y a los certificados de arriba.
          </p>
        </div>
        {!form && !faltaMigracion && (
          <button type="button" onClick={abrirNueva} style={s.btnPrimario}>+ Registrar retención</button>
        )}
      </div>

      {faltaMigracion && <p style={s.aviso}>{faltaMigracion}</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {form && (
        <form onSubmit={guardar} style={s.form}>
          <div style={s.fila}>
            <label style={s.campo}>
              Negocio
              <select value={form.negocio} onChange={(e) => setForm({ ...form, negocio: e.target.value })} style={s.input}>
                {NEGOCIOS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={s.campo}>
              Fecha de la factura
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={s.input} required />
            </label>
            <label style={s.campo}>
              N.° factura del proveedor
              <input value={form.numero_factura} onChange={(e) => setForm({ ...form, numero_factura: e.target.value })} style={s.input} placeholder="Ej. FE-2345" />
            </label>
          </div>

          <div style={s.campoAncho}>
            <span>Proveedor</span>
            {proveedorElegido ? (
              <div style={s.elegido}>
                <span>
                  <strong>{proveedorElegido.nombre}</strong>
                  {proveedorElegido.identificacion ? <span style={{ color: 'var(--text-secondary)' }}> — {proveedorElegido.identificacion}</span> : null}
                </span>
                <button type="button" onClick={() => setForm({ ...form, proveedor_id: '' })} style={s.btnLink}>Cambiar</button>
              </div>
            ) : nuevoProv ? (
              <div style={s.fila}>
                <input value={nuevoProv.nombre} onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })} style={s.input} placeholder="Nombre del proveedor *" autoFocus />
                <input value={nuevoProv.identificacion} onChange={(e) => setNuevoProv({ ...nuevoProv, identificacion: e.target.value })} style={s.input} placeholder="NIT o cédula (sale en el certificado)" />
                <button type="button" onClick={crearProveedor} disabled={creandoProv} style={s.btnSecundario}>{creandoProv ? 'Creando...' : 'Crear proveedor'}</button>
                <button type="button" onClick={() => setNuevoProv(null)} style={s.btnLink}>Cancelar</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={s.fila}>
                  <input value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ ...s.input, flex: 1, minWidth: '240px' }} placeholder="Escribe para buscar el proveedor (nombre o NIT)..." />
                  <button type="button" onClick={() => setNuevoProv({ nombre: buscar, identificacion: '', telefono: '' })} style={s.btnSecundario}>+ Nuevo proveedor</button>
                </div>
                {coincidencias.length > 0 && (
                  <div style={s.sugerencias}>
                    {coincidencias.map((p) => (
                      <button type="button" key={p.id} onClick={() => { setForm({ ...form, proveedor_id: String(p.id) }); setBuscar(''); }} style={s.sugerencia}>
                        {p.nombre}{p.identificacion ? <span style={{ color: 'var(--text-secondary)' }}> — {p.identificacion}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={s.fila}>
            <label style={{ ...s.campo, flex: 2 }}>
              Concepto (opcional)
              <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={s.input} placeholder="Ej. Compra de jeans" />
            </label>
          </div>

          <div style={s.fila}>
            <label style={s.campo}>
              Base de la retención
              <input inputMode="numeric" value={form.base ? Number(form.base).toLocaleString('es-CO') : ''} onChange={(e) => setForm({ ...form, base: soloNumero(e.target.value) })} style={s.input} placeholder="$0" />
            </label>
            <label style={s.campo}>
              Tarifa
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <select value={form.tarifa} onChange={(e) => setForm({ ...form, tarifa: e.target.value })} style={{ ...s.input, marginTop: 0, minWidth: '110px' }}>
                  {TARIFAS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
                </select>
                {form.tarifa === 'otra' && (
                  <input value={form.otraTarifa} onChange={(e) => setForm({ ...form, otraTarifa: e.target.value.replace(/[^\d.,]/g, '') })} style={{ ...s.input, marginTop: 0, minWidth: '80px', width: '90px' }} placeholder="%" />
                )}
              </div>
            </label>
            <label style={s.campo}>
              Valor retenido
              <input
                inputMode="numeric"
                value={form.valorManual ? (form.valor ? Number(form.valor).toLocaleString('es-CO') : '') : valorCalculado ? valorCalculado.toLocaleString('es-CO') : ''}
                onChange={(e) => setForm({ ...form, valor: soloNumero(e.target.value), valorManual: true })}
                style={s.input}
                placeholder="$0"
              />
              {form.valorManual && (
                <button type="button" onClick={() => setForm({ ...form, valorManual: false, valor: '' })} style={{ ...s.btnLink, fontSize: '12px', padding: '4px 0 0' }}>
                  Volver a calcular ({moneda(valorCalculado)})
                </button>
              )}
            </label>
          </div>

          <label style={s.campoAncho}>
            Notas (opcional)
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={s.input} />
          </label>

          {errorForm && <p style={{ color: 'var(--danger)', margin: 0 }}>{errorForm}</p>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={guardando} style={s.btnPrimario}>
              {guardando ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar retención'}
            </button>
            <button type="button" onClick={() => setForm(null)} style={s.btnSecundario}>Cancelar</button>
          </div>
        </form>
      )}

      {!faltaMigracion && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={s.th}>Fecha</th>
              <th style={s.th}>Negocio</th>
              <th style={s.th}>Proveedor</th>
              <th style={s.th}>N.° factura</th>
              <th style={s.th}>Base</th>
              <th style={s.th}>Tarifa</th>
              <th style={s.th}>Retenido</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={s.td}>{r.fecha}</td>
                <td style={s.td}>{r.negocio}</td>
                <td style={s.td}>
                  {r.proveedor_nombre}
                  {r.concepto ? <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{r.concepto}</div> : null}
                </td>
                <td style={s.td}>{r.numero_factura || '—'}</td>
                <td style={s.td}>{moneda(r.base)}</td>
                <td style={s.td}>{Number(r.porcentaje).toLocaleString('es-CO', { maximumFractionDigits: 3 })}%</td>
                <td style={s.td}>{moneda(r.valor)}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => abrirEdicion(r)} style={s.btnLink}>Editar</button>{' '}
                  <button type="button" onClick={() => borrar(r)} style={{ ...s.btnLink, color: 'var(--danger)' }}>Borrar</button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td style={s.td} colSpan={8}>{cargando ? 'Cargando...' : 'No hay retenciones sin factura de compra en este período.'}</td>
              </tr>
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={s.td} colSpan={6}>Total en el período</td>
                <td style={s.td}>{moneda(totalLista)}</td>
                <td style={s.td}></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '32px' },
  aviso: { background: '#fff4e5', border: '1px solid #f5c377', borderRadius: '8px', padding: '10px 14px', color: '#8a5a00' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px', padding: '14px', background: 'var(--bg, #f7f9f9)', borderRadius: '8px', border: '1px solid var(--border)' },
  fila: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' },
  campo: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: '170px', fontSize: '13px' },
  campoAncho: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' },
  input: { padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: '#fff' },
  elegido: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' },
  sugerencias: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 6px 18px rgba(0,0,0,.08)', maxHeight: '260px', overflowY: 'auto' },
  sugerencia: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '14px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px', verticalAlign: 'top' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
  btnSecundario: { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, height: '38px' },
  btnLink: { border: 'none', background: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, padding: 0, textAlign: 'left' },
};
