// Search and category results. Every filter lives in the URL, so a search can be shared.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { qs } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { ErrorState, Loading, Pagination } from '../components/ui.jsx';

const SORTS = ['newest', 'price_asc', 'price_desc', 'rating'];

export default function Search() {
  const l = useLang();
  const { t } = l;
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'newest';
  const page = Number(params.get('page')) > 0 ? Number(params.get('page')) : 1;

  const cats = useApi('/categories');
  const results = useApi(`/products${qs({ q, category, minPrice, maxPrice, sort: sort === 'newest' ? '' : sort, page: page > 1 ? page : '' })}`);
  const currentCat = cats.data?.categories.find((c) => c.slug === category);
  const heading = q ? t('search.resultsFor', { q }) : currentCat ? l.category(currentCat) : t('search.title');
  useTitle(heading);

  // Price inputs are edited locally and applied with the button (not on every keystroke).
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);
  useEffect(() => { setMin(minPrice); setMax(maxPrice); }, [minPrice, maxPrice]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Changes some params and always goes back to page 1. */
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    next.delete('page');
    setParams(next);
  };
  const pageLink = (p) => {
    const next = new URLSearchParams(params);
    p > 1 ? next.set('page', p) : next.delete('page');
    return `/search?${next}`;
  };
  const hasFilters = Boolean(category || minPrice || maxPrice);
  const total = results.data?.total;

  return (
    <div className="page search-page">
      <div className="search-page__head">
        <h1>{heading}</h1>
        {total !== undefined && <p className="muted">{total === 1 ? t('search.count1') : t('search.count', { n: total })}</p>}
      </div>

      <div className="search-page__layout">
        <aside className={`filters ${filtersOpen ? 'filters--open' : ''}`}>
          <button type="button" className="filters__toggle btn btn--quiet" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            {t('search.filters')}{hasFilters ? ' •' : ''}
          </button>
          <div className="filters__body">
            <fieldset>
              <legend>{t('search.category')}</legend>
              <ul className="filters__cats">
                <li><button type="button" aria-pressed={!category} onClick={() => update({ category: '' })}>{t('search.allCategories')}</button></li>
                {cats.data?.categories.map((c) => (
                  <li key={c.slug}>
                    <button type="button" aria-pressed={category === c.slug} onClick={() => update({ category: c.slug })}>
                      {l.category(c)}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
            <form className="filters__price" onSubmit={(e) => { e.preventDefault(); update({ minPrice: min, maxPrice: max }); }}>
              <fieldset>
                <legend>{t('search.price')}</legend>
                <div className="filters__range">
                  <label><span className="sr-only">{t('search.from')}</span>
                    <input type="number" inputMode="numeric" min="0" placeholder={t('search.from')} value={min} onChange={(e) => setMin(e.target.value)} />
                  </label>
                  <span aria-hidden="true">–</span>
                  <label><span className="sr-only">{t('search.to')}</span>
                    <input type="number" inputMode="numeric" min="0" placeholder={t('search.to')} value={max} onChange={(e) => setMax(e.target.value)} />
                  </label>
                </div>
                <button type="submit" className="btn btn--quiet">{t('search.apply')}</button>
              </fieldset>
            </form>
            {hasFilters && (
              <button type="button" className="link-button" onClick={() => update({ category: '', minPrice: '', maxPrice: '' })}>{t('search.clear')}</button>
            )}
          </div>
        </aside>

        <section className="search-page__results">
          <div className="sortbar">
            <label>
              {t('search.sort')}
              <select value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
                {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
              </select>
            </label>
          </div>

          {results.loading && <Loading />}
          {results.error && <ErrorState error={results.error} onRetry={results.reload} />}
          {results.data && results.data.total === 0 && (
            <div className="empty">
              <p className="empty__title">{t('search.empty')}</p>
              <p className="muted">{t('search.emptyHint')}</p>
              <Link to="/search" className="btn">{t('search.seeAll')}</Link>
            </div>
          )}
          {results.data && results.data.total > 0 && (
            <>
              <ProductGrid products={results.data.items} />
              <Pagination page={results.data.page} pages={results.data.pages} to={pageLink} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
