export const metadata = {
  title: 'POS Geek Store',
  description: 'Sistema interno de inventario y ventas — Geek Store Kennedy',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
