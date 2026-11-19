// Small shared pieces of UI.
import { useId } from 'react';
import { Link } from 'react-router';
import { useLang } from '../i18n.jsx';

/** Label + input/select/textarea + hint + error, wired for screen readers. */
export function Field({ label, hint, error, optional, as = 'input', children, className = '', ...props }) {
  const id = useId();
  const { t } = useLang();
  const Tag = as;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="field__optional"> ({t('checkout.optional')})</span>}
      </label>
      <Tag id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props}>{children}</Tag>
      {hint && !error && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

export function Price({ amd, className = '' }) {
  const { amd: fmt } = useLang();
  return <span className={`price ${className}`}>{fmt(amd)}</span>;
}

/** Read-only stars. Value can be fractional (4.5). */
export function Stars({ value, count, showCount = true }) {
  const { t } = useLang();
  if (!count) return showCount ? <span className="stars stars--none">{t('product.noRating')}</span> : null;
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" title={t('review.stars', { n: value.toFixed(1) })}>
      <span className="stars__track" aria-hidden="true">
        ★★★★★<span className="stars__fill" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
      <span className="sr-only">{t('review.stars', { n: value.toFixed(1) })}</span>
      <span className="stars__num">{value.toFixed(1)}</span>
      {showCount && <span className="stars__count">({count})</span>}
    </span>
  );
}

export function StockLabel({ stock }) {
  const { t } = useLang();
  if (stock === 0) return <span className="stock stock--out">{t('product.outOfStock')}</span>;
  if (stock <= 5) return <span className="stock stock--low">{t('product.onlyLeft', { n: stock })}</span>;
  return <span className="stock stock--ok">{t('product.inStock')}</span>;
}

export function StatusBadge({ status }) {
  const { t } = useLang();
  return <span className={`status status--${status}`}>{t(`status.${status}`)}</span>;
}

export function QuantityStepper({ value, max, onChange, disabled }) {
  const { t } = useLang();
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label={t('cart.decrease')}>−</button>
      <input
        type="number" inputMode="numeric" min={1} max={max} value={value} disabled={disabled}
        aria-label={t('product.quantity')}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(1, Math.min(max, n)));
        }}
      />
      <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={t('cart.increase')}>+</button>
    </div>
  );
}

export function Loading() {
  const { t } = useLang();
  return <p className="loading" role="status">{t('common.loading')}</p>;
}

export function ErrorState({ error, onRetry }) {
  const l = useLang();
  return (
    <div className="notice notice--error" role="alert">
      <p>{l.error(error)}</p>
      {onRetry && <button type="button" className="btn btn--quiet" onClick={onRetry}>{l.t('common.retry')}</button>}
    </div>
  );
}

export function Notice({ kind = 'info', children }) {
  return <div className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/** Previous / Page x of y / Next. `to(page)` builds each link. */
export function Pagination({ page, pages, to }) {
  const { t } = useLang();
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? <Link to={to(page - 1)} rel="prev">{t('page.prev')}</Link> : <span aria-hidden="true" />}
      <span>{t('page.of', { page, pages })}</span>
      {page < pages ? <Link to={to(page + 1)} rel="next">{t('page.next')}</Link> : <span aria-hidden="true" />}
    </nav>
  );
}

export function Thumb({ image, alt = '', size = 'thumb', className = '' }) {
  if (!image) return <span className={`thumb thumb--empty ${className}`} aria-hidden="true" />;
  return <img className={`thumb ${className}`} src={image[size]} alt={alt} loading="lazy" />;
}

/** Field errors for a failed request: Armenian by error code, otherwise the server's text. */
export function serverFieldErrors(err, l) {
  return Object.fromEntries(Object.entries(err?.fields ?? {}).map(([k, msg]) => [k, l.lang === 'hy' ? l.error(err) : msg]));
}
