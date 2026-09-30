import { leerTema, guardarTema } from '../../../lib/tema';

// Lee y guarda el tema visual (colores) de toda la aplicación, elegido en
// Configuraciones > Tema visual. Ver lib/tema.js.
export const dynamic = 'force-dynamic';

export async function GET() {
  const tema = await leerTema();
  return Response.json({ ok: true, tema });
}

export async function POST(request) {
  try {
    const { tema } = await request.json();
    const guardado = await guardarTema(tema);
    return Response.json({ ok: true, tema: guardado });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
