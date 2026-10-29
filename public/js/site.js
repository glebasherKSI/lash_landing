import { initTabs } from './modules/tabs.js';
import { initEffect } from './modules/effect.js';
import { initLightbox } from './modules/lightbox.js';
import { initBooking } from './modules/booking.js';
import { initMotion } from './modules/motion.js';
import { initFloatCta } from './modules/float-cta.js';
import { mountHeroWindow } from './modules/hero-window.js';

const pageData = JSON.parse(document.getElementById('page-data')?.textContent || '{}');

// Окно в стекле считается до анимаций: интро проявляет уже вырезанное стекло
mountHeroWindow(document.querySelector('[data-hero-window]'));
// Анимации раньше остальных модулей: регистрируют ScrollTrigger, на который те подписываются
initMotion();
const booking = initBooking(pageData);
initTabs();
initEffect(pageData, { onEffectChosen: (slug) => booking?.setEffect(slug) });
initLightbox();
initFloatCta();

// Любая ссылка с data-pick-service/date/time выбирает это в форме записи.
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-pick-service]');
  if (!link || !booking) return;
  booking.pick({
    serviceId: Number(link.dataset.pickService),
    date: link.dataset.pickDate,
    time: link.dataset.pickTime,
  });
});
