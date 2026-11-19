import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, randomKey } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { check, collect } from '../validate.js';
import { ErrorState, Field, Loading, Notice, Price, serverFieldErrors } from '../components/ui.jsx';

export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik',
  'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];

const EMPTY = { recipient: '', phone: '', region: '', city: '', street: '', apartment: '', note: '' };

export default function Checkout() {
  const l = useLang();
  const { t } = l;
  useTitle(t('checkout.title'));
  const navigate = useNavigate();
  const { user, setCartCount } = useSession();
  const cart = useApi('/cart');

  // One random key per visit to this page: a double click or a retry sends the same key,
  // and the server answers with the same order instead of making a second one.
  const requestKey = useRef(randomKey());
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [changed, setChanged] = useState([]);
  const [placing, setPlacing] = useState(false);

  // Pre-fill with the last address used, or the account's name and phone.
  useEffect(() => {
    api('/orders/last-address')
      .then(({ address }) => setForm(address
        ? { ...EMPTY, ...Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v ?? ''])) }
        : { ...EMPTY, recipient: user.name, phone: user.phone, region: 'Yerevan', city: 'Yerevan' }))
      .catch(() => {});
  }, [user]);

  if (cart.loading && !cart.data) return <div className="page"><Loading /></div>;
  if (cart.error) return <div className="page"><ErrorState error={cart.error} onRetry={cart.reload} /></div>;
  if (cart.data.cart.itemCount === 0 && !placing) return <Navigate to="/cart" replace />;
  const c = cart.data.cart;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (placing) return;
    const v = collect({
      recipient: check.required(form.recipient),
      phone: check.phone(form.phone),
      region: REGIONS.includes(form.region) ? null : 'v.region',
      city: check.required(form.city),
      street: check.required(form.street),
    });
    setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;

    setPlacing(true); setFormError(null); setChanged([]);
    try {
      const r = await api('/orders', { method: 'POST', body: { ...form, requestKey: requestKey.current } });
      setCartCount(0);
      navigate(`/orders/${r.order.id}?placed=1`, { replace: true });
    } catch (err) {
      setPlacing(false);
      if (err.code === 'PRICE_CHANGED') setChanged(err.items);
      else if (err.code === 'VALIDATION') setErrors(serverFieldErrors(err, l));
      else setFormError(err);
      cart.reload();
    }
  };

  const acceptPrices = async () => {
    const r = await api('/cart/accept-prices', { method: 'POST' });
    cart.setData(r);
    setChanged([]);
  };

  return (
    <div className="page checkout">
      <h1>{t('checkout.title')}</h1>
      <form className="checkout__layout" onSubmit={submit} noValidate>
        <fieldset className="checkout__address" disabled={placing}>
          <legend>{t('checkout.address')}</legend>
          <Field label={t('checkout.recipient')} value={form.recipient} onChange={set('recipient')} error={errors.recipient} autoComplete="name" />
          <Field label={t('checkout.phone')} type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" placeholder="+374 91 123456" />
          <Field label={t('checkout.region')} as="select" value={form.region} onChange={set('region')} error={errors.region}>
            <option value="">{t('checkout.chooseRegion')}</option>
            {REGIONS.map((r) => <option key={r} value={r}>{t(`region.${r}`)}</option>)}
          </Field>
          <Field label={t('checkout.city')} value={form.city} onChange={set('city')} error={errors.city} autoComplete="address-level2" />
          <div className="field-row">
            <Field label={t('checkout.street')} hint={t('checkout.streetHint')} value={form.street} onChange={set('street')} error={errors.street} autoComplete="address-line1" />
            <Field label={t('checkout.apartment')} optional value={form.apartment} onChange={set('apartment')} error={errors.apartment} autoComplete="address-line2" className="field--short" />
          </div>
          <Field label={t('checkout.note')} optional as="textarea" rows={2} value={form.note} onChange={set('note')} error={errors.note} />
        </fieldset>

        <aside className="summary checkout__summary">
          <h2>{t('checkout.summary')}</h2>
          {c.groups.map((g) => (
            <div key={g.seller.id} className="summary__group">
              <p className="summary__store">{g.seller.storeName}</p>
              <ul>
                {g.items.map((i) => (
                  <li key={i.productId}>
                    <span>{i.title} <span className="muted">× {i.quantity}</span></span>
                    <Price amd={i.lineTotalAmd} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="summary__total"><span>{t('cart.total')}</span> <Price amd={c.totalAmd} /></p>
          <p className="summary__payment">{t('checkout.payment')}</p>
          <p className="muted small">{t('checkout.paymentHint')}</p>

          {changed.length > 0 && (
            <Notice kind="warn">
              <p>{t('checkout.pricesChanged')}</p>
              <ul className="changed">
                {changed.map((i) => (
                  <li key={i.productId}>{i.title}: <s>{l.amd(i.oldPriceAmd)}</s> <strong>{l.amd(i.newPriceAmd)}</strong></li>
                ))}
              </ul>
              <button type="button" className="btn" onClick={acceptPrices}>{t('cart.acceptPrices')}</button>
            </Notice>
          )}
          {formError && (
            <Notice kind="error">
              <p>{l.error(formError)}</p>
              <Link to="/cart">{t('checkout.backToCart')}</Link>
            </Notice>
          )}
          <button type="submit" className="btn btn--primary btn--wide" disabled={placing || changed.length > 0 || !c.canCheckout}>
            {placing ? t('checkout.placing') : t('checkout.place')}
          </button>
        </aside>
      </form>
    </div>
  );
}
