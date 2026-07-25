// A self-contained, dependency-free error overlay rendered INTO the sandbox
// document — the same role Vite's error overlay plays. Shown for compile /
// transpile failures and runtime exceptions so the preview never silently
// unmounts to a white screen while the error only lives in the console.
//
// The overlay is deliberately not styled by the app (it must render even when
// the app's own CSS failed to build) and never throws: every public function
// swallows its own errors so reporting can never mask the original failure.

export interface OverlayFrame {
  functionName?: string | null;
  fileName?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
  // Original (source-mapped) location when available.
  _originalFileName?: string | null;
  _originalLineNumber?: number | null;
  _originalColumnNumber?: number | null;
}

export interface OverlayError {
  title?: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
  stack?: string;
  frames?: OverlayFrame[];
}

const OVERLAY_ID = 'sandpack-error-overlay';

const STYLES = `
  :host { all: initial; }
  .sp-ovr-wrap {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(16,16,20,0.92);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #e6e6eb; overflow: auto; padding: 24px; box-sizing: border-box;
  }
  .sp-ovr-card {
    max-width: 880px; margin: 0 auto;
    background: #1c1c22; border: 1px solid #34343e; border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0,0,0,0.5); overflow: hidden;
  }
  .sp-ovr-head {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px; background: #26262e; border-bottom: 1px solid #34343e;
  }
  .sp-ovr-badge {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    background: #e5484d; color: #fff; font-size: 14px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .sp-ovr-title { font-size: 14px; font-weight: 600; color: #f3f3f5; flex: 1; }
  .sp-ovr-dismiss {
    flex: none; background: none; border: none; color: #9a9aa4; cursor: pointer;
    font-size: 18px; line-height: 1; padding: 4px 6px; border-radius: 6px;
  }
  .sp-ovr-dismiss:hover { background: #34343e; color: #fff; }
  .sp-ovr-body { padding: 18px; }
  .sp-ovr-loc {
    font-size: 12px; color: #8ab4f8; margin-bottom: 10px; word-break: break-all;
  }
  .sp-ovr-msg {
    font-size: 13px; line-height: 1.55; color: #ffb3b6;
    white-space: pre-wrap; word-break: break-word;
  }
  .sp-ovr-stack {
    margin-top: 16px; padding-top: 12px; border-top: 1px solid #34343e;
  }
  .sp-ovr-stack-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #9a9aa4; margin-bottom: 8px;
  }
  .sp-ovr-frames { font-size: 12px; line-height: 1.7; }
  .sp-ovr-frame { display: flex; gap: 8px; padding: 1px 0; }
  .sp-ovr-fn { color: #c9c9d2; flex: none; }
  .sp-ovr-file { color: #8ab4f8; word-break: break-all; }
  .sp-ovr-frame.sp-ovr-internal { opacity: 0.45; }
  .sp-ovr-hint { margin-top: 14px; font-size: 11px; color: #7d7d88; }
`;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function isInternalFrame(f: OverlayFrame): boolean {
  const file = (f._originalFileName || f.fileName || '') as string;
  return (
    file.includes('node_modules') ||
    file.includes('refresh-helper') ||
    file.includes('react-refresh') ||
    file.includes('__csb')
  );
}

function frameLocation(f: OverlayFrame): string {
  const file = (f._originalFileName || f.fileName || '') as string;
  const line = f._originalLineNumber ?? f.lineNumber;
  const col = f._originalColumnNumber ?? f.columnNumber;
  if (!file) return '';
  const short = file.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
  return line != null ? `${short}:${line}${col != null ? ':' + col : ''}` : short;
}

function buildFrames(doc: Document, frames: OverlayFrame[]): HTMLElement {
  const wrap = el(doc, 'div', 'sp-ovr-frames');
  // Surface user frames first, then collapsed internals — mirrors Vite's
  // "user code on top" reading order.
  const user = frames.filter((f) => !isInternalFrame(f));
  const internal = frames.filter(isInternalFrame);
  for (const f of [...user, ...internal]) {
    const row = el(doc, 'div', 'sp-ovr-frame' + (isInternalFrame(f) ? ' sp-ovr-internal' : ''));
    row.appendChild(el(doc, 'span', 'sp-ovr-fn', (f.functionName || 'anonymous') + '  '));
    row.appendChild(el(doc, 'span', 'sp-ovr-file', frameLocation(f)));
    wrap.appendChild(row);
  }
  return wrap;
}

function render(err: OverlayError): void {
  if (typeof document === 'undefined') return;
  clearErrorOverlay();

  const doc = document;
  const host = doc.createElement('div');
  host.id = OVERLAY_ID;
  const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : (host as any);

  const style = doc.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const wrap = el(doc, 'div', 'sp-ovr-wrap');
  const card = el(doc, 'div', 'sp-ovr-card');

  const head = el(doc, 'div', 'sp-ovr-head');
  head.appendChild(el(doc, 'div', 'sp-ovr-badge', '!'));
  head.appendChild(el(doc, 'div', 'sp-ovr-title', err.title || 'Error'));
  const dismiss = el(doc, 'button', 'sp-ovr-dismiss', '×') as HTMLButtonElement;
  dismiss.setAttribute('aria-label', 'Dismiss error');
  dismiss.onclick = () => clearErrorOverlay();
  head.appendChild(dismiss);
  card.appendChild(head);

  const body = el(doc, 'div', 'sp-ovr-body');
  const loc = [err.path, err.line != null ? String(err.line) : null, err.column != null ? String(err.column) : null]
    .filter(Boolean)
    .join(':');
  if (loc) body.appendChild(el(doc, 'div', 'sp-ovr-loc', loc));
  body.appendChild(el(doc, 'div', 'sp-ovr-msg', err.message || 'Unknown error'));

  if (err.frames && err.frames.length) {
    const stackWrap = el(doc, 'div', 'sp-ovr-stack');
    stackWrap.appendChild(el(doc, 'div', 'sp-ovr-stack-label', 'Stack trace'));
    stackWrap.appendChild(buildFrames(doc, err.frames));
    body.appendChild(stackWrap);
  } else if (err.stack) {
    const stackWrap = el(doc, 'div', 'sp-ovr-stack');
    stackWrap.appendChild(el(doc, 'div', 'sp-ovr-stack-label', 'Stack trace'));
    const pre = el(doc, 'pre', 'sp-ovr-frames', err.stack);
    (pre.style as any).whiteSpace = 'pre-wrap';
    (pre.style as any).wordBreak = 'break-word';
    stackWrap.appendChild(pre);
    body.appendChild(stackWrap);
  }

  body.appendChild(
    el(doc, 'div', 'sp-ovr-hint', 'Fix the error and save — the preview rebuilds automatically.')
  );

  card.appendChild(body);
  wrap.appendChild(card);
  shadow.appendChild(wrap);
  doc.body.appendChild(host);
}

/** Show (or replace) the error overlay. Never throws. */
export function showErrorOverlay(err: OverlayError): void {
  try {
    render(err);
  } catch (e) {
    // Rendering must never mask the original error — fall back to console.
    // eslint-disable-next-line no-console
    console.error('[sandpack] failed to render error overlay', e);
  }
}

/** Remove the overlay (on the next successful compile / user dismiss). */
export function clearErrorOverlay(): void {
  try {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(OVERLAY_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  } catch {
    /* ignore */
  }
}
