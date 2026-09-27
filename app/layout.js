import './globals.css';

export const metadata = {
  title: 'POS Geek Store',
  description: 'Sistema interno de inventario y ventas — Geek Store',
};

// Sin esto, los celulares renderizan la página como si fuera de escritorio
// (asumen ~980px de ancho) y la muestran alejada/chiquita — ningún ajuste de
// CSS responsive sirve de nada sin esta línea.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
