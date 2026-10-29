import { animateCount, animateListIn, animateSuccess, animateValueChange } from './motion.js';

const FLASH_DELAY_MS = 650; // дать странице доскроллить до формы

const DATE_LABEL = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const REASON_LABEL = { busy: 'занято', closing: 'не успеем до закрытия' };

const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return DATE_LABEL.format(new Date(Date.UTC(y, m - 1, d)));
};

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const TELEGRAM_RE = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

const validateContact = (value) => {
  const v = value.trim();
  if (!v) return 'Укажите телефон или Telegram';
  if (TELEGRAM_RE.test(v)) return '';
  const digits = v.replace(/\D/g, '');
  if (PHONE_RE.test(v) && digits.length >= 9 && digits.length <= 15) return '';
  return 'Телефон (например +375 29 123-45-67) или Telegram (@username)';
};

/**
 * Форма записи: услуга → дата → время → контакты. Даты и слоты приходят с сервера,
 * сервер же окончательно проверяет слот при отправке.
 */
export const initBooking = ({ services = [], effects = [] }) => {
  const form = document.getElementById('booking-form');
  if (!form) return null;

  const section = document.getElementById('booking');
  const success = document.getElementById('booking-success');
  const datesBox = form.querySelector('[data-dates]');
  const timesBox = form.querySelector('[data-times]');
  const submit = form.querySelector('[data-submit]');
  const formError = form.querySelector('[data-form-error]');
  const summary = Object.fromEntries([...form.querySelectorAll('[data-summary]')].map((el) => [el.dataset.summary, el]));
  const csrf = form.elements._csrf.value;

  const state = { serviceId: null, date: null, time: null };
  let pending = null; // дата/время, которые нужно выбрать после загрузки
  let requestId = 0;

  const service = () => services.find((s) => s.id === state.serviceId);

  const setError = (name, message) => {
    const box = form.querySelector(`[data-error-for="${name}"]`);
    if (box) box.textContent = message || '';
    const input = form.elements[name];
    if (input instanceof HTMLInputElement) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  };

  const clearErrors = () => {
    form.querySelectorAll('[data-error-for]').forEach((el) => (el.textContent = ''));
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.setAttribute('aria-invalid', 'false'));
    formError.textContent = '';
  };

  const setSummary = (key, text) => {
    const el = summary[key];
    if (el.textContent === text) return;
    el.textContent = text;
    animateValueChange(el);
  };

  let shownPrice = null;
  const updateSummary = () => {
    const svc = service();
    const effectSlug = form.elements.effect_slug?.value;
    setSummary('service', svc?.title ?? '—');
    setSummary('effect', effects.find((e) => e.slug === effectSlug)?.name ?? 'подберём вместе');
    setSummary('date', state.date ? formatDate(state.date) : '—');
    setSummary('time', state.time ?? '—');
    if (!svc) {
      summary.price.textContent = '—';
      shownPrice = null;
    } else if (svc.price !== shownPrice) {
      animateCount(summary.price, shownPrice, svc.price, (v) => `${v} BYN`);
      if (shownPrice === null) animateValueChange(summary.price);
      shownPrice = svc.price;
    }
  };

  const placeholder = (box, text) => {
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'bstep__placeholder', textContent: text }));
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.message || 'Не удалось загрузить расписание');
    return data;
  };

  const renderTimes = (slots) => {
    if (!slots.some((s) => s.available)) {
      placeholder(timesBox, 'На этот день свободного времени нет, выберите другую дату');
      return;
    }
    const nodes = slots.map((slot) => {
      const label = document.createElement('label');
      label.className = 'time-option';
      const input = Object.assign(document.createElement('input'), {
        type: 'radio',
        name: 'time',
        value: slot.time,
        disabled: !slot.available,
        checked: slot.available && slot.time === state.time,
      });
      const span = Object.assign(document.createElement('span'), { textContent: slot.time });
      if (!slot.available) {
        span.title = REASON_LABEL[slot.reason] ?? 'недоступно';
        input.setAttribute('aria-label', `${slot.time}, ${span.title}`);
      } else {
        input.setAttribute('aria-label', `${slot.time}, до ${slot.end}`);
      }
      label.append(input, span);
      return label;
    });
    timesBox.replaceChildren(...nodes);
    animateListIn(nodes);
  };

  const loadTimes = async () => {
    if (!state.serviceId || !state.date) return;
    const id = ++requestId;
    placeholder(timesBox, 'Загружаю время…');
    try {
      const data = await fetchJson(`/api/slots?service_id=${state.serviceId}&date=${state.date}`);
      if (id !== requestId) return;
      if (pending?.time && data.slots.some((s) => s.time === pending.time && s.available)) state.time = pending.time;
      else if (!data.slots.some((s) => s.time === state.time && s.available)) state.time = null;
      pending = null;
      renderTimes(data.slots);
      updateSummary();
    } catch (error) {
      if (id === requestId) placeholder(timesBox, error.message);
    }
  };

  const renderDates = (days) => {
    if (!days.length) {
      placeholder(datesBox, 'Свободных дат пока нет. Напишите мастеру, подберём время.');
      return;
    }
    const nodes = days.map((day) => {
      const label = document.createElement('label');
      label.className = 'date-option';
      const input = Object.assign(document.createElement('input'), {
        type: 'radio',
        name: 'date',
        value: day.iso,
        disabled: !day.hasFree,
        checked: day.iso === state.date,
      });
      input.setAttribute('aria-label', `${day.label}, ${day.weekday}${day.hasFree ? '' : ', всё занято'}`);
      const span = document.createElement('span');
      span.innerHTML = '<small></small><b></b><small></small>';
      span.children[0].textContent = day.weekday;
      span.children[1].textContent = day.day;
      span.children[2].textContent = day.month.slice(0, 3);
      label.append(input, span);
      return label;
    });
    datesBox.replaceChildren(...nodes);
    animateListIn(nodes);
  };

  const loadDates = async () => {
    const id = ++requestId;
    placeholder(datesBox, 'Загружаю даты…');
    placeholder(timesBox, 'Сначала выберите дату');
    try {
      const data = await fetchJson(`/api/slots?service_id=${state.serviceId}`);
      if (id !== requestId) return;
      const wanted = pending?.date ?? state.date;
      const day = data.days.find((d) => d.iso === wanted && d.hasFree);
      state.date = day ? day.iso : null;
      if (!state.date) state.time = null;
      renderDates(data.days);
      updateSummary();
      if (state.date) await loadTimes();
      else pending = null;
    } catch (error) {
      if (id === requestId) placeholder(datesBox, error.message);
    }
  };

  form.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name === 'service_id') {
      state.serviceId = Number(value);
      setError('service_id', '');
      loadDates();
    } else if (name === 'date') {
      state.date = value;
      state.time = null;
      setError('date', '');
      loadTimes();
    } else if (name === 'time') {
      state.time = value;
      setError('time', '');
    }
    updateSummary();
  });

  form.elements.client_name.addEventListener('blur', (e) => {
    if (e.target.value) setError('client_name', e.target.value.trim().length < 2 ? 'Минимум 2 буквы' : '');
  });
  form.elements.contact.addEventListener('blur', (e) => {
    if (e.target.value) setError('contact', validateContact(e.target.value));
  });

  const validate = () => {
    const errors = {};
    if (!state.serviceId) errors.service_id = 'Выберите услугу';
    else if (!state.date) errors.date = 'Выберите дату';
    else if (!state.time) errors.time = 'Выберите время';
    if (form.elements.client_name.value.trim().length < 2) errors.client_name = 'Как к вам обращаться? Минимум 2 буквы';
    const contactError = validateContact(form.elements.contact.value);
    if (contactError) errors.contact = contactError;
    return errors;
  };

  const showErrors = (errors) => {
    for (const [name, message] of Object.entries(errors)) setError(name, message);
    const first = Object.keys(errors)[0];
    const target =
      form.elements[first] instanceof RadioNodeList
        ? form.querySelector(`[data-error-for="${first}"]`)?.closest('fieldset')
        : form.elements[first];
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (form.elements[first] instanceof HTMLElement) form.elements[first].focus({ preventScroll: true });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const errors = validate();
    if (Object.keys(errors).length) return showErrors(errors);

    submit.disabled = true;
    submit.textContent = 'Отправляю…';
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          service_id: state.serviceId,
          effect_slug: form.elements.effect_slug?.value ?? '',
          date: state.date,
          time: state.time,
          client_name: form.elements.client_name.value,
          contact: form.elements.contact.value,
          comment: form.elements.comment.value,
          website: form.elements.website.value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return showSuccess(data.booking);
      if (data.errors) showErrors(data.errors);
      formError.textContent = data.message || 'Не получилось отправить заявку. Попробуйте ещё раз.';
      if (res.status === 409) {
        state.time = null;
        await loadDates();
      }
    } catch {
      formError.textContent = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Записаться';
    }
  });

  const showSuccess = (booking) => {
    if (!booking) return;
    success.querySelector('[data-success-text]').textContent =
      `${booking.service}${booking.effect ? `, ${booking.effect.toLowerCase()} эффект` : ''}: ${booking.date}, ${booking.time}. Стоимость ${booking.price} BYN.`;
    animateSuccess(form, success);
    success.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  success.querySelector('[data-booking-again]').addEventListener('click', () => {
    form.reset();
    Object.assign(state, { serviceId: null, date: null, time: null });
    placeholder(datesBox, 'Сначала выберите услугу');
    placeholder(timesBox, 'Сначала выберите дату');
    updateSummary();
    success.hidden = true;
    form.hidden = false;
    form.querySelector('input[name="service_id"]')?.focus();
  });

  updateSummary();

  return {
    pick({ serviceId, date, time }) {
      const radio = form.querySelector(`input[name="service_id"][value="${serviceId}"]`);
      if (!radio) return;
      success.hidden = true;
      form.hidden = false;
      radio.checked = true;
      const card = radio.closest('.option-card');
      card.classList.remove('is-flash');
      setTimeout(() => {
        card.classList.add('is-flash');
        card.addEventListener('animationend', () => card.classList.remove('is-flash'), { once: true });
      }, FLASH_DELAY_MS);
      pending = date ? { date, time } : null;
      if (state.serviceId === serviceId && !pending) return;
      state.serviceId = serviceId;
      setError('service_id', '');
      updateSummary();
      loadDates();
    },
    setEffect(slug) {
      const radio = form.querySelector(`input[name="effect_slug"][value="${slug}"]`);
      if (radio) radio.checked = true;
      updateSummary();
    },
  };
};
