import { html, useEffect, useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { initials } from './util.js';

export { html };

export function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return html`<div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-label=${title}>
      <div class="modal-head"><h3>${title}</h3><button class="x" onClick=${onClose} aria-label="Đóng">×</button></div>
      <div class="modal-body">${children}</div>
      ${foot && html`<div class="modal-foot">${foot}</div>`}
    </div>
  </div>`;
}

export const Avatar = ({ p, size = 32 }) =>
  html`<span class=${'av av-' + (p?.dept || p?.role || 'x')} style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`}>${initials(p?.full_name)}</span>`;

export const Badge = ({ cls = '', children, title }) => html`<span class=${'badge ' + cls} title=${title}>${children}</span>`;

export function Bar({ pct, cls = '', label }) {
  const v = Math.max(0, Math.min(100, pct || 0));
  return html`<div class="pbar" title=${label || pct + '%'}><i class=${cls} style=${`width:${v}%`}></i></div>`;
}

export function Seg({ value, onChange, options }) {
  return html`<div class="seg">${options.map((o) => html`<button class=${value === o.id ? 'on' : ''} onClick=${() => onChange(o.id)}>${o.label}</button>`)}</div>`;
}

export function Stat({ value, label, cls = '', sub }) {
  return html`<div class=${'stat ' + cls}><b>${value ?? '—'}</b><span>${label}</span>${sub && html`<small>${sub}</small>`}</div>`;
}

export function Empty({ children }) {
  return html`<div class="empty">${children}</div>`;
}

export function Section({ title, right, children, cls = '' }) {
  return html`<section class=${'section ' + cls}>
    <div class="section-head"><h2>${title}</h2>${right}</div>
    ${children}
  </section>`;
}

// Nút xoá 2 bước (không dùng confirm() để chạy được trong mọi khung nhúng)
export function ConfirmButton({ label, ask = 'Bấm lần nữa để xác nhận', onConfirm, cls = 'link danger' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button type="button" class=${cls + (armed ? ' armed' : '')} onClick=${() => (armed ? onConfirm() : setArmed(true))}>${armed ? ask : label}</button>`;
}

export function useNow(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, []);
}
