import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [pwd, setPwd] = useState({ old_password: '', new_password: '' });
  const [resign, setResign] = useState({ reason: '', last_working_day: '' });
  const [existingResign, setExistingResign] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setMe(await api('/auth/me'));
    setExistingResign(await api('/resignation/mine'));
  }
  useEffect(() => { load(); }, []);

  async function changePwd() {
    setMsg(null);
    try {
      await api('/auth/change-password', { method: 'POST', body: pwd });
      setMsg({ ok: true, text: 'Password changed' });
      setPwd({ old_password: '', new_password: '' });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  async function submitResign() {
    setMsg(null);
    try {
      await api('/resignation', { method: 'POST', body: resign });
      setMsg({ ok: true, text: 'Resignation submitted' });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <>
      <div className="card">
        <h3>My Profile</h3>
        <div className="list-item"><span className="muted">Code</span><span>{me?.emp_code}</span></div>
        <div className="list-item"><span className="muted">Name</span><span>{me?.name}</span></div>
        <div className="list-item"><span className="muted">Email</span><span>{me?.email || '—'}</span></div>
        <div className="list-item"><span className="muted">Shift</span><span>{me?.shift_start?.slice(0,5)} – {me?.shift_end?.slice(0,5)}</span></div>
        <div className="list-item"><span className="muted">Leave Balance</span><span>{me?.leave_balance} days</span></div>
      </div>

      <div className="card">
        <h3>Change Password</h3>
        <label>Old Password</label>
        <input type="password" value={pwd.old_password}
               onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })} />
        <label>New Password</label>
        <input type="password" value={pwd.new_password}
               onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} />
        <button className="btn" onClick={changePwd}>Update Password</button>
      </div>

      {(existingResign || me?.resignation_enabled) && (
        <div className="card">
          <h3>Resignation</h3>
          {existingResign ? (
            <div>
              <div className="list-item"><span className="muted">Status</span>
                <span className={`pill ${existingResign.status === 'pending' ? 'pending' : 'approved'}`}>{existingResign.status}</span>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>Reason: {existingResign.reason}</div>
            </div>
          ) : (
            <>
              <label>Last Working Day</label>
              <input type="date" value={resign.last_working_day}
                     onChange={(e) => setResign({ ...resign, last_working_day: e.target.value })} />
              <label>Reason</label>
              <textarea value={resign.reason}
                        onChange={(e) => setResign({ ...resign, reason: e.target.value })}
                        placeholder="Reason for resignation" />
              <button className="btn danger" onClick={submitResign}>Submit Resignation</button>
            </>
          )}
        </div>
      )}

      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </>
  );
}
