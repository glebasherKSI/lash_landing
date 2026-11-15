// Белорусский номер телефона: одно правило для сервера (проверка), сайта и админки (маска, подсказки).
// В базе всегда хранится «+375291234567».

export const PHONE_PREFIX = '+375';
// Коды мобильных операторов: A1 (29/44), МТС (29/33), life:) (25)
export const OPERATOR_CODES = ['25', '29', '33', '44'];
const NATIONAL_LENGTH = 9;

// Цифры без кода страны; понимает «+375 …», «8 029 …», «80291234567».
// Номер не может начинаться с 8 или 0 (коды операторов 25–44), это остатки «8 0…»
const nationalDigits = (input) =>
  String(input ?? '')
    .replace(/\D/g, '')
    .replace(/^375/, '')
    .replace(/^8/, '')
    .replace(/^0/, '');

/** Для маски: цифры номера без кода страны, не больше 9. */
export const phoneDigits = (input) => nationalDigits(input).slice(0, NATIONAL_LENGTH);

// Лишние цифры — ошибка, а не повод обрезать: иначе получится чужой, но «правильный» номер
export const isValidPhone = (input) => {
  const digits = nationalDigits(input);
  return digits.length === NATIONAL_LENGTH && OPERATOR_CODES.includes(digits.slice(0, 2));
};

/** «+375291234567» или null, если номер не белорусский мобильный. */
export const normalizePhone = (input) => (isValidPhone(input) ? PHONE_PREFIX + phoneDigits(input) : null);

/** Маска для поля без кода страны: «(29) 123-45-67», по мере ввода. */
export const formatNational = (input) => {
  const d = phoneDigits(input);
  if (!d) return '';
  let out = `(${d.slice(0, 2)}`;
  if (d.length >= 2) out += ')';
  if (d.length > 2) out += ` ${d.slice(2, 5)}`;
  if (d.length > 5) out += `-${d.slice(5, 7)}`;
  if (d.length > 7) out += `-${d.slice(7, 9)}`;
  return out;
};

/** Для показа: «+375 (29) 123-45-67»; старые контакты (например, ник Telegram) — как есть. */
export const formatPhone = (stored) =>
  /^\+375\d{9}$/.test(stored ?? '') ? `${PHONE_PREFIX} ${formatNational(stored)}` : (stored ?? '');

export const PHONE_ERROR = 'Номер белорусского оператора: код и 7 цифр, например (29) 123-45-67';

/** Маска на поле ввода: только цифры, формат «(29) 123-45-67». */
export const attachPhoneMask = (input) => {
  const apply = () => {
    const formatted = formatNational(input.value);
    if (input.value !== formatted) input.value = formatted;
  };
  input.addEventListener('input', apply);
  apply();
};
