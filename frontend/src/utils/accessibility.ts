const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null
  );
}

export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function createFocusTrap(container: HTMLElement): { activate: () => void; deactivate: () => void } {
  let previousActive: HTMLElement | null = null;
  const handler = (e: KeyboardEvent) => trapFocus(container, e);

  return {
    activate() {
      previousActive = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', handler);
      const focusable = getFocusableElements(container);
      (focusable[0] ?? container).focus();
    },
    deactivate() {
      document.removeEventListener('keydown', handler);
      if (previousActive && typeof previousActive.focus === 'function' && document.contains(previousActive)) {
        previousActive.focus();
      }
    },
  };
}

export type ArrowDirection = 'vertical' | 'horizontal' | 'both';

export interface KeyboardNavOptions {
  direction?: ArrowDirection;
  loop?: boolean;
  onSelect?: (index: number) => void;
  onEscape?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
}

export function handleKeyboardNavigation(
  event: KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  options: KeyboardNavOptions = {}
): number {
  const { direction = 'vertical', loop = true, onSelect, onEscape, onHome, onEnd } = options;
  const isVert = direction === 'vertical' || direction === 'both';
  const isHoriz = direction === 'horizontal' || direction === 'both';
  let next = currentIndex;

  switch (event.key) {
    case 'ArrowDown':
      if (!isVert) break;
      event.preventDefault();
      next = currentIndex + 1;
      if (next >= itemCount) next = loop ? 0 : itemCount - 1;
      break;
    case 'ArrowUp':
      if (!isVert) break;
      event.preventDefault();
      next = currentIndex - 1;
      if (next < 0) next = loop ? itemCount - 1 : 0;
      break;
    case 'ArrowRight':
      if (!isHoriz) break;
      event.preventDefault();
      next = currentIndex + 1;
      if (next >= itemCount) next = loop ? 0 : itemCount - 1;
      break;
    case 'ArrowLeft':
      if (!isHoriz) break;
      event.preventDefault();
      next = currentIndex - 1;
      if (next < 0) next = loop ? itemCount - 1 : 0;
      break;
    case 'Home':
      event.preventDefault();
      if (onHome) { onHome(); return 0; }
      next = 0;
      break;
    case 'End':
      event.preventDefault();
      if (onEnd) { onEnd(); return itemCount - 1; }
      next = itemCount - 1;
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      onSelect?.(currentIndex);
      break;
    case 'Escape':
      onEscape?.();
      break;
    default:
      break;
  }
  return next;
}

let liveRegionEl: HTMLDivElement | null = null;

function getLiveRegion(): HTMLDivElement {
  if (typeof document === 'undefined') {
    return null as unknown as HTMLDivElement;
  }
  if (liveRegionEl && document.body.contains(liveRegionEl)) return liveRegionEl;
  liveRegionEl = document.createElement('div');
  liveRegionEl.id = 'airos-sr-live-region';
  liveRegionEl.setAttribute('aria-live', 'polite');
  liveRegionEl.setAttribute('aria-atomic', 'true');
  liveRegionEl.className = 'sr-only';
  document.body.appendChild(liveRegionEl);
  return liveRegionEl;
}

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const region = getLiveRegion();
  if (!region) return;
  region.setAttribute('aria-live', priority);
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

export function announceAssertive(message: string): void {
  announce(message, 'assertive');
}

export function announcePolite(message: string): void {
  announce(message, 'polite');
}

export function createLiveRegion(
  priority: 'polite' | 'assertive' = 'polite',
  id?: string
): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-live', priority);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
  if (id) el.id = id;
  el.className = 'sr-only';
  if (typeof document !== 'undefined') document.body.appendChild(el);
  return el;
}

export function removeLiveRegion(el: HTMLDivElement): void {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function isReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

export function visuallyHiddenStyles(): React.CSSProperties {
  return {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  };
}
