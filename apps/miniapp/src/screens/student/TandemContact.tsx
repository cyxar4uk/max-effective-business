// Контакт после «Это тандем!» — одни и те же кнопки и тексты на экране «Это тандем!» и в «Откликах».
import type { RefObject } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../../app/me';
import { CopyButton } from '../../components/CopyButton';

/** Телефон компании: «Позвонить» и «Скопировать номер» — tel: в MAX может не открыться, скопировать можно всегда. */
export function PhoneActions({ phone, target, className }: { phone: string; target: RefObject<HTMLElement | null>; className: string }) {
  return (
    <div className={`row ${className}`}>
      <a className="btn sm pri" href={`tel:${phone}`}>
        Позвонить
      </a>
      <CopyButton text={phone} target={target} label="Скопировать номер" />
    </div>
  );
}

/**
 * Компания номер не указала. Номер студента у неё есть (он открывается после приглашения) — ждать звонка.
 * Номера нет ни у кого — шаг номера онбординга и обратно на back.
 */
export function NoPhoneNote({ back }: { back: string }) {
  const { me } = useMe();
  const navigate = useNavigate();
  if (me.hasPhone) {
    return <span className="lbl">Компания не указала номер. Ваш номер у неё есть — ждите звонка в течение двух дней</span>;
  }
  return (
    <>
      <span className="lbl">Номера нет ни у вас, ни у компании</span>
      <button type="button" className="btn sm pri tc-share" onClick={() => navigate(`/consent?next=${back}`)}>
        Поделиться номером
      </button>
    </>
  );
}
