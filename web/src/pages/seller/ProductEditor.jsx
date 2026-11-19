// Product editor. A new product is saved as a draft first; photos need its id;
// then it can be published (the server requires at least one photo).
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import { api } from '../../api.js';
import { useApi, useTitle } from '../../hooks.js';
import { useLang } from '../../i18n.jsx';
import { check, collect } from '../../validate.js';
import { ErrorState, Field, Loading, Notice, serverFieldErrors } from '../../components/ui.jsx';

const EMPTY = { title: '', categoryId: '', description: '', priceAmd: '', stock: '' };
const MAX_PHOTOS = 5;

function Photos({ product, onImages }) {
  const l = useLang();
  const { t } = l;
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (request) => {
    setBusy(true); setError(null);
    try {
      const r = await request();
      onImages(r.images);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const upload = (files) => {
    if (!files.length) return;
    const form = new FormData();
    for (const f of files) form.append('images', f);
    run(() => api(`/seller/products/${product.id}/images`, { method: 'POST', form }));
  };

  const images = product.images;
  return (
    <section className="photos" aria-labelledby="photos-h">
      <h2 id="photos-h">{t('seller.photos')}</h2>
      <p className="muted small">{t('seller.photosHint')}</p>
      {images.length === 0 && <p className="muted">{t('seller.noPhotos')}</p>}
      <ul className="photos__list">
        {images.map((im, i) => (
          <li key={im.id} className="photo">
            <img src={im.thumb} alt="" />
            {i === 0 ? <span className="photo__main">{t('seller.main')}</span> : (
              <button type="button" className="btn btn--quiet btn--small" disabled={busy}
                onClick={() => run(() => api(`/seller/products/${product.id}/images/${im.id}/main`, { method: 'PUT' }))}>
                {t('seller.makeMain')}
              </button>
            )}
            <button type="button" className="link-button" disabled={busy}
              onClick={() => run(() => api(`/seller/products/${product.id}/images/${im.id}`, { method: 'DELETE' }))}>
              {t('seller.removePhoto')}
            </button>
          </li>
        ))}
      </ul>
      {images.length < MAX_PHOTOS && (
        <label className={`btn ${busy ? 'is-busy' : ''} upload`}>
          {busy ? t('seller.uploading') : t('seller.addPhotos')}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
            className="sr-only" onChange={(e) => upload([...e.target.files].slice(0, MAX_PHOTOS - images.length))} />
        </label>
      )}
      {error && <Notice kind="error">{l.error(error)}</Notice>}
    </section>
  );
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const l = useLang();
  const { t } = l;
  useTitle(isNew ? t('seller.newProduct') : t('seller.editProduct'));
  const navigate = useNavigate();
  const location = useLocation();
  const cats = useApi('/categories');
  const loaded = useApi(isNew ? null : `/seller/products/${id}`);
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [message, setMessage] = useState(location.state?.message ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = loaded.data?.product;
    if (!p) return;
    setProduct(p);
    setForm({ title: p.title, categoryId: String(p.categoryId), description: p.description, priceAmd: String(p.priceAmd), stock: String(p.stock) });
  }, [loaded.data]);

  if (!isNew && loaded.loading && !product) return <Loading />;
  if (!isNew && loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setMessage(null); setFormError(null);
    const v = collect({
      title: check.title(form.title),
      categoryId: form.categoryId ? null : 'v.category',
      description: check.description(form.description),
      priceAmd: check.price(form.priceAmd),
      stock: check.stock(form.stock),
    });
    setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;

    const body = {
      title: form.title, description: form.description, categoryId: Number(form.categoryId),
      priceAmd: Number(form.priceAmd), stock: Number(form.stock),
    };
    setBusy(true);
    try {
      if (isNew) {
        const r = await api('/seller/products', { method: 'POST', body });
        navigate(`/seller/products/${r.product.id}`, { replace: true, state: { message: 'seller.draftSaved' } });
      } else {
        const r = await api(`/seller/products/${id}`, { method: 'PATCH', body });
        setProduct(r.product);
        setMessage('seller.saved');
      }
    } catch (err) {
      if (Object.keys(err.fields).length) setErrors(serverFieldErrors(err, l)); else setFormError(err);
    } finally {
      setBusy(false);
    }
  };

  const setPublished = async (isPublished) => {
    setBusy(true); setFormError(null); setMessage(null);
    try {
      const r = await api(`/seller/products/${id}`, { method: 'PATCH', body: { isPublished } });
      setProduct(r.product);
    } catch (err) {
      setFormError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor">
      <Link to="/seller/products" className="back">{t('seller.backToProducts')}</Link>
      <h1>{isNew ? t('seller.newProduct') : t('seller.editProduct')}</h1>
      {message && <Notice kind="success">{t(message)}</Notice>}

      <div className="editor__layout">
        <form className="stack editor__form" onSubmit={save} noValidate>
          <Field label={t('seller.title')} value={form.title} onChange={set('title')} error={errors.title} maxLength={120} />
          <Field label={t('seller.category')} as="select" value={form.categoryId} onChange={set('categoryId')} error={errors.categoryId}>
            <option value="">{t('seller.chooseCategory')}</option>
            {cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{l.category(c)}</option>)}
          </Field>
          <Field label={t('seller.description')} as="textarea" rows={6} value={form.description} onChange={set('description')} error={errors.description} />
          <div className="field-row">
            <Field label={t('seller.price')} type="number" inputMode="numeric" min="1" step="1" value={form.priceAmd} onChange={set('priceAmd')} error={errors.priceAmd} />
            <Field label={t('seller.stock')} type="number" inputMode="numeric" min="0" step="1" value={form.stock} onChange={set('stock')} error={errors.stock} />
          </div>
          {formError && <Notice kind="error">{l.error(formError)}</Notice>}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? t('seller.saving') : isNew ? t('seller.saveDraft') : t('seller.save')}
          </button>
        </form>

        {product && (
          <div className="editor__side">
            <Photos product={product} onImages={(images) => setProduct((p) => ({ ...p, images }))} />
            <section className="visibility" aria-labelledby="vis-h">
              <h2 id="vis-h">{t('seller.publishState')}</h2>
              <p>{product.isPublished ? t('seller.isPublished') : t('seller.isDraft')}</p>
              <div className="actions">
                <button type="button" className={`btn ${product.isPublished ? 'btn--quiet' : 'btn--primary'}`} disabled={busy}
                  onClick={() => setPublished(!product.isPublished)}>
                  {product.isPublished ? t('seller.unpublish') : t('seller.publish')}
                </button>
                <Link to={`/products/${product.id}`}>{t('seller.viewInStore')}</Link>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
