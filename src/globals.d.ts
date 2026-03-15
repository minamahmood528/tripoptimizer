/// <reference types="google.maps" />

declare global {
  interface Window {
    google: typeof google;
  }
}

// Augment Vite env
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
