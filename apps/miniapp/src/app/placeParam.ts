// Разбор параметра запуска `internship_<id>` — отдельно от placeLink: он нужен первому чанку (StartParamGate),
// а сборка ссылки и разбор QR-кода — только экранам разделов.

/** Самый большой id места: столбец в базе — integer. */
const MAX_ID = 2_147_483_647;

/** id места из параметра запуска `internship_<id>`; иначе null. */
export function placeIdFromParam(param: string | null | undefined): number | null {
  const m = /^internship_(\d{1,10})$/.exec(param ?? '');
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}
