import { Link } from 'react-router';
import { Price, Stars, Thumb } from './ui.jsx';
import { useLang } from '../i18n.jsx';

export function ProductCard({ product }) {
  const { t } = useLang();
  return (
    <li className="card">
      <Link to={`/products/${product.id}`} className="card__link">
        <span className="card__media">
          <Thumb image={product.image} />
          {product.stock === 0 && <span className="card__flag">{t('product.outOfStock')}</span>}
        </span>
        <span className="card__title">{product.title}</span>
      </Link>
      <Price amd={product.priceAmd} className="card__price" />
      <Stars value={product.ratingAvg} count={product.ratingCount} />
      <span className="card__store">{product.seller.storeName}</span>
    </li>
  );
}

export function ProductGrid({ products }) {
  return (
    <ul className="grid">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </ul>
  );
}
