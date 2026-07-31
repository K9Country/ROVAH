import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#0F3B24" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ROVAH" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/rovah-pwa-192.png" />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerBootstrap }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

const serviceWorkerBootstrap = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ROVAH remains usable in a normal browser if registration is blocked.
      });
    });
  }
`;
