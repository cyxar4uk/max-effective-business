import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { backButton } from '../max/bridge';

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Кнопка «Назад» MAX: видна, когда есть куда вернуться, и ведёт на шаг назад. Требование модерации. */
export function BackButtonSync() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
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
