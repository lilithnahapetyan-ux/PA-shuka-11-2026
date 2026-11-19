// Log in, register, edit name and phone, become a seller.
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useTitle } from '../hooks.js';
import { useLang } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { check, collect } from '../validate.js';
import { Field, Notice, serverFieldErrors } from '../components/ui.jsx';

/** Shared form state: values, per-field errors, a form-level error, busy flag. */
function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  return { values, setValues, errors, setErrors, formError, setFormError, busy, setBusy, set };
}

/** Only allow redirects inside this site. */
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export function Login() {
  const l = useLang();
  const { t } = l;
  useTitle(t('auth.loginTitle'));
  const { user, signedIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const f = useForm({ email: '', password: '' });

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const v = collect({ email: check.email(f.values.email), password: f.values.password ? null : 'v.required' });
    f.setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;
    f.setBusy(true); f.setFormError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: f.values });
      signedIn(r.user);
      navigate(next, { replace: true });
    } catch (err) {
      f.setBusy(false);
      f.setFormError(err);
    }
  };

  return (
    <div className="page narrow">
      <h1>{t('auth.loginTitle')}</h1>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('auth.email')} type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
        <Field label={t('auth.password')} type="password" autoComplete="current-password" value={f.values.password} onChange={f.set('password')} error={f.errors.password} />
        {f.formError && <Notice kind="error">{l.error(f.formError)}</Notice>}
        <button type="submit" className="btn btn--primary btn--wide" disabled={f.busy}>{f.busy ? t('auth.loggingIn') : t('auth.login')}</button>
      </form>
      <p className="muted">{t('auth.noAccount')} <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('nav.register')}</Link></p>
      <p className="muted small">{t('auth.demo')}</p>
    </div>
  );
}

export function Register() {
  const l = useLang();
  const { t } = l;
  useTitle(t('auth.registerTitle'));
  const { user, signedIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const f = useForm({ name: '', email: '', phone: '', password: '' });

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const v = collect({
      name: check.required(f.values.name), email: check.email(f.values.email),
      phone: check.phone(f.values.phone), password: check.password(f.values.password),
    });
    f.setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;
    f.setBusy(true); f.setFormError(null);
    try {
      const r = await api('/auth/register', { method: 'POST', body: f.values });
      signedIn(r.user);
      navigate(next, { replace: true });
    } catch (err) {
      f.setBusy(false);
      if (Object.keys(err.fields).length) f.setErrors(serverFieldErrors(err, l)); else f.setFormError(err);
    }
  };

  return (
    <div className="page narrow">
      <h1>{t('auth.registerTitle')}</h1>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('auth.name')} autoComplete="name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
        <Field label={t('auth.email')} type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
        <Field label={t('auth.phone')} type="tel" autoComplete="tel" placeholder="+374 91 123456" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
        <Field label={t('auth.password')} type="password" autoComplete="new-password" hint={t('auth.passwordHint')} value={f.values.password} onChange={f.set('password')} error={f.errors.password} />
        {f.formError && <Notice kind="error">{l.error(f.formError)}</Notice>}
        <button type="submit" className="btn btn--primary btn--wide" disabled={f.busy}>{f.busy ? t('auth.registering') : t('auth.register')}</button>
      </form>
      <p className="muted">{t('auth.hasAccount')} <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('nav.login')}</Link></p>
    </div>
  );
}

export function Account() {
  const l = useLang();
  const { t } = l;
  useTitle(t('account.title'));
  const { user, setUser } = useSession();
  const f = useForm({ name: user.name, phone: user.phone });
  const [saved, setSaved] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    const v = collect({ name: check.required(f.values.name), phone: check.phone(f.values.phone) });
    f.setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;
    f.setBusy(true); f.setFormError(null);
    try {
      const r = await api('/me', { method: 'PATCH', body: f.values });
      setUser(r.user);
      setSaved(true);
    } catch (err) {
      if (Object.keys(err.fields).length) f.setErrors(serverFieldErrors(err, l)); else f.setFormError(err);
    } finally {
      f.setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <h1>{t('account.title')}</h1>
      <p className="muted">{user.email}</p>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('auth.name')} autoComplete="name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
        <Field label={t('auth.phone')} type="tel" autoComplete="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
        {f.formError && <Notice kind="error">{l.error(f.formError)}</Notice>}
        {saved && <Notice kind="success">{t('account.saved')}</Notice>}
        <button type="submit" className="btn btn--primary" disabled={f.busy}>{f.busy ? t('account.saving') : t('account.save')}</button>
      </form>
    </div>
  );
}

export function BecomeSeller() {
  const l = useLang();
  const { t } = l;
  useTitle(t('sell.title'));
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const f = useForm({ storeName: '', phone: user.phone });
  const [activated, setActivated] = useState(false);

  // Someone who is already a seller goes to the dashboard, but not right after activating
  // here: then we go straight to "add your first product".
  if (user.isSeller && !activated) return <Navigate to="/seller" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const v = collect({ storeName: check.storeName(f.values.storeName), phone: check.phone(f.values.phone) });
    f.setErrors(Object.fromEntries(Object.entries(v).map(([k, key]) => [k, t(key)])));
    if (Object.keys(v).length) return;
    f.setBusy(true); f.setFormError(null);
    try {
      const r = await api('/seller/activate', { method: 'POST', body: f.values });
      setActivated(true);
      setUser(r.user);
      navigate('/seller/products/new', { replace: true });
    } catch (err) {
      f.setBusy(false);
      if (Object.keys(err.fields).length) f.setErrors(serverFieldErrors(err, l)); else f.setFormError(err);
    }
  };

  return (
    <div className="page narrow">
      <h1>{t('sell.title')}</h1>
      <p className="lead">{t('sell.lead')}</p>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('sell.storeName')} value={f.values.storeName} onChange={f.set('storeName')} error={f.errors.storeName} autoComplete="organization" />
        <Field label={t('sell.phone')} type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} autoComplete="tel" />
        {f.formError && <Notice kind="error">{l.error(f.formError)}</Notice>}
        <button type="submit" className="btn btn--primary btn--wide" disabled={f.busy}>{f.busy ? t('sell.starting') : t('sell.start')}</button>
      </form>
    </div>
  );
}

export function NotFound() {
  const { t } = useLang();
  useTitle(t('common.notFound'));
  return (
    <div className="page empty">
      <p className="empty__title">{t('common.notFound')}</p>
      <Link to="/" className="btn">{t('common.home')}</Link>
    </div>
  );
}
