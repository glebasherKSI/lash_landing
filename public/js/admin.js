import { buildLashLines } from './lash-geometry.js';
import { mountHeroWindow } from './modules/hero-window.js';

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
    if (form.hasAttribute('data-reset')) form.reset();
    if (form.hasAttribute('data-reload') || result.reload) return reloadWithFlash(result.message);
    toast(result.message || 'Сохранено');
    form.closest('dialog')?.close();
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
  if (button.hasAttribute('data-remove-row')) button.closest('[data-row]')?.remove();
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

  const status = event.target.closest('[data-status-url]');
  if (status) {
    const result = await post(status.dataset.statusUrl, { status: status.value });
    if (!result.ok) return toast(result.message, 'error');
    const row = status.closest('[data-row]');
    row.className = row.className.replace(/status-\w+/, `status-${status.value}`);
    toast(result.message);
  }
});

/* ---------- Диалоги ---------- */

document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-dialog]');
  if (opener) document.getElementById(opener.dataset.openDialog)?.showModal();
  if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog')?.close();
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
  const values = data ?? { gradient: 'gray', tile: '1x1', is_active: true, is_popular: false };
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements[key];
    if (!field) continue;
    if (field instanceof RadioNodeList) field.value = value;
    else if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  }
  serviceDialog.showModal();
  form.elements.title.focus();
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
