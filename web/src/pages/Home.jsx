import { Link } from 'react-router';
import { useApi, useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { ErrorState, Loading } from '../components/ui.jsx';

export default function Home() {
  const l = useLang();
  const { t } = l;
  useTitle(null);
  const cats = useApi('/categories');
  const newest = useApi('/products?sort=newest&pageSize=12');

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <p className="hero__mark" aria-hidden="true" lang="hy">Շ</p>
          <div className="hero__text">
            <h1>{t('home.title')}</h1>
            <p>{t('home.lead')}</p>
          </div>
        </div>
        {cats.data && (
          <nav className="hero__cats" aria-label={t('home.browse')}>
            {cats.data.categories.map((c) => (
              <Link key={c.slug} to={`/search?category=${c.slug}`} className="chip">
                {l.category(c)} <span className="chip__count">{c.productCount}</span>
              </Link>
            ))}
          </nav>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>{t('home.newest')}</h2>
          <Link to="/search">{t('home.seeAll')}</Link>
        </div>
        {newest.loading && <Loading />}
        {newest.error && <ErrorState error={newest.error} onRetry={newest.reload} />}
        {newest.data && <ProductGrid products={newest.data.items} />}
      </section>
    </>
  );
}
