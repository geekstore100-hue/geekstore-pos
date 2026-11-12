'use client';

// app/gastos/page.js — Gastos del negocio (nov 2026). Ver lib/gastos.js.
// Registrar gastos que no son mercancía (arriendo, servicios, nómina,
// domicilios, aseo…), imprimir su comprobante de egreso y ver cuánto se ha
// gastado por categoría. Si un gasto en efectivo sale de la caja, se marca y
// se resta del cuadre del turno abierto.

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}
function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}
function fechaCorta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
function numeroComprobante(id) {
  return `CE-${String(id).padStart(4, '0')}`;
}
function nuevoIdLocal() {
  return `gasto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Ejemplo de concepto según la categoría (solo de guía, en el placeholder).
const EJEMPLOS = {
  Arriendo: 'Arriendo local Kennedy — noviembre 2026',
  'Servicios públicos': 'Energía Enel — octubre 2026',
  'Internet y teléfono': 'Internet Claro — noviembre 2026',
  Nómina: 'Quincena 1–15 noviembre — Fernando',
  'Transporte y domicilios': 'Domicilio entrega pedido a Suba',
  'Aseo y cafetería': 'Bolsas de basura y jabón',
};

const FORM_VACIO = {
  fecha: hoyISO(),
  categoria: '',
  concepto: '',
  beneficiario: '',
  beneficiario_doc: '',
  valor: '',
  medio_pago: '',
  de_caja: false,
  notas: '',
};

export default function GastosPage() {
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const idLocalRef = useRef(nuevoIdLocal());
  const formRef = useRef(null);

  async function cargar(d = desde, h = hasta) {
    setCargando(true);
    try {
      const res = await fetch(`/api/gastos?desde=${d}&hasta=${h}`);
      const data = await res.json();
      if (data.ok) setDatos(data);
      else setError(data.error || 'No se pudieron cargar los gastos');
    } catch {
      setError('Sin conexión: no se pudieron cargar los gastos');
    }
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const turnoAbierto = Boolean(datos?.turnoAbiertoId);
  const puedeDeCaja = form.medio_pago === 'Efectivo' && turnoAbierto;

  // Al escribir un beneficiario que ya se usó antes, se trae su NIT/cédula.
  function elegirBeneficiario(nombre) {
    const previo = (datos?.beneficiarios || []).find((b) => b.beneficiario.toLowerCase() === nombre.trim().toLowerCase());
    setForm((f) => ({ ...f, beneficiario: nombre, beneficiario_doc: previo && !f.beneficiario_doc ? previo.beneficiario_doc || '' : f.beneficiario_doc }));
  }

  async function guardar(imprimir) {
    setError('');
    setMensaje('');
    const valor = Number(String(form.valor).replace(/\D/g, ''));
    if (!form.categoria) return setError('Elige la categoría.');
    if (!form.concepto.trim()) return setError('Escribe el concepto.');
    if (!(valor > 0)) return setError('Escribe el valor.');
    if (!form.medio_pago) return setError('Elige cómo se pagó.');
    // La ventana se abre ya (con el clic) para que el navegador no la bloquee.
    const ventana = imprimir ? window.open('about:blank', '_blank') : null;
    setGuardando(true);
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, valor, de_caja: puedeDeCaja && form.de_caja, id_local: idLocalRef.current }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'No se pudo guardar' }));
      if (!data.ok) {
        if (ventana) ventana.close();
        setError(data.error || 'No se pudo guardar el gasto');
      } else {
        if (ventana) ventana.location.href = `/gastos/${data.id}/imprimir`;
        setMensaje(`Gasto ${numeroComprobante(data.id)} guardado${puedeDeCaja && form.de_caja ? ' (se restó del cuadre de la caja)' : ''}.`);
        setForm({ ...FORM_VACIO, fecha: form.fecha });
        idLocalRef.current = nuevoIdLocal();
        cargar();
      }
    } catch {
      if (ventana) ventana.close();
      setError('Sin conexión: no se guardó. Intenta de nuevo (no se va a duplicar).');
    }
    setGuardando(false);
  }

  // "Repetir": el mismo gasto de otro mes (ej. el arriendo), con la fecha de hoy.
  function repetir(g) {
    setForm({
      fecha: hoyISO(),
      categoria: g.categoria,
      concepto: g.concepto,
      beneficiario: g.beneficiario || '',
      beneficiario_doc: g.beneficiario_doc || '',
      valor: String(Math.round(Number(g.valor))),
      medio_pago: g.medio_pago,
      de_caja: false,
      notas: '',
    });
    idLocalRef.current = nuevoIdLocal();
    setMensaje('Datos copiados: revisa el concepto (por ejemplo el mes) y guarda.');
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function anular(g) {
    const motivo = window.prompt(`¿Por qué se anula el gasto ${numeroComprobante(g.id)} (${moneda(g.valor)})?`);
    if (motivo === null) return;
    if (!motivo.trim()) return setError('Para anular hay que escribir el motivo.');
    const res = await fetch(`/api/gastos/${g.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'anular', motivo }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (!data.ok) setError(data.error || 'No se pudo anular');
    else {
      setMensaje(`Gasto ${numeroComprobante(g.id)} anulado.`);
      cargar();
    }
  }

  const categoriasOrdenadas = useMemo(
    () => Object.entries(datos?.porCategoria || {}).sort((a, b) => b[1] - a[1]),
    [datos]
  );

  return (
    <Shell title="Gastos del negocio">
      <style>{`
        .gs-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 14px; }
        .gs-form label { font-size: 13px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; }
        .gs-form input, .gs-form select, .gs-form textarea { padding: 9px; border-radius: 8px; border: 1px solid var(--border); font: inherit; font-size: 14px; color: var(--text); background: #fff; }
        .gs-ancho2 { grid-column: span 2; }
        .gs-ancho3 { grid-column: 1 / -1; }
        .gs-caja { flex-direction: row !important; align-items: center; gap: 8px !important; color: var(--text) !important; font-size: 14px !important; }
        .gs-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .gs-chip { padding: 6px 10px; border-radius: 999px; background: #f3f4f6; font-size: 13px; }
        @media (max-width: 760px) { .gs-form { grid-template-columns: 1fr; } .gs-ancho2 { grid-column: auto; } }
      `}</style>

      <div ref={formRef} style={styles.card}>
        <h3 style={{ margin: '0 0 12px' }}>Registrar gasto</h3>
        <div className="gs-form">
          <label>
            Fecha
            <input type="date" value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
          </label>
          <label>
            Categoría
            <select value={form.categoria} onChange={(e) => cambiar('categoria', e.target.value)}>
              <option value="">Elige…</option>
              {(datos?.categorias || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Valor pagado
            <input
              inputMode="numeric"
              placeholder="$0"
              value={form.valor ? `$${Number(String(form.valor).replace(/\D/g, '')).toLocaleString('es-CO')}` : ''}
              onChange={(e) => cambiar('valor', e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="gs-ancho3">
            Concepto
            <input
              value={form.concepto}
              maxLength={200}
              placeholder={EJEMPLOS[form.categoria] || 'Qué se pagó'}
              onChange={(e) => cambiar('concepto', e.target.value)}
            />
          </label>
          <label className="gs-ancho2">
            Pagado a (persona o empresa)
            <input list="gs-beneficiarios" value={form.beneficiario} maxLength={120} placeholder="Ej. Inmobiliaria / dueño del local" onChange={(e) => elegirBeneficiario(e.target.value)} />
            <datalist id="gs-beneficiarios">
              {(datos?.beneficiarios || []).map((b) => (
                <option key={b.beneficiario} value={b.beneficiario} />
              ))}
            </datalist>
          </label>
          <label>
            NIT o cédula
            <input value={form.beneficiario_doc} maxLength={30} onChange={(e) => cambiar('beneficiario_doc', e.target.value)} />
          </label>
          <label>
            Cómo se pagó
            <select value={form.medio_pago} onChange={(e) => setForm((f) => ({ ...f, medio_pago: e.target.value, de_caja: e.target.value === 'Efectivo' ? f.de_caja : false }))}>
              <option value="">Elige…</option>
              {(datos?.mediosPago || []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          {form.medio_pago === 'Efectivo' ? (
            <label className="gs-caja gs-ancho2" title={turnoAbierto ? '' : 'No hay un turno de caja abierto'}>
              <input type="checkbox" checked={puedeDeCaja && form.de_caja} disabled={!turnoAbierto} onChange={(e) => cambiar('de_caja', e.target.checked)} />
              <span>
                Salió del efectivo de la caja (se resta del cuadre del turno)
                {!turnoAbierto ? <small style={{ display: 'block', color: 'var(--text-secondary)' }}>No hay turno abierto: si salió de la caja, abre el turno primero.</small> : null}
              </span>
            </label>
          ) : (
            <span className="gs-ancho2" />
          )}
          <label className="gs-ancho3">
            Notas (opcional)
            <textarea rows={2} maxLength={500} value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} />
          </label>
        </div>
        {error ? <p style={{ color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p> : null}
        {mensaje ? <p style={{ color: 'var(--teal-dark)', margin: '10px 0 0' }}>{mensaje}</p> : null}
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button onClick={() => guardar(true)} disabled={guardando} style={styles.btnPrimario}>
            {guardando ? 'Guardando…' : '🖨️ Guardar e imprimir comprobante'}
          </button>
          <button onClick={() => guardar(false)} disabled={guardando} style={styles.btnSecundario}>
            Solo guardar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', margin: '22px 0 12px', flexWrap: 'wrap' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button onClick={() => cargar()} style={styles.btnPrimario}>Consultar</button>
      </div>

      {datos ? (
        <div style={{ ...styles.card, marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <strong>Total gastado del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}</strong>
            <strong style={{ fontSize: '20px' }}>{moneda(datos.total)}</strong>
          </div>
          <div className="gs-chips">
            {categoriasOrdenadas.map(([c, v]) => (
              <span key={c} className="gs-chip">{c}: <strong>{moneda(v)}</strong></span>
            ))}
            {!categoriasOrdenadas.length ? <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Sin gastos en este rango.</span> : null}
          </div>
        </div>
      ) : null}

      <div className="pos-tabla-scroll" style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>N.º</th>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Categoría</th>
              <th style={styles.th}>Concepto</th>
              <th style={styles.th}>Pagado a</th>
              <th style={styles.th}>Cómo</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Valor</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {(datos?.gastos || []).map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--border)', ...(g.anulado ? { opacity: 0.55 } : {}) }}>
                <td style={{ ...styles.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{numeroComprobante(g.id)}</td>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{fechaCorta(g.fecha)}</td>
                <td style={styles.td}>{g.categoria}</td>
                <td style={styles.td}>
                  <span style={g.anulado ? { textDecoration: 'line-through' } : undefined}>{g.concepto}</span>
                  {g.anulado ? <span style={{ display: 'block', color: 'var(--danger)', fontSize: '12px', fontWeight: 600 }}>Anulado: {g.motivo_anulacion}</span> : null}
                </td>
                <td style={styles.td}>
                  {g.beneficiario || '—'}
                  {g.beneficiario_doc ? <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>{g.beneficiario_doc}</span> : null}
                </td>
                <td style={styles.td}>
                  {g.medio_pago}
                  {g.de_caja ? <span style={{ display: 'block', fontSize: '12px', color: '#9a5b00', fontWeight: 600 }}>De la caja</span> : null}
                </td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{moneda(g.valor)}</td>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                  <a href={`/gastos/${g.id}/imprimir`} target="_blank" rel="noopener noreferrer" title="Imprimir comprobante de egreso" style={styles.btnChico}>🖨️</a>
                  <button onClick={() => repetir(g)} title="Registrar otra vez (ej. el arriendo del mes siguiente)" style={styles.btnChico}>Repetir</button>
                  {!g.anulado ? <button onClick={() => anular(g)} style={{ ...styles.btnChico, color: 'var(--danger)', borderColor: 'var(--danger)' }}>Anular</button> : null}
                </td>
              </tr>
            ))}
            {!cargando && !(datos?.gastos || []).length ? (
              <tr>
                <td style={styles.td} colSpan={8}>Sin gastos en este rango.</td>
              </tr>
            ) : null}
            {cargando ? (
              <tr>
                <td style={styles.td} colSpan={8}>Cargando…</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px', verticalAlign: 'top' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, minHeight: '38px' },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, minHeight: '38px' },
  btnChico: { display: 'inline-block', padding: '5px 9px', marginRight: '6px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'inherit', textDecoration: 'none', fontSize: '13px', cursor: 'pointer' },
};
