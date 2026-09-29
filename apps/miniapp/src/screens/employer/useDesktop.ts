import { useSyncExternalStore } from 'react';

const DESKTOP = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** Ширина от 1024 px: форма места одной страницей с живым превью, меньше — пошагово. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}
