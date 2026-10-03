import { NextResponse } from 'next/server';
import { leerEstadoPanico, guardarEstadoPanico } from '../../../../lib/panico';
import { leerUltimoPedidoDistribuidor } from '../../../../lib/avisoPedidoDistribuidor';

// Estado compartido del botón de pánico (ver lib/panico.js). Lo consultan
// dos tipos de pantalla distintos:
// - El computador de la tienda (components/PanicoReceptor.js), cada pocos
//   segundos, para saber si tiene que taparse.
// - El celular de Nelson (components/PanicoBoton.js), al abrir, para saber
//   si ya está activo o no y mostrar el botón en el estado correcto.
//
// Esta misma consulta trae también el último pedido de distribuidor (ver
// lib/avisoPedidoDistribuidor.js), para mostrar el aviso de pedido nuevo
// sin hacer otra consulta aparte cada pocos segundos.
export async function GET() {
  try {
    const [estado, pedidoDistribuidor] = await Promise.all([leerEstadoPanico(), leerUltimoPedidoDistribuidor()]);
    return NextResponse.json({ ok: true, ...estado, pedidoDistribuidor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Prende o apaga el pánico a distancia (botón del celular). No pide clave:
// ya hace falta estar con la sesión del POS abierta para llegar aquí (ver
// middleware.js), y el botón que llama esto solo se ve en pantallas de
// celular. Apagarlo desde el computador mismo sí pide la clave de
// Seguridad — ver /api/configuracion/clave-admin/verificar, usado desde
// PanicoReceptor.js — para que quien esté ahí mirando donde no debe no
// pueda destaparlo él mismo.
export async function POST(request) {
  try {
    const body = await request.json();
    const estado = await guardarEstadoPanico(Boolean(body.activo));
    return NextResponse.json({ ok: true, ...estado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
