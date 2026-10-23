import { NextResponse } from 'next/server';
import { resumenClarity, CLARITY_PROJECT_ID } from '../../../../lib/clarity';

export const dynamic = 'force-dynamic';

// GET /api/analiticas/clarity?dias=1|3&forzar=1 — ver lib/clarity.js.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const r = await resumenClarity({ dias: searchParams.get('dias'), forzar: searchParams.get('forzar') === '1' });
  return NextResponse.json({ ...r, proyecto: CLARITY_PROJECT_ID });
}
