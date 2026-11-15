import { buildLashLines } from './lash-geometry.js';
import { mountHeroWindow } from './modules/hero-window.js';
import { parseContact } from './modules/contact-parse.js';
import { attachPhoneMask, formatNational, formatPhone, normalizePhone, phoneDigits } from './modules/phone.js';

const csrf = document.body.dataset.csrf;
const toastEl = document.querySelector('.toast');
const confirmDialog = document.getElementById('confirm-dialog');
const FLASH_KEY = 'admin-flash';

/* ---------- Уведомления ---------- */

let toastTimer;
const toast = (message, kind = 'ok') => {
  if (!toastEl || !message) return;
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), kind === 'error' ? 6000 : 2800);
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Короткий отклик на Android (на iPhone вибрация из браузера недоступна)
const haptic = () => navigator.vibrate?.(12);

/** Шторка уезжает вниз и только потом закрывается. */
const closeSheet = (dialog) => {
  if (!dialog?.open) return;
  if (reducedMotion() || !dialog.classList.contains('admin-dialog')) return dialog.close();
  dialog.classList.add('is-closing');
  dialog.addEventListener(
    'animationend',
    () => {
      dialog.classList.remove('is-closing');
      dialog.close();
    },
    { once: true },
  );
};

/** Строка схлопывается по высоте, затем удаляется — список не прыгает. */
const removeRow = (row) => {
  if (!row) return;
  if (reducedMotion()) return row.remove();
  row.style.height = `${row.offsetHeight}px`;
  row.getBoundingClientRect(); // зафиксировать высоту перед переходом
  row.classList.add('is-removing');
  setTimeout(() => row.remove(), 320);
};

const reloadWithFlash = (message) => {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {}
  location.reload();
};

const redirectWithFlash = (url, message) => {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {}
  location.href = url;
};

try {
  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash) {
    sessionStorage.removeItem(FLASH_KEY);
    toast(flash);
  }
} catch {}

/* ---------- Запросы ---------- */

const post = async (url, body) => {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-csrf-token': csrf, accept: 'application/json', ...(isForm ? {} : { 'content-type': 'application/x-www-form-urlencoded' }) },
    body: isForm ? body : new URLSearchParams(body ?? {}),
  });
  const data = await res.json().catch(() => ({ ok: false, message: 'Сервер ответил ошибкой. Обновите страницу.' }));
  if (res.status === 401) {
    toast('Сессия истекла, войдите снова', 'error');
    setTimeout(() => (location.href = '/admin/login'), 1200);
  }
  return { ok: res.ok && data.ok !== false, ...data };
};

const postJsonList = (url, ids) => {
  const body = new URLSearchParams();
  ids.forEach((id) => body.append('ids[]', id));
  return post(url, body);
};

const confirmAction = (text, okLabel = 'Удалить') =>
  new Promise((resolve) => {
    if (!confirmDialog) return resolve(window.confirm(text));
    confirmDialog.querySelector('#confirm-text').textContent = text;
    confirmDialog.querySelector('[value="ok"]').textContent = okLabel;
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
  });

/* ---------- Формы data-api ---------- */

// «why_items.0.title» → «why_items[0][title]»
const pathToName = (path) => path.split('.').map((p, i) => (i === 0 ? p : `[${p}]`)).join('');

const clearFormErrors = (form) => {
  form.querySelectorAll('[data-error-for]').forEach((el) => (el.textContent = ''));
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  const formError = form.querySelector('[data-form-error]');
  if (formError) formError.textContent = '';
};

const showFormErrors = (form, errors = {}) => {
  let first = null;
  for (const [path, message] of Object.entries(errors)) {
    const parts = path.split('.');
    let box = null;
    for (let n = parts.length; n > 0 && !box; n--) box = form.querySelector(`[data-error-for="${parts.slice(0, n).join('.')}"]`);
    const input = form.querySelector(`[name="${pathToName(path)}"]`) ?? form.querySelector(`[name="${parts[0]}"]`);
    input?.setAttribute('aria-invalid', 'true');
    // ошибка в свёрнутом разделе: раскрываем его
    (input ?? box)?.closest('details')?.setAttribute('open', '');
    if (box) box.textContent = message;
    first ??= input ?? box;
  }
  first?.focus?.();
  first?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
};

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-api]');
  if (!form) return;
  event.preventDefault();
  clearFormErrors(form);
  const submit = form.querySelector('[type="submit"]');
  submit?.setAttribute('disabled', '');
  try {
    const result = await post(form.action, new URLSearchParams(new FormData(form)));
    if (!result.ok) {
      showFormErrors(form, result.errors);
      const formError = form.querySelector('[data-form-error]');
      if (formError) formError.textContent = result.message;
      toast(result.message || 'Не сохранилось', 'error');
      return;
    }
    form.dispatchEvent(new CustomEvent('api:success', { detail: result }));
    if (form.hasAttribute('data-reset')) form.reset();
    if (form.hasAttribute('data-reload') || result.reload) return reloadWithFlash(result.message);
    toast(result.message || 'Сохранено');
    closeSheet(form.closest('dialog'));
  } catch {
    toast('Нет связи с сервером', 'error');
  } finally {
    submit?.removeAttribute('disabled');
  }
});

/* ---------- Кнопки data-api-post ---------- */

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-api-post]');
  if (!button) return;
  if (button.dataset.confirm && !(await confirmAction(button.dataset.confirm, button.dataset.confirmOk))) return;
  button.disabled = true;
  const result = await post(button.dataset.apiPost, button.dataset.body ? JSON.parse(button.dataset.body) : {});
  button.disabled = false;
  if (!result.ok) return toast(result.message, 'error');
  if (result.redirect) return redirectWithFlash(result.redirect, result.message);
  if (button.hasAttribute('data-reload') || result.reload) return reloadWithFlash(result.message);
  if (button.hasAttribute('data-remove-row')) {
    haptic();
    removeRow(button.closest('[data-row]'));
  }
  toast(result.message);
});

/* ---------- Переключатели и статусы ---------- */

document.addEventListener('change', async (event) => {
  const toggle = event.target.closest('[data-toggle-url]');
  if (toggle) {
    const result = await post(toggle.dataset.toggleUrl);
    if (!result.ok) {
      toggle.checked = !toggle.checked;
      return toast(result.message, 'error');
    }
    toggle.closest('[data-row]')?.classList.toggle('is-off', !result.is_active);
    return toast(result.message);
  }

});

/* ---------- Записи: быстрые кнопки статуса ---------- */

const STATUS_LABELS = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Выполнена' };

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-status-to]');
  if (!button) return;
  const card = button.closest('[data-booking]');
  if (button.dataset.confirm && !(await confirmAction(button.dataset.confirm, button.dataset.confirmOk))) return;
  const status = button.dataset.statusTo;
  button.disabled = true;
  const result = await post(`/admin/api/bookings/${card.dataset.booking}/status`, { status });
  button.disabled = false;
  if (!result.ok) return toast(result.message, 'error');
  card.className = card.className.replace(/status-\w+/, `status-${status}`);
  card.querySelector('[data-status-pill]').textContent = STATUS_LABELS[status];
  haptic();
  card.classList.remove('is-changed');
  card.getBoundingClientRect(); // перезапуск анимации при повторной смене
  card.classList.add('is-changed');
  toast(result.message);
});

/* ---------- Диалоги ---------- */

document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-dialog]');
  if (opener) document.getElementById(opener.dataset.openDialog)?.showModal();
  if (event.target.closest('[data-close-dialog]')) closeSheet(event.target.closest('dialog'));
  // нажатие на затемнение вокруг шторки
  if (event.target.matches('dialog.admin-dialog')) closeSheet(event.target);
});

// Esc и системный «назад» на Android закрывают шторку с той же анимацией
document.addEventListener('cancel', (event) => {
  if (!event.target.matches?.('dialog.admin-dialog')) return;
  event.preventDefault();
  closeSheet(event.target);
});

// Редактор услуги: одна форма для создания и правки
const serviceDialog = document.getElementById('service-dialog');
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-edit-service]');
  if (!trigger || !serviceDialog) return;
  const form = serviceDialog.querySelector('form');
  const data = trigger.dataset.editService ? JSON.parse(trigger.dataset.editService) : null;
  form.reset();
  clearFormErrors(form);
  form.action = data ? `/admin/api/services/${data.id}` : '/admin/api/services';
  serviceDialog.querySelector('#service-dialog-title').textContent = data ? 'Изменить услугу' : 'Новая услуга';
  // Удаление доступно только при правке существующей услуги
  const deleteButton = serviceDialog.querySelector('[data-service-delete]');
  deleteButton.hidden = !data;
  if (data) {
    deleteButton.dataset.apiPost = `/admin/api/services/${data.id}/delete`;
    deleteButton.dataset.confirm = `Удалить услугу «${data.title}»? Прошлые записи на неё сохранятся.`;
  }
  const values = data ?? { gradient: 'gray', tile: '1x1', is_active: true, is_popular: false };
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements[key];
    if (!field) continue;
    if (field instanceof RadioNodeList) field.value = value;
    else if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  }
  serviceDialog.showModal();
  // на телефоне фокус на поле сразу открывает клавиатуру — только для новой услуги
  if (!data) form.elements.title.focus();
});

/* ---------- Режим «Порядок»: стрелки вместо переключателей ---------- */

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-reorder-toggle]');
  if (!toggle) return;
  const scope = toggle.closest('[data-reorder-scope]');
  const on = !scope.classList.contains('is-reordering');
  scope.classList.toggle('is-reordering', on);
  toggle.setAttribute('aria-pressed', String(on));
  toggle.querySelector('[data-reorder-label]').textContent = on ? 'Готово' : 'Порядок';
  scope.querySelector('[data-reorder-hint]')?.toggleAttribute('hidden', !on);
});

/* ---------- Сортировка: перетаскивание и кнопки ---------- */

const saveOrder = async (list) => {
  const ids = [...list.querySelectorAll(':scope > [data-id]')].map((el) => el.dataset.id);
  const result = await postJsonList(list.dataset.sortable, ids);
  toast(result.ok ? result.message : result.message || 'Порядок не сохранился', result.ok ? 'ok' : 'error');
};

document.querySelectorAll('[data-sortable]').forEach((list) => {
  let dragged = null;

  for (const item of list.querySelectorAll(':scope > [data-id]')) {
    const handle = item.querySelector('.drag-handle');
    handle?.addEventListener('pointerdown', () => (item.draggable = true));
    item.addEventListener('dragstart', (e) => {
      dragged = item;
      item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      item.draggable = false;
      if (dragged) saveOrder(list);
      dragged = null;
    });
  }

  list.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const target = e.target.closest('[data-id]');
    if (!target || target === dragged || target.parentElement !== list) return;
    const rect = target.getBoundingClientRect();
    const horizontal = getComputedStyle(list).display === 'grid' && rect.width < list.clientWidth * 0.6;
    const after = horizontal ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
    target[after ? 'after' : 'before'](dragged);
  });

  list.addEventListener('click', (e) => {
    const move = e.target.closest('[data-move]');
    if (!move) return;
    const item = move.closest('[data-id]');
    const sibling = move.dataset.move === 'up' ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;
    if (move.dataset.move === 'up') sibling.before(item);
    else sibling.after(item);
    move.focus();
    saveOrder(list);
  });
});

/* ---------- Загрузка фото ---------- */

const dropzone = document.querySelector('form[data-upload]');
if (dropzone) {
  const input = dropzone.querySelector('input[type="file"]');
  const status = dropzone.querySelector('[data-upload-status]');

  const upload = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!images.length) return toast('Выберите файлы изображений', 'error');
    const body = new FormData();
    images.forEach((f) => body.append('photos', f));
    status.textContent = `Загружаю ${images.length} фото…`;
    dropzone.classList.add('is-busy');
    try {
      const result = await post(dropzone.action, body);
      status.textContent = result.message;
      if (result.reload) return reloadWithFlash(result.message);
      if (!result.ok) toast(result.message, 'error');
    } catch {
      status.textContent = 'Не удалось загрузить. Проверьте интернет.';
    } finally {
      dropzone.classList.remove('is-busy');
      input.value = '';
    }
  };

  input.addEventListener('change', () => upload(input.files));
  ['dragenter', 'dragover'].forEach((type) =>
    dropzone.addEventListener(type, (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dropzone.classList.add('is-over');
    }),
  );
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove('is-over')));
  dropzone.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    upload(e.dataTransfer.files);
  });
}

/* ---------- Расписание ---------- */

document.querySelectorAll('[data-day]').forEach((day) => {
  const toggle = day.querySelector('[data-day-toggle]');
  const sync = () => day.classList.toggle('is-off', !toggle.checked);
  toggle.addEventListener('change', sync);
  sync();
});

const excOff = document.querySelector('[data-exc-off]');
if (excOff) {
  const hours = document.querySelector('[data-exc-hours]');
  const sync = () => (hours.hidden = excOff.checked);
  excOff.addEventListener('change', sync);
  sync();
}

/* ---------- Акцентный цвет ---------- */

const accent = document.getElementById('st-accent');
if (accent) {
  const label = document.querySelector('[data-color-value]');
  const apply = () => {
    label.textContent = accent.value.toUpperCase();
    document.documentElement.style.setProperty('--accent', accent.value);
  };
  accent.addEventListener('input', apply);
  document.querySelector('[data-color-reset]')?.addEventListener('click', (e) => {
    accent.value = e.currentTarget.dataset.colorReset;
    apply();
  });
}

/* ---------- Живое превью эффекта ---------- */

document.querySelectorAll('[data-effect-form]').forEach((form) => {
  const inputs = [...form.querySelectorAll('[data-profile]')];
  const paths = [...form.querySelectorAll('[data-lash-line]')];
  const redraw = () => {
    const profile = inputs.map((i) => Math.min(18, Math.max(4, Number(i.value) || 4)));
    buildLashLines(profile).forEach((line, i) => paths[i]?.setAttribute('d', line.d));
  };
  inputs.forEach((i) => i.addEventListener('input', redraw));
  form.addEventListener('reset', () => setTimeout(redraw));
});

/* ---------- «Окно-глаз»: точка фокуса фото первого экрана ---------- */

const focusForm = document.querySelector('[data-focus-form]');
if (focusForm) {
  const picker = focusForm.querySelector('[data-focus-picker]');
  const mark = focusForm.querySelector('[data-focus-mark]');
  const widthInput = focusForm.querySelector('[data-focus-w]');
  const widthValue = focusForm.querySelector('[data-focus-w-value]');
  const preview = mountHeroWindow(focusForm.querySelector('[data-focus-preview]'));
  const clamp = (v) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));
  let focus = {
    fx: Number(focusForm.elements.focus_x.value),
    fy: Number(focusForm.elements.focus_y.value),
    ww: Number(widthInput.value),
  };

  const render = () => {
    mark.style.left = `${focus.fx}%`;
    mark.style.top = `${focus.fy}%`;
    focusForm.elements.focus_x.value = focus.fx;
    focusForm.elements.focus_y.value = focus.fy;
    widthValue.textContent = Math.round(focus.ww);
    picker.setAttribute('aria-valuetext', `${Math.round(focus.fx)}% по горизонтали, ${Math.round(focus.fy)}% по вертикали`);
    preview?.update(focus);
  };

  const pickAt = (e) => {
    const r = picker.getBoundingClientRect();
    focus = { ...focus, fx: clamp(((e.clientX - r.left) / r.width) * 100), fy: clamp(((e.clientY - r.top) / r.height) * 100) };
    render();
  };

  picker.addEventListener('pointerdown', (e) => {
    picker.setPointerCapture(e.pointerId);
    pickAt(e);
  });
  picker.addEventListener('pointermove', (e) => {
    if (picker.hasPointerCapture(e.pointerId)) pickAt(e);
  });
  picker.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!(e.key in moves)) return;
    e.preventDefault();
    focus = { ...focus, fx: clamp(focus.fx + moves[e.key][0]), fy: clamp(focus.fy + moves[e.key][1]) };
    render();
  });
  widthInput.addEventListener('input', () => {
    focus = { ...focus, ww: Number(widthInput.value) };
    render();
  });
  render();
}

// Диалог, который нужно открыть сразу (например, настройка окна после смены фото первого экрана)
const autoDialog = document.querySelector('dialog[data-autoopen]');
if (autoDialog) {
  autoDialog.showModal();
  history.replaceState(null, '', location.pathname);
}

/* ---------- Адрес и карта: живая ссылка «Проверить» ---------- */

const mapPreview = document.querySelector('[data-map-preview]');
if (mapPreview) {
  const form = mapPreview.closest('form');
  const update = () => {
    const custom = form.elements.map_url.value.trim();
    const query = [form.elements.city.value, form.elements.address.value].map((v) => v.trim()).filter(Boolean).join(', ');
    mapPreview.href = custom || (query ? `https://yandex.by/maps/?text=${encodeURIComponent(query)}` : '#');
  };
  ['city', 'address', 'map_url'].forEach((name) => form.elements[name].addEventListener('input', update));
}

/* ---------- Шторка фото в «Работах» ---------- */

const workSheet = document.getElementById('work-sheet');
if (workSheet) {
  const form = workSheet.querySelector('[data-work-form]');
  const img = workSheet.querySelector('[data-work-img]');
  const heroButton = workSheet.querySelector('[data-work-hero]');
  const focusButton = workSheet.querySelector('[data-work-focus]');
  const deleteButton = workSheet.querySelector('[data-work-delete]');
  const list = document.querySelector('.works-admin');
  let tile = null;
  let work = null;

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-work]');
    if (!opener) return;
    work = JSON.parse(opener.dataset.work);
    tile = opener.closest('[data-id]');
    clearFormErrors(form);
    form.action = `/admin/api/works/${work.id}`;
    form.elements.caption.value = work.caption;
    img.src = work.thumb;
    heroButton.hidden = work.isHero;
    focusButton.hidden = !work.isHero;
    // «На первый экран» обрабатывает общий data-api-post: сервер вернёт переход к настройке окна
    heroButton.dataset.apiPost = `/admin/api/works/${work.id}/hero`;
    workSheet.showModal();
  });

  // Подпись сохранилась: обновляем плитку без перезагрузки
  form.addEventListener('api:success', () => {
    const caption = form.elements.caption.value.trim();
    work = { ...work, caption };
    tile.querySelector('[data-caption]').textContent = caption || 'без подписи';
    tile.querySelector('[data-work]').dataset.work = JSON.stringify(work);
  });

  focusButton.addEventListener('click', () => closeSheet(workSheet));

  deleteButton.addEventListener('click', async () => {
    if (!(await confirmAction(deleteButton.dataset.confirm))) return;
    const result = await post(`/admin/api/works/${work.id}/delete`);
    if (!result.ok) return toast(result.message, 'error');
    closeSheet(workSheet);
    haptic();
    removeRow(tile);
    toast(result.message);
  });

  workSheet.querySelectorAll('[data-work-move]').forEach((button) =>
    button.addEventListener('click', () => {
      const up = button.dataset.workMove === 'up';
      const sibling = up ? tile.previousElementSibling : tile.nextElementSibling;
      if (!sibling) return toast(up ? 'Это фото уже первое' : 'Это фото уже последнее');
      if (up) sibling.before(tile);
      else sibling.after(tile);
      saveOrder(list);
    }),
  );
}

/* ---------- Telegram: поиск групп, тест, статус ---------- */

const telegramForm = document.querySelector('[data-telegram-form]');
if (telegramForm) {
  const tokenInput = telegramForm.querySelector('[data-tg-token]');
  const chatInput = telegramForm.querySelector('[data-tg-chat]');
  const titleInput = telegramForm.querySelector('[data-tg-title]');
  const titleHint = telegramForm.querySelector('[data-tg-title-hint]');
  const chatList = telegramForm.querySelector('[data-tg-chats]');
  const findButton = telegramForm.querySelector('[data-tg-find]');
  const testButton = telegramForm.querySelector('[data-tg-test]');
  const stateTag = telegramForm.closest('details').querySelector('[data-tg-state]');

  const credentials = () => ({ telegram_bot_token: tokenInput.value.trim(), telegram_chat_id: chatInput.value.trim() });

  // Запрос с кнопки: блокируем её на время и показываем ошибки у полей
  const run = async (button, url, body) => {
    clearFormErrors(telegramForm);
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Подождите…';
    try {
      const result = await post(url, body);
      if (!result.ok) {
        showFormErrors(telegramForm, result.errors);
        telegramForm.querySelector('[data-form-error]').textContent = result.message;
        toast(result.message, 'error');
        return null;
      }
      return result;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  // Ручной ввод ID: название группы больше не соответствует
  chatInput.addEventListener('input', () => {
    titleInput.value = '';
    titleHint.textContent = '';
  });

  findButton.addEventListener('click', async () => {
    const result = await run(findButton, '/admin/api/integrations/telegram/chats', credentials());
    if (!result) return;
    toast(result.message);
    chatList.replaceChildren(
      ...result.chats.map((chat) => {
        const li = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'chat-pick';
        pick.innerHTML = '<span class="chat-pick__title"></span><span class="chat-pick__id"></span>';
        pick.querySelector('.chat-pick__title').textContent = chat.title;
        pick.querySelector('.chat-pick__id').textContent = chat.id;
        pick.addEventListener('click', () => {
          chatInput.value = chat.id;
          titleInput.value = chat.title;
          titleHint.textContent = `Выбрана группа «${chat.title}». Нажмите «Сохранить».`;
          chatList.hidden = true;
        });
        li.append(pick);
        return li;
      }),
    );
    chatList.hidden = !result.chats.length;
  });

  testButton.addEventListener('click', async () => {
    const result = await run(testButton, '/admin/api/integrations/telegram/test', credentials());
    if (result) toast(result.message);
  });

  telegramForm.addEventListener('api:success', ({ detail }) => {
    const enabled = telegramForm.elements.telegram_enabled.checked;
    if (detail.tokenMask) tokenInput.placeholder = `сохранён ${detail.tokenMask} — вставьте новый, чтобы заменить`;
    tokenInput.value = '';
    stateTag.textContent = enabled ? 'включено' : 'выключено';
    stateTag.classList.toggle('tag--accent', enabled);
  });
}

/* ---------- Режим приложения ---------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});
}

// Приложение на главном экране не перезагружается само: при возврате через минуту и больше обновляем записи
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return (hiddenAt = Date.now());
  const away = hiddenAt && Date.now() - hiddenAt > 60_000;
  if (away && location.pathname === '/admin/bookings' && !document.querySelector('dialog[open]')) location.reload();
});

/* ---------- Записи: вкладки без перезагрузки ---------- */

const bookingFilters = document.querySelector('[data-bookings-filters]');
if (bookingFilters) {
  const list = document.querySelector('[data-bookings-list]');
  const segmented = bookingFilters.querySelector('[data-segmented]');
  const thumb = segmented.querySelector('.segmented__thumb');
  let controller = null;

  // Подложка под выбранным периодом переезжает к нажатой вкладке
  const moveThumb = () => {
    const active = segmented.querySelector('[aria-current="true"]');
    if (!active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  };
  segmented.classList.add('has-thumb');
  // Замер при загрузке может прийтись на недогруженный шрифт или анимацию появления (iPhone):
  // пересчитываем при любом изменении размеров вкладок и после загрузки шрифтов
  const thumbObserver = new ResizeObserver(moveThumb);
  segmented.querySelectorAll('a').forEach((a) => thumbObserver.observe(a));
  document.fonts?.ready.then(moveThumb);

  const setCurrent = (group, link) => group.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a === link)));

  bookingFilters.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    if (link.getAttribute('aria-current') === 'true') return;

    setCurrent(link.parentElement, link);
    moveThumb();
    link.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    list.classList.add('is-leaving');

    controller?.abort();
    controller = new AbortController();
    try {
      const [html] = await Promise.all([
        fetch(link.href, { signal: controller.signal }).then((r) => r.text()),
        new Promise((r) => setTimeout(r, 140)), // дать старому списку плавно уйти
      ]);
      const next = new DOMParser().parseFromString(html, 'text/html');
      list.innerHTML = next.querySelector('[data-bookings-list]').innerHTML;
      // ссылки вкладок зависят друг от друга (период ↔ статус) — берём свежие адреса и счётчики
      const fresh = next.querySelectorAll('[data-bookings-filters] a');
      bookingFilters.querySelectorAll('a').forEach((a, i) => {
        if (!fresh[i]) return;
        a.href = fresh[i].getAttribute('href');
        a.innerHTML = fresh[i].innerHTML;
      });
      history.replaceState(null, '', link.href);
      list.classList.remove('is-leaving');
    } catch (error) {
      if (error.name !== 'AbortError') location.href = link.href;
    }
  });
}

/* ---------- Быстрая запись: услуга → дата → время → клиентка ---------- */

const quickForm = document.querySelector('[data-quick-form]');
if (quickForm) {
  const dialog = quickForm.closest('dialog');
  const dateStep = quickForm.querySelector('[data-quick-step="date"]');
  const timeStep = quickForm.querySelector('[data-quick-step="time"]');
  const datesBox = quickForm.querySelector('[data-quick-dates]');
  const timesBox = quickForm.querySelector('[data-quick-times]');
  const custom = quickForm.querySelector('[data-quick-custom]');
  const customTime = quickForm.querySelector('[data-quick-custom-time]');
  const summary = quickForm.querySelector('[data-quick-summary]');
  const submit = quickForm.querySelector('[data-quick-submit]');
  const nameInput = quickForm.elements.client_name;
  const contactInput = quickForm.elements.contact;
  const DAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  let state = {};
  let request = 0;

  const placeholder = (box, text) => {
    box.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    box.append(p);
  };

  const sync = () => {
    quickForm.elements.date.value = state.date ?? '';
    quickForm.elements.time.value = state.time ?? '';
    quickForm.elements.force.value = state.force ? 'on' : '';
    const ready = state.serviceId && state.date && state.time;
    submit.disabled = !ready;
    if (ready) summary.textContent = `${state.title} · ${state.dateLabel}, ${state.time}${state.force ? ' (вне сетки)' : `–${state.end}`}`;
    else if (state.serviceId) summary.textContent = `${state.title} · выберите ${state.date ? 'время' : 'дату'}`;
    else summary.textContent = 'Выберите услугу и время';
  };

  // Кнопка-переключатель (radio) для лент даты и времени; текст только из наших данных
  const option = (name, value, html, { disabled = false, checked = false, className = '' } = {}) => {
    const label = document.createElement('label');
    label.className = `quick-chip ${className}`;
    label.innerHTML = `<input type="radio" name="${name}" value="${value}"${disabled ? ' disabled' : ''}${checked ? ' checked' : ''}><span>${html}</span>`;
    return label;
  };

  const loadTimes = async () => {
    const id = ++request;
    timeStep.disabled = false;
    placeholder(timesBox, 'Загружаю время…');
    const res = await fetch(`/admin/api/slots?service_id=${state.serviceId}&date=${state.date}`).then((r) => r.json());
    if (id !== request) return;
    if (!res.working) return placeholder(timesBox, 'Выходной. Если нужно, откройте «Другое время».');
    if (!res.slots.some((s) => s.available)) return placeholder(timesBox, 'Свободного времени нет. Можно выбрать «Другое время».');
    timesBox.innerHTML = '';
    for (const slot of res.slots) {
      const chip = option('slot', slot.time, slot.time, { disabled: !slot.available, className: slot.available ? '' : 'is-busy' });
      chip.dataset.end = slot.end;
      timesBox.append(chip);
    }
  };

  const loadDays = async () => {
    const id = ++request;
    dateStep.disabled = false;
    placeholder(datesBox, 'Загружаю даты…');
    const res = await fetch(`/admin/api/slots?service_id=${state.serviceId}`).then((r) => r.json());
    if (id !== request) return;
    datesBox.innerHTML = '';
    // ближайшая дата со свободным окном выбирается сама — на одно касание меньше
    const keep = res.days.find((d) => d.iso === state.date && d.free);
    const pick = keep ?? res.days.find((d) => d.free) ?? res.days[0];
    let picked = null;
    for (const day of res.days) {
      const top = day.offset === 0 ? 'сегодня' : day.offset === 1 ? 'завтра' : DAY_NAMES[new Date(`${day.iso}T12:00`).getDay()];
      const bottom = !day.working ? 'выходной' : day.free ? `${day.free} окон` : 'занято';
      const chip = option('date_pick', day.iso, `<small>${top}</small><b>${day.day}</b><small>${bottom}</small>`, {
        checked: day === pick,
        className: !day.working ? 'is-off' : day.free ? '' : 'is-full',
      });
      chip.dataset.label = day.offset < 2 ? top : `${top}, ${day.label}`;
      if (day === pick) picked = chip;
      datesBox.append(chip);
    }
    state = { ...state, date: pick.iso, dateLabel: picked.dataset.label, time: null, force: false };
    picked.scrollIntoView({ inline: 'center', block: 'nearest' });
    sync();
    loadTimes();
    // показать сразу дату и сетку времени: следующий шаг без прокрутки руками
    dateStep.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  quickForm.addEventListener('change', (event) => {
    const input = event.target;
    if (input.name === 'service_id') {
      state = { ...state, serviceId: input.value, title: input.dataset.title, time: null, force: false };
      sync();
      loadDays();
    } else if (input.name === 'date_pick') {
      state = { ...state, date: input.value, dateLabel: input.closest('label').dataset.label, time: null, force: false };
      sync();
      loadTimes();
    } else if (input.name === 'slot') {
      state = { ...state, time: input.value, end: input.closest('label').dataset.end, force: false };
      custom.open = false;
      customTime.value = '';
      haptic();
      sync();
      // дальше нужно имя: фокус сразу открывает клавиатуру
      if (!nameInput.value) nameInput.focus();
    }
  });

  customTime.addEventListener('input', () => {
    if (!customTime.value) return;
    timesBox.querySelectorAll('input:checked').forEach((i) => (i.checked = false));
    state = { ...state, time: customTime.value, force: true };
    sync();
  });

  attachPhoneMask(contactInput);

  // Номер показывается в маске «(29) 123-45-67»; не белорусский номер не подставляем
  const fillContact = ({ name, contact }) => {
    if (name) nameInput.value = name;
    if (contact && normalizePhone(contact)) contactInput.value = formatNational(contact);
    else if (contact) toast('Номер не белорусский — введите его вручную', 'error');
    hideSuggest();
    haptic();
  };

  // Вставка «Аня +375 29 …» в любое из двух полей раскладывает имя и телефон
  [nameInput, contactInput].forEach((input) =>
    input.addEventListener('paste', (event) => {
      const parsed = parseContact(event.clipboardData?.getData('text'));
      if (!parsed.name || !normalizePhone(parsed.contact)) return;
      event.preventDefault();
      fillContact(parsed);
    }),
  );

  /* Подсказки: сохранённые клиентки по имени или номеру */
  const suggest = quickForm.querySelector('[data-client-suggest]');
  const SUGGEST_LIMIT = 5;
  let clients = null;

  const hideSuggest = () => (suggest.hidden = true);

  const showSuggest = async () => {
    clients ??= await fetch('/admin/api/clients').then((r) => r.json()).then((r) => r.clients).catch(() => []);
    const name = nameInput.value.trim().toLowerCase();
    const digits = phoneDigits(contactInput.value);
    // пустые поля — последние клиентки; иначе совпадение по имени или по цифрам номера
    const found = clients
      .filter((c) => (!name || c.name.toLowerCase().includes(name)) && (!digits || c.contact.slice(4).includes(digits)))
      .slice(0, SUGGEST_LIMIT);
    const exact = found.length === 1 && found[0].name === nameInput.value.trim() && normalizePhone(contactInput.value) === found[0].contact;
    if (!found.length || exact) return hideSuggest();
    suggest.replaceChildren(
      ...found.map((c) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'client-suggest__item';
        const visits = c.visits === 1 ? '1 визит' : c.visits < 5 ? `${c.visits} визита` : `${c.visits} визитов`;
        button.append(
          Object.assign(document.createElement('span'), { className: 'client-suggest__name', textContent: c.name }),
          Object.assign(document.createElement('span'), { className: 'client-suggest__meta', textContent: `${formatPhone(c.contact)} · ${visits}` }),
        );
        button.addEventListener('click', () => fillContact({ name: c.name, contact: c.contact }));
        li.append(button);
        return li;
      }),
    );
    suggest.hidden = false;
  };

  [nameInput, contactInput].forEach((input) => {
    input.addEventListener('focus', showSuggest);
    input.addEventListener('input', showSuggest);
  });
  // нажатие на подсказку не должно уводить фокус и закрывать список раньше времени
  suggest.addEventListener('pointerdown', (event) => event.preventDefault());
  quickForm.addEventListener('focusout', () => setTimeout(() => {
    if (![nameInput, contactInput].includes(document.activeElement)) hideSuggest();
  }, 0));

  const pasteButton = quickForm.querySelector('[data-quick-paste]');
  if (navigator.clipboard?.readText) {
    pasteButton.hidden = false;
    pasteButton.addEventListener('click', async () => {
      try {
        const parsed = parseContact(await navigator.clipboard.readText());
        if (!parsed.name && !parsed.contact) return toast('В буфере нет имени или телефона', 'error');
        fillContact(parsed);
      } catch {
        toast('Нет доступа к буферу. Вставьте текст в поле вручную', 'error');
      }
    });
  }

  // Выбор из записной книжки — Chrome на Android (на iPhone браузер такого не умеет)
  const contactsButton = quickForm.querySelector('[data-quick-contacts]');
  if ('contacts' in navigator && 'ContactsManager' in window) {
    contactsButton.hidden = false;
    contactsButton.addEventListener('click', async () => {
      try {
        const [picked] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (picked) fillContact({ name: picked.name?.[0] ?? '', contact: picked.tel?.[0] ?? '' });
      } catch {
        toast('Не удалось открыть контакты', 'error');
      }
    });
  }

  // Каждое открытие — с чистого листа
  dialog.addEventListener('close', () => {
    quickForm.reset();
    hideSuggest();
    clients = null; // при следующем открытии — свежий список, с только что записанными
    state = {};
    dateStep.disabled = true;
    timeStep.disabled = true;
    placeholder(datesBox, 'Сначала выберите услугу');
    placeholder(timesBox, 'Выберите дату');
    sync();
  });
}

/* ---------- Аналитика: модуль грузится только на её странице ---------- */

if (document.querySelector('[data-analytics]')) import('./modules/analytics.js').then((m) => m.initAnalytics());
if (document.querySelector('[data-story]')) import('./modules/story.js').then((m) => m.initStory());
