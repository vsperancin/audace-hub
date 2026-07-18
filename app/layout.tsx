import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Audace Hub',
    template: '%s · Audace Hub',
  },
  description:
    'Plataforma multi-tenant para consolidar contas de marketplace (Mercado Livre, Shopee, Magalu, Amazon).',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ),
  robots: {
    index: false, // área logada — não indexar.
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}