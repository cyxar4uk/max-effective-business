import { createContext, useContext } from 'react';

/** Экран текущий (true) или уходящий — доигрывает анимацию под новым и скоро исчезнет (false). AnimatedRoutes. */
export const ScreenPresence = createContext(true);

/** Экран ещё текущий: уходящему не стоит менять содержимое и грузить данные. */
export const useScreenPresent = (): boolean => useContext(ScreenPresence);
