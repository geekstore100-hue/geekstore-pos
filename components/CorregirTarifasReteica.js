'use client';

import { useEffect, useState } from 'react';
import { textoTarifa } from '../lib/tarifasReteica';

// Aviso en ReteICA (oct 2026): retenciones guardadas con las tarifas viejas
// del POS (0,41 % / 1,1 %) en vez de las de Bogotá (0,414 % / 1,104 %, o
// sea 4,14 y 11,04 por mil). Muestra cuáles son y cuánto cambian, y las
// corrige con un botón. Si no hay ninguna, no se ve nada.

const moneda = (n) => `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

export default function CorregirTarifasReteica({ onCorregido }) {
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const d = await (await fetch('/api/reteica/corregir-tarifas')).json();
      if (d.ok) setDatos(d);
    } catch {
      // sin conexión: no se muestra el aviso
    }
  }
  useEffect(() => { cargar(); }, []);

  async function corregir() {
    if (!window.confirm(`¿Corregir ${datos.pendientes.length === 1 ? '1 retención' : `${datos.pendientes.length} retenciones`} a las tarifas 0,414 % / 1,104 %?`)) return;
    setCorrigiendo(true);
    setError('');
    try {
      const d = await (await fetch('/api/reteica/corregir-tarifas', { method: 'POST' })).json();
      if (!d.ok) return setError(d.error || 'No se pudo corregir');
      setMensaje(
        `✅ Listo: ${d.corregidas === 1 ? 'se corrigió 1 retención' : `se corrigieron ${d.corregidas} retenciones`}. El total retenido subió ${moneda(d.diferencia)}.` +
          (d.a_mano ? ` ${d.a_mano} tenían el valor escrito a mano: se cambió la tarifa pero revisa el valor.` : '')
      );
      setDatos(null);
      onCorregido?.();
    } catch {
      setError('Error de conexión');
    } finally {
      setCorrigiendo(false);
    }
  }

  if (mensaje) {
    return <div style={{ ...caja, background: 'var(--teal-light)', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{mensaje}</div>;
  }
  if (!datos || !datos.pendientes.length) return null;
  const n = datos.pendientes.length;

  return (
    <div style={caja}>
      <strong>Hay {n} {n === 1 ? 'retención' : 'retenciones'} con la tarifa vieja (0,41 % o 1,1 %).</strong>
      <div style={{ marginTop: '4px' }}>
        En Bogotá son 4,14 y 11,04 por mil (0,414 % y 1,104 %). Corregirlas suma {moneda(datos.diferencia)} al total retenido.
      </div>
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} style={link}>Ver cuáles son →</button>
      ) : (
        <div style={{ marginTop: '8px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={th}>Fecha</th>
                <th style={th}>Proveedor</th>
                <th style={th}>Factura</th>
                <th style={{ ...th, textAlign: 'right' }}>Base</th>
                <th style={th}>Tarifa</th>
                <th style={{ ...th, textAlign: 'right' }}>Retenido</th>
              </tr>
            </thead>
            <tbody>
              {datos.pendientes.map((l) => (
                <tr key={l.clave}>
                  <td style={td}>{l.fecha}</td>
                  <td style={td}>{l.proveedor}<div style={{ color: '#a15c07' }}>{l.negocio}</div></td>
                  <td style={td}>{l.numero || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{moneda(l.base)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{textoTarifa(l.tarifa_antes)} → <strong>{textoTarifa(l.tarifa_despues)}</strong></td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {l.valor_a_mano ? (
                      <>{moneda(l.valor_antes)}<div style={{ color: 'var(--danger)' }}>escrito a mano: revísalo</div></>
                    ) : (
                      <>{moneda(l.valor_antes)} → <strong>{moneda(l.valor_despues)}</strong></>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p style={{ color: 'var(--danger)', margin: '8px 0 0' }}>{error}</p>}
          <button type="button" onClick={corregir} disabled={corrigiendo} style={boton}>
            {corrigiendo ? 'Corrigiendo…' : `Corregir ${n === 1 ? '1 retención' : `${n} retenciones`}`}
          </button>
        </div>
      )}
    </div>
  );
}

const caja = { border: '1px solid #fedf89', background: '#fffaeb', color: '#93370d', borderRadius: '10px', padding: '12px 14px', margin: '0 0 16px', fontSize: '14px' };
const link = { border: 'none', background: 'none', padding: 0, marginTop: '8px', color: 'var(--teal-dark)', fontWeight: 600, cursor: 'pointer', fontSize: '14px' };
const th = { padding: '6px', borderBottom: '1px solid #fedf89', fontWeight: 600 };
const td = { padding: '6px', borderBottom: '1px solid #fdecc8', verticalAlign: 'top' };
const boton = { marginTop: '10px', padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, cursor: 'pointer' };
