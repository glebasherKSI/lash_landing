// Подключается в <head> синхронно: прячет элементы до старта анимаций, чтобы не было вспышки.
// Если анимации не запустились (ошибка, нет GSAP), через 2,5 с всё показывается как есть.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  root.classList.add('motion');
  setTimeout(function () {
    if (!window.__motionReady) root.classList.remove('motion');
  }, 2500);
})();
