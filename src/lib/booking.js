import { db } from '../db/db.js';
import { getService, getEffectBySlug, listServices } from '../db/repos/catalog.js';
import { getDayHours } from '../db/repos/schedule.js';
import { insertBooking, listBusyIntervals } from '../db/repos/bookings.js';
import { getSettings } from '../db/repos/settings.js';
import { buildDaySlots } from './slots.js';
import { addDays, daysBetween, describeDate, nowMinutes, todayISO } from './time.js';

// Сегодня можно записаться не раньше чем через час от текущего времени.
const SAME_DAY_LEAD_MIN = 60;

export class BookingError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const earliestStartFor = (date) => (date === todayISO() ? nowMinutes() + SAME_DAY_LEAD_MIN : 0);

export const getDaySlots = ({ date, durationMin, stepMin, excludeBookingId }) =>
  buildDaySlots({
    hours: getDayHours(date),
    durationMin,
    stepMin,
    busy: listBusyIntervals(date, { excludeId: excludeBookingId }),
    earliestStart: earliestStartFor(date),
  });

/** Рабочие дни в горизонте записи; выходные пропускаются. */
export const getBookingDays = ({ durationMin, settings = getSettings() }) => {
  const today = todayISO();
  const days = [];
  for (let i = 0; i < settings.booking_horizon_days; i++) {
    const date = addDays(today, i);
    if (!getDayHours(date)) continue;
    const slots = getDaySlots({ date, durationMin, stepMin: settings.slot_step_min });
    days.push({ ...describeDate(date), hasFree: slots.some((s) => s.available) });
  }
  return days;
};

/** Услуга, по которой считается «Ближайшее окно»: самая короткая полноценная процедура (не снятие). */
const referenceService = () => {
  const services = listServices({ activeOnly: true });
  const full = services.filter((s) => s.duration_min >= 60);
  const pool = full.length ? full : services;
  return pool.reduce((min, s) => (!min || s.duration_min < min.duration_min ? s : min), null);
};

export const findNearestWindow = (settings = getSettings()) => {
  const service = referenceService();
  if (!service) return null;
  const today = todayISO();
  for (let i = 0; i < settings.booking_horizon_days; i++) {
    const date = addDays(today, i);
    const slot = getDaySlots({ date, durationMin: service.duration_min, stepMin: settings.slot_step_min }).find(
      (s) => s.available,
    );
    if (slot) return { date, start: slot.start, ...describeDate(date), daysFromToday: i, serviceId: service.id };
  }
  return null;
};

/**
 * Проверяет слот и создаёт запись в одной IMMEDIATE-транзакции:
 * два параллельных запроса на одно время не пройдут оба.
 */
export const createBooking = (input, { source = 'site', ip = null, force = false } = {}) => {
  const settings = getSettings();
  const service = getService(input.service_id);
  if (!service || (!service.is_active && source === 'site')) {
    throw new BookingError('service_unavailable', 'Эта услуга сейчас недоступна для записи', 422);
  }

  let effect = null;
  if (input.effect_slug) {
    effect = getEffectBySlug(input.effect_slug);
    if (!effect) throw new BookingError('effect_unknown', 'Выбранный эффект не найден', 422);
  }

  if (source === 'site') {
    const offset = daysBetween(todayISO(), input.date);
    if (offset < 0 || offset >= settings.booking_horizon_days) {
      throw new BookingError('date_out_of_range', 'На эту дату запись пока не открыта', 422);
    }
  }

  const durationMin = service.duration_min;
  const start = input.start_min;

  return db
    .transaction(() => {
      if (!force) {
        const hours = getDayHours(input.date);
        if (!hours) throw new BookingError('day_off', 'В этот день мастер не работает');
        const slot = getDaySlots({ date: input.date, durationMin, stepMin: settings.slot_step_min }).find(
          (s) => s.start === start,
        );
        if (!slot) throw new BookingError('slot_invalid', 'Это время недоступно, выберите другое');
        if (!slot.available) {
          throw new BookingError(
            slot.reason === 'busy' ? 'slot_taken' : 'slot_too_late',
            slot.reason === 'busy'
              ? 'Это время только что заняли, выберите другое'
              : 'Процедура не успеет закончиться до конца рабочего дня',
          );
        }
      }

      const id = insertBooking({
        service_id: service.id,
        service_title: service.title,
        price_byn: service.price_byn,
        duration_min: durationMin,
        effect_slug: effect?.slug ?? null,
        effect_name: effect?.name ?? null,
        date: input.date,
        start_min: start,
        end_min: start + durationMin,
        client_name: input.client_name,
        contact: input.contact,
        comment: input.comment ?? '',
        status: input.status ?? 'new',
        source,
        ip,
      });
      return { id, service, effect, date: input.date, start, end: start + durationMin };
    })
    .immediate();
};
