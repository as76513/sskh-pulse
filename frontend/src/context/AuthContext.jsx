import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sskh_token');
    if (!token) { setLoading(false); return; }
    api('/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('sskh_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(emp_code, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: { emp_code, password },
    });
    localStorage.setItem('sskh_token', data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('sskh_token');
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
