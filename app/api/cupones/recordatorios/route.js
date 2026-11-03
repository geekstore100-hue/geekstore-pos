import { NextResponse } from 'next/server';
import { existeTablaCupones, paraRecordar, marcarRecordatorio, ErrorCupon, MENSAJE_MIGRACION } from '../../../../lib/cupones';

export const dynamic = 'force-dynamic';

// Recordatorios de cupones por WhatsApp (nov 2026). Ver lib/cupones.js.
//   GET  ?campana=X → cupones sin usar, con celular y vigentes.
//   POST { codigo, accion: 'enviado' | 'no_contactar' | 'contactar' }
export async function GET(request) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const campana = new URL(request.url).searchParams.get('campana');
    if (!campana) return NextResponse.json({ ok: false, error: 'Falta la campaña' }, { status: 400 });
    return NextResponse.json({ ok: true, cupones: await paraRecordar(campana) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const { codigo, accion } = await request.json();
    const cupon = await marcarRecordatorio(codigo, accion);
    return NextResponse.json({ ok: true, cupon });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
