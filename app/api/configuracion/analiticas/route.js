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
    if (urlEmbed) {
      // Error real que pasó: alguien pegó el código <iframe> completo (o un
      // pedazo mal seleccionado de él) en vez de solo el enlace, y quedó
      // guardado un texto que "empezaba" con https:// pero no era una URL
      // válida — Looker Studio lo rechazaba sin ningún mensaje claro. Estos
      // caracteres (espacios, comillas, < >) nunca van en una URL real, así
      // que si aparecen es casi seguro que se pegó HTML por error.
      if (/[<>"\s]/.test(urlEmbed)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Eso no parece un enlace válido — parece que se pegó también código HTML (como <iframe>...</iframe>). Pega solo el enlace, algo como https://lookerstudio.google.com/embed/reporting/.../page/...',
          },
          { status: 400 }
        );
      }
      try {
        const parsed = new URL(urlEmbed);
        if (parsed.protocol !== 'https:') throw new Error('no https');
      } catch {
        return NextResponse.json({ ok: false, error: 'El enlace no es válido. Debe empezar con https://' }, { status: 400 });
      }
    }
    const guardado = await guardarUrlAnaliticas(urlEmbed);
    return NextResponse.json({ ok: true, urlEmbed: guardado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
