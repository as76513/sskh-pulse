import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Admin() {
  const [tab, setTab] = useState('report');
  return (
    <>
      <div className="card" style={{ padding: 10 }}>
        <div className="row">
          <button className={`btn ${tab === 'report' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('report')}>Report</button>
          <button className={`btn ${tab === 'leaves' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('leaves')}>Leaves</button>
          <button className={`btn ${tab === 'employees' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('employees')}>Employees</button>
          <button className={`btn ${tab === 'add' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('add')}>Add Emp</button>
        </div>
      </div>
      {tab === 'report' && <DailyReport />}
      {tab === 'leaves' && <PendingLeaves />}
      {tab === 'employees' && <EmployeeList />}
      {tab === 'add' && <AddEmployee />}
    </>
  );
}

function DailyReport() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  async function load() { setData(await api(`/admin/report?date=${date}`)); }
  useEffect(() => { load(); }, [date]);

  async function removeEntry(emp_code) {
    if (!window.confirm(`Delete ${emp_code}'s attendance entry for ${date}?`)) return;
    await api('/admin/attendance/delete', { method: 'POST', body: { emp_code, work_date: date } });
    await load();
  }

  return (
    <div className="card">
      <h3>Daily Report</h3>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        {data?.records?.map((r) => (
          <div className="list-item" key={r.emp_code}>
            <div>
              <div>{r.name}</div>
              <div className="muted">{r.emp_code} · {r.check_in ? new Date(r.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
            </div>
            <div className="row" style={{ flex: 'none', alignItems: 'center', gap: 8 }}>
              <span className={`pill ${r.status || 'absent'}`}>{r.status || 'absent'}</span>
              {r.status && (
                <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 10px', fontSize: 11 }}
                        onClick={() => removeEntry(r.emp_code)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingLeaves() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  async function load() { setList(await api('/leaves/pending')); }
  useEffect(() => { load(); }, []);
  async function decide(id, decision) {
    setMsg(null);
    try {
      await api(`/leaves/${id}/decide`, { method: 'POST', body: { decision } });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  return (
    <div className="card">
      <h3>Pending Leaves</h3>
      {list.length === 0 && <div className="muted">No pending requests.</div>}
      {msg && <div className="alert err">{msg.text}</div>}
      {list.map((l) => (
        <div key={l.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
          <div><strong>{l.name}</strong> <span className="muted">({l.emp_code})</span></div>
          <div className="muted">{l.leave_type} · {l.days}d · {l.from_date?.slice(0,10)} → {l.to_date?.slice(0,10)}</div>
          <div className="muted" style={{ margin: '4px 0' }}>{l.reason}</div>
          <div className="row">
            <button className="btn" style={{ margin: 0, padding: 8, fontSize: 13 }} onClick={() => decide(l.id, 'approved')}>Approve</button>
            <button className="btn danger" style={{ margin: 0, padding: 8, fontSize: 13 }} onClick={() => decide(l.id, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmployeeList() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  async function load() { setList(await api('/admin/employees')); }
  useEffect(() => { load(); }, []);

  async function toggleResignation(emp_code, enabled) {
    setMsg(null);
    try {
      await api(`/admin/employees/${emp_code}/resignation-access`, { method: 'POST', body: { enabled } });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <div className="card">
      <h3>Employees</h3>
      {msg && <div className="alert err">{msg.text}</div>}
      {list.map((e) => (
        <div key={e.emp_code} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
          <div><strong>{e.name}</strong> <span className="muted">({e.emp_code} · {e.role})</span></div>
          <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
            <span className="muted">Resignation request</span>
            {e.resignation_enabled ? (
              <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 10px', fontSize: 12 }}
                      onClick={() => toggleResignation(e.emp_code, false)}>Enabled — revoke</button>
            ) : (
              <button className="btn" style={{ width: 'auto', margin: 0, padding: '6px 10px', fontSize: 12 }}
                      onClick={() => toggleResignation(e.emp_code, true)}>Enable</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddEmployee() {
  const [form, setForm] = useState({ emp_code: '', name: '', email: '', password: '', role: 'employee', office_id: 1 });
  const [msg, setMsg] = useState(null);
  async function submit() {
    setMsg(null);
    try {
      await api('/admin/employees', { method: 'POST', body: form });
      setMsg({ ok: true, text: 'Employee created' });
      setForm({ emp_code: '', name: '', email: '', password: '', role: 'employee', office_id: 1 });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  return (
    <div className="card">
      <h3>Add Employee</h3>
      <label>Employee Code</label>
      <input value={form.emp_code} onChange={(e) => setForm({ ...form, emp_code: e.target.value })} />
      <label>Name</label>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label>Email</label>
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <label>Temp Password</label>
      <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <label>Role</label>
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        <option value="employee">Employee</option>
        <option value="admin">Admin</option>
      </select>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <button className="btn" onClick={submit}>Create</button>
    </div>
  );
}
