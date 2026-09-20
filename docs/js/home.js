import Playground from './Playground.js';
import {previewFeedback} from './effects.js';

// The homepage's live example: one playground, two tabs, and a Reset button.
const host = document.querySelector('#playground-host');
const resetButton = document.querySelector('#reset-demo');
const tabs = [...document.querySelectorAll('.example-tabs [role=tab]')];
const languages = {js: 'javascript', jsx: 'jsx'};

// The heading's word swap is CSS, except for its blur.  Motion blur should streak only in the direction of travel, and
// CSS's blur() is the same in every direction, so two SVG filters do it and this sets their vertical strength while a
// swap is running: the ending leaving blurs as it goes, and the ending arriving sharpens as it lands.  The pointer
// events are on the word itself, so nothing else in the heading starts a swap.
const swapWord = document.querySelector('.hero h1 .swap');
const blurs = ['#rise-out', '#rise-in'].map(id => document.querySelector(`${id} feGaussianBlur`));
if (swapWord && blurs.every(Boolean) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const duration = 200, strength = 11; // The duration matches the rise in home.css.
  let progress = 0, target = 0, last = 0;
  const step = time => {
    progress += Math.sign(target - progress) * Math.min(Math.abs(target - progress), (time - last) / duration);
    last = time;
    blurs[0].setAttribute('stdDeviation', `0 ${(progress * strength).toFixed(2)}`);
    blurs[1].setAttribute('stdDeviation', `0 ${((1 - progress) * strength).toFixed(2)}`);
    if (progress !== target)
      requestAnimationFrame(step);
    else
      swapWord.classList.remove('swapping');
  };
  const swapTo = value => {
    target = value;
    if (swapWord.classList.contains('swapping'))
      return;
    swapWord.classList.add('swapping');
    last = performance.now();
    requestAnimationFrame(step);
  };
  swapWord.addEventListener('pointerenter', () => swapTo(1));
  swapWord.addEventListener('pointerleave', () => swapTo(0));
}

// Tab lists take the arrow keys, Home, and End, and only the selected tab is in the Tab order, which is what a
// keyboard user expects of anything with role="tablist".
for (const list of document.querySelectorAll('[role=tablist]')) {
  const buttons = [...list.querySelectorAll('[role=tab]')];
  const roving = () => buttons.forEach(button => button.tabIndex = button.getAttribute('aria-selected') === 'true' ? 0 : -1);
  roving();
  list.addEventListener('click', () => setTimeout(roving));
  list.addEventListener('keydown', event => {
    const move = {ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity}[event.key];
    if (!move)
      return;
    event.preventDefault();
    const index = Math.max(0, Math.min(buttons.length - 1, buttons.indexOf(document.activeElement) + move));
    buttons[index].focus();
    buttons[index].click();
  });
}

// The install strip in the closing band: a tab picks the line, and the button copies it.  The CDN address has no
// version in it, so it serves whatever is published and never names a release that isn't on npm yet.
const installLine = document.querySelector('#install-line');
const installTabs = [...document.querySelectorAll('.install [role=tab]')];
for (const button of installTabs)
  button.addEventListener('click', () => {
    installLine.textContent = button.dataset.line;
    for (const other of installTabs)
      other.setAttribute('aria-selected', other === button);
  });
document.querySelector('#copy-install').addEventListener('click', async event => {
  const button = event.currentTarget, mark = button.firstElementChild;

  // The clipboard is only available on a secure page.  Anywhere else the line is selected, ready for Ctrl+C.
  if (navigator.clipboard)
    await navigator.clipboard.writeText(installLine.textContent);
  else
    getSelection().selectAllChildren(installLine);
  mark.textContent = '✓';
  setTimeout(() => mark.textContent = '⧉', 1500);
});

try {
  // 1. Load both versions of the example.  Each file is a working module where it sits, so the JavaScript one
  //    imports Solarite by a path relative to its own folder; previews resolve paths against the site root, so the
  //    path a reader would write there is shown instead.
  const load = async file => {
    const response = await fetch(new URL(`../examples/${file}`, import.meta.url));
    if (!response.ok)
      throw new Error('The example could not be loaded.');
    return (await response.text()).trimEnd();
  };
  const originals = {
    js: (await load('shopping-list.js')).replace("'../../dist/Solarite.min.js'", "'./dist/Solarite.min.js'"),
    jsx: await load('shopping-list.jsx')};
  const edited = {...originals};
  let tab = 'js';

  // 2. The result card stops growing at the height of the source card and scrolls from there.
  const stylesheet = new URL('../media/home-demo.css', import.meta.url);
  const playground = new Playground({value: originals.js, width: 57, maxHeight: 560, capPreview: true, lazy: true,
    prefix: `<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${stylesheet}">`});
  host.replaceChildren(playground);
  previewFeedback(playground);

  // 3. The playground replaces its preview frame on every run, so accessible names are reapplied as it changes.
  const label = () => {
    for (const frame of host.querySelectorAll('iframe'))
      frame.title = 'Shopping list built with Solarite';
    host.querySelector('.cm-content')?.setAttribute('aria-label', 'Shopping list source code');
  };
  new MutationObserver(label).observe(host, {childList: true, subtree: true});
  label();

  // 4. Tabs keep their own edits, and Reset restores only the tab that is open.
  const show = (name, text) => {
    edited[tab] = playground.source;
    tab = name;
    playground.language = languages[name];
    playground.source = text ?? edited[name];
    for (const button of tabs)
      button.setAttribute('aria-selected', button.dataset.tab === name);
    playground.run(true);
  };
  for (const button of tabs) {
    button.disabled = false;
    button.addEventListener('click', () => show(button.dataset.tab));
  }
  resetButton.disabled = false;
  resetButton.addEventListener('click', () => show(tab, originals[tab]));
} catch (error) {
  host.textContent = `${error.message}  The documentation has more working examples.`;
  host.classList.add('loading-note');
}
