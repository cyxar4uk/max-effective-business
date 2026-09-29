import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  text?: ReactNode;
  /** Действие, которое выводит из пустого экрана: «Заполните анкету», «Создайте место». */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="state">
      <h2 className="state-title d">{title}</h2>
      {text && <p className="state-text">{text}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn pri" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
