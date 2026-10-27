const WIDTH_KEY = 'inside.layout.chatWidth.v1';

/** Local presentation preference only; never changes video source or chat state. */
function initPanelResize(layout) {
  const handle = document.querySelector('#panelResizer');
  const panel = document.querySelector('#companionPanel');
  const shell = layout;
  if (!handle || !panel || !shell) return;
  const desktop = matchMedia('(min-width: 801px)');
  let preferred = null, drag = null, frame = 0;
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved > 0) preferred = saved;
  } catch { /* Storage is optional. */ }
  const enabled = () => desktop.matches;
  const bounds = () => ({min:320, max:Math.max(320, Math.min(760, layout.clientWidth - parseFloat(getComputedStyle(layout).paddingLeft) - parseFloat(getComputedStyle(layout).paddingRight) - 360 - parseFloat(getComputedStyle(layout).columnGap)))});
  const clamp = width => Math.round(Math.max(bounds().min, Math.min(bounds().max, width)));
  const persist = () => {
    try {
      if (preferred == null) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(preferred));
    } catch { /* Keep the in-session width when storage is denied. */ }
  };
  const apply = width => {
    layout.style.setProperty('--chat-width', `${clamp(width)}px`);
    layout.style.setProperty('--resizer-chat-width', `${clamp(width)}px`);
    handle.setAttribute('aria-valuenow', String(clamp(width)));
    handle.setAttribute('aria-valuetext', `${clamp(width)} pixels, chat width`);
  };
  const sync = () => {
    handle.tabIndex = enabled() ? 0 : -1;
    handle.setAttribute('aria-valuemin', String(bounds().min));
    handle.setAttribute('aria-valuemax', String(bounds().max));
    if (preferred != null) apply(preferred);
    else {
      layout.style.removeProperty('--chat-width');
      layout.style.setProperty('--resizer-chat-width', `${panel.getBoundingClientRect().width}px`);
      handle.setAttribute('aria-valuenow', String(Math.round(panel.getBoundingClientRect().width)));
      handle.removeAttribute('aria-valuetext');
    }
  };
  const finish = cancelled => {
    if (!drag) return;
    cancelAnimationFrame(frame);
    const previous = drag.previous, width = drag.width, pointerId = drag.pointerId;
    drag = null;
    layout.classList.remove('is-resizing');
    document.body.classList.remove('is-panel-resizing');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    preferred = cancelled ? previous : clamp(width);
    sync();
    if (!cancelled) persist();
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !enabled() || drag) return;
    event.preventDefault();
    const width = panel.getBoundingClientRect().width;
    drag = {pointerId:event.pointerId, startX:event.clientX, startWidth:width, width, previous:preferred};
    layout.classList.add('is-resizing');
    document.body.classList.add('is-panel-resizing');
    handle.focus({preventScroll:true});
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.width = clamp(drag.startWidth + drag.startX - event.clientX);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (drag) apply(drag.width); });
  });
  handle.addEventListener('pointerup', event => { if (drag?.pointerId === event.pointerId) finish(false); });
  handle.addEventListener('pointercancel', () => finish(true));
  handle.addEventListener('lostpointercapture', () => finish(true));
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('keydown', event => {
    if (drag && event.key === 'Escape') { event.preventDefault(); finish(true); }
  });
  handle.addEventListener('keydown', event => {
    if (!enabled() || drag) return;
    const current = panel.getBoundingClientRect().width;
    const delta = event.shiftKey ? 48 : 16;
    const width = {ArrowLeft:current + delta, ArrowRight:current - delta, Home:bounds().min, End:bounds().max}[event.key];
    if (width == null) return;
    event.preventDefault();
    preferred = clamp(width);
    apply(preferred);
    persist();
  });
  handle.addEventListener('dblclick', () => {
    if (!enabled()) return;
    preferred = null;
    sync();
    persist();
  });
  new ResizeObserver(() => { finish(true); sync(); }).observe(layout);
  const modeChanged = () => {
    if (!enabled()) finish(true);
    if (!drag) sync();
  };
  new MutationObserver(modeChanged).observe(shell, {attributes:true, attributeFilter:['class']});
  new MutationObserver(modeChanged).observe(layout, {attributes:true, attributeFilter:['class']});
  desktop.addEventListener('change', modeChanged);
  sync();
}

initPanelResize(document.querySelector(".workspace"));
