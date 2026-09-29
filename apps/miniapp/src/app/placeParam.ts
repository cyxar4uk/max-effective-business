// Разбор id места — отдельно от placeLink: он нужен первому чанку (StartParamGate), а сборка ссылки и разбор
// QR-кода — только экранам разделов.

/** Самый большой id места: столбец в базе — integer. */
export const MAX_ID = 2_147_483_647;

/** id места из строки (адрес экрана, параметр `?place=`): только цифры, от 1 до MAX_ID; иначе null. */
export function parsePlaceId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= MAX_ID ? id : null;
}

/** id места из параметра запуска `internship_<id>`; иначе null. */
export function placeIdFromParam(param: string | null | undefined): number | null {
  const m = /^internship_(\d{1,10})$/.exec(param ?? '');
  return m ? parsePlaceId(m[1]) : null;
}
