import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/dist/styles.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { lastRole } from './app/lastRole';
import { preloadScreens } from './app/lazyScreen';
import { getStartParam, ready } from './max/bridge';

// Требование MAX: сообщить клиенту, что приложение готово
ready();

// Раздел, в который откроемся, грузится параллельно с GET /api/me
preloadScreens(getStartParam(), lastRole());

// Остальные начертания — сразу, пока идёт GET /api/me: к первому экрану они уже есть, и текст не прыгает
// при подмене шрифта. Основное (Onest 400) предзагружается из index.html
if ('fonts' in document) {
  for (const font of ['500 1em Onest', '600 1em Onest', '700 1em Onest', '600 1em Unbounded', '700 1em Unbounded', '800 1em Unbounded']) {
    document.fonts.load(font, 'Тандем 0').catch(() => {});
  }
  // ₽ в оплате и стрелки в подсказках — из дополнительных наборов (fonts.css): без них текст перестраивается позже
  document.fonts.load('400 1em Onest', '₽→').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Тема — по устройству: MaxUI сам следит за prefers-color-scheme, наши токены — тоже.
        app-root возвращает корню наш фон, цвет текста и шрифт (styles/app.css) */}
    <MaxUI className="app-root">
      <App />
    </MaxUI>
  </StrictMode>,
);
