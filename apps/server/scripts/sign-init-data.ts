// Режим разработки вне MAX: печатает подписанный initData для заголовка X-Max-Init-Data.
// Сервер проверяет его как настоящий, поэтому никаких обходов проверки в коде сервера нет.
//
//   npm run dev:init-data                       # пользователь 100001 «Тест Студент»
//   npm run dev:init-data -- 100002 Работодатель
//   npm run dev:init-data -- 100001 Студент internship_5   # с start_param
import { buildInitData } from '../src/auth/initData.js';

if (process.env.NODE_ENV !== 'development') {
  console.error('Скрипт работает только при NODE_ENV=development');
  process.exit(1);
}
const token = process.env.MAX_BOT_TOKEN;
if (!token) {
  console.error('Нет MAX_BOT_TOKEN в .env');
  process.exit(1);
}

const [id = '100001', lastName = 'Студент', startParam] = process.argv.slice(2);
const fields: Record<string, string> = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: `dev-${Date.now()}`,
  user: JSON.stringify({ id: Number(id), first_name: 'Тест', last_name: lastName, language_code: 'ru' }),
};
if (startParam) fields.start_param = startParam;

console.log(buildInitData(fields, token));
