import { getStore } from '@netlify/blobs';

// Aviso de "nuevo pedido de distribuidor" dentro del POS.
//
// Cuando un distribuidor hace un pedido en el portal, se anota aquí el
// último pedido (número, distribuidor, total, fecha). El computador de la
// tienda ya pregunta cada pocos segundos el estado del botón de pánico
// (/api/panico/estado); esa misma consulta ahora también trae este aviso,
// y components/AvisoPedidoDistribuidor.js muestra el cartel con sonido.
//
// Vive en Netlify Blobs (igual que el pánico), NO en Neon: así esas
// consultas cada pocos segundos no mantienen despierta la base de datos.

function tienda() {
  return getStore({ name: 'pos-estado', consistency: 'strong' });
}

const CLAVE = 'ultimo-pedido-distribuidor';

export async function anotarPedidoDistribuidor({ id, numero, distribuidor, total, articulos }) {
  const aviso = {
    id: Number(id) || null,
    numero: String(numero || ''),
    distribuidor: String(distribuidor || ''),
    total: Number(total) || 0,
    articulos: Number(articulos) || 0,
    creadoEn: new Date().toISOString(),
  };
  await tienda().setJSON(CLAVE, aviso);
  return aviso;
}

export async function leerUltimoPedidoDistribuidor() {
  try {
    return (await tienda().get(CLAVE, { type: 'json' })) || null;
  } catch {
    return null;
  }
}
