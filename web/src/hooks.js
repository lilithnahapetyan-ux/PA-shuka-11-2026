import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Loads `path` (or does nothing when path is null). Re-runs when path changes. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!path) return;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((data) => mine === seq.current && setState({ data, error: null, loading: false }))
      .catch((error) => mine === seq.current && setState({ data: null, error, loading: false }));
  }, [path]);

  useEffect(load, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

/** Sets the browser tab title. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Shuka` : 'Shuka';
  }, [title]);
}
