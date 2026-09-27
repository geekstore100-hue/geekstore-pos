'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import ChequeoSemanal from '../../components/ChequeoSemanal';
import ArqueoCaja from '../../components/ArqueoCaja';
import {
  generarIdLocal,
  guardarVentaPendiente,
  actualizarVentaPendiente,
  listarVentasPendientes,
  eliminarVentaPendiente,
  guardarSnapshot,
  leerSnapshot,
} from '../../lib/offlineVentas';

// Si hay ventas hechas sin conexión todavía pendientes de enviar, se les
// resta su cantidad al stock que se muestra en pantalla — así, mientras
// sigue sin haber internet, no se puede seguir vendiendo algo que ya se
// vendió (sin conexión) hace un rato y que en el servidor todavía figura con
// el stock viejo. Apenas esa venta se sincroniza, se vuelve a pedir el stock
// real del servidor y este ajuste ya no hace falta para ella.
function aplicarAjustesPendientes(productos, pendientes) {
  if (!pendientes.length) return productos;
  const descuentos = new Map();
  for (const venta of pendientes) {
    for (const item of venta.items) {
      descuentos.set(item.producto_id, (descuentos.get(item.producto_id) || 0) + Number(item.cantidad));
    }
  }
  if (descuentos.size === 0) return productos;
  return productos.map((p) =>
    descuentos.has(p.id)
      ? { ...p, stock_principal: Math.max(0, Number(p.stock_principal) - descuentos.get(p.id)) }
      : p
  );
}

function crearPestana(id, nombre) {
  return {
    id,
    nombre,
    carrito: [],
    editandoId: null,
    medioPago: '',
    // Pago combinado: cuando está activo, en vez de un solo "medioPago" se
    // usan estas líneas (cada una con su propio medio y monto), por ejemplo
    // una parte en Efectivo y otra en Tarjeta.
    pagoCombinado: false,
    pagosCombinados: [
      { medio: 'Efectivo', monto: '' },
      { medio: 'Tarjeta', monto: '' },
    ],
    vendedorId: '',
    lista: 'principal',
  };
}

export default function VentasPage() {
  const [productosCrudos, setProductosCrudos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const buscadorRef = useRef(null);

  // Después de imprimir el ticket, el cursor vuelve solo al buscador (con
  // el texto anterior seleccionado), para poder escribir o escanear el
  // siguiente producto de una vez sin tener que hacer clic. No se hace si
  // la persona ya se pasó a escribir en otro campo, ni en celular/tablet
  // (ahí abriría el teclado en pantalla sin que nadie lo pidiera).
  function enfocarBuscador() {
    const el = buscadorRef.current;
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    const activo = document.activeElement;
    if (activo && activo !== el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activo.tagName)) return;
    el.focus();
    el.select();
  }
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  // --- Ventas sin conexión ---
  // ventasPendientes: ventas hechas sin internet, guardadas en este
  // computador (IndexedDB, ver lib/offlineVentas.js) esperando a poder
  // enviarse al servidor. enLinea sigue el estado real de la conexión.
  // sincronizando evita que se disparen varios intentos de sincronización al
  // mismo tiempo.
  const [ventasPendientes, setVentasPendientes] = useState([]);
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // El stock que se muestra ya descuenta lo vendido sin conexión que todavía
  // no se ha podido enviar (ver aplicarAjustesPendientes arriba).
  const productos = useMemo(
    () => aplicarAjustesPendientes(productosCrudos, ventasPendientes),
    [productosCrudos, ventasPendientes]
  );

  // Ventas en paralelo: cada "pestaña" es una venta independiente en curso
  // (su propio carrito, medio de pago, vendedor y lista de precios), para
  // poder dejar una venta pendiente y atender otra sin perder la primera.
  const idContador = useRef(2);
  const [pestanas, setPestanas] = useState(() => [crearPestana(1, 'Venta principal')]);
  const [pestanaActivaId, setPestanaActivaId] = useState(1);
  const activa = pestanas.find((p) => p.id === pestanaActivaId) || pestanas[0];

  // Guarda los datos de la última factura impresa (de cualquier pestaña) para
  // poder reimprimirla con un botón, sin tener que buscarla en Historial.
  const [ultimaVenta, setUltimaVenta] = useState(null);

  const [turno, setTurno] = useState(null);
  const [cargandoTurno, setCargandoTurno] = useState(true);
  const [mostrarAbrirTurno, setMostrarAbrirTurno] = useState(false);
  const [baseInicial, setBaseInicial] = useState('');
  const [guardandoTurno, setGuardandoTurno] = useState(false);
  const [errorTurno, setErrorTurno] = useState('');
  const [mostrarCerrarTurno, setMostrarCerrarTurno] = useState(false);
  const [resumenTurno, setResumenTurno] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [dineroReal, setDineroReal] = useState('');
  const [observacionesCierre, setObservacionesCierre] = useState('');
  const [cerrandoTurno, setCerrandoTurno] = useState(false);
  // Resumen que se muestra apenas se cierra el turno (total de ventas, por
  // medio de pago y cuadre de caja), con los números finales que devuelve
  // el servidor en el momento exacto del cierre.
  const [cierreTurno, setCierreTurno] = useState(null);

  // Si no hay internet (o el servidor no contesta), en vez de dejar la
  // pantalla sin productos ni vendedores, se usa la última copia guardada en
  // este computador (ver lib/offlineVentas.js). No es en tiempo real, pero
  // deja seguir vendiendo — mejor eso que no poder vender nada.
  async function cargarTodo() {
    try {
      const [rProd, rVend] = await Promise.all([fetch('/api/productos'), fetch('/api/vendedores')]);
      const dProd = await rProd.json();
      const dVend = await rVend.json();
      if (dProd.ok) {
        const lista = dProd.productos.filter((p) => p.activo);
        setProductosCrudos(lista);
        guardarSnapshot('productos', lista);
      }
      if (dVend.ok) {
        const lista = dVend.vendedores.filter((v) => v.activo);
        setVendedores(lista);
        guardarSnapshot('vendedores', lista);
      }
      setEnLinea(true);
    } catch (e) {
      setEnLinea(false);
      const [productosGuardados, vendedoresGuardados] = await Promise.all([
        leerSnapshot('productos'),
        leerSnapshot('vendedores'),
      ]);
      if (productosGuardados) setProductosCrudos(productosGuardados);
      if (vendedoresGuardados) setVendedores(vendedoresGuardados);
    }
  }

  async function cargarTurno() {
    setCargandoTurno(true);
    try {
      const res = await fetch('/api/turnos');
      const data = await res.json();
      if (data.ok) {
        setTurno(data.turno);
        guardarSnapshot('turno', data.turno);
      }
      setEnLinea(true);
    } catch (e) {
      setEnLinea(false);
      // Se confía en el último turno conocido: si estaba abierto antes de
      // quedarse sin internet, se deja seguir vendiendo con ese turno. Al
      // volver la conexión, cargarTurno() se vuelve a llamar y trae el dato
      // real del servidor.
      const turnoGuardado = await leerSnapshot('turno');
      if (turnoGuardado) setTurno(turnoGuardado);
    }
    setCargandoTurno(false);
  }

  async function cargarVentasPendientes() {
    try {
      const lista = await listarVentasPendientes();
      setVentasPendientes(lista);
      return lista;
    } catch (e) {
      return [];
    }
  }

  useEffect(() => {
    cargarTodo();
    cargarTurno();
    cargarVentasPendientes();

    function alVolverConexion() {
      setEnLinea(true);
      cargarTodo();
      cargarTurno();
      sincronizarVentasPendientes();
    }
    function alPerderConexion() {
      setEnLinea(false);
    }
    setEnLinea(navigator.onLine);
    window.addEventListener('online', alVolverConexion);
    window.addEventListener('offline', alPerderConexion);

    // Además de reaccionar al evento "online" (que no siempre dispara en
    // todos los navegadores/routers), se revisa cada 45 segundos si ya hay
    // ventas pendientes por mandar.
    const intervalo = setInterval(() => {
      sincronizarVentasPendientes();
    }, 45000);

    return () => {
      window.removeEventListener('online', alVolverConexion);
      window.removeEventListener('offline', alPerderConexion);
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manda al servidor, una por una y en orden, las ventas guardadas sin
  // conexión. Se detiene apenas una falla:
  // - Si falla por falta de conexión, no tiene sentido seguir intentando las
  //   demás en este momento (se reintentará solo, más adelante).
  // - Si el SERVIDOR la rechaza (por ejemplo ya no hay stock suficiente, o
  //   sí hay internet pero el turno se cerró mientras tanto), esa venta
  //   puntual se marca con el error para revisarla a mano — y se detiene ahí
  //   para no desordenar las ventas que quedan detrás de esa.
  async function sincronizarVentasPendientes() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const pendientes = await listarVentasPendientes();
      for (const venta of pendientes) {
        if (venta.error) continue; // ya se marcó para revisión manual, no se reintenta sola
        let res;
        try {
          res = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              medio_pago: venta.medio_pago,
              pagos: venta.pagos,
              vendedor_id: venta.vendedor_id,
              items: venta.items,
              fecha_offline: venta.creadoEnISO,
            }),
          });
        } catch (e) {
          setEnLinea(false);
          break; // sigue sin internet — se reintenta en el próximo ciclo
        }
        const data = await res.json();
        if (data.ok) {
          await eliminarVentaPendiente(venta.idLocal);
        } else {
          await actualizarVentaPendiente({ ...venta, error: data.error || 'El servidor rechazó la venta' });
          break;
        }
      }
    } finally {
      await cargarVentasPendientes();
      cargarTodo();
      setSincronizando(false);
    }
  }

  async function abrirTurno() {
    setErrorTurno('');
    setGuardandoTurno(true);
    const res = await fetch('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_inicial: baseInicial }),
    });
    const data = await res.json();
    setGuardandoTurno(false);
    if (data.ok) {
      setTurno(data.turno);
      setMostrarAbrirTurno(false);
      setBaseInicial('');
    } else {
      setErrorTurno(data.error || 'No se pudo abrir el turno');
    }
  }

  async function abrirModalCerrarTurno() {
    if (!turno) return;
    setErrorTurno('');
    setMostrarCerrarTurno(true);
    setCargandoResumen(true);
    setDineroReal('');
    setObservacionesCierre('');
    const res = await fetch(`/api/turnos/${turno.id}`);
    const data = await res.json();
    if (data.ok) {
      setResumenTurno(data.resumen);
      // Se deja precargado el dinero esperado: si al contar la caja coincide,
      // el usuario no tiene que escribir nada más; si no coincide, lo ajusta.
      setDineroReal(String(data.resumen.dineroEsperado));
    }
    setCargandoResumen(false);
  }

  async function confirmarCierreTurno() {
    if (dineroReal === '') {
      setErrorTurno('Ingresa el dinero real en caja.');
      return;
    }
    setErrorTurno('');
    setCerrandoTurno(true);
    const res = await fetch(`/api/turnos/${turno.id}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dinero_real_caja: dineroReal, observaciones: observacionesCierre }),
    });
    const data = await res.json();
    setCerrandoTurno(false);
    if (data.ok) {
      setCierreTurno({
        resumen: data.resumen || resumenTurno,
        dineroReal: Number(dineroReal),
        abiertoEn: data.turno?.abierto_en || turno?.abierto_en,
        cerradoEn: data.turno?.cerrado_en || new Date().toISOString(),
      });
      setMostrarCerrarTurno(false);
      setResumenTurno(null);
      setTurno(null);
    } else {
      setErrorTurno(data.error || 'No se pudo cerrar el turno');
    }
  }

  function actualizarPestana(id, cambios) {
    setPestanas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...(typeof cambios === 'function' ? cambios(p) : cambios) } : p))
    );
  }

  function agregarPestana() {
    const id = idContador.current++;
    setPestanas((prev) => [...prev, crearPestana(id, `Venta ${prev.length + 1}`)]);
    setPestanaActivaId(id);
    setError('');
    setMensaje('');
  }

  function cerrarPestana(id) {
    if (pestanas.length <= 1) return;
    const restante = pestanas.filter((p) => p.id !== id);
    setPestanas(restante);
    if (id === pestanaActivaId) {
      setPestanaActivaId(restante[restante.length - 1].id);
    }
  }

  // Antes esto se mostraba completo (los ~3000 productos, cada uno con su
  // foto) cada vez que se escribía o borraba una letra en el buscador —
  // React tenía que re-renderizar miles de tarjetas con imagen en cada
  // tecla, lo que se sentía pesadísimo justo al escribir un código. Ahora
  // se limita a los primeros LIMITE_RESULTADOS que calcen con la búsqueda
  // (o los más recientes si el buscador está vacío); en la práctica nadie
  // necesita ver 3000 tarjetas a la vez, y con 2-3 letras del código o
  // nombre ya se llega al producto buscado.
  const LIMITE_RESULTADOS = 60;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q));
  }, [busqueda, productos]);

  const filtradosVisibles = useMemo(() => filtrados.slice(0, LIMITE_RESULTADOS), [filtrados]);

  function stockPrincipalDe(producto_id) {
    const p = productos.find((x) => x.id === producto_id);
    return p ? Number(p.stock_principal) || 0 : 0;
  }

  function precioSegunLista(producto, listaElegida) {
    if (listaElegida === 'distribuidor') {
      const precioDistribuidor = Number(producto.precio_distribuidor);
      if (precioDistribuidor > 0) return precioDistribuidor;
    }
    return Number(producto.precio_venta) || 0;
  }

  function cambiarLista(nuevaLista) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      lista: nuevaLista,
      carrito: p.carrito.map((item) => {
        const producto = productos.find((x) => x.id === item.producto_id);
        if (!producto) return item;
        return { ...item, precio_unitario: precioSegunLista(producto, nuevaLista) };
      }),
    }));
  }

  function agregarAlCarrito(producto) {
    if (!turno) {
      setError('Debes abrir un turno para vender.');
      return;
    }
    const inventariable = producto.es_inventariable !== false;
    const disponible = Number(producto.stock_principal) || 0;
    if (inventariable && disponible <= 0) {
      setError('No hay existencias en la bodega Principal para este producto.');
      return;
    }
    setError('');
    actualizarPestana(activa.id, (p) => {
      const existente = p.carrito.find((i) => i.producto_id === producto.id);
      if (existente) {
        if (inventariable && existente.cantidad + 1 > disponible) return p;
        return {
          ...p,
          carrito: p.carrito.map((i) => (i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)),
        };
      }
      return {
        ...p,
        carrito: [
          ...p.carrito,
          {
            producto_id: producto.id,
            referencia: producto.referencia,
            nombre: producto.nombre,
            cantidad: 1,
            precio_unitario: precioSegunLista(producto, p.lista),
            descuento_porcentaje: 0,
          },
        ],
      };
    });
  }

  function cambiarCantidad(producto_id, delta) {
    const producto = productos.find((p) => p.id === producto_id);
    const inventariable = producto ? producto.es_inventariable !== false : true;
    const disponible = inventariable ? stockPrincipalDe(producto_id) : Infinity;
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito
        .map((i) => (i.producto_id === producto_id ? { ...i, cantidad: Math.min(i.cantidad + delta, disponible) } : i))
        .filter((i) => i.cantidad > 0),
    }));
  }

  function quitarDelCarrito(producto_id) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito.filter((i) => i.producto_id !== producto_id),
      editandoId: p.editandoId === producto_id ? null : p.editandoId,
    }));
  }

  function alternarEdicion(producto_id) {
    actualizarPestana(activa.id, (p) => ({ ...p, editandoId: p.editandoId === producto_id ? null : producto_id }));
  }

  function actualizarItem(producto_id, campo, valor) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito.map((i) => (i.producto_id === producto_id ? { ...i, [campo]: valor } : i)),
    }));
  }

  function subtotalItem(item) {
    const descuento = Number(item.descuento_porcentaje) || 0;
    return item.cantidad * Number(item.precio_unitario) * (1 - descuento / 100);
  }

  const total = activa.carrito.reduce((acc, i) => acc + subtotalItem(i), 0);

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  // --- Pago combinado (ej. parte en efectivo y parte con tarjeta) ---

  function activarPagoCombinado(activo) {
    actualizarPestana(activa.id, { pagoCombinado: activo, medioPago: '' });
  }

  function actualizarLineaPago(indice, campo, valor) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      pagosCombinados: p.pagosCombinados.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)),
    }));
  }

  function agregarLineaPago() {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      pagosCombinados: [...p.pagosCombinados, { medio: 'Transferencia', monto: '' }],
    }));
  }

  function quitarLineaPago(indice) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      pagosCombinados: p.pagosCombinados.filter((_, i) => i !== indice),
    }));
  }

  // Llena la última línea con lo que falte para completar el total, para no
  // tener que sacar la cuenta a mano.
  function completarRestoEn(indice) {
    actualizarPestana(activa.id, (p) => {
      const sumaOtras = p.pagosCombinados.reduce((acc, l, i) => (i === indice ? acc : acc + (Number(l.monto) || 0)), 0);
      const resto = Math.max(0, total - sumaOtras);
      return {
        ...p,
        pagosCombinados: p.pagosCombinados.map((l, i) => (i === indice ? { ...l, monto: String(resto) } : l)),
      };
    });
  }

  const sumaPagosCombinados = activa.pagosCombinados.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  const diferenciaPago = Math.round((total - sumaPagosCombinados) * 100) / 100;

  // Antes esto abría una ventana nueva del navegador (window.open) para
  // armar el ticket e imprimirlo ahí. El problema: si esa ventana se quedaba
  // abierta (por olvido, o porque el diálogo de impresión tapaba la ventana
  // principal), el programa parecía "congelarse" y con el tiempo se iban
  // acumulando ventanas sueltas. Ahora se arma el ticket en un <iframe>
  // invisible dentro de la misma pantalla: se manda a imprimir igual (sale
  // el mismo diálogo de impresión de Windows/Chrome), pero no se abre ninguna
  // ventana nueva que haya que acordarse de cerrar, y el iframe se borra
  // solo apenas termina.
  function imprimirTicket({ ventaId, items, totalVenta, pagos, vendedorNombre, listaUsada, fecha, sinConexion }) {
    const filasHtml = items
      .map((i) => {
        const desc = Number(i.descuento_porcentaje) || 0;
        const sub = i.cantidad * Number(i.precio_unitario) * (1 - desc / 100);
        return `
          <tr><td colspan="2" style="padding-top:6px;">${escaparHtml(i.nombre)}</td></tr>
          <tr><td colspan="2" class="ref">Ref. ${escaparHtml(i.referencia || '-')}</td></tr>
          <tr>
            <td>${i.cantidad} x ${moneda(i.precio_unitario)}${desc ? ` (-${desc}%)` : ''}</td>
            <td style="text-align:right;">${moneda(sub)}</td>
          </tr>`;
      })
      .join('');

    // Nota sobre calidad de impresión: el papel es de 80mm, pero en la
    // mayoría de impresoras térmicas el área que realmente imprime es un
    // poco más angosta (por eso se usa menos de 80mm de ancho de contenido)
    // — si se usa el ancho completo, el borde derecho queda fuera del área
    // imprimible y sale cortado. También se usa una fuente de palo
    // (sans-serif) en negrita en vez de una fuente con trazos finos tipo
    // máquina de escribir, porque en impresión térmica se ve más nítida y
    // menos "borrosa".
    //
    // Antes el body iba centrado (margin: 0 auto) con 72mm de ancho. Eso
    // se ve perfecto en "Guardar como PDF" (el navegador sí centra bien
    // dentro de la página), pero muchas impresoras térmicas NO centran:
    // el cabezal imprime siempre pegado al borde izquierdo del área
    // imprimible, así que el "margen" que el centrado dejaba a la derecha
    // terminaba empujando el contenido justo al borde y se cortaba —
    // mientras a la izquierda solo quedaba papel en blanco de más, que no
    // se nota. Por eso ahora el contenido va pegado a la izquierda (sin
    // centrar) y más angosto (68mm en vez de 72mm), dejando un colchón
    // amplio de sobra a la derecha para que ninguna impresora lo corte.
    // Si de todas formas algún ticket sale cortado o borroso, revisa en
    // el cuadro de impresión de Windows/Chrome que la Escala esté en 100%
    // (no "Ajustar al papel"), los márgenes en "Ninguno", y el tamaño de
    // papel configurado como 80mm / Recibo, no Carta/A4.
    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${ventaId}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            width: 68mm;
            margin: 0;
            padding: 4px 0 10px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 600;
            font-size: 13px;
            color: #000;
          }
          h1 { font-size: 17px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
          p { margin: 3px 0; }
          .centro { text-align: center; }
          .ref { font-size: 11px; font-weight: 400; color: #333; padding-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; }
          hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
          .total-fila td { font-size: 15px; font-weight: 700; padding-top: 6px; }
        </style>
      </head>
      <body>
        <h1>GEEK STORE</h1>
        ${
          sinConexion
            ? '<p class="centro" style="border:1px solid #000;padding:3px;">*** SIN CONEXIÓN - PENDIENTE DE SINCRONIZAR ***</p>'
            : ''
        }
        <p class="centro">Venta #${ventaId}</p>
        <p class="centro">${fecha}</p>
        <hr />
        <table>${filasHtml}</table>
        <hr />
        <table>
          <tr class="total-fila"><td>TOTAL</td><td style="text-align:right;">${moneda(totalVenta)}</td></tr>
        </table>
        <hr />
        ${
          pagos.length > 1
            ? pagos.map((p) => `<p>${escaparHtml(p.medio_pago)}: ${moneda(p.monto)}</p>`).join('')
            : `<p>Medio de pago: ${escaparHtml(pagos[0]?.medio_pago || '-')}</p>`
        }
        ${vendedorNombre ? `<p>Vendedor: ${escaparHtml(vendedorNombre)}</p>` : ''}
        <p>Lista de precios: ${listaUsada === 'distribuidor' ? 'Distribuidor' : 'Principal'}</p>
        <hr />
        <p class="centro">¡Gracias por su compra!</p>
      </body>
      </html>`;

    // iframe invisible: no aparece como ventana, no lo bloquea el navegador
    // como pop-up, y no queda nada por cerrar.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    let limpiado = false;
    const limpiar = () => {
      if (limpiado) return;
      limpiado = true;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Al terminar de imprimir (o al cancelar el diálogo), se quita el
    // iframe y el cursor vuelve al buscador.
    let terminado = false;
    const terminarImpresion = () => {
      if (terminado) return;
      terminado = true;
      limpiar();
      enfocarBuscador();
    };

    const ventanaIframe = iframe.contentWindow;
    ventanaIframe.addEventListener('afterprint', terminarImpresion);
    // Por si el navegador no dispara "afterprint" en un iframe (pasa en
    // algunos casos), se limpia igual pasado un tiempo prudente (acá sin
    // mover el cursor, para no quitárselo a alguien que ya esté escribiendo).
    setTimeout(limpiar, 30000);

    // Un pequeño margen para que el navegador termine de montar el
    // documento antes de mandar a imprimir.
    setTimeout(() => {
      try {
        ventanaIframe.focus();
        // En Chrome, print() se queda esperando hasta que se cierra el
        // diálogo de impresión, así que al llegar a la línea siguiente ya
        // se imprimió (o se canceló).
        ventanaIframe.print();
        terminarImpresion();
      } catch {
        terminarImpresion();
      }
    }, 200);
  }

  function escaparHtml(texto) {
    return String(texto || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Imprime el resumen de cierre de turno en el mismo formato térmico de
  // 80mm que los tickets de venta (ver imprimirTicket arriba para las notas
  // sobre por qué el ancho es 68mm sin centrar). Es un ticket aparte, no
  // uno de venta: se usa para dejar constancia en papel de cuánto dio el
  // turno y si la caja cuadró, por si se necesita archivar o mostrarlo.
  function imprimirCierreTurno(c) {
    if (!c) return;
    const r = c.resumen || {};
    const diferencia = c.dineroReal !== null && c.dineroReal !== undefined ? c.dineroReal - Number(r.dineroEsperado || 0) : null;
    const cuadra = diferencia !== null && Math.abs(diferencia) < 1;

    const filaResumen = (etiqueta, valor) => `
      <tr><td>${escaparHtml(etiqueta)}</td><td style="text-align:right;">${valor}</td></tr>`;

    const filasResumen = [
      filaResumen('Efectivo', moneda(r.ventasEfectivo)),
      filaResumen('Tarjeta', moneda(r.ventasTarjeta)),
      filaResumen('Transferencia', moneda(r.ventasTransferencia)),
      Number(r.ventasOtro) > 0 ? filaResumen('Otros medios', moneda(r.ventasOtro)) : '',
      Number(r.devolucionDinero) > 0 ? filaResumen('Devoluciones', `-${moneda(r.devolucionDinero)}`) : '',
    ].join('');

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Cierre de turno</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            width: 68mm;
            margin: 0;
            padding: 4px 0 10px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 600;
            font-size: 13px;
            color: #000;
          }
          h1 { font-size: 17px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
          h2 { font-size: 14px; text-align: center; margin: 0 0 6px; }
          p { margin: 3px 0; }
          .centro { text-align: center; }
          table { width: 100%; border-collapse: collapse; }
          hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
          .total-fila td { font-size: 15px; font-weight: 700; padding-top: 6px; }
        </style>
      </head>
      <body>
        <h1>GEEK STORE</h1>
        <h2>Cierre de turno</h2>
        <p class="centro">
          ${c.abiertoEn ? `${new Date(c.abiertoEn).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — ` : ''}
          ${new Date(c.cerradoEn).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
        <hr />
        <table>
          <tr class="total-fila"><td>TOTAL VENTAS</td><td style="text-align:right;">${moneda(r.totalVentas)}</td></tr>
        </table>
        ${r.cantidadVentas !== undefined ? `<p class="centro">${r.cantidadVentas} venta${r.cantidadVentas === 1 ? '' : 's'}</p>` : ''}
        <hr />
        <table>${filasResumen}</table>
        <hr />
        <table>
          <tr><td>Dinero esperado</td><td style="text-align:right;">${moneda(r.dineroEsperado)}</td></tr>
          ${c.dineroReal !== null && c.dineroReal !== undefined ? `<tr><td>Dinero contado</td><td style="text-align:right;">${moneda(c.dineroReal)}</td></tr>` : ''}
        </table>
        ${
          diferencia !== null
            ? `<p class="centro" style="margin-top:6px;">${cuadra ? 'La caja cuadró.' : `Diferencia: ${diferencia > 0 ? '+' : ''}${moneda(diferencia)}`}</p>`
            : ''
        }
      </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    let limpiado = false;
    const limpiar = () => {
      if (limpiado) return;
      limpiado = true;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    let terminado = false;
    const terminarImpresion = () => {
      if (terminado) return;
      terminado = true;
      limpiar();
    };

    const ventanaIframe = iframe.contentWindow;
    ventanaIframe.addEventListener('afterprint', terminarImpresion);
    setTimeout(limpiar, 30000);

    setTimeout(() => {
      try {
        ventanaIframe.focus();
        ventanaIframe.print();
        terminarImpresion();
      } catch {
        terminarImpresion();
      }
    }, 200);
  }

  async function confirmarVenta() {
    setError('');
    setMensaje('');

    if (!turno) {
      setError('Debes abrir un turno para vender.');
      return;
    }
    const pestanaVenta = activa;
    if (pestanaVenta.carrito.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }

    let pagosBody = null;
    if (pestanaVenta.pagoCombinado) {
      const lineasValidas = pestanaVenta.pagosCombinados.filter((l) => Number(l.monto) > 0);
      if (lineasValidas.length < 2) {
        setError('Para pago combinado, ingresa el monto de al menos dos medios de pago');
        return;
      }
      const suma = lineasValidas.reduce((acc, l) => acc + Number(l.monto), 0);
      if (Math.abs(suma - total) > 1) {
        setError(`Los montos ingresados (${moneda(suma)}) no coinciden con el total (${moneda(total)})`);
        return;
      }
      pagosBody = lineasValidas.map((l) => ({ medio_pago: l.medio, monto: Number(l.monto) }));
    } else if (!pestanaVenta.medioPago) {
      setError('Selecciona el medio de pago');
      return;
    }

    setGuardando(true);
    const itemsVendidos = pestanaVenta.carrito;
    const totalVendido = total;
    const vendedorNombre = vendedores.find((v) => String(v.id) === String(pestanaVenta.vendedorId))?.nombre || '';
    const itemsBody = pestanaVenta.carrito.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      descuento_porcentaje: i.descuento_porcentaje || 0,
    }));
    const cuerpoVenta = {
      medio_pago: pagosBody ? undefined : pestanaVenta.medioPago,
      pagos: pagosBody || undefined,
      vendedor_id: pestanaVenta.vendedorId ? Number(pestanaVenta.vendedorId) : null,
      items: itemsBody,
    };
    const pagosParaTicket = pagosBody || [{ medio_pago: pestanaVenta.medioPago, monto: totalVendido }];

    function limpiarCarritoYAvisar(datosTicket, mensajeExito) {
      imprimirTicket(datosTicket);
      setUltimaVenta(datosTicket);
      setMensaje(mensajeExito);
      actualizarPestana(pestanaVenta.id, (p) => ({
        ...p,
        carrito: [],
        editandoId: null,
        medioPago: '',
        pagoCombinado: false,
        pagosCombinados: [
          { medio: 'Efectivo', monto: '' },
          { medio: 'Tarjeta', monto: '' },
        ],
      }));
    }

    // Sin internet: ni siquiera se intenta la petición (fetch puede demorar
    // varios segundos en fallar) — se guarda de una vez en este computador
    // (IndexedDB, sobrevive aunque se apague el PC) y se sigue como si la
    // venta hubiera quedado registrada, dejando claro en el ticket y en el
    // mensaje que todavía falta sincronizarla.
    if (!navigator.onLine) {
      await guardarVentaComoPendiente();
      return;
    }

    let res;
    try {
      res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoVenta),
      });
    } catch (e) {
      // Se creía que había internet pero la petición falló de todas formas
      // (por ejemplo se cortó justo en ese momento) — incluso el mismo
      // camino de "sin conexión".
      setEnLinea(false);
      await guardarVentaComoPendiente();
      return;
    }
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      const fecha = new Date().toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      limpiarCarritoYAvisar(
        {
          ventaId: data.ventaId,
          items: itemsVendidos,
          totalVenta: totalVendido,
          pagos: data.pagos || pagosParaTicket,
          vendedorNombre,
          listaUsada: pestanaVenta.lista,
          fecha,
        },
        'Venta registrada.'
      );
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la venta');
    }

    async function guardarVentaComoPendiente() {
      const ahora = new Date();
      const fecha = ahora.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const idLocal = generarIdLocal();
      await guardarVentaPendiente({
        idLocal,
        ...cuerpoVenta,
        creadoEn: ahora.getTime(),
        creadoEnISO: ahora.toISOString(),
      });
      setGuardando(false);
      await cargarVentasPendientes();
      limpiarCarritoYAvisar(
        {
          ventaId: `Pendiente (sin internet)`,
          items: itemsVendidos,
          totalVenta: totalVendido,
          pagos: pagosParaTicket,
          vendedorNombre,
          listaUsada: pestanaVenta.lista,
          fecha,
          sinConexion: true,
        },
        'Sin conexión: la venta se guardó en este computador y se enviará sola cuando vuelva el internet.'
      );
    }
  }

  function reimprimirUltimaFactura() {
    if (!ultimaVenta) return;
    imprimirTicket(ultimaVenta);
  }

  const ventaConError = ventasPendientes.find((v) => v.error);

  return (
    <Shell title="Vender">
      {!enLinea && (
        <div style={styles.bannerOffline}>
          🔴 Sin conexión — se sigue pudiendo vender con la última información guardada en este computador. Las
          ventas quedan guardadas acá y se envían solas apenas vuelva el internet.
        </div>
      )}
      {enLinea && ventasPendientes.length > 0 && !ventaConError && (
        <div style={styles.bannerPendiente}>
          {sincronizando
            ? `Sincronizando ${ventasPendientes.length} venta(s) hecha(s) sin conexión...`
            : `${ventasPendientes.length} venta(s) hecha(s) sin conexión, pendientes de enviar.`}
          <button onClick={sincronizarVentasPendientes} disabled={sincronizando} style={styles.btnSincronizar}>
            Sincronizar ahora
          </button>
        </div>
      )}
      {ventaConError && (
        <div style={styles.bannerError}>
          Una venta guardada sin conexión no pudo sincronizarse: <strong>{ventaConError.error}</strong>. Las ventas
          pendientes después de esa quedaron en espera para no desordenarlas. Revisa el stock/turno y reintenta.
          <button
            onClick={() => {
              const { error, ...ventaSinError } = ventaConError;
              actualizarVentaPendiente(ventaSinError).then(sincronizarVentasPendientes);
            }}
            style={styles.btnSincronizar}
          >
            Reintentar
          </button>
        </div>
      )}
      <ChequeoSemanal vendedores={vendedores} enLinea={enLinea} />
      <div className="pos-stack-900" style={styles.layout}>
        <div style={styles.columnaProductos}>
          <div style={styles.barraSuperior}>
            <div style={styles.bannerTurno}>
              {cargandoTurno ? (
                <span>Cargando turno...</span>
              ) : turno ? (
                <>
                  <span>
                    Turno abierto desde{' '}
                    {new Date(turno.abierto_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button onClick={abrirModalCerrarTurno} style={styles.linkTurno}>Cerrar turno</button>
                  <ArqueoCaja turno={turno} vendedores={vendedores} enLinea={enLinea} />
                </>
              ) : (
                <>
                  <span>Turno cerrado</span>
                  <button onClick={() => setMostrarAbrirTurno(true)} style={styles.linkTurno}>Abrir turno</button>
                </>
              )}
            </div>
            <input
              ref={buscadorRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar productos por referencia o nombre..."
              style={styles.buscador}
            />
          </div>
          {filtrados.length > LIMITE_RESULTADOS && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 8px' }}>
              Mostrando {LIMITE_RESULTADOS} de {filtrados.length} — sigue escribiendo para afinar la búsqueda.
            </p>
          )}
          <div style={styles.grid}>
            {filtradosVisibles.map((p) => {
              const enCarrito = activa.carrito.find((i) => i.producto_id === p.id);
              const inventariable = p.es_inventariable !== false;
              const stockPrincipal = Number(p.stock_principal) || 0;
              const stockDistribuidor = Number(p.stock_distribuidor) || 0;
              const agotado = inventariable && stockPrincipal <= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => !agotado && agregarAlCarrito(p)}
                  style={{
                    ...styles.tarjeta,
                    ...(enCarrito ? styles.tarjetaActiva : {}),
                    ...(agotado ? styles.tarjetaAgotada : {}),
                  }}
                >
                  <div style={styles.tarjetaTop}>
                    <span style={styles.referencia}>{p.referencia}</span>
                    {enCarrito && <span style={styles.badgeCantidad}>{enCarrito.cantidad}</span>}
                  </div>
                  {p.imagen_key ? (
                    <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={styles.fotoTarjeta} />
                  ) : (
                    <div style={styles.icono}>📦</div>
                  )}
                  <div style={styles.nombre}>{p.nombre}</div>
                  {inventariable ? (
                    <div style={styles.stockInfo}>
                      <span style={styles.badgeStock}>Principal: {stockPrincipal}</span>
                      <span style={styles.badgeStock}>Distribuidor: {stockDistribuidor}</span>
                    </div>
                  ) : (
                    <div style={styles.stockInfo}>
                      <span style={styles.badgeServicio}>Servicio</span>
                    </div>
                  )}
                  {agotado ? (
                    <div style={styles.agotado}>{stockDistribuidor > 0 ? 'Sin stock en Principal' : 'Agotado'}</div>
                  ) : (
                    <div style={styles.precio}>{moneda(precioSegunLista(p, activa.lista))}</div>
                  )}
                </div>
              );
            })}
            {filtrados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Sin productos.</p>}
          </div>
        </div>

        <div className="pos-panel-lateral" style={styles.columnaCarrito}>
          <div style={styles.listaPrecios}>
            <button
              type="button"
              onClick={() => cambiarLista('principal')}
              style={{ ...styles.btnLista, ...(activa.lista === 'principal' ? styles.btnListaActivo : {}) }}
            >
              Lista Principal
            </button>
            <button
              type="button"
              onClick={() => cambiarLista('distribuidor')}
              style={{ ...styles.btnLista, ...(activa.lista === 'distribuidor' ? styles.btnListaActivo : {}) }}
            >
              Lista Distribuidor
            </button>
          </div>

          <h3 style={{ marginTop: 0 }}>Factura de venta</h3>

          <div style={styles.listaCarrito}>
            {activa.carrito.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Toca un producto para agregarlo.</p>}
            {activa.carrito.map((item) => (
              <div
                key={item.producto_id}
                onClick={() => alternarEdicion(item.producto_id)}
                style={{ ...styles.itemCarrito, cursor: 'pointer' }}
                title="Clic para editar precio o descuento"
              >
                <div style={styles.itemHeader}>
                  <strong>{item.nombre}</strong>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      quitarDelCarrito(item.producto_id);
                    }}
                    style={styles.btnQuitar}
                  >
                    ×
                  </button>
                </div>

                <div style={styles.itemControles} onClick={(e) => e.stopPropagation()}>
                  <div style={styles.stepper}>
                    <button onClick={() => cambiarCantidad(item.producto_id, -1)} style={styles.stepperBtn}>−</button>
                    <span>{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(item.producto_id, 1)} style={styles.stepperBtn}>+</button>
                  </div>
                  <span style={{ fontWeight: 600 }}>{moneda(subtotalItem(item))}</span>
                </div>

                {activa.editandoId === item.producto_id && (
                  <div style={styles.edicion} onClick={(e) => e.stopPropagation()}>
                    <label style={styles.labelEdicion}>
                      Precio
                      <input
                        type="number"
                        step="0.01"
                        value={item.precio_unitario}
                        onChange={(e) => actualizarItem(item.producto_id, 'precio_unitario', e.target.value)}
                        style={styles.inputEdicion}
                      />
                    </label>
                    <label style={styles.labelEdicion}>
                      Descuento %
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={item.descuento_porcentaje}
                        onChange={(e) => actualizarItem(item.producto_id, 'descuento_porcentaje', e.target.value)}
                        style={styles.inputEdicion}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={styles.piePanel}>
            <div style={styles.filaDosCampos}>
              {!activa.pagoCombinado ? (
                <label style={styles.labelCampo}>
                  Medio de pago *
                  <select
                    value={activa.medioPago}
                    onChange={(e) => actualizarPestana(activa.id, { medioPago: e.target.value })}
                    style={styles.inputCampo}
                  >
                    <option value="">Seleccionar</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Otro">Otro</option>
                  </select>
                </label>
              ) : (
                <div style={{ flex: 1 }} />
              )}
              <label style={styles.labelCampo}>
                Vendedor
                <select
                  value={activa.vendedorId}
                  onChange={(e) => actualizarPestana(activa.id, { vendedorId: e.target.value })}
                  style={styles.inputCampo}
                >
                  <option value="">Seleccionar</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" onClick={() => activarPagoCombinado(!activa.pagoCombinado)} style={styles.linkPagoCombinado}>
              {activa.pagoCombinado ? '✕ Cancelar pago combinado' : '+ Pagar con más de un medio (ej. efectivo + tarjeta)'}
            </button>

            {activa.pagoCombinado && (
              <div style={styles.pagoCombinadoBox}>
                {activa.pagosCombinados.map((l, i) => (
                  <div key={i} style={styles.filaPagoCombinado}>
                    <select
                      value={l.medio}
                      onChange={(e) => actualizarLineaPago(i, 'medio', e.target.value)}
                      style={{ ...styles.inputCampo, flex: 1 }}
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Otro">Otro</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Monto"
                      value={l.monto}
                      onChange={(e) => actualizarLineaPago(i, 'monto', e.target.value)}
                      style={{ ...styles.inputCampo, width: '110px' }}
                    />
                    <button type="button" onClick={() => completarRestoEn(i)} style={styles.btnMiniLink} title="Llenar con lo que falte">
                      Completar
                    </button>
                    {activa.pagosCombinados.length > 2 && (
                      <button type="button" onClick={() => quitarLineaPago(i)} style={styles.btnQuitar}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <button type="button" onClick={agregarLineaPago} style={styles.btnMiniLink}>+ Agregar otro medio</button>
                  <span style={{ fontSize: '12px', color: diferenciaPago === 0 ? 'var(--teal-dark)' : 'var(--danger)' }}>
                    {diferenciaPago === 0
                      ? 'Los montos cuadran con el total'
                      : diferenciaPago > 0
                        ? `Falta ${moneda(diferenciaPago)}`
                        : `Sobra ${moneda(Math.abs(diferenciaPago))}`}
                  </span>
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

            <button onClick={confirmarVenta} disabled={guardando || activa.carrito.length === 0} style={styles.btnVender}>
              <span>{guardando ? 'Registrando...' : 'Vender'}</span>
              <span>{moneda(total)}</span>
            </button>

            <div style={styles.piePagina}>
              <span>{activa.carrito.length} producto(s)</span>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {ultimaVenta && (
                  <button
                    onClick={reimprimirUltimaFactura}
                    style={styles.btnIconoDiscreto}
                    title={`Reimprimir última factura (venta #${ultimaVenta.ventaId})`}
                    aria-label="Reimprimir última factura"
                  >
                    🖨️
                  </button>
                )}
                <button onClick={() => actualizarPestana(activa.id, (p) => ({ ...p, carrito: [] }))} style={styles.btnCancelar}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pos-pestanas-bar" style={styles.pestanasBar}>
        {pestanas.map((p) => (
          <div
            key={p.id}
            style={{ ...styles.pestanaBtn, ...(p.id === activa.id ? styles.pestanaBtnActiva : {}) }}
            onClick={() => setPestanaActivaId(p.id)}
          >
            <span>🛒 {p.nombre}</span>
            {p.carrito.length > 0 && <span style={styles.pestanaBadge}>{p.carrito.length}</span>}
            {pestanas.length > 1 && (
              <span
                style={styles.pestanaCerrar}
                onClick={(e) => {
                  e.stopPropagation();
                  cerrarPestana(p.id);
                }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarPestana} style={styles.pestanaAgregar} title="Nueva venta">+</button>
      </div>

      {mostrarAbrirTurno && (
        <div style={styles.overlay} onMouseDown={() => setMostrarAbrirTurno(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Abrir turno</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Indica el dinero en efectivo con el que inicias el turno.
            </p>
            <label style={styles.labelCampo}>
              Base inicial
              <input
                type="number"
                step="0.01"
                value={baseInicial}
                onChange={(e) => setBaseInicial(e.target.value)}
                style={styles.inputCampo}
                autoFocus
              />
            </label>

            {errorTurno && <p style={{ color: 'var(--danger)' }}>{errorTurno}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button onClick={abrirTurno} disabled={guardandoTurno} style={styles.btnPrimario}>
                {guardandoTurno ? 'Abriendo...' : 'Guardar'}
              </button>
              <button onClick={() => setMostrarAbrirTurno(false)} style={styles.btnSecundarioModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {cierreTurno && (
        <div style={styles.overlay} onMouseDown={() => setCierreTurno(null)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Turno cerrado</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '-6px' }}>
              {cierreTurno.abiertoEn &&
                `${new Date(cierreTurno.abiertoEn).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — `}
              {new Date(cierreTurno.cerradoEn).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>

            <div style={styles.totalCierre}>
              <span style={{ fontSize: '13px', color: 'var(--teal-dark)' }}>Total de ventas del turno</span>
              <strong style={{ fontSize: '30px' }}>{moneda(cierreTurno.resumen?.totalVentas)}</strong>
              {cierreTurno.resumen?.cantidadVentas !== undefined && (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {cierreTurno.resumen.cantidadVentas} venta{cierreTurno.resumen.cantidadVentas === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {cierreTurno.resumen && (
              <>
                <div style={styles.filaResumenTurno}><span>Efectivo</span><strong>{moneda(cierreTurno.resumen.ventasEfectivo)}</strong></div>
                <div style={styles.filaResumenTurno}><span>Tarjeta</span><strong>{moneda(cierreTurno.resumen.ventasTarjeta)}</strong></div>
                <div style={styles.filaResumenTurno}><span>Transferencia</span><strong>{moneda(cierreTurno.resumen.ventasTransferencia)}</strong></div>
                {Number(cierreTurno.resumen.ventasOtro) > 0 && (
                  <div style={styles.filaResumenTurno}><span>Otros medios</span><strong>{moneda(cierreTurno.resumen.ventasOtro)}</strong></div>
                )}
                {Number(cierreTurno.resumen.devolucionDinero) > 0 && (
                  <div style={styles.filaResumenTurno}><span>Devoluciones de dinero</span><strong>-{moneda(cierreTurno.resumen.devolucionDinero)}</strong></div>
                )}
                <div style={{ ...styles.filaResumenTurno, borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                  <span>Dinero esperado en caja</span><strong>{moneda(cierreTurno.resumen.dineroEsperado)}</strong>
                </div>
                <div style={styles.filaResumenTurno}><span>Dinero contado</span><strong>{moneda(cierreTurno.dineroReal)}</strong></div>
                {(() => {
                  const diferencia = cierreTurno.dineroReal - Number(cierreTurno.resumen.dineroEsperado);
                  const coincide = Math.abs(diferencia) < 1;
                  return (
                    <p style={{ fontSize: '13px', fontWeight: 600, color: coincide ? 'var(--teal-dark)' : 'var(--danger)', margin: '6px 0 0' }}>
                      {coincide ? 'La caja cuadró.' : `Diferencia en caja: ${diferencia > 0 ? '+' : ''}${moneda(diferencia)}`}
                    </p>
                  );
                })()}
              </>
            )}

            <div style={{ marginTop: '16px' }}>
              <button onClick={() => setCierreTurno(null)} style={styles.btnPrimario}>Aceptar</button>
              <button onClick={() => imprimirCierreTurno(cierreTurno)} style={styles.btnSecundarioModal}>
                🖨️ Imprimir (80mm)
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarCerrarTurno && (
        <div style={styles.overlay} onMouseDown={() => setMostrarCerrarTurno(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cerrar turno</h3>
            {turno && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Fecha de inicio{' '}
                {new Date(turno.abierto_en).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            {ventasPendientes.length > 0 && (
              <p style={styles.avisoPendientesCierre}>
                Hay {ventasPendientes.length} venta{ventasPendientes.length === 1 ? '' : 's'} hecha{ventasPendientes.length === 1 ? '' : 's'} sin
                conexión que todavía no se ha{ventasPendientes.length === 1 ? '' : 'n'} enviado. No están incluidas en este
                resumen: si cierras ahora, se sumarán al próximo turno cuando se sincronicen.
              </p>
            )}

            {cargandoResumen ? (
              <p>Cargando resumen...</p>
            ) : (
              resumenTurno && (
                <>
                  <div style={styles.filaResumenTurno}><span>Base inicial</span><strong>{moneda(resumenTurno.baseInicial)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas en efectivo</span><strong>{moneda(resumenTurno.ventasEfectivo)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas por tarjeta</span><strong>{moneda(resumenTurno.ventasTarjeta)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas por transferencia</span><strong>{moneda(resumenTurno.ventasTransferencia)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Otros medios de pago</span><strong>{moneda(resumenTurno.ventasOtro)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Devolución de dinero</span><strong>{moneda(resumenTurno.devolucionDinero)}</strong></div>
                  <div style={{ ...styles.filaResumenTurno, borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', fontWeight: 700 }}>
                    <span>Total de ventas</span><span>{moneda(resumenTurno.totalVentas)}</span>
                  </div>
                  <div style={styles.dineroEsperado}>
                    <span>Dinero esperado en caja</span><strong>{moneda(resumenTurno.dineroEsperado)}</strong>
                  </div>
                </>
              )
            )}

            <label style={{ ...styles.labelCampo, marginTop: '16px' }}>
              Dinero real en caja *
              <input
                type="number"
                step="0.01"
                value={dineroReal}
                onChange={(e) => setDineroReal(e.target.value)}
                style={styles.inputCampo}
              />
            </label>
            {resumenTurno && dineroReal !== '' && (
              (() => {
                const diferencia = Number(dineroReal) - resumenTurno.dineroEsperado;
                const coincide = Math.abs(diferencia) < 1;
                return (
                  <p style={{ fontSize: '13px', color: coincide ? 'var(--teal-dark)' : 'var(--danger)', margin: '0 0 8px' }}>
                    {coincide ? 'Coincide con el dinero esperado.' : `Diferencia: ${diferencia > 0 ? '+' : ''}${moneda(diferencia)}`}
                  </p>
                );
              })()
            )}
            <label style={styles.labelCampo}>
              Observaciones
              <textarea
                value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                style={{ ...styles.inputCampo, minHeight: '50px' }}
              />
            </label>

            {errorTurno && <p style={{ color: 'var(--danger)' }}>{errorTurno}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button onClick={confirmarCierreTurno} disabled={cerrandoTurno} style={styles.btnPrimario}>
                {cerrandoTurno ? 'Cerrando...' : 'Guardar'}
              </button>
              <button onClick={() => setMostrarCerrarTurno(false)} style={styles.btnSecundarioModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start', paddingBottom: '56px' },
  columnaProductos: { flex: 1, minWidth: 0 },
  barraSuperior: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg)',
    paddingBottom: '10px',
  },
  bannerTurno: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  },
  bannerOffline: {
    background: '#fdecea',
    color: '#7a1f14',
    border: '1px solid #f3b7ac',
    borderRadius: 'var(--radius)',
    padding: '10px 16px',
    fontSize: '13px',
    marginBottom: '12px',
  },
  bannerPendiente: {
    background: '#fff8e1',
    color: '#7a5c00',
    border: '1px solid #f0d98c',
    borderRadius: 'var(--radius)',
    padding: '10px 16px',
    fontSize: '13px',
    marginBottom: '12px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  bannerError: {
    background: '#fdecea',
    color: '#7a1f14',
    border: '1px solid #f3b7ac',
    borderRadius: 'var(--radius)',
    padding: '10px 16px',
    fontSize: '13px',
    marginBottom: '12px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  totalCierre: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    background: 'var(--teal-light)',
    borderRadius: 'var(--radius)',
    padding: '14px',
    margin: '8px 0 14px',
  },
  avisoPendientesCierre: {
    background: '#fef3c7',
    color: '#92400e',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
  },
  btnSincronizar: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid currentColor',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12px',
  },
  linkTurno: {
    border: 'none',
    background: 'none',
    color: 'var(--teal-dark)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
  },
  buscador: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    background: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '14px',
  },
  tarjeta: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    cursor: 'pointer',
    textAlign: 'center',
    position: 'relative',
  },
  tarjetaActiva: { border: '2px solid var(--teal)' },
  tarjetaAgotada: { opacity: 0.5, cursor: 'not-allowed' },
  tarjetaTop: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' },
  referencia: {},
  badgeCantidad: {
    background: 'var(--teal)',
    color: '#fff',
    borderRadius: '999px',
    width: '18px',
    height: '18px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icono: {
    width: '150px',
    height: '150px',
    margin: '8px auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '52px',
    background: 'var(--bg)',
    borderRadius: '10px',
  },
  fotoTarjeta: { width: '150px', height: '150px', objectFit: 'contain', background: 'var(--bg)', borderRadius: '10px', margin: '8px auto', display: 'block' },
  nombre: { fontSize: '13px', fontWeight: 600, marginBottom: '4px', minHeight: '32px' },
  stockInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', marginBottom: '6px' },
  badgeStock: {
    fontSize: '11px',
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
  },
  badgeServicio: {
    fontSize: '11px',
    color: '#6b7280',
    background: '#f3f4f6',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
  },
  precio: { fontSize: '17px', fontWeight: 700, color: 'var(--text)' },
  listaPrecios: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
  btnLista: {
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  btnListaActivo: { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' },
  agotado: { fontSize: '12px', color: 'var(--warning)' },
  columnaCarrito: {
    width: '340px',
    flexShrink: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 104px)',
    position: 'sticky',
    top: '24px',
  },
  listaCarrito: { flex: 1, overflowY: 'auto', marginBottom: '12px' },
  itemCarrito: { borderBottom: '1px solid var(--border)', padding: '10px 0' },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' },
  btnQuitar: { border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' },
  itemControles: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' },
  stepper: { display: 'flex', alignItems: 'center', gap: '10px' },
  stepperBtn: { width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  edicion: { display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' },
  labelEdicion: { fontSize: '12px', color: 'var(--text-secondary)', flex: 1 },
  inputEdicion: { display: 'block', width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '2px' },
  piePanel: { flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: '12px' },
  filaDosCampos: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  linkPagoCombinado: {
    border: 'none',
    background: 'none',
    color: 'var(--teal-dark)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '6px 0',
    textAlign: 'left',
  },
  pagoCombinadoBox: {
    background: 'var(--bg)',
    borderRadius: '8px',
    padding: '10px',
    marginBottom: '8px',
  },
  filaPagoCombinado: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' },
  btnMiniLink: {
    border: 'none',
    background: 'none',
    color: 'var(--teal-dark)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 2px',
    whiteSpace: 'nowrap',
  },
  labelCampo: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', flex: 1, marginBottom: '8px' },
  inputCampo: {
    display: 'block',
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    fontSize: '13px',
  },
  btnVender: {
    width: '100%',
    padding: '14px',
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '4px',
  },
  piePagina: { display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' },
  btnCancelar: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer' },
  // Icono discreto (sin texto) para reimprimir la última factura; el texto
  // solo aparece como tooltip nativo al dejar el cursor encima (atributo
  // "title" del botón).
  btnIconoDiscreto: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '15px',
    padding: 0,
    lineHeight: 1,
    opacity: 0.75,
  },
  pestanasBar: {
    position: 'fixed',
    bottom: '14px',
    left: '80px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 60,
    flexWrap: 'wrap',
    maxWidth: 'calc(100vw - 380px)',
  },
  pestanaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '999px',
    background: '#fff',
    border: '1px solid var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  pestanaBtnActiva: {
    background: 'var(--teal)',
    color: '#fff',
    border: '1px solid var(--teal)',
    fontWeight: 600,
  },
  pestanaBadge: {
    background: 'rgba(0,0,0,0.15)',
    borderRadius: '999px',
    padding: '0 7px',
    fontSize: '11px',
  },
  pestanaCerrar: {
    marginLeft: '2px',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
  pestanaAgregar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#fff',
    borderRadius: 'var(--radius)',
    padding: '24px',
    width: '380px',
    maxWidth: '92vw',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  btnSecundarioModal: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
  },
  btnPrimario: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  filaResumenTurno: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px' },
  dineroEsperado: {
    display: 'flex',
    justifyContent: 'space-between',
    background: 'var(--bg)',
    padding: '10px 12px',
    borderRadius: '8px',
    marginTop: '10px',
    fontSize: '14px',
  },
};
