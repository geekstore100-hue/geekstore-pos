import { NextResponse } from 'next/server';
import { leerConfigIA, guardarConfigIA, PROMPT_DEF } from '../../../../lib/iaArticulo';

// Configuración del modelo y el prompt de la IA usada en "Nuevo producto"
// (Configuraciones > Inteligencia artificial). GET devuelve la config
// actual (o los valores por defecto si nunca se guardó nada); POST la
// actualiza.
export async function GET() {
  try {
    const config = await leerConfigIA();
    // promptPorDefecto: para el botón "Usar el prompt recomendado" de
    // Configuraciones (por si el guardado es uno viejo).
    return NextResponse.json({ ok: true, ...config, promptPorDefecto: PROMPT_DEF });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = await guardarConfigIA(body);
    return NextResponse.json({ ok: true, ...config });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
