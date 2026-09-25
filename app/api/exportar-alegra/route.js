import { NextResponse } from 'next/server';

// DESHABILITADO (sept 2026): era el endpoint temporal de un solo uso para
// migrar el catálogo de Alegra Cuenta 1 hacia este sistema. Esa migración
// ya se hizo (todo el catálogo, bodegas, categorías y proveedores ya están
// en Neon), y Nelson pidió desconectar del todo la Cuenta 1 — así que este
// archivo ya NO llama a la API de Alegra ni lee ALEGRA_EMAIL/ALEGRA_TOKEN.
//
// Se deja como una respuesta fija en vez de borrarlo, para no depender de
// borrar archivos en GitHub — puedes borrarlo por completo desde GitHub
// si prefieres limpiar el repositorio.

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Este endpoint fue deshabilitado — la migración desde Alegra Cuenta 1 ya se completó.' },
    { status: 410 }
  );
}
