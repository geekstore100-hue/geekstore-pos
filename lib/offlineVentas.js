// Guarda ventas y datos de respaldo en IndexedDB del navegador, para que
// sobrevivan aunque se apague el PC (a diferencia de una variable en
// memoria, que se pierde apenas se cierra la pestaña o se reinicia el
// equipo). Se usa solo desde /ventas — ver ese archivo para el flujo
// completo de "vender sin internet".
//
// Dos cosas se guardan acá:
// 1. "ventas_pendientes": ventas hechas sin conexión, en espera de mandarse
//    al servidor apenas vuelva el internet.
// 2. "snapshots": la última copia buena de productos/vendedores/turno, para
//    poder seguir vendiendo (con esos datos, aunque no sean del segundo
//    exacto) si el PC se reinicia sin internet y la página no puede volver
//    a pedirlos al servidor.

const DB_NOMBRE = 'geekstore_pos_offline';
const DB_VERSION = 1;
const STORE_VENTAS = 'ventas_pendientes';
const STORE_SNAPSHOTS = 'snapshots';

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este navegador'));
      return;
    }
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(STORE_VENTAS)) {
        db.createObjectStore(STORE_VENTAS, { keyPath: 'idLocal' });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'clave' });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

function promisificar(peticion) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

export function generarIdLocal() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function guardarVentaPendiente(venta) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_VENTAS, 'readwrite');
  tx.objectStore(STORE_VENTAS).put(venta);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// put() reemplaza el registro completo si ya existe la misma idLocal — sirve
// tanto para agregar una venta nueva como para actualizarle el campo
// "error" cuando el servidor la rechaza al sincronizar.
export const actualizarVentaPendiente = guardarVentaPendiente;

export async function listarVentasPendientes() {
  const db = await abrirDB();
  const tx = db.transaction(STORE_VENTAS, 'readonly');
  const resultado = await promisificar(tx.objectStore(STORE_VENTAS).getAll());
  return (resultado || []).sort((a, b) => a.creadoEn - b.creadoEn);
}

export async function eliminarVentaPendiente(idLocal) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_VENTAS, 'readwrite');
  tx.objectStore(STORE_VENTAS).delete(idLocal);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function guardarSnapshot(clave, datos) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
  tx.objectStore(STORE_SNAPSHOTS).put({ clave, datos, guardadoEn: Date.now() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerSnapshot(clave) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
  const resultado = await promisificar(tx.objectStore(STORE_SNAPSHOTS).get(clave));
  return resultado ? resultado.datos : null;
}
