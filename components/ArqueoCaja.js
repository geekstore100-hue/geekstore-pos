'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { instanteHoyColombia } from '../lib/horaColombia';

// Arqueo de caja: contar el efectivo a mitad de turno y compararlo con lo
// que el sistema dice que debería haber.
//
// - Se puede hacer cuando se quiera, con el botón "Arqueo" junto al turno.
// - Si en Configuraciones > Caja hay una hora configurada, a esa hora el
//   sistema lo pide solo (pregunta a /api/arqueos/pendiente justo a esa
//   hora — ver el useEffect de abajo; ya no pregunta cada minuto).
//   Se puede posponer 10 minutos, pero vuelve a salir hasta que se haga.
//
// El conteo es "a ciegas": el vendedor escribe lo que contó SIN ver cuánto
// debería haber; el sistema le muestra la diferencia solo después de
// guardar. Así el número no se puede "acomodar" al esperado.
const POSPONER_MIN = 10;

export default function ArqueoCaja({ turno, vendedores = [], enLinea = true }) {
  const [abierto, setAbierto] = useState(false);
  const [programado, setProgramado] = useState(false);
  const [hora, setHora] = useState('');
  const [dinero, setDinero] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const pospuestoHasta = useRef(0);
  const abiertoRef = useRef(false);
  abiertoRef.current = abierto;

  function abrir(esProgramado) {
    setProgramado(esProgramado);
    setDinero('');
    setVendedorId('');
    setObservaciones('');
    setError('');
    setResultado(null);
    setAbierto(true);
  }

  // Antes esto le preguntaba al servidor CADA MINUTO, todo el día, si ya
  // tocaba el arqueo — y cada pregunta eran hasta 3 consultas a la base de
  // datos, lo que mantenía Neon encendido sin parar mientras Vender
  // estuviera abierto con un turno. Ahora pregunta una vez, y con la hora
  // configurada que devuelve el servidor calcula él mismo cuándo volver a
  // preguntar: justo a la hora del arqueo (y, si lo posponen, justo cuando
  // se acaban los 10 minutos). En un día normal son 2 o 3 consultas en
  // total, en vez de cientos.
  useEffect(() => {
    if (!turno || !enLinea) return undefined;
    let cancelado = false;
    let temporizador = null;

    function volverARevisarEn(ms) {
      clearTimeout(temporizador);
      temporizador = setTimeout(revisar, Math.max(ms, 1000));
    }

    async function revisar() {
      if (cancelado) return;
      // Con la ventana del arqueo abierta, o pospuesto, no hace falta
      // preguntarle nada al servidor todavía — solo esperar.
      if (abiertoRef.current) {
        volverARevisarEn(POSPONER_MIN * 60000);
        return;
      }
      const faltaPospuesto = pospuestoHasta.current - Date.now();
      if (faltaPospuesto > 0) {
        volverARevisarEn(faltaPospuesto + 2000);
        return;
      }
      try {
        const res = await fetch('/api/arqueos/pendiente');
        const data = await res.json();
        if (cancelado || !data.ok) return;
        if (data.pendiente) {
          setHora(data.hora);
          abrir(true);
          // Por si lo posponen: se vuelve a revisar cuando se cumplan los
          // 10 minutos (si ya lo hicieron, el servidor dirá que no está
          // pendiente y se programa para mañana).
          volverARevisarEn(POSPONER_MIN * 60000);
          return;
        }
        if (!data.activo) return; // arqueo programado desactivado: no hay nada que esperar
        const [h, m] = String(data.hora || '').split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return;
        let proxima = instanteHoyColombia(h, m).getTime();
        // Si la hora de hoy ya pasó (y no está pendiente: ya se hizo, o el
        // turno se abrió después de esa hora), la próxima vez es mañana.
        if (proxima <= Date.now()) proxima += 24 * 60 * 60 * 1000;
        volverARevisarEn(proxima - Date.now() + 5000);
      } catch {
        // Sin conexión: se vuelve a intentar en un rato.
        volverARevisarEn(5 * 60000);
      }
    }

    revisar();
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [turno, enLinea]);

  function posponer() {
    pospuestoHasta.current = Date.now() + POSPONER_MIN * 60000;
    setAbierto(false);
  }

  async function guardar() {
    setError('');
    if (dinero === '' || Number(dinero) < 0) {
      setError('Escribe cuánto efectivo contaste en la caja');
      return;
    }
    if (vendedores.length > 0 && !vendedorId) {
      setError('Selecciona quién hizo el arqueo');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch('/api/arqueos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dinero_contado: Number(dinero),
          vendedor_id: vendedorId ? Number(vendedorId) : null,
          observaciones,
          programado,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'No se pudo registrar el arqueo');
        return;
      }
      setResultado(data.arqueo);
    } catch {
      setError('No hay conexión. Intenta de nuevo cuando vuelva el internet.');
    } finally {
      setGuardando(false);
    }
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  function horaLegible(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  if (!turno) return null;

  return (
    <>
      <button onClick={() => abrir(false)} style={styles.link}>Arqueo</button>

      {/* El recuadro se dibuja directamente en el <body> (createPortal), no
          dentro de la línea del turno donde está el botón: si no, hereda su
          letra chica y gris. */}
      {abierto && createPortal(
        <div style={styles.overlay} onMouseDown={() => !guardando && !programado && setAbierto(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Arqueo de caja</h3>

            {!resultado ? (
              <>
                {programado && (
                  <p style={styles.avisoHora}>Son más de las {horaLegible(hora)}: es hora del arqueo de caja.</p>
                )}
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Cuenta todo el efectivo que hay en la caja en este momento (billetes y monedas, incluida la base) y
                  escribe el total. Después de guardar, el sistema te dice si cuadra.
                </p>
                <label style={styles.etiqueta}>
                  Efectivo contado *
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={dinero}
                    onChange={(e) => setDinero(e.target.value)}
                    style={styles.input}
                    autoFocus
                  />
                </label>
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
                  <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={styles.input} />
                </label>
                {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
                <div style={styles.botones}>
                  <button onClick={guardar} disabled={guardando} style={styles.btnPrimario}>
                    {guardando ? 'Guardando...' : 'Registrar arqueo'}
                  </button>
                  {programado ? (
                    <button onClick={posponer} disabled={guardando} style={styles.btnSecundario}>
                      Recordarme en {POSPONER_MIN} minutos
                    </button>
                  ) : (
                    <button onClick={() => setAbierto(false)} disabled={guardando} style={styles.btnSecundario}>Cancelar</button>
                  )}
                </div>
              </>
            ) : (
              (() => {
                const diferencia = Number(resultado.diferencia);
                const cuadra = Math.abs(diferencia) < 1;
                return (
                  <>
                    <div style={styles.filaResumen}><span>Efectivo contado</span><strong>{moneda(resultado.dinero_contado)}</strong></div>
                    <div style={styles.filaResumen}><span>Debería haber</span><strong>{moneda(resultado.dinero_esperado)}</strong></div>
                    <div style={{ ...styles.resultado, ...(cuadra ? styles.resultadoOk : styles.resultadoMal) }}>
                      {cuadra
                        ? 'La caja cuadra.'
                        : `${diferencia > 0 ? 'Sobran' : 'Faltan'} ${moneda(Math.abs(diferencia))}. Quedó registrado en el historial del turno.`}
                    </div>
                    <div style={styles.botones}>
                      <button onClick={() => setAbierto(false)} style={styles.btnPrimario}>Aceptar</button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const styles = {
  link: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontWeight: 600, fontSize: '13px', padding: 0 },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
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
    width: '400px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  avisoHora: { background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontWeight: 600, marginTop: 0 },
  etiqueta: { display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: '14px' },
  botones: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderBottom: '1px solid var(--border)' },
  resultado: { borderRadius: '8px', padding: '10px 12px', marginTop: '12px', fontSize: '14px', fontWeight: 600 },
  resultadoOk: { background: 'var(--teal-light)', color: 'var(--teal-dark)' },
  resultadoMal: { background: '#fee2e2', color: '#991b1b' },
};
