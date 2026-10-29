import { swapPanels } from './motion.js';

/** Вкладки категорий услуг: ARIA tabs со стрелками и Home/End, подчёркивание переезжает к выбранной. */
export const initTabs = () => {
  const tablist = document.querySelector('.tabs[role="tablist"]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const indicator = tablist.querySelector('.tabs__indicator');
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  const moveIndicator = () => {
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    if (!indicator || !active) return;
    indicator.style.setProperty('--ix', `${active.offsetLeft}px`);
    indicator.style.setProperty('--iw', String(active.offsetWidth));
    // при переносе вкладок на вторую строку линия встаёт под нужную строку
    indicator.style.top = `${active.offsetTop + active.offsetHeight}px`;
    indicator.style.bottom = 'auto';
  };

  if (indicator) {
    tablist.classList.add('tabs--js');
    moveIndicator();
    window.addEventListener('resize', moveIndicator);
    document.fonts?.ready.then(moveIndicator);
  }

  const select = (tab, { focus = false } = {}) => {
    const current = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    if (tab === current) return;
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
    if (focus) tab.focus();
    moveIndicator();
    swapPanels(current && panelOf(current), panelOf(tab));
  };

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(tabs[(moves[event.key] + tabs.length) % tabs.length], { focus: true });
  });
};
