// Redes sociales de Geek Store (octubre 2026). Se agregan al mensaje del
// cupón y al comprobante de venta por WhatsApp.
export const REDES = [
  { nombre: 'Instagram', url: 'https://www.instagram.com/geekstorebogota/' },
  { nombre: 'TikTok', url: 'https://www.tiktok.com/@geek.store683' },
  { nombre: 'Facebook', url: 'https://www.facebook.com/geekstorebogota' },
];

export function textoRedes() {
  return ['📲 *Síguenos* para ver novedades, ofertas y lanzamientos:', ...REDES.map((r) => `${r.nombre}: ${r.url}`)].join('\n');
}
