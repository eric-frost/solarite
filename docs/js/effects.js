import {blueprintGlass} from "./glass.js";

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');
const animations = new Set();
const stops = new Set();

/**
 * Track only our finite animations, so a changed motion preference can stop them without touching the editor. */
function animate(element, frames, options) {
  if (reducedMotion.matches || document.hidden)
    return;
  const animation = element.animate(frames, options);
  animations.add(animation);
  const forget = () => animations.delete(animation);
  animation.addEventListener('finish', forget, {once: true});
  animation.addEventListener('cancel', forget, {once: true});
  return animation;
}

function stopMotion() {
  for (const animation of animations)
    animation.cancel();
  for (const stop of stops)
    stop();
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches)
    stopMotion();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden)
    stopMotion();
});

// 1. Give each blue band its own quiet, demand-driven glass surface.
for (const band of document.querySelectorAll(".blueprint"))
  stops.add(blueprintGlass(band, reducedMotion, coarsePointer));

// 2. Trace the existing drafting marks once.  Masks preserve the dashed ring and centrelines while they draw.
document.documentElement.classList.add('effects-ready');
for (const trace of document.querySelectorAll('.sun-trace')) {
  const delay = trace.classList.contains('sun-disc') ? 40
    : trace.classList.contains('sun-ring') ? 140 : 260;
  animate(trace, [{strokeDasharray: '1', strokeDashoffset: '1'},
    {strokeDasharray: '1', strokeDashoffset: '0'}], {
    duration: 760, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards'});
}

// 3. Keep labels and layout fixed while every benchmark bar reveals at the same speed, once per visit.
const chart = document.querySelector('.benchmark');
const chartObserver = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting))
    return;
  chartObserver.disconnect();
  for (const bar of chart.querySelectorAll('.bar i'))
    animate(bar, [{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}], {
      duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)'});
}, {threshold: .15});
if (chart)
  chartObserver.observe(chart);

/**
 * After an edit has been run successfully, sweep a highlight along the arrow from source to result and ring the
 * result card once.  The playground says when a run has finished and whether it failed, so a syntax error or an
 * example that throws gets no applause, and neither do runs nobody typed for, such as the first one and Reset.
 * @param playground {Playground} */
export function previewFeedback(playground) {
  const flow = document.createElement('span');
  flow.className = 'preview-flow';
  flow.setAttribute('aria-hidden', 'true');
  flow.append(document.createElement('i'));
  playground.append(flow);
  let pulse = [];
  stops.add(() => pulse.forEach(animation => animation?.cancel()));
  playground.addEventListener('preview', event => {
    if (!event.detail.edited || event.detail.error)
      return;
    pulse.forEach(animation => animation?.cancel());
    pulse = [
      animate(flow.firstElementChild, [
        {transform: 'translateX(-110%)'}, {transform: 'translateX(110%)'}
      ], {duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)'}),
      animate(playground.preview, [
        {boxShadow: '0 0 0 2px #b8efff00, 0 0 22px #8fe3ff00'},
        {boxShadow: '0 0 0 2px #b8efffee, 0 0 22px #8fe3ff66', offset: .35},
        {boxShadow: '0 0 0 2px #b8efff00, 0 0 22px #8fe3ff00'}
      ], {duration: 800, delay: 250, easing: 'ease-out'})];
  });
}
