import { useState, useEffect } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export interface UseGoogleMapsReturn {
  isLoaded: boolean;
  isError: boolean;
}

let _loadPromise: Promise<void> | null = null;
let _loadedKey = '';

export function useGoogleMaps(apiKey: string): UseGoogleMapsReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!apiKey) { setIsLoaded(false); setIsError(false); return; }
    if (window.google?.maps && _loadedKey === apiKey) { setIsLoaded(true); return; }

    if (_loadedKey !== apiKey) {
      _loadedKey = apiKey;
      setOptions({ key: apiKey, v: 'weekly' });
      _loadPromise = importLibrary('maps')
        .then(() => importLibrary('places'))
        .then(() => undefined as void);
    }

    _loadPromise!
      .then(() => { setIsLoaded(true); setIsError(false); })
      .catch(() => { setIsError(true); setIsLoaded(false); });
  }, [apiKey]);

  return { isLoaded, isError };
}

export async function searchPlace(
  query: string,
): Promise<{ name: string; address: string; lat: number; lng: number } | null> {
  if (!window.google?.maps?.places) return null;
  return new Promise((resolve) => {
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    service.textSearch({ query }, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
        const r = results[0];
        resolve({
          name: r.name ?? '',
          address: r.formatted_address ?? '',
          lat: r.geometry?.location?.lat() ?? 0,
          lng: r.geometry?.location?.lng() ?? 0,
        });
      } else { resolve(null); }
    });
  });
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!window.google?.maps?.Geocoder) return null;
  const geocoder = new window.google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        resolve({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
      } else { resolve(null); }
    });
  });
}
