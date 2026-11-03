import { NextResponse } from 'next/server';
import { leerEnlaceSede, crearSesionSede, COOKIE_SEDE, DURACION_SEDE_SEG } from '../../../../../lib/sesionSede';

export const dynamic = 'force-dynamic';

// Enlace que abre el POS de la sede ("Editar ficha web"): vale 15 minutos.
// Deja una sesión LIMITADA (12 horas) que solo sirve para editar los
// productos de esa sede, y abre el editor en ese producto.
export async function GET(request) {
  const url = new URL(request.url);
  const enlace = await leerEnlaceSede(url.searchParams.get('t'));
  if (!enlace) {
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:24px"><h3>El enlace venció</h3><p>Vuelve a tocar "Editar ficha web" en el POS de tu sede.</p></body>',
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  const destino = new URL(`/productos${enlace.productoId ? `?editar=${enlace.productoId}` : ''}`, url.origin);
  const res = NextResponse.redirect(destino);
  res.cookies.set(COOKIE_SEDE, await crearSesionSede(enlace.sede), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SEDE_SEG,
  });
  return res;
}
