import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/pedidos-web/pendientes — pedidos PAGADOS en geekstore.com.co que
// todavía no se han facturado (no tienen su venta en el POS). Los muestra el
// aviso de arriba en todas las pantallas (components/AvisoPedidosWeb.js),
// para que no se despache nada sin facturar (nov 2026).
//
// Le pregunta a la tienda (/api/publico/pedidos-sin-facturar) con el mismo
// secreto que ya comparten (DISTRIBUIDOR_CLAVE). La tienda es
// https://geekstore.com.co salvo que se ponga TIENDA_URL en Netlify.
// Se guarda 60 s en memoria para no preguntar de más.

let memoria = { en: 0, datos: null };

export async function GET() {
  try {
    if (memoria.datos && Date.now() - memoria.en < 60 * 1000) return NextResponse.json(memoria.datos);
    const clave = process.env.DISTRIBUIDOR_CLAVE;
    if (!clave) return NextResponse.json({ ok: false, error: 'Falta DISTRIBUIDOR_CLAVE en Netlify (sitio del POS)' });
    const base = (process.env.TIENDA_URL || 'https://geekstore.com.co').replace(/\/$/, '');
    const res = await fetch(`${base}/api/publico/pedidos-sin-facturar`, {
      headers: { 'x-distribuidor-clave': clave },
      cache: 'no-store',
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return NextResponse.json({ ok: false, error: data.error || `La tienda respondió ${res.status}` });
    memoria = { en: Date.now(), datos: { ok: true, pedidos: data.pedidos || [], adminUrl: `${base}/admin` } };
    return NextResponse.json(memoria.datos);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
