// «Заполнить за меня» на шаге 1 формы места: поле «Опишите задачу своими словами», кнопка и итог запроса.
// Сам запрос — в useAiDraft.ts, он живёт в форме и переживает смену шага.
import { LIMITS, type Draft } from './draft';
import type { AiDraftCtl } from './useAiDraft';

interface AiDraftProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  ai: AiDraftCtl;
  compact: boolean;
}

export function AiDraft({ draft, update, ai, compact }: AiDraftProps) {
  const { state } = ai;
  const loading = state.status === 'loading';
  const note =
    state.status === 'done'
      ? `${state.source === 'ai' ? 'Черновик от ИИ' : 'Подобрали по ключевым словам'} — проверьте навыки${compact ? ' ниже' : ' на шаге 3'}`
      : null;

  return (
    <div className={compact ? 'pf-group pf-ai' : 'surf pf-hint pf-ai'}>
      <label htmlFor="pf-brief" className={compact ? 'lbl' : 'pf-hint-t'}>
        Опишите задачу своими словами
      </label>
      {!compact && (
        <span id="pf-brief-sub" className="lbl">
          Заполним заголовок, направление и навыки — останется проверить
        </span>
      )}
      <textarea
        id="pf-brief"
        className="pf-area pf-brief"
        rows={3}
        value={draft.brief}
        maxLength={LIMITS.brief}
        placeholder="Например: нужен человек вести инсту кофейни и снимать сторис"
        aria-describedby={compact ? 'pf-brief-st' : 'pf-brief-sub pf-brief-st'}
        aria-invalid={state.status === 'error' && state.field}
        onChange={(e) => {
          update({ brief: e.target.value });
          ai.reset();
        }}
      />
      <div className="pf-ai-row">
        <button type="button" className="btn sec sm" disabled={loading} aria-busy={loading} onClick={ai.run}>
          {loading ? 'Заполняем…' : 'Заполнить за меня'}
        </button>
        <span className="lbl num">
          {draft.brief.length} из {LIMITS.brief}
        </span>
      </div>
      {/* Одна живая область на ошибку и результат: экранный диктор прочтёт их один раз */}
      <div id="pf-brief-st" aria-live="polite">
        {state.status === 'error' && <p className="pf-err">{state.message}</p>}
        {note && <p className={state.status === 'done' && state.source === 'ai' ? 'pf-ai-note' : 'pf-ai-note rules'}>{note}</p>}
      </div>
    </div>
  );
}
