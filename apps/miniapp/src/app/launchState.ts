// Состояния переходов из-за параметра запуска (только типы — в сборку не попадают).

/** Место открыто параметром запуска `internship_<id>` (StartParamGate): QR камерой, кнопка бота. */
export interface LaunchState {
  launch?: boolean;
}

/** Владелец открыл ссылку на своё место и попал к кандидатам (InternshipScreen): плашка «Посмотреть как студент». */
export interface OwnLinkState {
  ownLink?: boolean;
}

/** Место глазами студента, даже своё: сканер в колоде, «Посмотреть как студент», возврат после анкеты. */
export interface AsStudentState {
  asStudent?: boolean;
}
