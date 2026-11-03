'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { enlaceWhatsapp } from '../lib/comprobanteWhatsapp';
import { PLANTILLAS_RECORDATORIO, textoRecordatorio, diasParaVencer } from '../lib/cuponTexto';

// RECORDATORIOS (nov 2026): escribirle por WhatsApp, uno por uno, a quien
// recibió un cupón y no lo ha usado. Cada botón abre WhatsApp con el mensaje
// listo (nombre, código, descuento, fecha y el enlace que deja el descuento
// en el carrito) y deja anotado que ya se le escribió, para no repetir.
// "Pidió no recibir" lo saca de la lista (si responde NO).
// La plantilla se puede editar; queda guardada en este navegador.

function guardada(campana) {
  try {
    return JSON.parse(localStorage.getItem(`recordatorio:${campana}`) || 'null');
  } catch {
    return null;
  }
}

function fechaCorta(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
}

export default function RecordatoriosCupones({ campana }) {
  const [cupones, setCupones] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('pendientes');
  const [tipo, setTipo] = useState('activo');
  const [plantilla, setPlantilla] = useState(PLANTILLAS_RECORDATORIO.activo.texto);
  const [editando, setEditando] = useState(false);
  const [ultimo, setUltimo] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const d = await (await fetch(`/api/cupones/recordatorios?campana=${encodeURIComponent(campana)}`)).json();
      if (!d.ok) return setError(d.error || 'No se pudo cargar');
      setCupones(d.cupones);
      // Si a la mayoría les quedan 5 días o menos, se sugiere "Últimos días".
      const g = guardada(campana);
      const pocos = d.cupones.length && d.cupones.filter((c) => diasParaVencer(c) <= 5).length > d.cupones.length / 2;
      const t = g?.tipo || (pocos ? 'ultimos' : 'activo');
      setTipo(t);
      setPlantilla(g?.textos?.[t] || PLANTILLAS_RECORDATORIO[t].texto);
    } catch {
      setError('Error de conexión');
    }
  }, [campana]);
  useEffect(() => { cargar(); }, [cargar]);

  function recordar(nuevoTipo, texto) {
    try {
      const g = guardada(campana) || { textos: {} };
      g.tipo = nuevoTipo;
      if (texto !== undefined) g.textos = { ...(g.textos || {}), [nuevoTipo]: texto };
      localStorage.setItem(`recordatorio:${campana}`, JSON.stringify(g));
    } catch {
      /* sin almacenamiento */
    }
  }
  function elegirTipo(t) {
    setTipo(t);
    const g = guardada(campana);
    setPlantilla(g?.textos?.[t] || PLANTILLAS_RECORDATORIO[t].texto);
    recordar(t);
  }
  function editarPlantilla(texto) {
    setPlantilla(texto);
    recordar(tipo, texto);
  }
  function restaurar() {
    editarPlantilla(PLANTILLAS_RECORDATORIO[tipo].texto);
  }

  async function marcar(c, accion) {
    // Se actualiza en pantalla de una vez (WhatsApp ya se abrió).
    setCupones((cs) =>
      cs.map((x) =>
        x.codigo === c.codigo
          ? accion === 'enviado'
            ? { ...x, recordado_en: new Date().toISOString(), recordatorios: Number(x.recordatorios || 0) + 1 }
            : { ...x, no_contactar: accion === 'no_contactar' }
          : x
      )
    );
    if (accion === 'enviado') setUltimo(c.codigo);
    try {
      const d = await (await fetch('/api/cupones/recordatorios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: c.codigo, accion }) })).json();
      if (!d.ok) setError(d.error || 'No se pudo anotar');
    } catch {
      setError('No se pudo anotar (sin conexión). Revisa la lista antes de seguir.');
    }
  }

  const visibles = useMemo(() => {
    if (!cupones) return [];
    if (filtro === 'pendientes') return cupones.filter((c) => !c.no_contactar && !c.recordado_en);
    if (filtro === 'recordados') return cupones.filter((c) => !c.no_contactar && c.recordado_en);
    if (filtro === 'no') return cupones.filter((c) => c.no_contactar);
    return cupones;
  }, [cupones, filtro]);

  if (error && !cupones) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!cupones) return <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>;

  const total = cupones.filter((c) => !c.no_contactar).length;
  const hechos = cupones.filter((c) => !c.no_contactar && c.recordado_en).length;
  const ejemplo = visibles[0] || cupones[0];

  return (
    <div className="rc">
      <style>{`
        .rc-barra { height: 8px; background: #eef1f5; border-radius: 99px; overflow: hidden; margin: 6px 0 12px; }
        .rc-barra div { height: 100%; background: var(--teal); }
        .rc-fila { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid var(--border); }
        .rc-fila.ultimo { background: #f0fbf7; }
        .rc-wa { background: #25d366; color: #fff; border: none; border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .rc-wa.otra { background: #fff; color: #128c4a; border: 1px solid #25d366; }
        .rc-mini { border: none; background: none; color: var(--text-secondary); font-size: 12px; cursor: pointer; padding: 0; text-decoration: underline; }
        .rc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .rc-chips button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 5px 11px; font-size: 13px; cursor: pointer; }
        .rc-chips button.on { background: var(--teal); border-color: var(--teal); color: #fff; font-weight: 700; }
        .rc-previa { white-space: pre-wrap; background: #e7f8ee; border: 1px solid #b7e4c7; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.45; margin: 8px 0 0; font-family: inherit; }
      `}</style>

      {total === 0 ? (
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No hay cupones sin usar con celular en esta campaña (o ya vencieron).</p>
      ) : (
        <>
          <div style={{ fontSize: '14px' }}>
            <strong>{hechos}</strong> de <strong>{total}</strong> recordados · quedan {total - hechos}
          </div>
          <div className="rc-barra"><div style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} /></div>

          <div className="rc-chips" style={{ marginBottom: '8px' }}>
            {Object.entries(PLANTILLAS_RECORDATORIO).map(([k, p]) => (
              <button key={k} type="button" className={tipo === k ? 'on' : ''} onClick={() => elegirTipo(k)}>{p.titulo}</button>
            ))}
            <button type="button" onClick={() => setEditando((e) => !e)}>{editando ? 'Listo' : '✏️ Editar mensaje'}</button>
          </div>
          {editando ? (
            <>
              <textarea
                value={plantilla}
                onChange={(e) => editarPlantilla(e.target.value)}
                rows={9}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '14px', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Se reemplazan solos: {'{nombre} {codigo} {descuento} {condiciones} {servicio} {vence} {cuando} {enlace} {evento}'} ·{' '}
                <button type="button" className="rc-mini" onClick={restaurar}>volver al original</button>
              </div>
            </>
          ) : null}
          {ejemplo && (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>Así le llega a {ejemplo.cliente_nombre || ejemplo.codigo}:</div>
              <pre className="rc-previa">{textoRecordatorio(ejemplo, plantilla)}</pre>
            </>
          )}

          <div className="rc-chips" style={{ margin: '14px 0 4px' }}>
            {[
              ['pendientes', `Por escribir (${total - hechos})`],
              ['recordados', `Ya recordados (${hechos})`],
              ['no', `No contactar (${cupones.length - total})`],
            ].map(([k, t]) => (
              <button key={k} type="button" className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{t}</button>
            ))}
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}

          {visibles.map((c) => {
            const dias = diasParaVencer(c);
            return (
              <div key={c.codigo} className={`rc-fila${ultimo === c.codigo ? ' ultimo' : ''}`}>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.cliente_nombre || 'Sin nombre'} · {c.cliente_telefono}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {c.codigo} · vence {dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
                    {c.recordado_en ? ` · ✓ recordado ${fechaCorta(c.recordado_en)}${Number(c.recordatorios) > 1 ? ` (${c.recordatorios} veces)` : ''}` : ''}
                  </div>
                </div>
                {c.no_contactar ? (
                  <button type="button" className="rc-mini" onClick={() => marcar(c, 'contactar')}>Volver a la lista</button>
                ) : (
                  <>
                    <a
                      className={`rc-wa${c.recordado_en ? ' otra' : ''}`}
                      href={enlaceWhatsapp(c.cliente_telefono, textoRecordatorio(c, plantilla))}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => marcar(c, 'enviado')}
                    >
                      {c.recordado_en ? 'Enviar otra vez' : 'WhatsApp'}
                    </a>
                    <button type="button" className="rc-mini" onClick={() => { if (window.confirm(`¿${c.cliente_nombre || c.codigo} pidió no recibir más mensajes?`)) marcar(c, 'no_contactar'); }}>
                      Pidió no recibir
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {!visibles.length && <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{filtro === 'pendientes' ? '✅ Ya les escribiste a todos.' : 'Nadie en esta lista.'}</p>}
        </>
      )}
    </div>
  );
}
