import { NextResponse } from 'next/server';
import { COOKIE_SESION, tokenSesionValido } from './lib/sesion';
import { COOKIE_SEDE, sedeDeSesion } from './lib/sesionSede';
import { cabecerasCors } from './lib/corsSedes';

// API de sedes (POS de Venecia, ver lib/sedes.js): el CORS se pone AQUÍ,
// en el Edge, para que vaya en todas las respuestas — también cuando la
// función falla o Netlify la corta por tiempo (502/503/504). Así el POS de
// Venecia puede leer el error real en vez de "sin conexión". El preflight
// (OPTIONS) se contesta aquí mismo, sin despertar la función.
const API_SEDES = /^\/api\/publico\/sedes\/(publicar|stock|productos|estado)\/?$/;

// SESIÓN DE SEDE (nov 2026, ver lib/sesionSede.js): la gente de Geek Store
// Venecia entra al editor de productos con un enlace de su POS, sin la
// clave de administrador. Solo puede usar estas rutas (y los productos de su
// sede: cada ruta lo revisa con el encabezado x-pos-sede que pone aquí).
const RUTAS_SEDE = [
  ['GET', /^\/productos\/?$/],
  ['GET', /^\/api\/sesion$/],
  ['GET', /^\/api\/tema$/],
  ['GET', /^\/api\/categorias$/],
  ['GET', /^\/api\/subcategorias$/],
  ['GET', /^\/api\/productos$/],
  ['PUT', /^\/api\/productos\/\d+$/],
  ['GET', /^\/api\/productos\/\d+\/imagenes$/],
  ['POST', /^\/api\/productos\/\d+\/imagenes$/],
  ['DELETE', /^\/api\/productos\/\d+\/imagenes\/\d+$/],
  ['PATCH', /^\/api\/productos\/\d+\/imagenes\/\d+$/],
  ['POST', /^\/api\/productos\/analizar-foto$/],
  ['POST', /^\/api\/productos\/quitar-fondo$/],
  ['GET', /^\/api\/productos\/foto-remota$/],
  ['GET', /^\/api\/productos\/fotos-pagina$/],
];
function rutaPermitidaSede(metodo, pathname) {
  const m = metodo === 'HEAD' ? 'GET' : metodo;
  return RUTAS_SEDE.some(([mm, re]) => mm === m && re.test(pathname));
}
// Nadie puede mandar x-pos-sede desde afuera: solo lo pone este archivo.
function siguienteCon(request, sede) {
  const headers = new Headers(request.headers);
  headers.delete('x-pos-sede');
  if (sede) headers.set('x-pos-sede', sede);
  return NextResponse.next({ request: { headers } });
}

// Rutas públicas, sin necesidad de tener la sesión de administrador
// iniciada:
// - /login, /api/login: la propia pantalla/endpoint de inicio de sesión.
// - /api/logout: cerrar sesión debe funcionar siempre, aunque la sesión ya
//   esté vencida.
// - /api/publico: el catálogo público que usa la tienda (geekstore-tienda)
//   para leer productos, precios y stock (ver app/api/publico/catalogo).
// - /api/imagenes: las fotos de los productos que ese mismo catálogo
//   referencia — si esta ruta quedara protegida, el catálogo respondería
//   bien pero las fotos no cargarían en la tienda.
// - /_next y favicon.ico: recursos internos de Next.js.
function esRutaPublica(pathname) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/publico') ||
    pathname.startsWith('/api/imagenes') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  );
}

const METODOS_SOLO_LECTURA = ['GET', 'HEAD', 'OPTIONS'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (API_SEDES.test(pathname)) {
    const cors = cabecerasCors(request);
    if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: cors });
    const res = siguienteCon(request, null);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  // Protección contra ataques desde otras páginas (CSRF): si estás con la
  // sesión abierta y visitas una página maliciosa, esa página podría
  // intentar mandarle órdenes a tu POS (registrar, anular, borrar...) a
  // nombre tuyo. Los navegadores modernos marcan cada petición con
  // "Sec-Fetch-Site"; si una petición que MODIFICA datos viene de otro
  // sitio web ("cross-site"), se rechaza. Las rutas /api/publico quedan por
  // fuera porque las llama el servidor de la tienda, no un navegador.
  if (!METODOS_SOLO_LECTURA.includes(request.method) && !pathname.startsWith('/api/publico')) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ ok: false, error: 'Solicitud bloqueada' }, { status: 403 });
    }
  }

  if (esRutaPublica(pathname)) {
    return siguienteCon(request, null);
  }

  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (await tokenSesionValido(token)) {
    return siguienteCon(request, null);
  }

  // Sesión limitada de una sede (Venecia): solo su editor de productos.
  const sede = await sedeDeSesion(request.cookies.get(COOKIE_SEDE)?.value);
  if (sede) {
    if (rutaPermitidaSede(request.method, pathname)) return siguienteCon(request, sede);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'No disponible para esta sede' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/productos', request.url));
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

// api/imagenes/ también queda por fuera del middleware: las fotos ya eran
// públicas (ver esRutaPublica arriba) y esa ruta solo acepta GET, así que
// el middleware no hacía nada con ellas — pero igual se ejecutaba una vez
// por CADA foto que se cargaba (hasta 60 de golpe al abrir Vender, más
// todas las que pide la tienda), gastando ejecuciones en Netlify para nada.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/imagenes/).*)'],
};
