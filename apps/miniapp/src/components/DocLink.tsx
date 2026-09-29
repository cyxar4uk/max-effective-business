import type { ReactNode } from 'react';
import type { AboutLink } from '../app/about';
import { openPage } from '../max/bridge';

/**
 * Ссылка на документ из public/legal или внешнюю страницу. В MAX открывается во внешнем браузере, вне MAX — в новой
 * вкладке: мини-приложение остаётся открытым, вернуться — закрыть браузер или вкладку.
 */
export function DocLink({ link, className, children }: { link: AboutLink; className?: string; children?: ReactNode }) {
  return (
    <a
      className={className}
      href={link.url}
      onClick={(e) => {
        e.preventDefault();
        openPage(link.url);
      }}
    >
      {children ?? link.title}
    </a>
  );
}
