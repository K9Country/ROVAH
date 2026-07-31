'use dom';

import { useEffect, useState } from 'react';

type GooglePropertyMapProps = {
  address: string;
  dom?: import('expo/dom').DOMProps;
};

export default function GooglePropertyMap({ address }: GooglePropertyMapProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasMapConfigError, setHasMapConfigError] = useState(false);
  const fallbackMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  useEffect(() => {
    let isActive = true;

    // A DOM component can be hosted in an isolated web view. Build the
    // configuration URL from the live site rather than assuming its relative
    // URL resolves against the production domain.
    const configUrl = typeof window !== 'undefined' && window.location.origin.startsWith('http')
      ? new URL('/map-config.json', window.location.origin).toString()
      : 'https://k9-country.expo.app/map-config.json';

    void fetch(configUrl, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Map configuration is unavailable.');
        return response.json() as Promise<{ apiKey?: string }>;
      })
      .then((config) => {
        if (isActive && config.apiKey) setApiKey(config.apiKey);
        else if (isActive) setHasMapConfigError(true);
      })
      .catch(() => {
        if (isActive) setHasMapConfigError(true);
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (!apiKey) {
    return (
      <div style={{ alignItems: 'center', background: '#E6EDE2', boxSizing: 'border-box', color: '#47574A', display: 'flex', fontFamily: 'Arial, sans-serif', height: '100%', justifyContent: 'center', padding: 20, textAlign: 'center', width: '100%' }}>
        {hasMapConfigError ? (
          <div>
            <div>Map preview is temporarily unavailable.</div>
            <a href={fallbackMapUrl} rel="noreferrer" style={{ color: '#284E31', display: 'inline-block', fontWeight: 700, marginTop: 10 }} target="_blank">
              Open location in Google Maps
            </a>
          </div>
        ) : 'Loading map preview...'}
      </div>
    );
  }

  const source = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(address)}`;

  return (
    <iframe
      allowFullScreen
      aria-label="Google Map location preview"
      referrerPolicy="strict-origin-when-cross-origin"
      src={source}
      style={{ border: 0, display: 'block', height: '220px', width: '100%' }}
      title="Google Map location preview"
    />
  );
}
