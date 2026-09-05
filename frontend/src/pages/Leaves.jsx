import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Leaves() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { setList(await api('/leaves/mine')); }
  useEffect(() => { load(); }, []);

  async function submit() {
    setMsg(null); setBusy(true);
    try {
      await api('/leaves', { method: 'POST', body: form });
      setMsg({ ok: true, text: 'Leave applied' });
      setForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3>Apply for Leave</h3>
        <label>Type</label>
        <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
          <option value="casual">Casual</option>
          <option value="sick">Sick</option>
          <option value="earned">Earned</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <div className="row">
          <div>
            <label>From</label>
            <input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
          </div>
        </div>
        <label>Reason</label>
        <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Reason for leave" />
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <button className="btn" onClick={submit} disabled={busy}>Apply</button>
      </div>

      <div className="card">
        <h3>My Leaves</h3>
        {list.length === 0 && <div className="muted">No leave applications.</div>}
        {list.map((l) => (
          <div className="list-item" key={l.id}>
            <div>
              <div>{l.leave_type} · {l.days}d</div>
              <div className="muted">{l.from_date?.slice(0, 10)} → {l.to_date?.slice(0, 10)}</div>
            </div>
            <span className={`pill ${l.status}`}>{l.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}
