import { getStore } from '@netlify/blobs';

// Estado del botón de pánico: es COMPARTIDO (no vive en el celular de cada
// quien), porque la idea es controlarlo a distancia — Nelson lo activa desde
// su celular (viendo las cámaras desde la casa, por ejemplo) y eso oculta la
// pantalla del computador de la tienda, sin tocar ese computador para nada.
//
// Antes se guardaba en la base de datos (tabla "configuracion" de Neon). El
// problema: el computador de la tienda pregunta este estado cada pocos
// segundos, todo el día (y toda la noche si el POS queda abierto), y eso
// mantenía la base de datos de Neon encendida 24/7 — nunca alcanzaba a
// "dormirse", que es lo que hace que Neon no cobre. Ahora vive en Netlify
// Blobs (el mismo almacenamiento donde ya están las fotos de los productos):
// estas consultas ya no tocan Neon para nada.
//
// consistency: 'strong' — para que el cambio desde el celular se vea en el
// computador en la siguiente consulta (sin esto, Netlify puede tardar hasta
// un minuto en propagar el cambio).
function tienda() {
  return getStore({ name: 'pos-estado', consistency: 'strong' });
}

export async function leerEstadoPanico() {
  try {
    const v = await tienda().get('panico', { type: 'json' });
    if (!v) return { activo: false, cambiadoEn: null };
    return { activo: Boolean(v.activo), cambiadoEn: v.cambiadoEn || null };
  } catch {
    return { activo: false, cambiadoEn: null };
  }
}

export async function guardarEstadoPanico(activo) {
  const cambiadoEn = new Date().toISOString();
  await tienda().setJSON('panico', { activo: Boolean(activo), cambiadoEn });
  return { activo: Boolean(activo), cambiadoEn };
}
