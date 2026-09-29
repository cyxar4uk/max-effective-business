import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import { LEGAL } from '../../app/about';
import { useMe } from '../../app/me';
import { DocLink } from '../../components/DocLink';
import { haptic, requestContact, type MaxContact } from '../../max/bridge';
import { fade, sheet, useReduced } from '../../motion/springs';
import './onboarding.css';

/** Куда вести после онбординга: только свой путь, без внешних адресов и без петли на /consent. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/consent')) return '/';
  return raw;
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Не получилось. Повторите попытку.');

type Step = 'consent' | 'phone' | 'done';

function Orb() {
  return (
    <div className="ob-orb" aria-hidden="true">
      <div className="orb">
        <i className="a" />
        <i className="b" />
      </div>
    </div>
  );
}

function Item({ icon, title, text, accent }: { icon: 'user' | 'doc' | 'lock'; title: string; text: string; accent?: boolean }) {
  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
    doc: (
      <>
        <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2.5" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      </>
    ),
  };
  return (
    <div className="li">
      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ color: accent ? 'var(--em)' : 'var(--st)' }}>
        {paths[icon]}
      </svg>
      <div className="col grow">
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span className="lbl">{text}</span>
      </div>
    </div>
  );
}

/**
 * Онбординг, общий для обеих ролей: `/consent?next=<путь>`.
 * Шаги: согласие на обработку ПД → номер телефона, если его нет (можно пропустить) → переход на `next`.
 * Ответы сервера в формате /api/me — ими обновляем пользователя без перезагрузки.
 */
export function ConsentScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { me, setMe } = useMe();
  const next = safeNext(params.get('next'));
  const employer = next.startsWith('/employer');
  const lastStep = employer ? 'профиль компании' : 'анкета';

  const reduced = useReduced();
  const [step, setStep] = useState<Step>(() => (!me.consent ? 'consent' : !me.hasPhone ? 'phone' : 'done'));
  const [firstStep] = useState(step);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === 'done') return <Navigate to={next} replace />;

  const giveConsent = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.consent();
      setMe(updated);
      haptic.notify('success');
      setStep(updated.hasPhone ? 'done' : 'phone');
    } catch (err) {
      haptic.notify('error');
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const sharePhone = async () => {
    setBusy(true);
    setError(null);
    let contact: MaxContact;
    try {
      contact = await requestContact();
    } catch {
      // Пользователь отказался или мы не в MAX — номер не обязателен, идём дальше
      setBusy(false);
      setStep('done');
      return;
    }
    try {
      // Тело — ровно то, что вернул requestContact(): сервер проверяет подпись MAX
      const updated = await api.phone(contact);
      setMe(updated);
      haptic.notify('success');
      setStep('done');
    } catch (err) {
      haptic.notify('error');
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  let content: ReactNode;
  if (step === 'consent') {
    content = (
      <>
        <span className="lbl">Шаг 1 из 3 · потом номер и {lastStep}</span>
        <h1 id="ob-title" className="d m0 ob-h">
          Пара формальностей
        </h1>
        <p className="m0 ob-text">
          {employer
            ? 'Чтобы опубликовать место и передать студенту ваш контакт после приглашения, нужно согласие на обработку данных.'
            : 'Чтобы подбирать места и передать ваш контакт компании после взаимного интереса, нужно согласие на обработку данных.'}
        </p>
        <div className="surf ob-list">
          {employer ? (
            <>
              <Item icon="user" title="Имя из MAX" text="Студенты видят его после приглашения" />
              <Item icon="doc" title="Профиль компании" text="Название, город, контактное лицо" />
              <Item icon="lock" title="Телефон" text="Откроется студенту только после приглашения" accent />
            </>
          ) : (
            <>
              <Item icon="user" title="Имя из MAX" text="Компания видит его в отклике" />
              <Item icon="doc" title="Анкета" text="Вуз, курс, направление, город, навыки" />
              <Item icon="lock" title="Фамилия и телефон" text="Откроются компании только после приглашения" accent />
            </>
          )}
        </div>
        {/* Полный текст — public/legal/consent.html, версия совпадает с CONSENT_VERSION */}
        <DocLink link={LEGAL.consent} className="lbl ob-doc">
          Текст согласия · версия от 27.09.2026
        </DocLink>
        {error && (
          <p className="ob-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn pri" onClick={giveConsent} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Даю согласие'}
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate('/', { replace: true })} disabled={busy}>
          Не сейчас
        </button>
      </>
    );
  } else {
    content = (
      <>
        <span className="lbl">Шаг 2 из 3 · потом {lastStep}</span>
        <h1 id="ob-title" className="d m0 ob-h">
          Номер телефона
        </h1>
        <p className="m0 ob-text">
          {employer
            ? 'Студент увидит номер только после вашего приглашения — так ему будет проще связаться с вами.'
            : 'Компания увидит номер только после приглашения — так вам смогут позвонить. MAX передаст его в один тап.'}
        </p>
        {error && (
          <p className="ob-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn pri" onClick={sharePhone} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Поделиться номером'}
        </button>
        {/* Не блокируем: окно MAX с номером можно закрыть без ответа, и тогда запрос повиснет */}
        <button type="button" className="btn ghost" onClick={() => setStep('done')}>
          Пропустить
        </button>
      </>
    );
  }

  // Скрим проявляется, шторка выезжает снизу пружиной; шаги внутри сменяются проявлением.
  // prefers-reduced-motion — только короткое проявление без сдвигов
  return (
    <main className="ob">
      <Orb />
      <motion.div
        className="ob-dim"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? fade : { ...fade, duration: 0.25 }}
      />
      <motion.section
        className="sheet ob-sheet"
        role="dialog"
        aria-labelledby="ob-title"
        initial={reduced ? { opacity: 0 } : { y: '100%' }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        transition={reduced ? fade : sheet}
      >
        <span className="grab" aria-hidden="true" />
        <motion.div
          key={step}
          className="ob-step"
          initial={step === firstStep ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...fade, duration: 0.2 }}
        >
          {content}
        </motion.div>
      </motion.section>
    </main>
  );
}
