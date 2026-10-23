import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { esErrorDeGuardia } from '../../../../../lib/transaccion';
import { costoListo, consultaGuardarCosto } from '../../../../../lib/costoVenta';
import {
  prepararLineas,
  consultasReemplazarLineas,
  ErrorCotizacion,
  faltaMigracion,
  MENSAJE_MIGRACION,
  esCotizacionYaFacturada,
} from '../../../../../lib/cotizacionDistribuidor';

// Convierte una cotización de distribuidor en VENTA del POS (octubre 2026).
// Antes "facturar" era solo un estado: la factura se hacía aparte.
//
// Recibe las líneas ya revisadas/editadas en pantalla, la bodega de donde
// sale la mercancía (por defecto Bodega Distribuidor), el medio de pago (o
// pago combinado) y el vendedor. En UNA sola transacción:
//   - marca la cotización como facturada (solo si seguía pendiente),
//   - crea la venta con sus pagos (sin turno de caja: no sale en el cierre),
//   - descuenta el stock de la bodega elegida (nunca lo deja en negativo),
//   - registra los movimientos y deja la cotización con las líneas finales
//     y enlazada a la venta.
// Si algo falla, no se guarda nada.
//
// Modo AUTOMÁTICO (bodega_id = 'auto', octubre 2026): cada producto sale
// primero de Bodega Distribuidor y lo que falte, de Principal. Lo de
// Principal queda como una VENTA APARTE (ver abajo), para saber cuánto vendió
// cada bodega.

const MEDIOS = new Set(['Efectivo', 'Tarjeta', 'Transferencia', 'Otro']);

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, bodega_id, medio_pago, pagos: pagosBody, vendedor_id } = await request.json();

    const [cotizacion] = await sql`SELECT id, numero, estado, distribuidor_nombre FROM cotizaciones_distribuidor WHERE id = ${id}`;
    if (!cotizacion) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    if (cotizacion.estado !== 'pendiente') {
      return NextResponse.json({ ok: false, error: 'Esta cotización ya está facturada.' }, { status: 409 });
    }

    // Octubre 2026: las ventas de distribuidor NUNCA entran al turno de caja
    // (no hace falta tener uno abierto y no salen en el cierre del vendedor,
    // para no confundirlo). Quedan sin turno, como las de eventos, y salen
    // igual en Historial y en Reportes.

    const automatico = bodega_id === 'auto';
    let bodega = null;
    let distribuidor = null;
    let principal = null;
    let lineas;
    let total;
    // Por cada línea: de qué bodega(s) sale → [{ bodega, cantidad }]
    const partes = new Map();

    if (automatico) {
      const bodegasPorNombre = await sql`SELECT id, nombre FROM bodegas WHERE nombre IN ('Bodega Distribuidor', 'Principal')`;
      distribuidor = bodegasPorNombre.find((b) => b.nombre === 'Bodega Distribuidor');
      principal = bodegasPorNombre.find((b) => b.nombre === 'Principal');
      if (!distribuidor || !principal) {
        return NextResponse.json({ ok: false, error: 'No se encontraron las bodegas "Bodega Distribuidor" y "Principal"' }, { status: 500 });
      }
      ({ lineas, total } = await prepararLineas(items));
      const ids = [...new Set(lineas.filter((l) => l.inventariable).map((l) => l.producto_id))];
      const filas = ids.length
        ? await sql`SELECT producto_id, bodega_id, cantidad FROM stock WHERE producto_id = ANY(${ids}::int[]) AND bodega_id IN (${distribuidor.id}, ${principal.id})`
        : [];
      const quedan = new Map(); // `${producto}:${bodega}` → unidades libres
      for (const f of filas) quedan.set(`${f.producto_id}:${f.bodega_id}`, Math.max(0, Number(f.cantidad) || 0));
      for (const l of lineas) {
        if (!l.inventariable) {
          partes.set(l, [{ bodega: principal, cantidad: l.cantidad }]);
          continue;
        }
        const kd = `${l.producto_id}:${distribuidor.id}`;
        const kp = `${l.producto_id}:${principal.id}`;
        const deDist = Math.min(l.cantidad, quedan.get(kd) || 0);
        const dePpal = l.cantidad - deDist;
        if (dePpal > (quedan.get(kp) || 0)) {
          const hayD = (quedan.get(kd) || 0);
          const hayP = (quedan.get(kp) || 0);
          return NextResponse.json(
            { ok: false, error: `No alcanza el stock de "${l.nombre}": hay ${hayD} en Bodega Distribuidor y ${hayP} en Principal, y se necesitan ${l.cantidad}.` },
            { status: 409 }
          );
        }
        quedan.set(kd, (quedan.get(kd) || 0) - deDist);
        quedan.set(kp, (quedan.get(kp) || 0) - dePpal);
        partes.set(l, [
          ...(deDist > 0 ? [{ bodega: distribuidor, cantidad: deDist }] : []),
          ...(dePpal > 0 ? [{ bodega: principal, cantidad: dePpal }] : []),
        ]);
      }
    } else {
      [bodega] = await sql`SELECT id, nombre FROM bodegas WHERE id = ${Number(bodega_id) || 0}`;
      if (!bodega || bodega.nombre === 'Garantías con Proveedor') {
        return NextResponse.json({ ok: false, error: 'Elige la bodega de donde sale la mercancía' }, { status: 400 });
      }

      ({ lineas, total } = await prepararLineas(items, { bodegaId: bodega.id }));

      // Stock suficiente en la bodega elegida (sumando líneas del mismo producto).
      const pedido = new Map();
      for (const l of lineas) if (l.inventariable) pedido.set(l.producto_id, (pedido.get(l.producto_id) || 0) + l.cantidad);
      for (const [productoId, cantidad] of pedido) {
        const l = lineas.find((x) => x.producto_id === productoId);
        if (l.disponible < cantidad) {
          return NextResponse.json(
            { ok: false, error: `No alcanza el stock de "${l.nombre}" en ${bodega.nombre}: hay ${l.disponible} y se necesitan ${cantidad}.` },
            { status: 409 }
          );
        }
      }
      for (const l of lineas) partes.set(l, [{ bodega, cantidad: l.cantidad }]);
    }

    // Pagos (igual que en Vender).
    const esPagoCombinado = Array.isArray(pagosBody) && pagosBody.length > 0;
    let pagos;
    if (esPagoCombinado) {
      for (const p of pagosBody) {
        if (!MEDIOS.has(p.medio_pago) || !(Number(p.monto) > 0)) {
          return NextResponse.json({ ok: false, error: 'Revisa los montos del pago combinado' }, { status: 400 });
        }
      }
      pagos = pagosBody.map((p) => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }));
      const suma = pagos.reduce((a, p) => a + p.monto, 0);
      if (Math.abs(suma - total) > 1) {
        return NextResponse.json({ ok: false, error: `Los pagos (${suma}) no suman el total (${total})` }, { status: 400 });
      }
    } else {
      if (!MEDIOS.has(medio_pago)) return NextResponse.json({ ok: false, error: 'Selecciona el medio de pago' }, { status: 400 });
      pagos = [{ medio_pago, monto: total }];
    }
    // ── Una venta por bodega (octubre 2026) ─────────────────────────────
    // En automático, lo que sale de Principal se guarda como una VENTA
    // APARTE: así se sabe exactamente cuánto vendió Bodega Distribuidor (y
    // su costo y ganancia en Reportes). Las dos ventas se guardan juntas: o
    // quedan las dos, o ninguna. La de Distribuidor queda como venta
    // principal de la cotización (venta_id) y la de Principal en
    // venta_principal_id.
    const grupos = [];
    if (automatico) {
      const gDist = { bodega: distribuidor, partes: [] };
      const gPpal = { bodega: principal, partes: [] };
      for (const l of lineas) {
        for (const parte of partes.get(l)) {
          // Los servicios (sin inventario) van con la venta de Distribuidor.
          const g = !l.inventariable ? gDist : parte.bodega.id === principal.id ? gPpal : gDist;
          g.partes.push({ l, cantidad: parte.cantidad, bodega: l.inventariable ? parte.bodega : distribuidor });
        }
      }
      if (gDist.partes.length) grupos.push(gDist);
      if (gPpal.partes.length) grupos.push(gPpal);
    } else {
      grupos.push({ bodega, partes: lineas.flatMap((l) => partes.get(l).map((parte) => ({ l, cantidad: parte.cantidad, bodega: parte.bodega }))) });
    }
    for (const g of grupos) g.total = g.partes.reduce((a, x) => a + x.cantidad * x.l.precio_unitario, 0);

    // Reparte los pagos entre las ventas, en orden (con un solo medio de
    // pago, cada venta queda con ese medio por su propio total).
    const restantes = pagos.map((p) => ({ ...p }));
    for (const g of grupos) {
      let falta = g.total;
      g.pagos = [];
      for (const p of restantes) {
        if (falta <= 0.5) break;
        const usa = Math.min(p.monto, falta);
        if (usa > 0) {
          g.pagos.push({ medio_pago: p.medio_pago, monto: usa });
          p.monto -= usa;
          falta -= usa;
        }
      }
      if (!g.pagos.length) g.pagos.push({ medio_pago: pagos[0].medio_pago, monto: g.total });
    }

    if (grupos.length > 1) {
      await sql`ALTER TABLE cotizaciones_distribuidor ADD COLUMN IF NOT EXISTS venta_principal_id INT`;
    }

    const nota = `Cotización distribuidor ${cotizacion.numero} — ${cotizacion.distribuidor_nombre}`;
    const guardarCosto = await costoListo();
    const consultas = [
      // 1) Solo si sigue pendiente (si otra pestaña ya la facturó, se cancela todo).
      sql`
        WITH upd AS (
          UPDATE cotizaciones_distribuidor
          SET estado = 'facturada', facturada_en = now(), total_original = COALESCE(total_original, total), total = ${total}
          WHERE id = ${id} AND estado = 'pendiente'
          RETURNING 1
        )
        SELECT CASE WHEN COUNT(*) = 0 THEN ('cotizacion_no_pendiente_' || COUNT(*)::text)::int ELSE 1 END FROM upd
      `,
    ];
    const indiceVenta = [];
    grupos.forEach((g, k) => {
      const variable = k === 0 ? 'pos.id_venta' : 'pos.id_venta_2';
      const medioPagoGuardado = [...new Set(g.pagos.map((p) => p.medio_pago))].join(' + ');
      indiceVenta.push(consultas.length);
      consultas.push(sql`
        WITH nueva AS (
          INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id)
          VALUES (${g.total}, ${medioPagoGuardado}, ${Number(vendedor_id) || null}, ${null})
          RETURNING id
        )
        SELECT id, set_config(${variable}, id::text, true) FROM nueva
      `);
      for (const p of g.pagos) {
        consultas.push(sql`
          INSERT INTO pagos_venta (venta_id, medio_pago, monto)
          VALUES (current_setting(${variable})::int, ${p.medio_pago}, ${p.monto})
        `);
      }
      for (const x of g.partes) {
        if (x.l.inventariable) {
          consultas.push(sql`
            WITH descontado AS (
              UPDATE stock SET cantidad = cantidad - ${x.cantidad}
              WHERE producto_id = ${x.l.producto_id} AND bodega_id = ${x.bodega.id} AND cantidad >= ${x.cantidad}
              RETURNING 1
            )
            SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM descontado) c
          `);
        }
        consultas.push(sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id, nota)
          VALUES (${x.l.producto_id}, ${x.bodega.id}, 'venta', ${x.cantidad}, ${x.l.precio_unitario}, 0, current_setting(${variable})::int,
                  ${grupos.length > 1 ? `${nota} (${x.bodega.nombre})` : nota})
        `);
      }
      // Costo del día de la venta (ver lib/costoVenta.js).
      if (guardarCosto) consultas.push(consultaGuardarCosto(variable));
    });
    // La cotización queda con las líneas finales y enlazada a su(s) venta(s).
    consultas.push(...consultasReemplazarLineas(id, lineas));
    consultas.push(sql`UPDATE cotizaciones_distribuidor SET venta_id = current_setting('pos.id_venta')::int WHERE id = ${id}`);
    if (grupos.length > 1) {
      consultas.push(sql`UPDATE cotizaciones_distribuidor SET venta_principal_id = current_setting('pos.id_venta_2')::int WHERE id = ${id}`);
    }

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (esCotizacionYaFacturada(error)) {
        return NextResponse.json({ ok: false, error: 'Esta cotización ya se facturó (quizás desde otra pestaña). No se guardó nada.' }, { status: 409 });
      }
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          { ok: false, error: 'Stock insuficiente: otra venta se llevó unidades mientras se guardaba. No se guardó nada — revisa y vuelve a intentar.' },
          { status: 409 }
        );
      }
      throw error;
    }
    const ventas = grupos.map((g, k) => ({ id: resultados[indiceVenta[k]][0].id, bodega: g.bodega.nombre, total: g.total }));
    const ventaId = ventas[0].id;
    const textoBodega =
      ventas.length > 1
        ? ventas.map((v) => `venta #${v.id} de ${v.bodega} por $${Math.round(v.total).toLocaleString('es-CO')}`).join(' y ')
        : ventas[0].bodega;
    return NextResponse.json({ ok: true, ventaId, ventas, total, bodega: textoBodega });
  } catch (error) {
    if (error instanceof ErrorCotizacion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (faltaMigracion(error)) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
