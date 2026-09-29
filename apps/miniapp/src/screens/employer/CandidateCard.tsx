// Карточка кандидата (макет c2 Candidates): инициал на цветной обложке, совпадение фразой и навыками,
// под карточкой — решение кнопками или контакт приглашённого.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { Candidate, Internship } from '../../api/types';
import { matchCounts, matchText, type SkillNames } from '../../app/matchText';
import { useMe } from '../../app/me';
import { CopyButton } from '../../components/CopyButton';
import { haptic } from '../../max/bridge';
import { aboutLine, avatarClass, firstName, fullName, initial, paths, phoneText, studyLine, whenText } from './candidate';
import { Avatar, Eq, MatchSkills } from './candidateUi';
import { CheckIcon, CrossIcon, DocIcon, LockIcon } from './icons';
import type { Decision, Pending } from './useDecision';
import { DemoBadge } from '../../components/DemoBadge';

interface CardProps {
  c: Candidate;
  names: SkillNames;
}

/** Тёмная карточка кандидата — как карточка места в ленте студента. */
export function CandidateCard(props: CardProps) {
  const c = props.c;
  return (
    <article className="card cd-card" aria-label={`Кандидат: ${c.status === 'invited' ? fullName(c) : firstName(c)}`}>
      <CandidateCardBody {...props} />
    </article>
  );
}

/** Содержимое карточки: в колоде «Карточки» его оборачивает SwipeDeck, на десктопе — CandidateCard. */
export function CandidateCardBody({ c, names }: CardProps) {
  const name = c.status === 'invited' ? fullName(c) : firstName(c);
  const when = whenText(c.interestedAt);
  return (
    <>
      <div className={`cover ${avatarClass(c.studentId)}`} aria-hidden="true">
        <span className="cv-ring" style={{ width: 300, height: 300, left: -80, top: -90 }} />
        <span className="cd-initial">{initial(c)}</span>
      </div>
      <div className="topchips">
        <span className="row" style={{ gap: 6 }}>
          {c.course ? <span className="gchip">{c.course} курс</span> : null}
          {c.status === 'invited' && <span className="gchip cd-gchip-ok">Приглашение отправлено</span>}
          {c.status === 'declined' && <span className="gchip">Отказ</span>}
          {c.status === 'interested' && when && <span className="gchip">{when}</span>}
        </span>
        <DemoBadge isDemo={c.isDemo} kind="response" onCover />
      </div>
      <div className="shade" />
      <div className="info">
        <div className="col" style={{ gap: 4 }}>
          <h2 className="title cd-name">{name}</h2>
          {aboutLine(c) && <span className="facts">{aboutLine(c)}</span>}
        </div>
        <div className="match">
          <span className="pct num">
            {c.match.score}
            <small>%</small>
          </span>
          <span className="col" style={{ gap: 6 }}>
            <Eq score={c.match.score} height={28} onSurf={false} />
            {matchCounts(c.match) && <span className="facts cd-counts">{matchCounts(c.match)}</span>}
            <span className="lbl cd-basis">по навыкам, которые отметил студент</span>
          </span>
        </div>
        <p className="cd-phrase">{matchText(c.match, names)}</p>
        <MatchSkills match={c.match} names={names} max={8} />
        {c.status === 'interested' && (
          <p className="facts cd-lock">
            <LockIcon />
            Фамилия и телефон откроются после приглашения
          </p>
        )}
      </div>
    </>
  );
}

interface ContactProps {
  c: Candidate;
  place: Internship;
  /** Без строки «вуз · курс · совпадение». */
  compact?: boolean;
  /** Строка-переход к документам практики или следующим шагам. */
  docs?: boolean;
}

/**
 * Контакт приглашённого: фамилия, телефон, «Скопировать номер». Телефона нет — студент им не делился:
 * говорим, как связаться, а если номера нет и у работодателя — что его добавить.
 */
export function ContactBlock({ c, place, compact = false, docs = true }: ContactProps) {
  const navigate = useNavigate();
  const { me } = useMe();
  const phone = useRef<HTMLSpanElement>(null);
  return (
    <div className="surf cd-contact">
      <div className="li cd-contact-main">
        <Avatar c={c} size={44} />
        <div className="col grow">
          <span className="cd-contact-name">{fullName(c)}</span>
          {c.phone ? (
            <span ref={phone} className="num cd-phone">
              {phoneText(c.phone)}
            </span>
          ) : (
            <span className="lbl">
              {me.hasPhone
                ? 'Номер студент не указал — бот отправит ему в чат MAX ваш контакт, ждите сообщения'
                : 'Номера нет ни у вас, ни у студента — добавьте свой номер в профиле, чтобы студент мог связаться'}
            </span>
          )}
        </div>
        {c.phone && <CopyButton text={c.phone} target={phone} label="Скопировать номер" />}
      </div>
      {!compact && (
        <div className="li">
          <span className="lbl grow">
            {[studyLine(c), `совпадение ${c.match.score} %`].filter(Boolean).join(' · ')}
          </span>
          <DemoBadge isDemo={c.isDemo} kind="response" />
        </div>
      )}
      {docs && (
        <button
          type="button"
          className="li cd-docs-link"
          onClick={() => {
            haptic.selection();
            navigate(paths.docs(place.id, c.studentId));
          }}
        >
          <span className="ico g cd-ico" aria-hidden="true">
            <DocIcon />
          </span>
          <span className="col grow">
            <span className="cd-contact-name">{place.type === 'practice' ? 'Документы для практики' : 'Следующие шаги'}</span>
            <span className="lbl">
              {place.type === 'practice' ? 'Договор с вузом, руководитель, задание, отзыв' : 'Задачи, график, оформление, первый день'}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

interface ActionsProps {
  c: Candidate;
  place: Internship;
  pending: Pending | null;
  onDecide: (action: Decision) => void;
}

/** Под карточкой: решение кнопками (свайп решений не отправляет) или контакт приглашённого. */
export function CandidateActions({ c, place, pending, onDecide }: ActionsProps) {
  const mine = pending && pending.candidate.studentId === c.studentId ? pending.action : null;
  const note = useRef<HTMLParagraphElement>(null);
  // Решение ждёт отправки — внизу выезжает тост «Приглашение отправится через…»: поднимаем строку над ним
  // (отступ — scroll-margin-bottom в places.css)
  useEffect(() => {
    if (mine !== null) note.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [mine]);

  if (c.status === 'invited') return <ContactBlock c={c} place={place} />;
  if (c.status === 'declined') {
    return <p className="lbl cd-after">Вы отказали. Студент видит это в «Моих откликах».</p>;
  }
  if (place.status === 'closed') {
    return <p className="lbl cd-after">Набор закрыт. Чтобы пригласить, откройте место снова.</p>;
  }
  const name = firstName(c);
  return (
    <>
      <div className="acts cd-acts">
        <button
          type="button"
          className="fab nope"
          disabled={mine !== null}
          onClick={() => onDecide('decline')}
          aria-label={`Отказать: ${name}`}
        >
          <span className="c">
            <CrossIcon className="ic" />
          </span>
          Отказать
        </button>
        <button
          type="button"
          className="fab like"
          disabled={mine !== null}
          onClick={() => onDecide('invite')}
          aria-label={`Пригласить: ${name}`}
        >
          <span className="c">
            <CheckIcon className="ic" />
          </span>
          Пригласить
        </button>
      </div>
      <p ref={note} className="lbl cd-acts-note">Приглашение открывает контакты для созвона. Это не оффер и ни к чему не обязывает.</p>
    </>
  );
}
