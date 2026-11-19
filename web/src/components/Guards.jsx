// Route guards. These only decide what to show; the server checks every permission itself.
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../session.jsx';
import { Loading } from './ui.jsx';

export function RequireAuth() {
  const { user, ready } = useSession();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export function RequireSeller() {
  const { user, ready } = useSession();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!user.isSeller) return <Navigate to="/sell" replace />;
  return <Outlet />;
}
