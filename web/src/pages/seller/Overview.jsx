import { Link } from 'react-router';
import { useApi, useTitle } from '../../hooks.js';
import { useLang } from '../../i18n.jsx';
import { useSession } from '../../session.jsx';
import { ErrorState, Loading, Price, StatusBadge } from '../../components/ui.jsx';

const ORDER = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export default function Overview() {
  const l = useLang();
  const { t } = l;
  const { user } = useSession();
  useTitle(t('seller.overview'));
  const { data, error, loading, reload } = useApi('/seller/overview');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const max = Math.max(1, ...ORDER.map((s) => data.ordersByStatus[s]));

  return (
    <div className="overview">
      <h1>{user.storeName}</h1>
      <div className="figures">
        <Link to="/seller/orders?status=placed" className="figure">
          <span className="figure__num">{data.toConfirm}</span>
          <span className="figure__label">{t('seller.toConfirm')}</span>
        </Link>
        <Link to="/seller/orders?status=confirmed" className="figure">
          <span className="figure__num">{data.toShip}</span>
          <span className="figure__label">{t('seller.toShip')}</span>
        </Link>
        <div className="figure figure--money">
          <Price amd={data.revenueLast30DaysAmd} className="figure__num" />
          <span className="figure__label">{t('seller.revenue')}</span>
          <span className="figure__hint muted">{t('seller.revenueHint')}</span>
        </div>
      </div>

      <section className="bystatus" aria-labelledby="bystatus-h">
        <h2 id="bystatus-h">{t('seller.byStatus')}</h2>
        <ul>
          {ORDER.map((s) => (
            <li key={s}>
              <Link to={`/seller/orders?status=${s}`} className="bystatus__row">
                <StatusBadge status={s} />
                <span className="bystatus__bar" aria-hidden="true">
                  <span className={`bystatus__fill bystatus__fill--${s}`} style={{ width: `${(data.ordersByStatus[s] / max) * 100}%` }} />
                </span>
                <span className="bystatus__n">{data.ordersByStatus[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
