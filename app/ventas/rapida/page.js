'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';
import { textoComprobante, enlaceWhatsapp } from '../../../lib/comprobanteWhatsapp';
import { textoCuponWhatsapp, lineaCuponComprobante } from '../../../lib/cuponTexto';

// VENTA RÁPIDA para el celular (octubre 2026) — pensada para vender en
// eventos como SOFA 2026 parado en el stand, con una mano:
//   - Modo "Evento": la venta NO entra al turno de caja de la tienda (el
//     vendedor de Kennedy no la ve en su turno). Modo "Tienda": entra al
//     turno abierto, como una venta normal.
//   - Cada producto sale de la bodega que se elija (Principal o Bodega
//     Distribuidor); al final del evento, en "Resumen del evento"
//     (/eventos) se ve qué salió de cada una.
//   - Al terminar, botón para mandar el comprobante por WhatsApp.
//   - Si se cae el internet, la venta queda guardada en el celular y se
//     envía sola cuando vuelve (sin duplicarse: cada venta lleva un código
//     único, id_local).
// El modo, el evento, la bodega por defecto y el vendedor se recuerdan en
// este celular.

const MEDIOS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'];
const K = {
  modo: 'ventaRapida.modo',
  evento: 'ventaRapida.evento',
  bodega: 'ventaRapida.bodega',
  vendedor: 'ventaRapida.vendedor',
  pendientes: 'ventaRapida.pendientes',
  productos: 'ventaRapida.productos',
  empresa: 'ventaRapida.empresa',
};

function leer(k, def) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : JSON.parse(v);
  } catch {
    return def;
  }
}
function guardar(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // sin memoria local (navegación privada): sigue funcionando sin recordar
  }
}
function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}
function soloDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}
function quitarTildes(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function nuevoIdLocal() {
  const r = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `rapida-${r}`;
}

export default function VentaRapidaPage() {
  const [listo, setListo] = useState(false);
  const [modo, setModo] = useState('evento');
  const [evento, setEvento] = useState('SOFA 2026');
  const [editandoEvento, setEditandoEvento] = useState(false);
  const [bodegaDefecto, setBodegaDefecto] = useState('Principal');
  const [vendedorId, setVendedorId] = useState('');

  const [productos, setProductos] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [empresa, setEmpresa] = useState({});
  const [turnoAbierto, setTurnoAbierto] = useState(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');

  const [buscar, setBuscar] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [cobrando, setCobrando] = useState(false);
  const [medio, setMedio] = useState('Efectivo');
  const [combinado, setCombinado] = useState(false);
  const [montos, setMontos] = useState({});
  const [recibe, setRecibe] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTel, setClienteTel] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorVenta, setErrorVenta] = useState('');
  const [hecha, setHecha] = useState(null);
  // Cupones (octubre 2026): el de la venta (va en el comprobante) y el
  // de "Dar cupón" (a quien no compra).
  const [cuponVenta, setCuponVenta] = useState(null);
  const [darCupon, setDarCupon] = useState(false);
  const [dcTel, setDcTel] = useState('');
  const [dcNombre, setDcNombre] = useState('');
  const [dcCupon, setDcCupon] = useState(null);
  const [dcError, setDcError] = useState('');
  const [dcCargando, setDcCargando] = useState(false);

  const [pendientes, setPendientes] = useState([]);
  const enviando = useRef(false);
  const buscador = useRef(null);

  // ---- Preferencias guardadas en este celular
  useEffect(() => {
    setModo(leer(K.modo, 'evento'));
    setEvento(leer(K.evento, 'SOFA 2026'));
    setBodegaDefecto(leer(K.bodega, 'Principal'));
    setVendedorId(leer(K.vendedor, ''));
    setPendientes(leer(K.pendientes, []));
    setEmpresa(leer(K.empresa, {}));
    const cache = leer(K.productos, null);
    if (cache?.productos) setProductos(cache.productos);
    if (cache?.bodegas) setBodegas(cache.bodegas);
    setListo(true);
  }, []);
  useEffect(() => { if (listo) guardar(K.modo, modo); }, [modo, listo]);
  useEffect(() => { if (listo) guardar(K.evento, evento); }, [evento, listo]);
  useEffect(() => { if (listo) guardar(K.bodega, bodegaDefecto); }, [bodegaDefecto, listo]);
  useEffect(() => { if (listo) guardar(K.vendedor, vendedorId); }, [vendedorId, listo]);

  // ---- Datos del servidor
  const cargar = useCallback(async () => {
    try {
      const [rp, rb, rv, rt, re] = await Promise.all([
        fetch('/api/productos?para=venta').then((r) => r.json()),
        fetch('/api/bodegas').then((r) => r.json()),
        fetch('/api/vendedores').then((r) => r.json()),
        fetch('/api/turnos').then((r) => r.json()),
        fetch('/api/configuracion/datos-empresa').then((r) => r.json()).catch(() => ({})),
      ]);
      if (rp.ok) setProductos(rp.productos);
      const bods = rb.ok ? rb.bodegas.filter((b) => b.nombre !== 'Garantías con Proveedor') : [];
      if (rb.ok) setBodegas(bods);
      if (rv.ok) setVendedores(rv.vendedores);
      if (rt.ok) setTurnoAbierto(rt.turno);
      if (re?.ok) {
        const e = { nit: re.nit || '', telefono: re.telefono || '' };
        setEmpresa(e);
        guardar(K.empresa, e);
      }
      if (rp.ok) {
        // Copia liviana para poder seguir vendiendo si se cae el internet.
        guardar(K.productos, {
          bodegas: bods,
          productos: rp.productos.map((p) => ({
            id: p.id, referencia: p.referencia, nombre: p.nombre, precio_venta: p.precio_venta, imagen_key: p.imagen_key,
            es_inventariable: p.es_inventariable, stock_principal: p.stock_principal, stock_distribuidor: p.stock_distribuidor,
          })),
        });
      }
      setSinConexion(false);
      setErrorCarga(rp.ok ? '' : rp.error || 'No se pudieron cargar los productos');
    } catch {
      setSinConexion(true);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const idBodega = useCallback(
    (nombre) => bodegas.find((b) => b.nombre === nombre)?.id || null,
    [bodegas]
  );
  const stockDe = (p, nombreBodega) =>
    Number(nombreBodega === 'Bodega Distribuidor' ? p.stock_distribuidor : p.stock_principal) || 0;

  // ---- Buscar
  const resultados = useMemo(() => {
    const t = quitarTildes(buscar.trim());
    if (!t) return [];
    const palabras = t.split(/\s+/);
    return productos
      .filter((p) => {
        const texto = quitarTildes(`${p.nombre} ${p.referencia || ''}`);
        return palabras.every((w) => texto.includes(w));
      })
      .slice(0, 30);
  }, [buscar, productos]);

  const enCarrito = (productoId, bodega) =>
    carrito.filter((l) => l.producto_id === productoId && l.bodega === bodega).reduce((a, l) => a + l.cantidad, 0);

  function agregar(p) {
    const inventariable = p.es_inventariable !== false;
    const otra = bodegaDefecto === 'Principal' ? 'Bodega Distribuidor' : 'Principal';
    let bodega = bodegaDefecto;
    if (inventariable && stockDe(p, bodega) - enCarrito(p.id, bodega) <= 0 && stockDe(p, otra) - enCarrito(p.id, otra) > 0) bodega = otra;
    if (inventariable && stockDe(p, bodega) - enCarrito(p.id, bodega) <= 0) return;
    setCarrito((c) => {
      const i = c.findIndex((l) => l.producto_id === p.id && l.bodega === bodega);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...c, { key: `${p.id}-${Date.now()}`, producto_id: p.id, nombre: p.nombre, referencia: p.referencia, precioLista: Number(p.precio_venta) || 0, precio: Number(p.precio_venta) || 0, cantidad: 1, bodega, inventariable, producto: p }];
    });
    setBuscar('');
    buscador.current?.blur();
  }

  function cambiarCantidad(key, delta) {
    setCarrito((c) =>
      c
        .map((l) => {
          if (l.key !== key) return l;
          const nueva = l.cantidad + delta;
          if (l.inventariable && delta > 0 && nueva > stockDe(l.producto, l.bodega) - (enCarrito(l.producto_id, l.bodega) - l.cantidad)) return l;
          return { ...l, cantidad: nueva };
        })
        .filter((l) => l.cantidad > 0)
    );
  }
  function cambiarBodega(key, bodega) {
    setCarrito((c) => c.map((l) => (l.key === key ? { ...l, bodega } : l)));
  }
  function cambiarPrecio(key, valor) {
    setCarrito((c) => c.map((l) => (l.key === key ? { ...l, precio: Number(soloDigitos(valor)) || 0 } : l)));
  }

  const total = carrito.reduce((a, l) => a + l.precio * l.cantidad, 0);
  const unidades = carrito.reduce((a, l) => a + l.cantidad, 0);
  const sinStock = carrito.filter((l) => l.inventariable && enCarrito(l.producto_id, l.bodega) > stockDe(l.producto, l.bodega));
  const sumaCombinado = MEDIOS.reduce((a, m) => a + (Number(montos[m]) || 0), 0);
  const cambio = medio === 'Efectivo' && !combinado && Number(recibe) > 0 ? Number(recibe) - total : null;

  // ---- Ventas pendientes (sin internet)
  const enviarPendientes = useCallback(async () => {
    if (enviando.current) return;
    const lista = leer(K.pendientes, []);
    if (!lista.length) return;
    enviando.current = true;
    let cambio2 = false;
    for (const p of lista) {
      if (p.error) continue;
      try {
        const r = await fetch('/api/ventas/rapida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.payload) });
        const d = await r.json().catch(() => ({}));
        if (d.ok) {
          p.enviada = true;
          p.ventaId = d.ventaId;
          cambio2 = true;
        } else if (r.status >= 400 && r.status < 500) {
          p.error = d.error || 'El servidor rechazó la venta';
          cambio2 = true;
        }
      } catch {
        break; // sigue sin internet: se intenta después
      }
    }
    const quedan = lista.filter((p) => !p.enviada);
    guardar(K.pendientes, quedan);
    setPendientes(quedan);
    enviando.current = false;
    if (cambio2) cargar();
  }, [cargar]);

  useEffect(() => {
    enviarPendientes();
    const t = setInterval(enviarPendientes, 20000);
    window.addEventListener('online', enviarPendientes);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', enviarPendientes);
    };
  }, [enviarPendientes]);

  function descartarPendiente(idLocal) {
    if (!window.confirm('¿Descartar esta venta? No se guardará en el sistema.')) return;
    const quedan = leer(K.pendientes, []).filter((p) => p.payload.id_local !== idLocal);
    guardar(K.pendientes, quedan);
    setPendientes(quedan);
  }

  // ---- Cobrar
  function abrirCobro() {
    setErrorVenta('');
    setCombinado(false);
    setMontos({});
    setRecibe('');
    setCobrando(true);
  }

  async function confirmarVenta() {
    setErrorVenta('');
    if (modo === 'evento' && !evento.trim()) return setErrorVenta('Escribe el nombre del evento');
    if (modo === 'tienda' && !turnoAbierto && !sinConexion) return setErrorVenta('No hay turno abierto en la tienda. Usa el modo Evento o abre el turno en Vender.');
    if (sinStock.length) return setErrorVenta(`No alcanza el stock de "${sinStock[0].nombre}" en ${sinStock[0].bodega}`);
    if (combinado && Math.abs(sumaCombinado - total) > 1) return setErrorVenta(`Los pagos suman ${moneda(sumaCombinado)} y el total es ${moneda(total)}`);
    const pagos = combinado
      ? MEDIOS.filter((m) => Number(montos[m]) > 0).map((m) => ({ medio_pago: m, monto: Number(montos[m]) }))
      : [{ medio_pago: medio, monto: total }];
    const payload = {
      modo,
      evento: modo === 'evento' ? evento.trim() : null,
      items: carrito.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, precio_unitario: l.precio, bodega_id: idBodega(l.bodega) })),
      ...(combinado ? { pagos } : { medio_pago: medio }),
      vendedor_id: vendedorId ? Number(vendedorId) : null,
      cliente_nombre: clienteNombre.trim(),
      cliente_telefono: clienteTel,
      id_local: nuevoIdLocal(),
    };
    const ahora = new Date().toISOString();
    if (payload.items.some((i) => !i.bodega_id)) return setErrorVenta('No se encontraron las bodegas. Recarga la página con internet.');

    const resumen = {
      fecha: ahora,
      evento: payload.evento,
      lineas: carrito.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, bodega: l.bodega })),
      total,
      pagos,
      clienteNombre: clienteNombre.trim(),
      clienteTel,
      cambio,
    };

    setGuardando(true);
    try {
      const r = await fetch('/api/ventas/rapida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) {
        setErrorVenta(d.error || 'No se pudo guardar la venta');
        return;
      }
      descontarLocal();
      setHecha({ ...resumen, numero: d.ventaId });
      if (modo === 'evento') crearCuponDeVenta(clienteTel, clienteNombre.trim(), d.ventaId);
      cargar();
    } catch {
      // Sin internet: se guarda en el celular y se envía sola después.
      // fecha_offline: el momento real de la venta (no el de cuando por
      // fin se pueda enviar).
      const lista = [...leer(K.pendientes, []), { payload: { ...payload, fecha_offline: ahora }, resumen }];
      guardar(K.pendientes, lista);
      setPendientes(lista);
      descontarLocal();
      setHecha({ ...resumen, numero: null, pendiente: true });
      setSinConexion(true);
    } finally {
      setGuardando(false);
    }
  }

  // Cupón de regreso para quien compra en el evento: va en el comprobante.
  async function pedirCupon(datos) {
    const r = await fetch('/api/cupones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    return r.json().catch(() => ({}));
  }
  async function crearCuponDeVenta(tel, nombre, ventaId) {
    try {
      let d = await pedirCupon({ telefono: tel, nombre, venta_id: ventaId });
      // Si el celular quedó mal escrito, igual se entrega el cupón (sin celular).
      if (!d.ok && tel) d = await pedirCupon({ nombre, venta_id: ventaId });
      if (d.ok) setCuponVenta(d.cupon);
    } catch {
      // sin internet o sin la migración: el comprobante sale sin cupón
    }
  }

  async function entregarCupon() {
    setDcError('');
    const digitos = dcTel.replace(/\D/g, '');
    if (digitos && !/^(57)?3\d{9}$/.test(digitos)) return setDcError('El celular debe tener 10 dígitos y empezar por 3');
    setDcCargando(true);
    try {
      const d = await pedirCupon({ telefono: digitos, nombre: dcNombre.trim() });
      if (!d.ok) return setDcError(d.error || 'No se pudo crear el cupón');
      setDcCupon({ ...d.cupon, _existente: Boolean(d.existente) });
    } catch {
      setDcError('Sin internet: el cupón necesita conexión para crearse.');
    } finally {
      setDcCargando(false);
    }
  }
  function cerrarDarCupon() {
    setDarCupon(false);
    setDcTel('');
    setDcNombre('');
    setDcCupon(null);
    setDcError('');
  }

  // Descuenta en pantalla el stock vendido (la próxima carga trae el real).
  function descontarLocal() {
    setProductos((ps) =>
      ps.map((p) => {
        const ls = carrito.filter((l) => l.producto_id === p.id);
        if (!ls.length) return p;
        const dp = ls.filter((l) => l.bodega === 'Principal').reduce((a, l) => a + l.cantidad, 0);
        const dd = ls.filter((l) => l.bodega === 'Bodega Distribuidor').reduce((a, l) => a + l.cantidad, 0);
        return { ...p, stock_principal: Number(p.stock_principal) - dp, stock_distribuidor: Number(p.stock_distribuidor) - dd };
      })
    );
  }

  function nuevaVenta() {
    setCarrito([]);
    setHecha(null);
    setCuponVenta(null);
    setCobrando(false);
    setClienteNombre('');
    setClienteTel('');
    setTimeout(() => buscador.current?.focus(), 50);
  }

  const textoWhatsapp = hecha ? textoComprobante(hecha, empresa, cuponVenta ? lineaCuponComprobante(cuponVenta) : '') : '';
  const nombreCorto = (b) => (b === 'Bodega Distribuidor' ? 'Distribuidor' : b);

  return (
    <Shell title="Venta rápida">
      <style>{`
        .vr { max-width: 640px; margin: 0 auto; padding-bottom: 110px; }
        /* El botón de pánico tapaba los precios: en esta pantalla no se muestra (sigue en Inicio). */
        .pos-boton-panico { display: none !important; }
        .vr-seg { display: flex; background: #eef1f4; border-radius: 12px; padding: 4px; gap: 4px; }
        .vr-seg button { flex: 1; border: none; background: transparent; padding: 10px 6px; border-radius: 9px; font-weight: 600; font-size: 14px; color: var(--text-secondary); }
        .vr-seg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
        .vr-buscar { position: sticky; top: 0; z-index: 20; background: var(--bg); padding: 8px 0; }
        .vr-buscar input { width: 100%; font-size: 17px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border); background: #fff; box-sizing: border-box; }
        .vr-res { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
        .vr-res button { display: flex; width: 100%; gap: 10px; align-items: center; text-align: left; border: none; border-bottom: 1px solid var(--border); background: #fff; padding: 10px 12px; font-size: 15px; }
        .vr-res button:disabled { opacity: .45; }
        .vr-foto { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: #f1f3f5; flex: none; }
        .vr-linea { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
        .vr-chip { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .vr-chip.on { background: var(--teal-light); border-color: var(--teal); color: var(--teal-dark); }
        .vr-chip:disabled { opacity: .4; }
        .vr-paso { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border); background: #fff; font-size: 20px; font-weight: 700; }
        .vr-barra { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; background: #fff; border-top: 1px solid var(--border); padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); box-shadow: 0 -4px 16px rgba(0,0,0,.06); }
        .vr-barra button { width: 100%; max-width: 640px; display: block; margin: 0 auto; }
        .vr-principal { border: none; background: var(--teal); color: #fff; font-size: 18px; font-weight: 700; padding: 15px; border-radius: 12px; width: 100%; }
        .vr-principal:disabled { opacity: .5; }
        .vr-sec { border: 1px solid var(--border); background: #fff; color: var(--text); font-size: 16px; font-weight: 600; padding: 13px; border-radius: 12px; width: 100%; }
        .vr-fondo { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
        .vr-hoja { background: #fff; width: 100%; max-width: 640px; max-height: 92dvh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
        .vr-medios { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .vr-medios button { padding: 14px 8px; border-radius: 12px; border: 1px solid var(--border); background: #fff; font-size: 15px; font-weight: 600; }
        .vr-medios button.on { border-color: var(--teal); background: var(--teal-light); color: var(--teal-dark); }
        .vr-input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid var(--border); font-size: 16px; background: #fff; }
        .vr-label { font-size: 13px; color: var(--text-secondary); display: block; margin: 12px 0 4px; }
        .vr-aviso { background: #fff4e5; border: 1px solid #f5c377; color: #8a5a00; border-radius: 10px; padding: 10px 12px; font-size: 14px; margin-bottom: 10px; }
        .vr-error { background: #fde8e8; border: 1px solid #f5b5b5; color: #a12020; border-radius: 10px; padding: 10px 12px; font-size: 14px; margin: 10px 0; }
      `}</style>

      <div className="vr">
        {/* Modo y evento */}
        <div className="vr-seg" style={{ marginBottom: '8px' }}>
          <button type="button" className={modo === 'evento' ? 'on' : ''} onClick={() => setModo('evento')}>🎪 Evento</button>
          <button type="button" className={modo === 'tienda' ? 'on' : ''} onClick={() => setModo('tienda')}>🏪 Tienda</button>
        </div>
        {modo === 'evento' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '14px' }}>
            {editandoEvento ? (
              <>
                <input className="vr-input" value={evento} onChange={(e) => setEvento(e.target.value)} placeholder="Nombre del evento" autoFocus />
                <button type="button" className="vr-chip on" onClick={() => setEditandoEvento(false)}>Listo</button>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>Evento:</span>
                <strong>{evento || '—'}</strong>
                <button type="button" className="vr-chip" onClick={() => setEditandoEvento(true)}>Cambiar</button>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button type="button" className="vr-chip on" onClick={() => setDarCupon(true)}>🎟️ Dar cupón</button>
                  <Link href={`/eventos?evento=${encodeURIComponent(evento)}`} className="vr-chip" style={{ textDecoration: 'none' }}>
                    📊
                  </Link>
                </span>
              </>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: turnoAbierto ? 'var(--text-secondary)' : 'var(--danger)', margin: '0 0 8px' }}>
            {turnoAbierto ? 'Las ventas entran al turno de caja abierto de la tienda.' : 'No hay turno abierto en la tienda: ábrelo en Vender o usa el modo Evento.'}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '13px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Sale por defecto de:</span>
          {['Principal', 'Bodega Distribuidor'].map((b) => (
            <button key={b} type="button" className={`vr-chip${bodegaDefecto === b ? ' on' : ''}`} onClick={() => setBodegaDefecto(b)}>
              {nombreCorto(b)}
            </button>
          ))}
        </div>

        {sinConexion && <div className="vr-aviso">Sin internet: puedes seguir vendiendo; las ventas se guardan en este celular y se envían solas cuando vuelva la conexión.</div>}
        {errorCarga && <div className="vr-error">{errorCarga}</div>}
        {pendientes.length > 0 && (
          <div className="vr-aviso">
            <strong>{pendientes.filter((p) => !p.error).length} venta(s) por enviar</strong>
            {pendientes.some((p) => !p.error) && <span> — se envían solas al volver el internet.</span>}
            {pendientes.filter((p) => p.error).map((p) => (
              <div key={p.payload.id_local} style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f5c377' }}>
                <div>⚠️ Venta de {moneda(p.resumen.total)} ({p.resumen.lineas.map((l) => `${l.cantidad}× ${l.nombre}`).join(', ')}) no se pudo guardar: {p.error}</div>
                <button type="button" className="vr-chip" style={{ marginTop: '6px' }} onClick={() => descartarPendiente(p.payload.id_local)}>Descartar</button>
              </div>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="vr-buscar">
          <input
            ref={buscador}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="🔍 Buscar producto o referencia"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        {buscar.trim() && (
          <div className="vr-res">
            {resultados.length === 0 && <div style={{ padding: '14px', color: 'var(--text-secondary)' }}>No se encontró nada con “{buscar}”.</div>}
            {resultados.map((p) => {
              const sp = stockDe(p, 'Principal');
              const sd = stockDe(p, 'Bodega Distribuidor');
              const agotado = p.es_inventariable !== false && sp - enCarrito(p.id, 'Principal') <= 0 && sd - enCarrito(p.id, 'Bodega Distribuidor') <= 0;
              return (
                <button key={p.id} type="button" onClick={() => agregar(p)} disabled={agotado}>
                  {p.imagen_key ? <img className="vr-foto" src={`/api/imagenes/${p.imagen_key}`} alt="" loading="lazy" /> : <span className="vr-foto" />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {p.referencia ? `Ref ${p.referencia} · ` : ''}
                      {p.es_inventariable === false ? 'Servicio' : agotado ? 'Agotado' : `Principal ${sp} · Distribuidor ${sd}`}
                    </span>
                  </span>
                  <strong style={{ flex: 'none' }}>{moneda(p.precio_venta)}</strong>
                </button>
              );
            })}
          </div>
        )}

        {/* Carrito */}
        {carrito.length === 0 && !buscar.trim() && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 12px' }}>
            Busca un producto para empezar la venta.
            <div style={{ marginTop: '14px' }}>
              <Link href="/eventos" style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>Ver ventas de eventos</Link>
            </div>
          </div>
        )}
        {carrito.map((l) => {
          const falta = l.inventariable && enCarrito(l.producto_id, l.bodega) > stockDe(l.producto, l.bodega);
          return (
            <div key={l.key} className="vr-linea" style={falta ? { borderColor: 'var(--danger)' } : undefined}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{l.nombre}</div>
                  {l.referencia && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ref {l.referencia}</div>}
                </div>
                <button type="button" onClick={() => cambiarCantidad(l.key, -l.cantidad)} aria-label="Quitar" style={{ border: 'none', background: 'none', fontSize: '20px', color: 'var(--text-secondary)', padding: '0 4px' }}>×</button>
              </div>
              {l.inventariable && (
                <div style={{ display: 'flex', gap: '6px', margin: '8px 0', flexWrap: 'wrap' }}>
                  {['Principal', 'Bodega Distribuidor'].map((b) => {
                    const hay = stockDe(l.producto, b);
                    return (
                      <button key={b} type="button" className={`vr-chip${l.bodega === b ? ' on' : ''}`} disabled={hay <= 0 && l.bodega !== b} onClick={() => cambiarBodega(l.key, b)}>
                        {nombreCorto(b)} ({hay})
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" className="vr-paso" onClick={() => cambiarCantidad(l.key, -1)} aria-label="Menos">−</button>
                <span style={{ minWidth: '28px', textAlign: 'center', fontWeight: 700, fontSize: '17px' }}>{l.cantidad}</span>
                <button type="button" className="vr-paso" onClick={() => cambiarCantidad(l.key, 1)} aria-label="Más">+</button>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <input
                    inputMode="numeric"
                    value={l.precio ? l.precio.toLocaleString('es-CO') : ''}
                    onChange={(e) => cambiarPrecio(l.key, e.target.value)}
                    aria-label="Precio unitario"
                    style={{ width: '120px', textAlign: 'right', fontSize: '16px', fontWeight: 600, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                  {l.precio < l.precioLista && (
                    <div style={{ fontSize: '12px', color: 'var(--teal-dark)' }}>
                      Antes {moneda(l.precioLista)} · −{Math.round((1 - l.precio / l.precioLista) * 100)}%
                    </div>
                  )}
                </div>
              </div>
              {falta && <div style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '6px' }}>No alcanza el stock en {l.bodega}.</div>}
            </div>
          );
        })}
        {carrito.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 4px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            <span>{unidades} unidad(es)</span>
            <button type="button" onClick={() => window.confirm('¿Vaciar la venta?') && setCarrito([])} style={{ border: 'none', background: 'none', color: 'var(--danger)', fontWeight: 600 }}>Vaciar</button>
          </div>
        )}
      </div>

      {carrito.length > 0 && !cobrando && !hecha && (
        <div className="vr-barra">
          <button type="button" className="vr-principal" onClick={abrirCobro} disabled={sinStock.length > 0}>
            Cobrar {moneda(total)}
          </button>
        </div>
      )}

      {/* Hoja de cobro */}
      {cobrando && !hecha && (
        <div className="vr-fondo" onClick={(e) => e.target === e.currentTarget && !guardando && setCobrando(false)}>
          <div className="vr-hoja">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{modo === 'evento' ? evento : 'Tienda'} · {unidades} und</span>
              <button type="button" onClick={() => setCobrando(false)} disabled={guardando} style={{ border: 'none', background: 'none', fontSize: '15px', color: 'var(--text-secondary)' }}>Volver</button>
            </div>
            <div style={{ fontSize: '34px', fontWeight: 800, margin: '4px 0 12px' }}>{moneda(total)}</div>

            {!combinado ? (
              <>
                <div className="vr-medios">
                  {MEDIOS.map((m) => (
                    <button key={m} type="button" className={medio === m ? 'on' : ''} onClick={() => setMedio(m)}>{m}</button>
                  ))}
                </div>
                {medio === 'Efectivo' && (
                  <>
                    <label className="vr-label">¿Con cuánto paga? (opcional)</label>
                    <input className="vr-input" inputMode="numeric" value={recibe ? Number(recibe).toLocaleString('es-CO') : ''} onChange={(e) => setRecibe(soloDigitos(e.target.value))} placeholder="$0" />
                    {cambio !== null && (
                      <div style={{ marginTop: '6px', fontWeight: 700, color: cambio < 0 ? 'var(--danger)' : 'var(--teal-dark)' }}>
                        {cambio < 0 ? `Faltan ${moneda(-cambio)}` : `Cambio: ${moneda(cambio)}`}
                      </div>
                    )}
                  </>
                )}
                <button type="button" onClick={() => setCombinado(true)} style={{ border: 'none', background: 'none', color: 'var(--teal-dark)', fontWeight: 600, padding: '12px 0 0' }}>
                  Pagar con dos medios (ej. parte en efectivo)
                </button>
              </>
            ) : (
              <>
                {MEDIOS.map((m) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ width: '120px', fontWeight: 600 }}>{m}</span>
                    <input className="vr-input" inputMode="numeric" value={montos[m] ? Number(montos[m]).toLocaleString('es-CO') : ''} onChange={(e) => setMontos({ ...montos, [m]: soloDigitos(e.target.value) })} placeholder="$0" />
                  </div>
                ))}
                <div style={{ fontSize: '14px', color: Math.abs(sumaCombinado - total) > 1 ? 'var(--danger)' : 'var(--teal-dark)', fontWeight: 600 }}>
                  {Math.abs(sumaCombinado - total) > 1 ? `Faltan ${moneda(total - sumaCombinado)}` : 'Los pagos cuadran con el total'}
                </div>
                <button type="button" onClick={() => setCombinado(false)} style={{ border: 'none', background: 'none', color: 'var(--teal-dark)', fontWeight: 600, padding: '12px 0 0' }}>
                  Un solo medio de pago
                </button>
              </>
            )}

            <label className="vr-label">Cliente (opcional, para el comprobante)</label>
            <input className="vr-input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre" autoComplete="off" />
            <input className="vr-input" style={{ marginTop: '8px' }} type="tel" inputMode="tel" value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} placeholder="Celular / WhatsApp" autoComplete="off" />

            <label className="vr-label">Vendedor</label>
            <select className="vr-input" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Sin vendedor</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>

            {errorVenta && <div className="vr-error">{errorVenta}</div>}
            <button type="button" className="vr-principal" style={{ marginTop: '16px' }} onClick={confirmarVenta} disabled={guardando}>
              {guardando ? 'Guardando...' : `Confirmar venta · ${moneda(total)}`}
            </button>
          </div>
        </div>
      )}

      {/* Venta hecha */}
      {hecha && (
        <div className="vr-fondo">
          <div className="vr-hoja" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '46px' }}>{hecha.pendiente ? '📶' : '✅'}</div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{hecha.pendiente ? 'Venta guardada en el celular' : `Venta #${hecha.numero}`}</div>
            <div style={{ fontSize: '28px', fontWeight: 800, margin: '6px 0' }}>{moneda(hecha.total)}</div>
            {hecha.cambio > 0 && <div style={{ fontWeight: 700, color: 'var(--teal-dark)' }}>Cambio: {moneda(hecha.cambio)}</div>}
            {hecha.pendiente && (
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No hay internet. Se enviará sola al sistema cuando vuelva la conexión.</p>
            )}
            <a
              href={enlaceWhatsapp(hecha.clienteTel, textoWhatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="vr-principal"
              style={{ display: 'block', textDecoration: 'none', background: '#25d366', marginTop: '14px' }}
            >
              Enviar comprobante por WhatsApp
            </a>
            {!hecha.clienteTel && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>Sin número: WhatsApp te deja elegir el contacto.</p>}
            {cuponVenta && (
              <p style={{ fontSize: '13px', color: 'var(--teal-dark)', margin: '8px 0 0', fontWeight: 600 }}>
                🎟️ El comprobante incluye su cupón de regreso: {cuponVenta.codigo}
              </p>
            )}
            <button type="button" className="vr-sec" style={{ marginTop: '10px' }} onClick={nuevaVenta}>Nueva venta</button>
          </div>
        </div>
      )}
      {/* Dar cupón (a quien no compra) */}
      {darCupon && (
        <div className="vr-fondo" onClick={(e) => e.target === e.currentTarget && cerrarDarCupon()}>
          <div className="vr-hoja">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '18px' }}>🎟️ Dar cupón</strong>
              <button type="button" onClick={cerrarDarCupon} style={{ border: 'none', background: 'none', fontSize: '15px', color: 'var(--text-secondary)' }}>Cerrar</button>
            </div>
            {!dcCupon ? (
              <>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                  Se crea un código único y se abre WhatsApp con el mensaje listo: descuento en la página, bono y doble garantía en servicio técnico, y el video de cómo trabajamos.
                </p>
                <label className="vr-label">Celular / WhatsApp</label>
                <input className="vr-input" type="tel" inputMode="tel" value={dcTel} onChange={(e) => setDcTel(e.target.value)} placeholder="300 123 4567" autoFocus />
                <label className="vr-label">Nombre (opcional)</label>
                <input className="vr-input" value={dcNombre} onChange={(e) => setDcNombre(e.target.value)} placeholder="Nombre" autoComplete="off" />
                {dcError && <div className="vr-error">{dcError}</div>}
                <button type="button" className="vr-principal" style={{ marginTop: '14px' }} onClick={entregarCupon} disabled={dcCargando}>
                  {dcCargando ? 'Creando...' : 'Crear cupón'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>Código</div>
                <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '1px' }}>{dcCupon.codigo}</div>
                {dcCupon._existente && (
                  <div style={{ fontSize: '13px', color: '#8a5a00', marginTop: '4px' }}>Este celular ya tenía cupón: es el mismo (uno por persona).</div>
                )}
                <a
                  href={enlaceWhatsapp(dcTel, textoCuponWhatsapp(dcCupon))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vr-principal"
                  style={{ display: 'block', textDecoration: 'none', background: '#25d366', marginTop: '14px' }}
                >
                  Enviar cupón por WhatsApp
                </a>
                <button type="button" className="vr-sec" style={{ marginTop: '10px' }} onClick={() => { setDcCupon(null); setDcTel(''); setDcNombre(''); }}>
                  Otro cupón
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
