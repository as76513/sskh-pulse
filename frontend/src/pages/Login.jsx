import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.jpg';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [emp, setEmp] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(''); setBusy(true);
    try {
      await login(emp, pwd);
      nav('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="login-box">
        <div className="brand-logo pulse"><img src={logo} alt="Shubh Shree Knowledge Hub" /></div>
        <h2>SSKH Pulse</h2>
        <div className="sub">Shubh Shree Knowledge Hub Private Limited</div>

        <div className="card" style={{ textAlign: 'left' }}>
          <label>Employee Code</label>
          <input value={emp} onChange={(e) => setEmp(e.target.value)}
                 placeholder="EMP001" autoCapitalize="characters" />
          <label>Password</label>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                 placeholder="••••••••"
                 onKeyDown={(e) => e.key === 'Enter' && submit()} />
          {err && <div className="alert err">{err}</div>}
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
