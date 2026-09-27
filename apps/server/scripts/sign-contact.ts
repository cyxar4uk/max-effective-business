// Режим разработки вне MAX: печатает тело для POST /api/me/phone, как его вернул бы WebApp.requestContact().
//   npm run dev:contact -- 100001 +79990000000
import { signContact } from '../src/auth/contact.js';

if (process.env.NODE_ENV !== 'development') {
  console.error('Скрипт работает только при NODE_ENV=development');
  process.exit(1);
}
const token = process.env.MAX_BOT_TOKEN;
if (!token) {
  console.error('Нет MAX_BOT_TOKEN в .env');
  process.exit(1);
}
const [id = '100001', phone = '+79990000000'] = process.argv.slice(2);
const contact = { phone, authDate: String(Math.floor(Date.now() / 1000)) };
console.log(JSON.stringify({ ...contact, hash: signContact(contact, Number(id), token) }));
