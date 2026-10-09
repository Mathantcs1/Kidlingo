import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { evaluate, isExpression } from '../core/expr';
import { formatMoney, hashString, parseMoney, toDecimalString } from '../core/money';
import type { Member, Minor } from '../core/types';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

const PALETTE = ['#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#be123c', '#4d7c0f', '#a16207', '#9333ea', '#0e7490', '#b91c1c'];

export function Avatar({ member, size = 32 }: { member?: Member; size?: number }) {
  const name = member?.name ?? '?';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: PALETTE[hashString(member?.id ?? name) % PALETTE.length] }} aria-hidden>
      {initials || '?'}
    </span>
  );
}

/**
 * Amount input that doubles as a calculator: typing "1200/3+50" shows the result and
 * commits it on blur. Value is held in minor units.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  placeholder = '0.00',
  autoFocus,
  ariaLabel,
  className = '',
}: {
  value: Minor | null;
  onChange: (v: Minor | null) => void;
  currency: string;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? '' : toDecimalString(value, currency));
  const lastEmitted = useRef<Minor | null>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value === null ? '' : toDecimalString(value, currency));
      lastEmitted.current = value;
    }
  }, [value, currency]);

  const compute = (t: string): Minor | null => {
    if (!t.trim()) return null;
    if (isExpression(t)) {
      const r = evaluate(t);
      return r === null ? null : parseMoney(r.toFixed(6), currency);
    }
    return parseMoney(t, currency);
  };

  const preview = isExpression(text) ? compute(text) : undefined;
  return (
    <span className={`money-input ${className}`}>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => {
          setText(e.target.value);
          const v = compute(e.target.value);
          lastEmitted.current = v;
          onChange(v);
        }}
        onBlur={() => {
          const v = compute(text);
          if (v !== null && isExpression(text)) setText(toDecimalString(v, currency));
        }}
      />
      {preview !== undefined && <span className="calc-preview">= {preview === null ? '?' : formatMoney(preview, currency)}</span>}
    </span>
  );
}

export function Money({ amount, currency, signed, tone }: { amount: Minor; currency: string; signed?: boolean; tone?: boolean }) {
  const cls = tone ? (amount > 0 ? 'pos' : amount < 0 ? 'neg' : 'zero') : '';
  return <span className={`money ${cls}`}>{formatMoney(amount, currency, { signed })}</span>;
}

// ---- Toasts (with optional Undo) ----

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(text: string, action?: Toast['action']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, action }]);
    // Undo-able toasts linger longer so there's time to react.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && (
              <button
                className="link-btn"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
