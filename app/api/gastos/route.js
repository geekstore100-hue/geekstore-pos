import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { tablaGastos, CATEGORIAS, MEDIOS_PAGO_GASTO } from '../../../lib/gastos';

// Gastos del negocio (nov 2026) — ver lib/gastos.js.
//   GET ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → gastos del rango + totales por
//       categoría + beneficiarios usados antes (para autocompletar).
//   POST → registra un gasto.

function fechaValida(f) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) && !Number.isNaN(Date.parse(f));
}
function hoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export async function GET(request) {
  try {
    await tablaGastos();
    const { searchParams } = new URL(request.url);
    const hoy = hoyBogota();
    const desde = fechaValida(searchParams.get('desde')) ? searchParams.get('desde') : `${hoy.slice(0, 8)}01`;
    const hasta = fechaValida(searchParams.get('hasta')) ? searchParams.get('hasta') : hoy;
    const gastos = await sql`
      SELECT id, fecha::text AS fecha, categoria, concepto, beneficiario, beneficiario_doc, contacto_id, valor, medio_pago,
             de_caja, turno_id, notas, creado_en, anulado, anulado_en, motivo_anulacion
      FROM gastos
      WHERE fecha BETWEEN ${desde} AND ${hasta}
      ORDER BY fecha DESC, id DESC
    `;
    const porCategoria = {};
    let total = 0;
    for (const g of gastos) {
      if (g.anulado) continue;
      porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + Number(g.valor);
      total += Number(g.valor);
    }
    const contactos = await sql`
      SELECT id, nombre, documento, telefono FROM gastos_contactos
      WHERE activo = true ORDER BY lower(nombre) LIMIT 1000
    `;
    const [turno] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    return NextResponse.json({
      ok: true,
      desde,
      hasta,
      gastos,
      total,
      porCategoria,
      contactos,
      categorias: CATEGORIAS,
      mediosPago: MEDIOS_PAGO_GASTO,
      turnoAbiertoId: turno?.id || null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await tablaGastos();
    const b = await request.json().catch(() => ({}));
    const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const fecha = fechaValida(b.fecha) ? b.fecha : hoyBogota();
    const categoria = CATEGORIAS.includes(b.categoria) ? b.categoria : null;
    const concepto = texto(b.concepto, 200);
    let beneficiario = texto(b.beneficiario, 120) || null;
    let beneficiarioDoc = texto(b.beneficiario_doc, 30) || null;
    // "Pagado a" elegido de los contactos: el nombre y el documento salen de ahí.
    let contactoId = null;
    if (Number(b.contacto_id) > 0) {
      const [c] = await sql`SELECT id, nombre, documento FROM gastos_contactos WHERE id = ${Number(b.contacto_id)}`;
      if (!c) return NextResponse.json({ ok: false, error: 'Ese contacto ya no existe: elígelo de nuevo' }, { status: 400 });
      contactoId = c.id;
      beneficiario = c.nombre;
      beneficiarioDoc = c.documento || null;
    }
    const valor = Math.round(Number(b.valor));
    const medioPago = MEDIOS_PAGO_GASTO.includes(b.medio_pago) ? b.medio_pago : null;
    // Solo el efectivo puede salir de la caja; si llega marcado con otro medio
    // de pago, se ignora la marca (el arriendo por transferencia no toca la caja).
    const deCaja = b.de_caja === true && medioPago === 'Efectivo';
    const notas = String(b.notas ?? '').trim().slice(0, 500) || null;
    const idLocal = /^[A-Za-z0-9._:-]{6,80}$/.test(String(b.id_local || '')) ? String(b.id_local) : null;

    if (!categoria) return NextResponse.json({ ok: false, error: 'Elige la categoría del gasto' }, { status: 400 });
    if (!concepto) return NextResponse.json({ ok: false, error: 'Escribe el concepto (ej. Arriendo local noviembre 2026)' }, { status: 400 });
    if (!(valor > 0) || valor > 1e10) return NextResponse.json({ ok: false, error: 'Escribe un valor válido' }, { status: 400 });
    if (!medioPago) return NextResponse.json({ ok: false, error: 'Elige cómo se pagó' }, { status: 400 });

    // Si ya llegó (doble clic o se perdió la respuesta), no se repite.
    if (idLocal) {
      const [ya] = await sql`SELECT id FROM gastos WHERE id_local = ${idLocal}`;
      if (ya) return NextResponse.json({ ok: true, id: ya.id, repetido: true });
    }

    // Plata de la caja: tiene que ser efectivo y debe haber un turno abierto
    // (ahí es donde se resta del cuadre).
    let turnoId = null;
    if (deCaja) {
      const [turno] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
      if (!turno) {
        return NextResponse.json({ ok: false, error: 'No hay un turno de caja abierto: ábrelo o registra el gasto sin marcar "salió de la caja"' }, { status: 409 });
      }
      turnoId = turno.id;
    }

    try {
      const [g] = await sql`
        INSERT INTO gastos (fecha, categoria, concepto, beneficiario, beneficiario_doc, contacto_id, valor, medio_pago, de_caja, turno_id, notas, id_local)
        VALUES (${fecha}, ${categoria}, ${concepto}, ${beneficiario}, ${beneficiarioDoc}, ${contactoId}, ${valor}, ${medioPago}, ${deCaja}, ${turnoId}, ${notas}, ${idLocal})
        RETURNING id
      `;
      return NextResponse.json({ ok: true, id: g.id });
    } catch (e) {
      if (idLocal && /duplicate key/i.test(e.message || '')) {
        const [ya] = await sql`SELECT id FROM gastos WHERE id_local = ${idLocal}`;
        if (ya) return NextResponse.json({ ok: true, id: ya.id, repetido: true });
      }
      throw e;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
