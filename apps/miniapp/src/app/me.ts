import { createContext, useContext } from 'react';
import type { Me } from '../api/types';

export interface MeContextValue {
  me: Me;
  /** Обновить пользователя ответом POST /api/me/consent или /api/me/phone. */
  setMe: (me: Me) => void;
}

export const MeContext = createContext<MeContextValue | null>(null);

export function useMe(): MeContextValue {
  const value = useContext(MeContext);
  if (!value) throw new Error('useMe вне MeProvider');
  return value;
}
