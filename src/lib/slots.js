/**
 * Чистый расчёт сетки слотов на один день.
 * Слот доступен, если услуга целиком помещается до конца рабочего дня
 * и не пересекается ни с одной активной записью.
 */
export const buildDaySlots = ({ hours, durationMin, stepMin, busy, earliestStart = 0 }) => {
  if (!hours) return [];
  const slots = [];
  for (let start = hours.start; start < hours.end; start += stepMin) {
    if (start < earliestStart) continue;
    const end = start + durationMin;
    const overlaps = busy.some((b) => start < b.end && b.start < end);
    const fits = end <= hours.end;
    slots.push({ start, end, available: fits && !overlaps, reason: overlaps ? 'busy' : fits ? null : 'closing' });
  }
  return slots;
};

export const intervalsOverlap = (a, b) => a.start < b.end && b.start < a.end;
