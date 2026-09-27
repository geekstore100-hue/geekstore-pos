import { NextResponse } from 'next/server';

// Esta era una herramienta temporal de un solo uso (importar las fotos de
// producto desde las URLs de Alegra a Netlify Blobs). Ya se usó, las URLs de
// Alegra ya vencieron, y dejarla activa era un riesgo: bastaba con abrir un
// enlace para que se volviera a ejecutar y sobrescribiera fotos. Queda
// desactivada. (La carpeta app/api/importar-fotos, con su mapa-fotos.json,
// se puede borrar completa desde GitHub cuando quieras.)
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Esta herramienta de importación ya se usó y fue desactivada.' },
    { status: 410 }
  );
}
