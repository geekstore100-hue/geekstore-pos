// lib/fotosNavegador.js
// Arreglos de fotos que se hacen en el navegador (oct 2026), para el
// borrador de factura de compra. Son copia de los de la pantalla de
// Productos (app/productos/page.js), que tiene los suyos adentro.

// Recorta el espacio en blanco alrededor del producto (fotos de proveedor
// con el producto chiquito en el centro de un fondo blanco enorme).
export function recortarEspaciosBlancos(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      // Fondo blanco primero: en un PNG con fondo transparente, lo
      // transparente se leía como negro — no se recortaba y además la foto
      // final (JPG) quedaba con fondo negro. Así queda blanco y se recorta
      // igual que un fondo blanco normal.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const { width, height } = canvas;
      let datos;
      try {
        datos = ctx.getImageData(0, 0, width, height).data;
      } catch {
        resolve(dataUri); // por si el navegador bloquea el canvas
        return;
      }

      const esBlanco = (r, g, b) => r > 245 && g > 245 && b > 245;

      let minX = width, minY = height, maxX = 0, maxY = 0, encontrado = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (!esBlanco(datos[i], datos[i + 1], datos[i + 2])) {
            encontrado = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!encontrado) {
        resolve(dataUri); // la foto es toda blanca, no hay nada que recortar
        return;
      }

      const margen = Math.round(Math.max(width, height) * 0.02);
      minX = Math.max(0, minX - margen);
      minY = Math.max(0, minY - margen);
      maxX = Math.min(width - 1, maxX + margen);
      maxY = Math.min(height - 1, maxY + margen);

      const anchoRecorte = maxX - minX + 1;
      const altoRecorte = maxY - minY + 1;

      const canvasRecorte = document.createElement('canvas');
      canvasRecorte.width = anchoRecorte;
      canvasRecorte.height = altoRecorte;
      canvasRecorte.getContext('2d').drawImage(
        canvas, minX, minY, anchoRecorte, altoRecorte, 0, 0, anchoRecorte, altoRecorte
      );
      resolve(canvasRecorte.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}
// Achica la foto que se manda a la IA (máx. 1280 px) para no pasarse del
// límite de la IA gratis.
export function redimensionarParaIA(dataUri, maxLado = 1280, calidad = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h || (w <= maxLado && h <= maxLado)) {
        resolve(dataUri);
        return;
      }
      const escala = maxLado / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * escala);
      canvas.height = Math.round(h * escala);
      try {
        const ctx = canvas.getContext('2d');
        // Fondo blanco: si la foto es un PNG con fondo transparente, al
        // pasarla a JPG lo transparente quedaría NEGRO.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      } catch {
        resolve(dataUri); // por si el navegador bloquea el canvas
      }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}