// Buyer: order list, and one order with a status per seller, history, cancel and reviews.
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { check } from '../validate.js';
import { ErrorState, Loading, Notice, Pagination, Price, StatusBadge, Thumb, serverFieldErrors } from '../components/ui.jsx';

export function OrderList() {
  const l = useLang();
  const { t } = l;
  useTitle(t('orders.title'));
  const [params] = useSearchParams();
  const page = Number(params.get('page')) > 0 ? Number(params.get('page')) : 1;
  const { data, error, loading, reload } = useApi(`/orders?page=${page}`);

  return (
    <div className="page orders">
      <h1>{t('orders.title')}</h1>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.total === 0 && (
        <div className="empty">
          <p className="empty__title">{t('orders.empty')}</p>
          <Link to="/search" className="btn btn--primary">{t('cart.startShopping')}</Link>
        </div>
      )}
      {data && data.total > 0 && (
        <>
          <ul className="order-list">
            {data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="order-row">
                  <span className="order-row__id">{t('orders.number', { id: o.id })}</span>
                  <span className="order-row__date muted">{l.date(o.createdAt)}</span>
                  <Price amd={o.totalAmd} className="order-row__total" />
                  <span className="order-row__parts">
                    {o.parts.map((p) => (
                      <span key={p.id} className="order-row__part">{p.storeName} <StatusBadge status={p.status} /></span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} to={(p) => `/orders?page=${p}`} />
        </>
      )}
    </div>
  );
}

export function History({ history, viewer }) {
  const l = useLang();
  const { t } = l;
  return (
    <ol className="history" aria-label={t('orders.history')}>
      {history.map((h, i) => (
        <li key={i} className={`history__step history__step--${h.to}`}>
          <StatusBadge status={h.to} />
          <span className="history__when">{l.dateTime(h.at)}</span>
          <span className="history__who muted">
            {h.by === 'seller' ? t('orders.bySeller') : viewer === 'seller' ? t('orders.byBuyerSeller') : t('orders.byBuyer')}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ReviewForm({ productId, onDone, onCancel }) {
  const l = useLang();
  const { t } = l;
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (rating < 1) v.rating = t('v.rating');
    if (check.review(body)) v.body = t('v.review');
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, body } });
      onDone();
    } catch (err) {
      setBusy(false);
      if (err.code === 'VALIDATION') setErrors(serverFieldErrors(err, l)); else setFormError(err);
    }
  };

  return (
    <form className="review-form" onSubmit={submit} noValidate>
      <fieldset className={errors.rating ? 'field--error' : ''}>
        <legend>{t('review.rating')}</legend>
        <div className="star-input">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating === n} aria-label={t('review.stars', { n })}
              className={n <= rating ? 'is-on' : ''} onClick={() => setRating(n)}>★</button>
          ))}
        </div>
        {errors.rating && <p className="field__error">{errors.rating}</p>}
      </fieldset>
      <div className={`field ${errors.body ? 'field--error' : ''}`}>
        <label htmlFor={`rv-${productId}`}>{t('review.body')}</label>
        <textarea id={`rv-${productId}`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={Boolean(errors.body)} />
        {errors.body && <p className="field__error">{errors.body}</p>}
      </div>
      {formError && <Notice kind="error">{l.error(formError)}</Notice>}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? t('review.posting') : t('review.post')}</button>
        <button type="button" className="link-button" onClick={onCancel}>{t('review.cancel')}</button>
      </div>
    </form>
  );
}

function Part({ orderId, part, onChange }) {
  const l = useLang();
  const { t } = l;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [thanks, setThanks] = useState(null);

  const cancel = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api(`/orders/${orderId}/sellers/${part.id}/cancel`, { method: 'POST' });
      onChange(r.order);
    } catch (e) {
      setError(e);
      onChange(null);
    } finally {
      setBusy(false); setConfirming(false);
    }
  };

  return (
    <section className="part">
      <header className="part__head">
        <h2>{part.seller.storeName}</h2>
        <StatusBadge status={part.status} />
      </header>
      <ul className="part__items">
        {part.items.map((i) => (
          <li key={i.productId} className="part-item">
            <Link to={`/products/${i.productId}`}><Thumb image={i.image} /></Link>
            <div className="part-item__main">
              <Link to={`/products/${i.productId}`} className="part-item__title">{i.title}</Link>
              <span className="muted">{t('orders.qty', { n: i.quantity, price: l.amd(i.unitPriceAmd) })}</span>
              {i.reviewed && <span className="tag">{t('orders.reviewed')}</span>}
              {thanks === i.productId && <Notice kind="success">{t('review.thanks')}</Notice>}
              {i.canReview && reviewing !== i.productId && (
                <button type="button" className="btn btn--quiet btn--small" onClick={() => setReviewing(i.productId)}>{t('orders.writeReview')}</button>
              )}
              {reviewing === i.productId && (
                <ReviewForm productId={i.productId} onCancel={() => setReviewing(null)}
                  onDone={() => { setReviewing(null); setThanks(i.productId); onChange(null); }} />
              )}
            </div>
            <Price amd={i.lineTotalAmd} />
          </li>
        ))}
      </ul>
      <p className="part__subtotal"><span>{t('cart.subtotal')}</span> <Price amd={part.subtotalAmd} /></p>

      <details className="part__history" open={part.history.length > 1}>
        <summary>{t('orders.history')}</summary>
        <History history={part.history} viewer="buyer" />
      </details>

      {error && <Notice kind="error">{l.error(error)}</Notice>}
      {part.canCancel && !confirming && (
        <button type="button" className="btn btn--danger-quiet" onClick={() => setConfirming(true)}>{t('orders.cancel')}</button>
      )}
      {confirming && (
        <div className="confirm" role="alertdialog" aria-label={t('orders.cancelConfirm', { store: part.seller.storeName })}>
          <p>{t('orders.cancelConfirm', { store: part.seller.storeName })}</p>
          <div className="actions">
            <button type="button" className="btn btn--danger" onClick={cancel} disabled={busy}>{t('orders.cancelYes')}</button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)} disabled={busy}>{t('orders.cancelNo')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const l = useLang();
  const { t } = l;
  useTitle(t('orders.number', { id }));
  const { data, error, loading, reload, setData } = useApi(`/orders/${id}`);

  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error?.status === 404) return <div className="page empty"><p className="empty__title">{t('orders.notFound')}</p><Link to="/orders">{t('orders.title')}</Link></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const o = data.order;
  const a = o.address;

  return (
    <div className="page order">
      {params.get('placed') && (
        <div className="placed">
          <p className="placed__title">{t('orders.placedBanner', { id: o.id })}</p>
          <p>{t('orders.placedHint')}</p>
        </div>
      )}
      <div className="order__head">
        <h1>{t('orders.number', { id: o.id })}</h1>
        <p className="muted">{t('orders.placedOn', { date: l.date(o.createdAt) })}</p>
      </div>

      <div className="order__layout">
        <div className="order__parts">
          {o.parts.map((p) => (
            <Part key={p.id} orderId={o.id} part={p} onChange={(next) => (next ? setData({ order: next }) : reload())} />
          ))}
        </div>
        <aside className="summary">
          <h2>{t('orders.delivery')}</h2>
          <address className="address">
            {a.recipient}<br />
            {a.street}{a.apartment ? `, ${a.apartment}` : ''}<br />
            {a.city}, {t(`region.${a.region}`)}<br />
            <a href={`tel:${a.phone.replace(/\s/g, '')}`}>{a.phone}</a>
            {a.note && <><br /><span className="muted">{a.note}</span></>}
          </address>
          <p className="summary__total"><span>{t('orders.total')}</span> <Price amd={o.totalAmd} /></p>
          <p className="summary__payment">{t('checkout.payment')}</p>
        </aside>
      </div>
    </div>
  );
}
