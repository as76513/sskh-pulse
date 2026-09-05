import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { getPosition } from '../utils/geo.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Home() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setToday(await api('/attendance/today'));
    setHistory(await api('/attendance/history'));
  }
  useEffect(() => { load(); }, []);

  async function punch(kind) {
    setMsg(null); setBusy(true);
    try {
      const loc = await getPosition();
      const res = await api(`/attendance/${kind}`, {
        method: 'POST',
        body: { latitude: loc.latitude, longitude: loc.longitude },
      });
      setMsg({ ok: true, text: res.message + (res.is_late ? ' (Late)' : '') });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = today?.check_in && !today?.check_out;
  const done = today?.check_in && today?.check_out;

  return (
    <>
      <div className="card big-status">
        <div className="date">Hello, {user?.name} 👋</div>
        <div className="time">{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="date">{clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
      </div>

      <div className="card">
        <h3>Attendance</h3>
        {today?.check_in && (
          <div className="list-item">
            <span>Check In</span>
            <span>{new Date(today.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              {today.is_late && <span className="pill late" style={{ marginLeft: 6 }}>Late</span>}
            </span>
          </div>
        )}
        {today?.check_out && (
          <div className="list-item">
            <span>Check Out</span>
            <span>{new Date(today.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              {today.is_halfday && <span className="pill halfday" style={{ marginLeft: 6 }}>Half</span>}
            </span>
          </div>
        )}

        {!checkedIn && !done && (
          <button className="btn" onClick={() => punch('check-in')} disabled={busy}>
            {busy ? 'Locating…' : '📍 Check In'}
          </button>
        )}
        {checkedIn && (
          <button className="btn" onClick={() => punch('check-out')} disabled={busy}>
            {busy ? 'Locating…' : '📍 Check Out'}
          </button>
        )}
        {done && <div className="alert ok">✓ Attendance complete for today ({today.worked_hours}h)</div>}
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </div>

      <MonthCalendar />

      <div className="card">
        <h3>Recent History</h3>
        {history.length === 0 && <div className="muted">No records yet.</div>}
        {history.slice(0, 10).map((h) => (
          <div className="list-item" key={h.work_date}>
            <span>{new Date(h.work_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            <span className={`pill ${h.status}`}>{h.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const LEAVE_ABBR = { casual: 'CL', sick: 'SL', earned: 'PL', unpaid: 'LWP' };
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function MonthCalendar() {
  const [open, setOpen] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [history, setHistory] = useState([]);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    api(`/attendance/history?month=${month}`).then(setHistory);
    api('/leaves/mine').then(setLeaves);
  }, [month]);

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstWeekday = new Date(year, mon - 1, 1).getDay();

  const historyByDate = useMemo(
    () => Object.fromEntries(history.map((h) => [h.work_date, h])),
    [history]
  );

  const leaveByDate = useMemo(() => {
    const map = {};
    for (const l of leaves) {
      if (l.status !== 'approved') continue;
      const from = l.from_date?.slice(0, 10);
      const to = l.to_date?.slice(0, 10);
      if (!from || !to) continue;
      for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        if (ds.slice(0, 7) === month) map[ds] = l;
      }
    }
    return map;
  }, [leaves, month]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const presentCount = history.filter((h) => h.status === 'present' || h.status === 'halfday').length;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const leave = leaveByDate[dateStr];
    const att = historyByDate[dateStr];
    let cls = '';
    let label = '';
    if (leave) { cls = 'present'; label = LEAVE_ABBR[leave.leave_type] || 'LV'; }
    else if (att?.status === 'present') { cls = 'present'; label = '✓'; }
    else if (att?.status === 'halfday') { cls = 'halfday'; label = 'H'; }
    else if (att?.status === 'absent') { cls = 'absent'; label = 'A'; }
    cells.push({ day, dateStr, cls, label, isToday: dateStr === todayStr });
  }

  return (
    <div className="card" style={{ paddingBottom: open ? 18 : 0 }}>
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <h3 style={{ margin: 0, color: 'inherit' }}>Monthly Calendar</h3>
        <span className={`chevron${open ? ' open' : ''}`}>›</span>
      </div>
      {open && (
        <>
          <div className="cal-summary">
            <span>Present</span>
            <strong>{presentCount} / {daysInMonth} days</strong>
          </div>
          <div className="cal-nav">
            <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px' }}
                    onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
            <span>{monthLabel(month)}</span>
            <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px' }}
                    onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {cells.map((c, i) => c ? (
              <div key={c.dateStr} className={`cal-cell ${c.cls}${c.isToday ? ' today' : ''}`.trim()} title={c.dateStr}>
                <span className="cal-day-num">{c.day}</span>
                {c.label && <span className="cal-label">{c.label}</span>}
              </div>
            ) : <div key={`blank-${i}`} className="cal-cell empty" />)}
          </div>
        </>
      )}
    </div>
  );
}
