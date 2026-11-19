import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorState, Loading, Notice, Price, QuantityStepper, Stars, StockLabel } from '../components/ui.jsx';

function Gallery({ images, title }) {
  const { t } = useLang();
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [images]);
  if (!images.length) return <div className="gallery"><span className="gallery__main thumb--empty" /></div>;
  return (
    <div className="gallery">
      <img className="gallery__main" src={images[i].large} alt={title} />
      {images.length > 1 && (
        <ul className="gallery__thumbs">
          {images.map((im, n) => (
            <li key={im.thumb}>
              <button type="button" aria-pressed={n === i} aria-label={t('product.photo', { n: n + 1 })} onClick={() => setI(n)}>
                <img src={im.thumb} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Reviews({ productId }) {
  const l = useLang();
  const { t } = l;
  const [state, setState] = useState({ items: [], page: 0, pages: 1, total: 0, loading: true, error: null });

  const load = (page) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api(`/products/${productId}/reviews?page=${page}`)
      .then((r) => setState((s) => ({ items: page === 1 ? r.items : [...s.items, ...r.items], page: r.page, pages: r.pages, total: r.total, loading: false, error: null })))
      .catch((error) => setState((s) => ({ ...s, loading: false, error })));
  };
  useEffect(() => load(1), [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="reviews" aria-labelledby="reviews-h">
      <h2 id="reviews-h">{t('product.reviews')}</h2>
      {state.error && <ErrorState error={state.error} onRetry={() => load(state.page + 1)} />}
      {!state.loading && state.total === 0 && <p className="muted">{t('product.noReviews')}</p>}
      <ul className="reviews__list">
        {state.items.map((r) => (
          <li key={r.id} className="review">
            <Stars value={r.rating} count={1} showCount={false} />
            <p className="review__body">{r.body}</p>
            <p className="review__meta">{r.buyerName}, {l.date(r.createdAt)}</p>
          </li>
        ))}
      </ul>
      {state.loading && <Loading />}
      {!state.loading && state.page < state.pages && (
        <button type="button" className="btn btn--quiet" onClick={() => load(state.page + 1)}>{t('product.moreReviews')}</button>
      )}
    </section>
  );
}

export default function Product() {
  const { id } = useParams();
  const l = useLang();
  const { t } = l;
  const { user, setCartCount } = useSession();
  const location = useLocation();
  const { data, error, loading, reload } = useApi(`/products/${id}`);
  const p = data?.product;
  useTitle(p?.title);

  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState(null);
  useEffect(() => { setQty(1); setAdded(false); setAddError(null); }, [id]);

  if (loading) return <div className="page"><Loading /></div>;
  if (error?.status === 404) {
    return (
      <div className="page empty">
        <p className="empty__title">{t('product.notFound')}</p>
        <Link to="/search" className="btn">{t('search.seeAll')}</Link>
      </div>
    );
  }
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const own = user && user.id === p.seller.id;

  const add = async () => {
    setAdding(true); setAddError(null); setAdded(false);
    try {
      // The cart stores a quantity per product, so "add" means current + qty.
      const { cart } = await api('/cart');
      const inCart = cart.groups.flatMap((g) => g.items).find((i) => i.productId === p.id)?.quantity ?? 0;
      const r = await api(`/cart/items/${p.id}`, { method: 'PUT', body: { quantity: inCart + qty } });
      setCartCount(r.cart.itemCount);
      setAdded(true);
    } catch (e) {
      setAddError(e);
      if (e.code === 'OUT_OF_STOCK' || e.code === 'NOT_ENOUGH_STOCK') reload();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="page product">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/search">{t('nav.allProducts')}</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/search?category=${p.category.slug}`}>{l.category(p.category)}</Link>
      </nav>

      {!p.isPublished && <Notice kind="warn">{t('product.unpublished')}</Notice>}

      <div className="product__layout">
        <Gallery images={p.images} title={p.title} />

        <div className="product__info">
          <h1>{p.title}</h1>
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          <Price amd={p.priceAmd} className="product__price" />
          <StockLabel stock={p.stock} />
          <p className="product__seller">{t('product.soldBy', { store: p.seller.storeName })}</p>

          <div className="buybox">
            {own ? (
              <>
                <p>{t('product.yours')}</p>
                <Link className="btn" to={`/seller/products/${p.id}`}>{t('product.edit')}</Link>
              </>
            ) : !user ? (
              <Link className="btn btn--primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>{t('product.loginToBuy')}</Link>
            ) : p.stock > 0 ? (
              <>
                <div className="buybox__row">
                  <span className="buybox__label">{t('product.quantity')}</span>
                  <QuantityStepper value={qty} max={p.stock} onChange={setQty} disabled={adding} />
                </div>
                <button type="button" className="btn btn--primary btn--wide" onClick={add} disabled={adding}>
                  {adding ? t('product.adding') : t('product.addToCart')}
                </button>
              </>
            ) : null}
            {added && <Notice kind="success">{t('product.added')} <Link to="/cart">{t('product.viewCart')}</Link></Notice>}
            {addError && <Notice kind="error">{l.error(addError)}</Notice>}
          </div>

          <section className="product__desc">
            <h2>{t('product.description')}</h2>
            <p>{p.description}</p>
          </section>
        </div>
      </div>

      <Reviews productId={p.id} />
    </div>
  );
}
