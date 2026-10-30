// Яндекс Метрика: стандартный код счётчика, вынесенный в файл (строгий CSP запрещает inline-скрипты).
// Номер счётчика и вебвизор приходят из data-атрибутов, их задают в админке.
(function () {
  var script = document.currentScript;
  var id = Number(script && script.dataset.id);
  if (!id) return;

  window.ym =
    window.ym ||
    function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
  window.ym.l = Date.now();
  window.__metrikaId = id;

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(tag);

  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: script.dataset.webvisor === '1',
  });
})();
