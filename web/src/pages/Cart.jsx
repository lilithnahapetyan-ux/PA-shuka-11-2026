import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorState, Loading, Notice, Price, QuantityStepper, Thumb } from '../components/ui.jsx';

export function warningText(w, l) {
  if (w.code === 'PRICE_CHANGED') return l.t('cart.warn.PRICE_CHANGED', { old: l.amd(w.oldPriceAmd), new: l.amd(w.newPriceAmd) });
  return null;
}

export default function Cart() {
  const l = useLang();
  const { t } = l;
  useTitle(t('cart.title'));
  const navigate = useNavigate();
  const { setCartCount } = useSession();
  const { data, error, loading, reload, setData } = useApi('/cart');
  const [busy, setBusy] = useState(null); // productId being changed
  const [actionError, setActionError] = useState(null);

  const apply = async (productId, request) => {
    setBusy(productId); setActionError(null);
    try {
      const r = await request();
      setData(r);
      setCartCount(r.cart.itemCount);
    } catch (e) {
      setActionError(e);
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const cart = data.cart;

  if (cart.itemCount === 0) {
    return (
      <div className="page empty">
        <h1>{t('cart.title')}</h1>
        <p className="empty__title">{t('cart.empty')}</p>
        <Link to="/search" className="btn btn--primary">{t('cart.startShopping')}</Link>
      </div>
    );
  }

  const items = cart.groups.flatMap((g) => g.items);
  const priceChanged = items.some((i) => i.warnings.some((w) => w.code === 'PRICE_CHANGED'));

  return (
    <div className="page cart">
      <h1>{t('cart.title')}</h1>
      {actionError && <Notice kind="error">{l.error(actionError)}</Notice>}
      {!cart.canCheckout && (
        <Notice kind="warn">
          <p>{t('cart.fixFirst')}</p>
          {priceChanged && (
            <button type="button" className="btn" onClick={() => apply('all', () => api('/cart/accept-prices', { method: 'POST' }))}>
              {t('cart.acceptPrices')}
            </button>
          )}
        </Notice>
      )}

      <div className="cart__layout">
        <div className="cart__groups">
          {cart.groups.map((g) => (
            <section key={g.seller.id} className="cart-group" aria-label={g.seller.storeName}>
              <h2 className="cart-group__store">{t('cart.from', { store: g.seller.storeName })}</h2>
              <ul>
                {g.items.map((i) => {
                  const blocked = i.warnings.some((w) => w.code === 'SOLD_OUT' || w.code === 'UNAVAILABLE');
                  return (
                    <li key={i.productId} className={`cart-item ${blocked ? 'cart-item--blocked' : ''}`}>
                      <Link to={`/products/${i.productId}`} className="cart-item__img"><Thumb image={i.image} /></Link>
                      <div className="cart-item__main">
                        <Link to={`/products/${i.productId}`} className="cart-item__title">{i.title}</Link>
                        <Price amd={i.priceAmd} className="cart-item__price" />
                        {i.warnings.map((w) => (
                          <p key={w.code} className="cart-item__warn">
                            {warningText(w, l) ?? t(`cart.warn.${w.code}`, { n: i.stock })}
                          </p>
                        ))}
                        <div className="cart-item__controls">
                          {!blocked && (
                            <QuantityStepper
                              value={Math.min(i.quantity, Math.max(1, i.stock))}
                              max={Math.max(1, i.stock)}
                              disabled={busy !== null}
                              onChange={(q) => apply(i.productId, () => api(`/cart/items/${i.productId}`, { method: 'PUT', body: { quantity: q } }))}
                            />
                          )}
                          <button type="button" className="link-button" disabled={busy !== null}
                            onClick={() => apply(i.productId, () => api(`/cart/items/${i.productId}`, { method: 'DELETE' }))}>
                            {t('cart.remove')}
                          </button>
                        </div>
                      </div>
                      <Price amd={i.lineTotalAmd} className="cart-item__line" />
                    </li>
                  );
                })}
              </ul>
              <p className="cart-group__subtotal"><span>{t('cart.subtotal')}</span> <Price amd={g.subtotalAmd} /></p>
            </section>
          ))}
        </div>

        <aside className="summary">
          <p className="summary__total"><span>{t('cart.total')}</span> <Price amd={cart.totalAmd} /></p>
          <button type="button" className="btn btn--primary btn--wide" disabled={!cart.canCheckout} onClick={() => navigate('/checkout')}>
            {t('cart.checkout')}
          </button>
          <p className="muted small">{t('checkout.payment')}</p>
        </aside>
      </div>
    </div>
  );
}
