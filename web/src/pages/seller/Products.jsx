import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api.js';
import { useApi, useTitle } from '../../hooks.js';
import { useLang } from '../../i18n.jsx';
import { ErrorState, Loading, Notice, Price, Thumb } from '../../components/ui.jsx';

export default function Products() {
  const l = useLang();
  const { t } = l;
  useTitle(t('seller.products'));
  const { data, error, loading, reload } = useApi('/seller/products');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const togglePublished = async (p) => {
    setBusy(p.id); setActionError(null);
    try {
      await api(`/seller/products/${p.id}`, { method: 'PATCH', body: { isPublished: !p.isPublished } });
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="section__head">
        <h1>{t('seller.products')}</h1>
        <Link to="/seller/products/new" className="btn btn--primary">{t('seller.addProduct')}</Link>
      </div>
      {actionError && <Notice kind="error">{l.error(actionError)}</Notice>}
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">{t('seller.noProducts')}</p>
          <Link to="/seller/products/new" className="btn btn--primary">{t('seller.addProduct')}</Link>
        </div>
      )}
      {data && data.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('seller.col.product')}</th>
              <th scope="col" className="num">{t('seller.col.price')}</th>
              <th scope="col" className="num">{t('seller.col.stock')}</th>
              <th scope="col">{t('seller.col.status')}</th>
              <th scope="col" className="num">{t('seller.col.sold')}</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className={p.isPublished ? '' : 'is-draft'}>
                <td data-label={t('seller.col.product')}>
                  <Link to={`/seller/products/${p.id}`} className="table__product">
                    <Thumb image={p.image} />
                    <span>{p.title}</span>
                  </Link>
                </td>
                <td data-label={t('seller.col.price')} className="num"><Price amd={p.priceAmd} /></td>
                <td data-label={t('seller.col.stock')} className={`num ${p.stock === 0 ? 'is-zero' : ''}`}>{p.stock}</td>
                <td data-label={t('seller.col.status')}>
                  <span className={`pill ${p.isPublished ? 'pill--on' : 'pill--off'}`}>{p.isPublished ? t('seller.published') : t('seller.draft')}</span>
                </td>
                <td data-label={t('seller.col.sold')} className="num">{p.unitsSold}</td>
                <td className="table__actions">
                  <Link to={`/seller/products/${p.id}`} className="btn btn--quiet btn--small">{t('seller.edit')}</Link>
                  <button type="button" className="btn btn--quiet btn--small" disabled={busy === p.id} onClick={() => togglePublished(p)}>
                    {p.isPublished ? t('seller.unpublish') : t('seller.publish')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
