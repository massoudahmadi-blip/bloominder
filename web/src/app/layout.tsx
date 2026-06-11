import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-serif' });

export const metadata: Metadata = {
  metadataBase: new URL('https://bloominder.com'),
  title: {
    default: 'Bloominder — Intelligence immobilière en France',
    template: '%s · Bloominder',
  },
  description:
    'Prix de vente réels (DVF), estimation d’adresse, scores d’investissement, rendement locatif et statistiques de marché — sur toute la France. Données officielles.',
  keywords: ['DVF', 'prix immobilier France', 'estimation adresse', 'rendement locatif', 'investissement immobilier', 'cadastre', 'prix au m²'],
  applicationName: 'Bloominder',
  openGraph: {
    type: 'website',
    siteName: 'Bloominder',
    locale: 'fr_FR',
    url: 'https://bloominder.com',
    title: 'Bloominder — Intelligence immobilière en France',
    description:
      'Prix de vente réels (DVF), estimation d’adresse, scores d’investissement et rendement locatif sur toute la France.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bloominder — Intelligence immobilière en France',
    description: 'Prix réels DVF, estimation d’adresse, scores et rendement locatif partout en France.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bloominder-theme')||'editorial';document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
