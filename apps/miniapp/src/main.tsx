import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/dist/styles.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { ready } from './max/bridge';

// Требование MAX: сообщить клиенту, что приложение готово
ready();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Тема — по устройству: MaxUI сам следит за prefers-color-scheme, наши токены — тоже.
        app-root возвращает корню наш фон, цвет текста и шрифт (styles/app.css) */}
    <MaxUI className="app-root">
      <App />
    </MaxUI>
  </StrictMode>,
);
