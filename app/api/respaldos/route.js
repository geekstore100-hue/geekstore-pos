import { NextResponse } from 'next/server';
import { generarRespaldo, listarRespaldos } from '../../../lib/respaldo';

// Lista los respaldos disponibles (fecha y tamaño) para la pantalla de
// Configuraciones → Respaldos.
export async function GET() {
  try {
    const respaldos = await listarRespaldos();
    return NextResponse.json({ ok: true, respaldos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Botón "Generar respaldo ahora": corre el mismo respaldo que se hace solo
// todos los días (ver lib/respaldo.js), pero al momento — útil para
// comprobar que está funcionando, o antes de hacer un cambio grande.
export async function POST() {
  try {
    const resultado = await generarRespaldo();
    return NextResponse.json({ ok: true, respaldo: resultado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
