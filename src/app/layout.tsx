import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proveedores y Puntos de Venta 5F',
  description: 'Portal de gestión Five Friends',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
