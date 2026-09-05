import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.jpg';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="logo"><img src={logo} alt="Shubh Shree Knowledge Hub" /></div>
        <div style={{ flex: 1 }}>
          <h1>SSKH Pulse</h1>
          <small>Shubh Shree Knowledge Hub</small>
        </div>
        <button
          className="btn secondary"
          style={{ width: 'auto', margin: 0, padding: '8px 12px', fontSize: 12 }}
          onClick={() => { logout(); nav('/login'); }}
        >
          Logout
        </button>
      </div>

      <div className="content">{children}</div>

      <nav className="tabbar">
        <NavLink to="/" end><span className="ic">🏠</span>Home</NavLink>
        <NavLink to="/leaves"><span className="ic">🌴</span>Leaves</NavLink>
        <NavLink to="/documents"><span className="ic">📄</span>Docs</NavLink>
        <NavLink to="/profile"><span className="ic">👤</span>Profile</NavLink>
        {isAdmin && <NavLink to="/admin"><span className="ic">🛠️</span>Admin</NavLink>}
      </nav>
    </div>
  );
}
