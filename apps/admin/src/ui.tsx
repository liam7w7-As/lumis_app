import { useEffect, useRef, type ReactNode } from 'react';
import type { State, PlanId } from './api';
export const planNames = { free: 'Gratis', pro: 'Pro', plus: 'Plus' };
export const stateNames = { active: 'Activa', expired: 'Vencida', suspended: 'Suspendida' };
export const money = (n: number) =>
  new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(n);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/La_Paz',
      }).format(new Date(value.length === 10 ? value + 'T12:00:00-04:00' : value))
    : 'Sin vencimiento';
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    business: (
      <>
        <path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h3a2 2 0 012 2v10M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-2h2v2" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 9 9m-3-3 3-3m-6 0 3-3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    activity: (
      <>
        <path d="M3 4v16h18M5 13h4l3-6 4 10 3-5h3" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H5a2 2 0 00-2 2v12a2 2 0 002 2h5M14 8l4 4-4 4M8 12h13" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L20 5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0112 0v3M17 5a3 3 0 010 6m2 3a5 5 0 012 4v3" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 8a8 8 0 00-14-3L3 8m0-5v5h5M4 16a8 8 0 0014 3l3-3m0 5v-5h-5" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6m0 3h.01" />
      </>
    ),
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L2 9.6l6.2-.9L12 3Z" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
export function Status({ state }: { state: State }) {
  return (
    <span className={'badge state ' + state}>
      <span />
      {stateNames[state]}
    </span>
  );
}
export function PlanBadge({ plan }: { plan: PlanId }) {
  return <span className={'badge plan ' + plan}>{planNames[plan]}</span>;
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" />
      <div>
        <strong>No se pudo completar</strong>
        <p>{error}</p>
        {retry && (
          <button className="text-button" onClick={retry}>
            Volver a intentar
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name="business" size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" /> Cargando información…
    </div>
  );
}
export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'dialog ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN LUMIS</p>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Cerrar" onClick={onClose} disabled={busy}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        {total === 0
          ? 'Sin resultados'
          : `${(page - 1) * size + 1}–${Math.min(page * size, total)} de ${total}`}
      </span>
      <div>
        <button
          className="button subtle small"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          className="button subtle small"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
