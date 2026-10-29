// Использование: npm run hash-password -- "новый пароль"
// Без аргумента пароль спрашивается в консоли. Результат вставьте в .env как ADMIN_PASSWORD_HASH.
import readline from 'node:readline/promises';
import argon2 from 'argon2';

const askPassword = async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Новый пароль администратора: ');
  rl.close();
  return answer;
};

const password = process.argv[2] ?? (await askPassword());
if (!password || password.length < 8) {
  console.error('Пароль должен быть не короче 8 символов');
  process.exit(1);
}
const hash = await argon2.hash(password, { type: argon2.argon2id });
console.log(`\nADMIN_PASSWORD_HASH=${hash}\n`);
console.log('Вставьте строку в .env (в кавычках не нужно) и перезапустите сервер.');
