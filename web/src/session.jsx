// Who is signed in, and how many items are in their cart (for the header badge).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async (u = user) => {
    if (!u) return setCartCount(0);
    try {
      const { cart } = await api('/cart');
      setCartCount(cart.itemCount);
    } catch { /* badge is not critical */ }
  }, [user]);

  useEffect(() => {
    api('/me')
      .then(({ user: u }) => { setUser(u); refreshCart(u); })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = useCallback((u) => { setUser(u); refreshCart(u); }, [refreshCart]);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } finally {
      setUser(null);
      setCartCount(0);
    }
  }, []);

  return (
    <SessionContext.Provider value={{ user, ready, setUser, signedIn, logout, cartCount, setCartCount, refreshCart }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
