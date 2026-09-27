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
      <body>
        {children}
        {/* Registra el service worker (public/sw.js) que permite que el
            sistema siga cargando sin internet — ver ese archivo para el
            detalle. Va como <script> plano (no un componente de React) para
            no tener que convertir este layout en "use client". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {
                    // Si falla el registro (navegador viejo, etc.) el sistema
                    // sigue funcionando normal, solo sin el respaldo offline.
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
