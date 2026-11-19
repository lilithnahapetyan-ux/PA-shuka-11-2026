import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../../api.js';
import { useApi, useTitle } from '../../hooks.js';
import { useLang } from '../../i18n.jsx';
import { ErrorState, Loading, Notice, Pagination, Price, StatusBadge, Thumb } from '../../components/ui.jsx';
import { History } from '../Orders.jsx';

const TABS = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export function SellerOrders() {
  const l = useLang();
  const { t } = l;
  useTitle(t('seller.orders'));
  const [params] = useSearchParams();
  const status = TABS.includes(params.get('status')) ? params.get('status') : 'placed';
  const page = Number(params.get('page')) > 0 ? Number(params.get('page')) : 1;
  const { data, error, loading, reload } = useApi(`/seller/orders?status=${status}&page=${page}`);

  return (
    <div>
      <h1>{t('seller.orders')}</h1>
      <nav className="tabs" aria-label={t('seller.orders')}>
        {TABS.map((s) => (
          <Link key={s} to={`/seller/orders?status=${s}`} className="tab" aria-current={s === status ? 'page' : undefined}>
            {t(`status.${s}`)} <span className="tab__count">{data?.counts?.[s] ?? ''}</span>
          </Link>
        ))}
      </nav>
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <p className="empty muted">{t('seller.noOrders')}</p>}
      {data && data.items.length > 0 && (
        <>
          <ul className="order-list">
            {data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/seller/orders/${o.id}`} className="order-row">
                  <span className="order-row__id">{t('seller.order', { id: o.orderId })}</span>
                  <span className="order-row__date muted">{l.date(o.createdAt)}</span>
                  <span className="order-row__who">{o.recipient}, {o.city}</span>
                  <span className="muted">{t('seller.units', { n: o.units })}</span>
                  <Price amd={o.subtotalAmd} className="order-row__total" />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} to={(p) => `/seller/orders?status=${status}&page=${p}`} />
        </>
      )}
    </div>
  );
}

export function SellerOrderDetail() {
  const { id } = useParams();
  const l = useLang();
  const { t } = l;
  const { data, error, loading, reload, setData } = useApi(`/seller/orders/${id}`);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useTitle(data ? t('seller.order', { id: data.order.orderId }) : null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const o = data.order;
  const d = o.delivery;

  const move = async (to) => {
    if (to === 'cancelled' && !confirmCancel) return setConfirmCancel(true);
    setBusy(true); setMoveError(null); setConfirmCancel(false);
    try {
      setData(await api(`/seller/orders/${o.id}/status`, { method: 'POST', body: { to } }));
    } catch (e) {
      setMoveError(e);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="seller-order">
      <Link to={`/seller/orders?status=${o.status}`} className="back">{t('seller.backToOrders')}</Link>
      <div className="order__head">
        <h1>{t('seller.order', { id: o.orderId })}</h1>
        <StatusBadge status={o.status} />
      </div>
      <p className="muted">{l.dateTime(o.createdAt)}, {t('seller.buyer', { name: o.buyerName })}</p>

      <div className="order__layout">
        <div>
          <section className="part">
            <h2>{t('seller.items')}</h2>
            <p className="muted small">{t('seller.priceAtPurchase')}</p>
            <ul className="part__items">
              {o.items.map((i) => (
                <li key={i.productId} className="part-item">
                  <Thumb image={i.image} />
                  <div className="part-item__main">
                    <span className="part-item__title">{i.title}</span>
                    <span className="muted">{t('orders.qty', { n: i.quantity, price: l.amd(i.unitPriceAmd) })}</span>
                  </div>
                  <Price amd={i.lineTotalAmd} />
                </li>
              ))}
            </ul>
          </section>
          <section className="part">
            <h2>{t('orders.history')}</h2>
            <History history={o.history} viewer="seller" />
          </section>
        </div>

        <aside className="summary">
          <h2>{t('seller.deliverTo')}</h2>
          <address className="address">
            <strong>{d.recipient}</strong><br />
            <a href={`tel:${d.phone.replace(/\s/g, '')}`} className="address__phone">{d.phone}</a><br />
            {d.street}{d.apartment ? `, ${d.apartment}` : ''}<br />
            {d.city}, {t(`region.${d.region}`)}
            {d.note && <><br /><span className="address__note">{d.note}</span></>}
          </address>
          <p className="summary__total"><span>{t('seller.cash')}</span> <Price amd={o.cashToCollectAmd} /></p>

          {moveError && <Notice kind="error">{l.error(moveError)}</Notice>}
          {o.allowedMoves.length > 0 && (
            <div className="moves">
              {o.allowedMoves.map((to) => (
                <button key={to} type="button" disabled={busy}
                  className={`btn btn--wide ${to === 'cancelled' ? 'btn--danger-quiet' : 'btn--primary'}`}
                  onClick={() => move(to)} hidden={confirmCancel && to === 'cancelled'}>
                  {t(`move.${to}`)}
                </button>
              ))}
            </div>
          )}
          {confirmCancel && (
            <div className="confirm" role="alertdialog" aria-label={t('move.cancelled')}>
              <p>{t('seller.cancelConfirm')}</p>
              <div className="actions">
                <button type="button" className="btn btn--danger" onClick={() => move('cancelled')} disabled={busy}>{t('orders.cancelYes')}</button>
                <button type="button" className="btn btn--quiet" onClick={() => setConfirmCancel(false)}>{t('orders.cancelNo')}</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
