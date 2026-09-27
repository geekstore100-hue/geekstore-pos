import { NextResponse } from 'next/server';
import { leerDatosEmpresa, guardarDatosEmpresa } from '../../../../lib/datosEmpresa';

// Datos legales de Geek Store (Configuraciones > Datos de la empresa),
// usados en el encabezado del certificado de retención de ReteICA.
export async function GET() {
  try {
    const datos = await leerDatosEmpresa();
    return NextResponse.json({ ok: true, ...datos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const datos = await guardarDatosEmpresa(body);
    return NextResponse.json({ ok: true, ...datos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
