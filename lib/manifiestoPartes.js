// lib/manifiestoPartes.js — manifiestos de importación (navegador), nov 2026.
// Antes no se podía subir nada de más de ~5 MB (límite de Netlify por
// petición). Ahora se aceptan hasta 15 MB: los archivos grandes se mandan
// en pedazos de 4 MB y el servidor los junta; para verlos se traen igual,
// por pedazos, y se arma el archivo aquí.

export const MAXIMO_MB = 15;
const MAXIMO = MAXIMO_MB * 1024 * 1024;
const PARTE = 4 * 1024 * 1024; // igual que TAMANO_PARTE en lib/manifiestosGuardar.js
const DIRECTO = 4.5 * 1024 * 1024; // hasta aquí se sube en una sola petición

const mb = (b) => (b / 1024 / 1024).toLocaleString('es-CO', { maximumFractionDigits: 1 });

async function json(res) {
  return res.json().catch(() => ({ ok: false, error: `El servidor respondió ${res.status}` }));
}

// Sube el archivo (File o Blob) y devuelve la fila del manifiesto.
export async function subirManifiesto(facturaId, archivo, nombre, alAvanzar = () => {}) {
  if (archivo.size > MAXIMO) {
    throw new Error(`El archivo pesa ${mb(archivo.size)} MB y el máximo es ${MAXIMO_MB} MB. Si es un PDF escaneado, pártelo en dos.`);
  }
  if (archivo.size <= DIRECTO) {
    const formData = new FormData();
    formData.append('archivo', archivo, nombre);
    const res = await fetch(`/api/facturas-compra/${facturaId}/manifiestos`, { method: 'POST', body: formData });
    if (res.status === 413) throw new Error('El servidor no recibió el archivo por el tamaño. Intenta otra vez.');
    const data = await json(res);
    if (!data.ok) throw new Error(data.error || 'No se pudo subir el manifiesto');
    return data.manifiesto;
  }
  const subida = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '');
  const partes = Math.ceil(archivo.size / PARTE);
  const base = `/api/facturas-compra/${facturaId}/manifiestos/partes?subida=${subida}`;
  for (let n = 0; n < partes; n++) {
    alAvanzar(n + 1, partes);
    const pedazo = archivo.slice(n * PARTE, (n + 1) * PARTE);
    let data = null;
    // Cada pedazo se intenta hasta 3 veces (una conexión que se cae no daña todo).
    for (let intento = 0; intento < 3 && !data?.ok; intento++) {
      try {
        const res = await fetch(`${base}&n=${n}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pedazo });
        data = await json(res);
      } catch {
        data = { ok: false, error: 'error de conexión' };
      }
    }
    if (!data?.ok) throw new Error(`No se pudo subir la parte ${n + 1} de ${partes} (${data?.error || 'error'}).`);
  }
  const res = await fetch(`${base}&terminar=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partes, nombre }),
  });
  const data = await json(res);
  if (!data.ok) throw new Error(data.error || 'No se pudo guardar el manifiesto');
  return data.manifiesto;
}

// Abre un manifiesto en otra pestaña. Los pequeños se abren directo; los
// grandes se traen por partes y se arman aquí.
export async function abrirManifiesto(key, nombre) {
  const url = `/api/manifiestos/${encodeURIComponent(key)}`;
  const ventana = window.open('', '_blank');
  try {
    if (ventana) ventana.document.write('<p style="font-family:sans-serif;padding:20px">Abriendo el manifiesto…</p>');
    const info = await fetch(`${url}?info=1`).then(json);
    if (!info.ok) throw new Error(info.error || 'No se encontró el manifiesto');
    if (info.partes <= 1) {
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
      return;
    }
    const pedazos = [];
    for (let n = 0; n < info.partes; n++) {
      if (ventana) ventana.document.body.innerHTML = `<p style="font-family:sans-serif;padding:20px">Abriendo el manifiesto… parte ${n + 1} de ${info.partes}</p>`;
      const res = await fetch(`${url}?parte=${n}`);
      if (!res.ok) throw new Error(`No se pudo traer la parte ${n + 1}`);
      pedazos.push(await res.blob());
    }
    const blob = new Blob(pedazos, { type: info.tipo });
    const objeto = URL.createObjectURL(blob);
    const visible = info.tipo === 'application/pdf' || /^image\/(jpeg|png|webp)$/i.test(info.tipo);
    if (ventana && visible) {
      ventana.location.href = objeto;
    } else {
      if (ventana) ventana.close();
      const a = document.createElement('a');
      a.href = objeto;
      a.download = nombre || key;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objeto), 5 * 60 * 1000);
  } catch (e) {
    if (ventana) ventana.close();
    alert(e.message || 'No se pudo abrir el manifiesto');
  }
}
