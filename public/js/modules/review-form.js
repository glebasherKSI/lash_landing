// Форма «Оставить отзыв»: раскрывается в блоке отзывов, отправляет отзыв на проверку мастеру.

export const initReviewForm = () => {
  const root = document.querySelector('[data-review]');
  if (!root) return;
  const form = root.querySelector('[data-review-form]');
  const open = root.querySelector('[data-review-open]');
  const done = root.querySelector('[data-review-done]');
  const submit = form.querySelector('[data-review-submit]');
  const formError = form.querySelector('[data-form-error]');
  const intro = root.querySelector('[data-review-intro]');

  open.addEventListener('click', () => {
    form.hidden = false;
    open.hidden = true;
    open.setAttribute('aria-expanded', 'true');
    form.elements.author.focus();
  });

  // поле поправили — его ошибка уходит
  form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (!name) return;
    form.querySelector(`[data-error-for="${name}"]`)?.replaceChildren();
    form.querySelectorAll(`[name="${name}"]`).forEach((el) => el.removeAttribute('aria-invalid'));
  });

  const clearErrors = () => {
    form.querySelectorAll('[data-error-for]').forEach((el) => (el.textContent = ''));
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    formError.textContent = '';
  };

  const showErrors = (errors = {}) => {
    let first = null;
    for (const [name, message] of Object.entries(errors)) {
      const box = form.querySelector(`[data-error-for="${name}"]`);
      if (box) box.textContent = message;
      const field = form.elements[name];
      if (field instanceof HTMLElement) field.setAttribute('aria-invalid', 'true');
      first ??= field instanceof RadioNodeList ? field[0] : field;
    }
    first?.focus?.();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    submit.disabled = true;
    submit.textContent = 'Отправляю…';
    try {
      const data = Object.fromEntries(new FormData(form));
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': form.elements._csrf.value },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({ ok: false, message: 'Сервер ответил ошибкой. Попробуйте позже.' }));
      if (!res.ok || result.ok === false) {
        showErrors(result.errors);
        formError.textContent = result.errors ? '' : result.message || 'Не получилось отправить отзыв';
        return;
      }
      form.hidden = true;
      intro.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      if (window.ym && window.__metrikaId) window.ym(window.__metrikaId, 'reachGoal', 'review');
    } catch {
      formError.textContent = 'Нет связи. Проверьте интернет и попробуйте ещё раз.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отправить отзыв';
    }
  });
};
