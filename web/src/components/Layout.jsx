// Header (logo, search, categories, cart, account, language) on every page, and the footer.
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useLang } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { useApi } from '../hooks.js';

const GridIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="icon">
    {[4, 13].flatMap((x) => [4, 13].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />))}
  </svg>
);
const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="icon">
    <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** A button that opens a small menu; closes on outside click, Escape, or navigation. */
function Menu({ label, buttonContent, children, align = 'start' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="menu__button" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {buttonContent}
      </button>
      {open && <div className={`menu__panel menu__panel--${align}`}>{children}</div>}
    </div>
  );
}

function SearchBox() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(location.pathname === '/search' ? params.get('q') ?? '' : '');

  useEffect(() => {
    if (location.pathname === '/search') setQ(params.get('q') ?? '');
  }, [location.pathname, params]);

  return (
    <form
      className="search" role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
      }}
    >
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nav.search')} aria-label={t('nav.search')} />
      <button type="submit" className="search__button">{t('nav.searchButton')}</button>
    </form>
  );
}

function Header() {
  const l = useLang();
  const { t } = l;
  const { user, cartCount, logout } = useSession();
  const navigate = useNavigate();
  const { data } = useApi('/categories');
  const categories = data?.categories ?? [];

  return (
    <header className="header">
      <div className="header__inner">
        <Link to="/" className="logo" aria-label="Shuka">
          <span className="logo__latin">Shuka</span>
          <span className="logo__armenian" lang="hy">Շուկա</span>
        </Link>

        <SearchBox />

        <nav className="header__nav" aria-label="Main">
          <Menu label={t('nav.categories')} buttonContent={<><GridIcon /><span className="hide-sm">{t('nav.categories')}</span></>}>
            <ul className="menu__list">
              <li><Link to="/search">{t('nav.allProducts')}</Link></li>
              {categories.map((c) => (
                <li key={c.slug}><Link to={`/search?category=${c.slug}`}>{l.category(c)}</Link></li>
              ))}
            </ul>
          </Menu>

          <div className="lang" role="group" aria-label={t('nav.language')}>
            <button type="button" aria-pressed={l.lang === 'en'} onClick={() => l.setLang('en')}>EN</button>
            <button type="button" aria-pressed={l.lang === 'hy'} onClick={() => l.setLang('hy')} lang="hy">Հայ</button>
          </div>

          {user ? (
            <Menu label={t('nav.account')} align="end" buttonContent={<><PersonIcon /><span className="account-name hide-sm">{user.name.split(' ')[0]}</span></>}>
              <ul className="menu__list">
                <li><Link to="/orders">{t('nav.myOrders')}</Link></li>
                <li>{user.isSeller ? <Link to="/seller">{t('nav.sellerDashboard')}</Link> : <Link to="/sell">{t('nav.sell')}</Link>}</li>
                <li><Link to="/account">{t('nav.profile')}</Link></li>
                <li>
                  <button type="button" onClick={async () => { await logout(); navigate('/'); }}>{t('nav.logout')}</button>
                </li>
              </ul>
            </Menu>
          ) : (
            <Link to="/login" className="header__link"><PersonIcon /><span className="hide-xs">{t('nav.login')}</span></Link>
          )}

          <Link to="/cart" className="cart-link" aria-label={t('nav.cartCount', { n: cartCount })}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
              <circle cx="17" cy="20" r="1.4" fill="currentColor" />
            </svg>
            <span className="cart-link__label">{t('nav.cart')}</span>
            {cartCount > 0 && <span className="cart-link__count">{cartCount}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Layout() {
  const { t } = useLang();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <span className="logo logo--small"><span className="logo__latin">Shuka</span><span className="logo__armenian" lang="hy">Շուկա</span></span>
          <p>{t('footer.note')}</p>
        </div>
      </footer>
    </>
  );
}

/** Left navigation inside the seller dashboard. */
export function SellerLayout() {
  const { t } = useLang();
  const { data } = useApi('/seller/overview');
  return (
    <div className="seller">
      <nav className="seller__nav" aria-label={t('nav.sellerDashboard')}>
        <NavLink to="/seller" end>{t('seller.overview')}</NavLink>
        <NavLink to="/seller/products">{t('seller.products')}</NavLink>
        <NavLink to="/seller/orders">
          {t('seller.orders')}
          {data?.toConfirm > 0 && <span className="seller__badge">{data.toConfirm}</span>}
        </NavLink>
      </nav>
      <div className="seller__body"><Outlet /></div>
    </div>
  );
}
