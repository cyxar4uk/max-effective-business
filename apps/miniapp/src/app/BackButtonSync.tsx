import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { backButton } from '../max/bridge';
import { historyIndex, rememberEntry } from './history';

/** Кнопка «Назад» MAX: видна, когда есть куда вернуться, и ведёт на шаг назад. Требование модерации. */
export function BackButtonSync() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    rememberEntry(location.pathname);
    if (historyIndex() > 0) backButton.show();
    else backButton.hide();
  }, [location]);

  useEffect(() => {
    const onBack = () => navigate(-1);
    backButton.onClick(onBack);
    return () => backButton.offClick(onBack);
  }, [navigate]);

  return null;
}
