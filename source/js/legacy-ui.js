(() => {
  const menu = document.querySelector('.moon-menu');
  if (!menu) return;

  const toggle = menu.querySelector('.moon-menu__toggle');
  const setOpen = open => {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  menu.querySelectorAll('[data-scroll-target]').forEach(button => {
    button.addEventListener('click', () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = button.dataset.scrollTarget === 'top' ? 0 : document.documentElement.scrollHeight;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      setOpen(false);
    });
  });
})();
