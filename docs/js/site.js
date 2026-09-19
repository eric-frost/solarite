// Shared by the homepage and the documentation.  A classic script, loaded in the head, so the theme is set before
// anything is drawn; a module would run after the first paint and flash the light theme at someone who chose dark.
(() => {
  const key = 'solarite-theme';
  const html = document.documentElement;

  // The site opens light unless the visitor chose dark with the moon button on an earlier visit.  The system's
  // dark setting is deliberately ignored for now.  `dark` is the attribute the code editor watches for its colours.
  html.toggleAttribute('dark', localStorage.getItem(key) === 'dark');

  addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('#dark-toggle');
    button.setAttribute('aria-pressed', html.hasAttribute('dark'));
    button.addEventListener('click', () => {
      const dark = html.toggleAttribute('dark');
      localStorage.setItem(key, dark ? 'dark' : 'light');
      button.setAttribute('aria-pressed', dark);

      // Previews are separate documents; new ones pick the theme up from the playground as they are made.
      for (const frame of document.querySelectorAll('play-ground iframe'))
        frame.contentDocument?.documentElement.toggleAttribute('dark', dark);
    });
  });
})();
