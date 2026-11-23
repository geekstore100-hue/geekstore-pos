// lib/manifiestosGuardar.js — manifiestos de importación (servidor).
// Guarda el archivo ya validado en Netlify Blobs y lo anota en la factura.
// Lo usan la subida normal (app/api/facturas-compra/[id]/manifiestos) y la
// subida por partes para archivos grandes (…/manifiestos/partes), nov 2026.

import { getStore } from '@netlify/blobs';
import sql from './db';

export const TAMANO_PARTE = 4 * 1024 * 1024; // lo que viaja en cada petición (Netlify deja ~6 MB)

export function almacenManifiestos() {
  return getStore('manifiestos-importacion');
}

export function almacenPartes() {
  return getStore({ name: 'manifiestos-partes', consistency: 'strong' });
}

export async function guardarManifiesto(factura, documento) {
  const base = `${factura.numero || `FC-${factura.id}`}-${Date.now()}`.replace(/[^\w.-]+/g, '_');
  const key = `${base}.${documento.ext}`;
  await almacenManifiestos().set(key, documento.buffer, { metadata: { contentType: documento.contentType } });
  const [fila] = await sql`
    INSERT INTO factura_compra_manifiestos (factura_compra_id, archivo_key, nombre_original, tipo_archivo, tamano_bytes)
    VALUES (${factura.id}, ${key}, ${documento.nombreOriginal}, ${documento.contentType}, ${documento.buffer.byteLength})
    RETURNING id, archivo_key, nombre_original, tipo_archivo, tamano_bytes, subido_en
  `;
  return fila;
}
