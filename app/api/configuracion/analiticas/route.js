import { NextResponse } from 'next/server';
import { leerUrlAnaliticas, guardarUrlAnaliticas } from '../../../../lib/analiticas';

// Enlace del reporte embebido de Analíticas (Configuraciones > Analíticas,
// también editable directo desde /analiticas).
export async function GET() {
  try {
    const urlEmbed = await leerUrlAnaliticas();
    return NextResponse.json({ ok: true, urlEmbed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const urlEmbed = String(body.urlEmbed || '').trim();
    if (urlEmbed && !/^https:\/\//i.test(urlEmbed)) {
      return NextResponse.json({ ok: false, error: 'El enlace debe empezar con https://' }, { status: 400 });
    }
    const guardado = await guardarUrlAnaliticas(urlEmbed);
    return NextResponse.json({ ok: true, urlEmbed: guardado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
