import { NextResponse } from 'next/server';
import { leerPedido, opcionesParaLineas } from '../../../../lib/pedidoCliente';

export const dynamic = 'force-dynamic';

// Cotizar desde foto (nov 2026). Ver lib/pedidoCliente.js.
//   POST { accion: 'leer', imagen?: dataURL, texto?: string }
//        → { lineas: [{ n, ref, nombre, descripcion, cantidad, buscar }] }
//   POST { accion: 'opciones', lineas: [...] }   (máximo 8 por llamada)
//        → { lineas: [{ n, opciones: [...], otros: [...] }] }
// Van en llamadas separadas para que cada una quepa en el tiempo máximo de
// Netlify (las IAs se demoran).

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.accion === 'leer') {
      const r = await leerPedido({ imagen: body.imagen, texto: body.texto });
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.accion === 'opciones') {
      const lineas = (Array.isArray(body.lineas) ? body.lineas : []).slice(0, 8).map((l, i) => ({
        n: Number(l.n) || i + 1,
        nombre: String(l.nombre || '').slice(0, 120),
        descripcion: String(l.descripcion || '').slice(0, 1200),
        cantidad: Math.max(1, Math.round(Number(l.cantidad) || 1)),
        buscar: (Array.isArray(l.buscar) ? l.buscar : []).map((b) => String(b).slice(0, 40)).slice(0, 8),
      }));
      if (!lineas.length) return NextResponse.json({ ok: false, error: 'No hay líneas para buscar' }, { status: 400 });
      const r = await opcionesParaLineas(lineas);
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ ok: false, error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
