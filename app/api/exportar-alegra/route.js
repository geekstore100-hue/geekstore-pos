import { NextResponse } from 'next/server';

// Endpoint temporal de un solo uso para migrar el catálogo real de Alegra
// (cuenta 1) hacia este sistema. No escribe nada en Neon: solo consulta la
// API de Alegra y devuelve el JSON crudo, tal cual lo entrega Alegra, para
// que Nelson lo descargue y se lo pase a Claude, quien arma el SQL de
// importación a partir de ese JSON.
//
// Requiere dos variables de entorno en Netlify (Site configuration →
// Environment variables) para el sitio de este proyecto (geekstore-pos):
//   ALEGRA_EMAIL  -> el correo del usuario de Alegra con el que se generó el token
//   ALEGRA_TOKEN  -> el token de API generado en Alegra (Configuración → API)
// Deben ser los de la cuenta 1 de Alegra (la que se está reemplazando), no
// los de la cuenta 2 (la que se dejó solo para la factura electrónica DIAN).

const BASE_URL = 'https://api.alegra.com/api/v1';
const TAMANO_PAGINA = 30; // límite máximo que permite la API de Alegra

function authHeader() {
  const email = process.env.ALEGRA_EMAIL;
  const token = process.env.ALEGRA_TOKEN;
  if (!email || !token) return null;
  const base64 = Buffer.from(`${email}:${token}`).toString('base64');
  return `Basic ${base64}`;
}

async function pedirPagina(path, start) {
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}start=${start}&limit=${TAMANO_PAGINA}`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
  });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`Alegra respondió algo que no es JSON (status ${res.status}): ${texto.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`Alegra respondió error ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

const RUTAS = {
  bodegas: '/warehouses',
  'listas-precio': '/price-lists',
  categorias: '/item-categories',
  proveedores: '/contacts?type=provider',
  items: '/items?mode=advanced',
};

export async function GET(request) {
  try {
    if (!authHeader()) {
      return NextResponse.json(
        { ok: false, error: 'Faltan las variables de entorno ALEGRA_EMAIL y/o ALEGRA_TOKEN en Netlify.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entidad = searchParams.get('entidad');
    const startInicial = Number(searchParams.get('start') || 0);
    const paginas = Math.min(Number(searchParams.get('paginas') || 8), 20); // tope de seguridad por llamada

    if (!RUTAS[entidad]) {
      return NextResponse.json(
        { ok: false, error: `entidad inválida. Usa una de: ${Object.keys(RUTAS).join(', ')}` },
        { status: 400 }
      );
    }

    const datos = [];
    let start = startInicial;
    let siguienteStart = null;

    for (let i = 0; i < paginas; i++) {
      const pagina = await pedirPagina(RUTAS[entidad], start);
      const filas = Array.isArray(pagina) ? pagina : pagina.data || [];
      datos.push(...filas);

      if (filas.length < TAMANO_PAGINA) {
        siguienteStart = null; // ya no hay más páginas
        break;
      }
      start += TAMANO_PAGINA;
      siguienteStart = start;
    }

    return NextResponse.json({
      ok: true,
      entidad,
      startInicial,
      registrosEnEsteLote: datos.length,
      siguienteStart,
      data: datos,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
