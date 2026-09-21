import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Badge({ cls, children, title }: { cls: string; children: ReactNode; title?: string }) {
  return <i className={`badge ${cls}`} title={title}>{children}</i>;
}

export function Modal({
  title, subtitle, onClose, children, footer, width = 520,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" style={{ width: `min(${width}px, 100%)` }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="关闭"><X size={17} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}{required && <b>*</b>}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

export const inputCls = 'ipt';
