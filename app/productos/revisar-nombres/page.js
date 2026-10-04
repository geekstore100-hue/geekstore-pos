'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';

// Productos → "Revisar nombres con IA".
//
// La IA lee los nombres de todos los productos activos (de a 40) y SUGIERE
// correcciones de ortografía (ej. "Estrabilizador" → "Estabilizador") y
// marca los nombres que parecen cortados. Nada se cambia solo: Nelson ve
// cada sugerencia, la puede editar, desmarcar o decir "esta palabra está
// bien" (para marcas como "Raop" que la IA no conoce), y al final toca
// "Guardar cambios aprobados".

function resaltarCambios(actual, sugerido) {
  const a = new Set(actual.split(/\s+/));
  return sugerido.split(/(\s+)/).map((parte, i) =>
    /\s+/.test(parte) || a.has(parte) ? (
      <span key={i}>{parte}</span>
    ) : (
      <mark key={i} style={{ background: '#d9f5e5', color: '#0b5c2f', borderRadius: '3px', padding: '0 2px' }}>{parte}</mark>
    )
  );
}

function palabrasCambiadas(actual, sugerido) {
  const s = new Set(String(sugerido || '').split(/\s+/));
  return String(actual).split(/\s+/).filter((w) => w && !s.has(w));
}

export default function RevisarNombresPage() {
  const [proveedor, setProveedor] = useState('');
  const [sugerencias, setSugerencias] = useState([]); // {id, referencia, actual, sugerido, motivo, cortado, aprobado, editado}
  const [progreso, setProgreso] = useState({ revisados: 0, total: 0 });
  const [revisando, setRevisando] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [palabrasCorrectas, setPalabrasCorrectas] = useState([]);
  const detenerRef = useRef(false);
  const siguienteRef = useRef(0);

  useEffect(() => {
    fetch('/api/productos/nombres')
      .then((r) => r.json())
      .then((d) => d.ok && setPalabrasCorrectas(d.palabrasCorrectas || []))
      .catch(() => {});
  }, []);

  async function revisar() {
    setError('');
    setMensaje('');
    setRevisando(true);
    detenerRef.current = false;
    try {
      while (!detenerRef.current) {
        const res = await fetch('/api/productos/revisar-nombres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ desde: siguienteRef.current, proveedor: proveedor || undefined }),
        });
        const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));
        if (!data.ok) {
          setError(`${data.error || 'No se pudo revisar'} — puedes darle "Continuar" para reintentar desde donde iba.`);
          break;
        }
        setProgreso({ revisados: data.revisados, total: data.total });
        if (data.sugerencias?.length) {
          setSugerencias((prev) => {
            const ya = new Set(prev.map((s) => s.id));
            return [
              ...prev,
              ...data.sugerencias
                .filter((s) => !ya.has(s.id))
                .map((s) => ({ ...s, aprobado: Boolean(s.sugerido), editado: s.sugerido || s.actual })),
            ];
          });
        }
        if (data.siguiente === null || data.siguiente === undefined) {
          setTerminado(true);
          break;
        }
        siguienteRef.current = data.siguiente;
      }
    } catch {
      setError('Error de conexión — dale "Continuar" para seguir desde donde iba.');
    }
    setRevisando(false);
  }

  function actualizar(id, cambios) {
    setSugerencias((prev) => prev.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
  }

  async function marcarPalabrasCorrectas(s) {
    const nuevas = palabrasCambiadas(s.actual, s.sugerido).filter((w) => /[a-z]/i.test(w));
    if (!nuevas.length) return;
    const lista = [...new Set([...palabrasCorrectas, ...nuevas])];
    const res = await fetch('/api/productos/nombres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabrasCorrectas: lista }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setPalabrasCorrectas(data.palabrasCorrectas);
      setSugerencias((prev) => prev.filter((x) => x.id !== s.id));
      setMensaje(`Listo: "${nuevas.join('", "')}" queda como palabra correcta y la IA no la volverá a cambiar.`);
    } else {
      setError(data.error || 'No se pudo guardar la palabra');
    }
  }

  async function quitarPalabraCorrecta(w) {
    const lista = palabrasCorrectas.filter((x) => x !== w);
    const res = await fetch('/api/productos/nombres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabrasCorrectas: lista }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) setPalabrasCorrectas(data.palabrasCorrectas);
  }

  async function guardar() {
    const cambios = sugerencias
      .filter((s) => s.aprobado && s.editado.trim() && s.editado.trim() !== s.actual)
      .map((s) => ({ id: s.id, nombre: s.editado.trim() }));
    if (!cambios.length) {
      setError('No hay cambios aprobados para guardar.');
      return;
    }
    setGuardando(true);
    setError('');
    const res = await fetch('/api/productos/nombres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cambios }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (data.ok) {
      const guardados = new Set(cambios.map((c) => c.id));
      setSugerencias((prev) => prev.filter((s) => !guardados.has(s.id)));
      setMensaje(`Se actualizaron ${data.actualizados} nombres. La tienda los muestra en unos minutos.`);
    } else {
      setError(data.error || 'No se pudo guardar');
    }
  }

  const aprobados = sugerencias.filter((s) => s.aprobado && s.editado.trim() !== s.actual).length;
  const pct = progreso.total ? Math.round((progreso.revisados / progreso.total) * 100) : 0;

  return (
    <Shell title="Revisar nombres con IA">
      <div style={styles.card}>
        <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
          La IA revisa la ortografía de los nombres de tus productos activos y te sugiere correcciones. <strong>No cambia nada sola</strong>:
          tú apruebas cada una. Las marcas y modelos que la IA no conozca (como &quot;Raop&quot;) márcalos con &quot;La palabra está bien&quot; y no los
          volverá a tocar.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={styles.select} disabled={revisando}>
            <option value="">IA por defecto (Configuraciones)</option>
            <option value="mistral">Mistral</option>
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
          </select>
          {revisando ? (
            <button type="button" style={styles.btnSecundario} onClick={() => { detenerRef.current = true; }}>
              Pausar
            </button>
          ) : (
            <button type="button" style={styles.btnPrimario} onClick={revisar} disabled={terminado}>
              {terminado ? 'Revisión completa' : progreso.revisados > 0 ? 'Continuar revisión' : 'Empezar revisión'}
            </button>
          )}
          <Link href="/productos" style={{ color: 'var(--teal-dark)', fontSize: '14px' }}>← Volver a Productos</Link>
        </div>

        {progreso.total > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ height: '8px', background: 'var(--bg)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {revisando ? 'Revisando… ' : ''}{progreso.revisados} de {progreso.total} productos revisados · {sugerencias.length} con algo para revisar
            </div>
          </div>
        )}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}
      </div>

      {sugerencias.length > 0 && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Sugerencias</h3>
            <button type="button" style={styles.btnPrimario} onClick={guardar} disabled={guardando || aprobados === 0}>
              {guardando ? 'Guardando…' : `Guardar ${aprobados} cambio${aprobados === 1 ? '' : 's'} aprobado${aprobados === 1 ? '' : 's'}`}
            </button>
          </div>
          {sugerencias.map((s) => (
            <div key={s.id} style={{ ...styles.fila, ...(s.aprobado ? {} : { opacity: 0.6 }) }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={s.aprobado}
                  onChange={(e) => actualizar(s.id, { aprobado: e.target.checked })}
                  style={{ marginTop: '4px' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Ref. {s.referencia} · {s.cortado ? '⚠️ Parece cortado — complétalo a mano' : s.motivo}
                  </div>
                  <div style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '14px' }}>{s.actual}</div>
                  {s.sugerido && <div style={{ fontSize: '14px', marginBottom: '6px' }}>{resaltarCambios(s.actual, s.sugerido)}</div>}
                </div>
              </label>
              <input
                type="text"
                value={s.editado}
                onChange={(e) => actualizar(s.id, { editado: e.target.value, aprobado: true })}
                style={styles.input}
                aria-label={`Nombre nuevo para la referencia ${s.referencia}`}
              />
              {s.sugerido && palabrasCambiadas(s.actual, s.sugerido).length > 0 && (
                <button type="button" style={styles.btnLink} onClick={() => marcarPalabrasCorrectas(s)}>
                  La palabra &quot;{palabrasCambiadas(s.actual, s.sugerido).join(' ')}&quot; está bien (no volver a cambiarla)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {terminado && sugerencias.length === 0 && (
        <div style={styles.card}>✅ Revisión completa: no quedan nombres para corregir.</div>
      )}

      {palabrasCorrectas.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Palabras que la IA no debe cambiar</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {palabrasCorrectas.map((w) => (
              <span key={w} style={styles.chip}>
                {w}
                <button type="button" onClick={() => quitarPalabraCorrecta(w)} style={styles.chipX} aria-label={`Quitar ${w}`}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' },
  select: { padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  input: { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' },
  fila: { padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  btnLink: { alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', textAlign: 'left' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 4px 4px 10px', borderRadius: '999px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '13px' },
  chipX: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px', color: 'var(--text-secondary)' },
};
