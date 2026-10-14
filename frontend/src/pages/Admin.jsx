import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Admin() {
  const [tab, setTab] = useState('report');
  return (
    <>
      <div className="card" style={{ padding: 10 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${tab === 'report' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('report')}>Report</button>
          <button className={`btn ${tab === 'monthly' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('monthly')}>Monthly</button>
          <button className={`btn ${tab === 'leaves' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('leaves')}>Leaves</button>
          <button className={`btn ${tab === 'employees' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('employees')}>Employees</button>
          <button className={`btn ${tab === 'add' ? '' : 'secondary'}`} style={{ margin: 0, fontSize: 12, padding: 10 }} onClick={() => setTab('add')}>Add Emp</button>
        </div>
      </div>
      {tab === 'report' && <DailyReport />}
      {tab === 'monthly' && <MonthlyReport />}
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
  const [form, setForm] = useState({ emp_code: '', name: '', email: '', password: '', role: 'employee', office_id: '1' });
  const [msg, setMsg] = useState(null);
  async function submit() {
    setMsg(null);
    try {
      await api('/admin/employees', { method: 'POST', body: form });
      setMsg({ ok: true, text: 'Employee created' });
      setForm({ emp_code: '', name: '', email: '', password: '', role: 'employee', office_id: '1' });
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
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
             placeholder="firstname.lastname@shubhshreeknowledgehub.com" />
      <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
        Login username is everything before the @ — so the email must match that exactly.
      </div>
      <label>Temp Password</label>
      <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
             placeholder="8+ chars, upper+lower+number+symbol" />
      <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
        Ignored if this email already has a password set elsewhere in the company account.
      </div>
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

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const LEAVE_ABBR = { casual: 'CL', sick: 'SL', earned: 'PL', unpaid: 'LWP' };

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(day) {
  if (day.status === 'leave') return LEAVE_ABBR[day.leave_type] || 'Leave';
  if (day.status === 'lwp') return 'LWP';
  if (day.status === 'LM') return 'LM';
  if (day.status === 'halfday') return 'Half';
  if (day.status === 'present') return 'Present';
  if (day.status === 'absent') return 'Absent';
  if (day.status === 'off') return 'Off';
  return '';
}

function downloadMonthlyCsv(data) {
  const { employee, month, summary, days } = data;
  const rows = [
    ['Employee', `${employee.name} (${employee.emp_code})`],
    ['Month', monthLabel(month)],
    [],
    ['Present', summary.present],
    ['Late mark (LM)', summary.late],
    ['LM deduction (leaves)', summary.lm_deductions],
    ['Half day', summary.halfday],
    ['Paid leave', summary.leave],
    ['Unpaid / LWP', summary.lwp],
    ['Absent', summary.absent],
    ['Unmarked weekdays', summary.unmarked],
    ['Sundays off', summary.off],
    ['Payable days', summary.payable_days],
    [],
    ['Date', 'Weekday', 'Status', 'Check in', 'Check out', 'Hours', 'Leave type'],
    ...days.map((d) => [
      d.date,
      d.weekday,
      statusLabel(d) || d.status,
      fmtTime(d.check_in),
      fmtTime(d.check_out),
      d.worked_hours ?? '',
      d.leave_type || '',
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${employee.emp_code}-${month}-attendance.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function MonthlyReport() {
  const [employees, setEmployees] = useState([]);
  const [empCode, setEmpCode] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/admin/employees').then((rows) => {
      const list = (rows || []).filter((e) => e.status === 'active');
      setEmployees(list);
      if (list[0] && !empCode) setEmpCode(list[0].emp_code);
    });
  }, []);

  async function load() {
    if (!empCode) return;
    setBusy(true); setErr(null);
    try {
      setData(await api(`/admin/attendance/monthly?emp_code=${encodeURIComponent(empCode)}&month=${month}`));
    } catch (e) {
      setData(null);
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { if (empCode) load(); }, [empCode, month]);

  const [year, mon] = month.split('-').map(Number);
  const firstWeekday = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const byDate = Object.fromEntries((data?.days || []).map((d) => [d.date, d]));
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const d = byDate[dateStr];
    let cls = d?.status || '';
    let label = '';
    if (d?.status === 'present') label = '✓';
    else if (d?.status === 'LM') { cls = 'LM'; label = 'LM'; }
    else if (d?.status === 'halfday') label = 'H';
    else if (d?.status === 'leave') { cls = 'leave'; label = LEAVE_ABBR[d.leave_type] || 'LV'; }
    else if (d?.status === 'lwp') { cls = 'absent'; label = 'LWP'; }
    else if (d?.status === 'absent') label = 'A';
    else if (d?.status === 'off') { cls = 'off'; label = ''; }
    cells.push({ day, dateStr, cls, label });
  }
  const s = data?.summary;

  return (
    <div className="card">
      <h3>Monthly attendance</h3>
      <label>Employee</label>
      <select value={empCode} onChange={(e) => setEmpCode(e.target.value)}>
        {employees.map((e) => (
          <option key={e.emp_code} value={e.emp_code}>{e.name} ({e.emp_code})</option>
        ))}
      </select>
      <div className="cal-nav" style={{ marginTop: 12 }}>
        <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px' }}
                onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span>{monthLabel(month)}</span>
        <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px' }}
                onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      {err && <div className="alert err">{err}</div>}
      {busy && <div className="muted">Loading…</div>}
      {s && (
        <>
          <div className="stat-grid">
            <div className="stat"><span>Present</span><strong>{s.present}</strong></div>
            <div className="stat"><span>Late (LM)</span><strong>{s.late}</strong></div>
            <div className="stat"><span>LM deduction (leaves)</span><strong>{s.lm_deductions}</strong></div>
            <div className="stat"><span>Half day</span><strong>{s.halfday}</strong></div>
            <div className="stat"><span>Leave</span><strong>{s.leave}</strong></div>
            <div className="stat"><span>LWP</span><strong>{s.lwp}</strong></div>
            <div className="stat"><span>Absent</span><strong>{s.absent}</strong></div>
          </div>
          <div className="cal-summary">
            <span>Payable days</span>
            <strong>{s.payable_days}</strong>
          </div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Payable = present + LM + (half day × 0.5) + paid leave. Apply your own deduction for each LM or half day.
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {cells.map((c, i) => c ? (
              <div key={c.dateStr} className={`cal-cell ${c.cls}`.trim()} title={c.dateStr}>
                <span className="cal-day-num">{c.day}</span>
                {c.label && <span className="cal-label">{c.label}</span>}
              </div>
            ) : <div key={`blank-${i}`} className="cal-cell empty" />)}
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => downloadMonthlyCsv(data)}>
            Download CSV
          </button>
        </>
      )}
    </div>
  );
}
