// Обновить сохранённый снимок вакансий «Работа России» (src/import/trudvsemSnapshot.ts):
//   npm run import:snapshot
// Снимок нужен, если API недоступен во время проверки. В него попадают только нужные поля — без контактов.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchPilotVacancies, mapVacancy } from '../src/import/trudvsem.js';

const { vacancies, failed, total, errors } = await fetchPilotVacancies({ timeoutMs: 90_000 });
if (failed) console.log(`Не получены целиком ${failed} из ${total} запросов — снимок неполный, можно запустить ещё раз:`, errors);
if (!vacancies.length) throw new Error('API не вернул ни одной вакансии — снимок не обновлён');
// В снимок — только те, что импортируются: остальные всё равно отбрасываются
const kept = vacancies.filter((v) => mapVacancy(v) !== null);
// Дата по Москве
const takenAt = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

const file = fileURLToPath(new URL('../src/import/trudvsemSnapshot.ts', import.meta.url));
writeFileSync(
  file,
  `// Снимок вакансий «Работа России» на ${takenAt}: запасной источник, если API недоступен.\n` +
    `// Сгенерирован scripts/trudvsem-snapshot.ts (npm run import:snapshot). Контактов нет — только нужные поля.\n` +
    `import type { TrudvsemVacancy } from './trudvsem.js';\n\n` +
    `export const TRUDVSEM_SNAPSHOT: { takenAt: string; vacancies: TrudvsemVacancy[] } = ${JSON.stringify({ takenAt, vacancies: kept }, null, 2)};\n`,
);
console.log(`Снимок: ${kept.length} из ${vacancies.length} вакансий → ${file}`);
