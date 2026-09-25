import crypto from 'crypto';
import {
  ddb,
  Tables,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  BatchGetCommand,
} from '../config/dynamo.js';
import { ensureCognitoUser } from '../config/cognito.js';
import { DEFAULT_LATE_GRACE_MIN, DEFAULT_SHIFT_END, DEFAULT_SHIFT_START } from '../utils/shift.js';

export async function createEmployee(req, res) {
  const {
    emp_code, name, email, phone, password, role,
    office_id, shift_start, shift_end, date_of_joining, leave_balance,
  } = req.body;
  if (!emp_code || !name || !email || !password)
    return res.status(400).json({ error: 'emp_code, name, email, password required' });

  const { Item: existing } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code } })
  );
  if (existing) return res.status(409).json({ error: 'emp_code or email exists' });

  const { Items: byEmail } = await ddb.send(new QueryCommand({
    TableName: Tables.employees,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': email },
  }));
  if (byEmail.length) return res.status(409).json({ error: 'emp_code or email exists' });

  // If this email is already a real Cognito user (e.g. someone the other
  // app provisioned), leave their existing password alone entirely — just
  // register them as an SSKH Pulse employee. `password` only takes effect
  // for a genuinely new Cognito user.
  await ensureCognitoUser(email, password);

  const item = {
    emp_code,
    name,
    email,
    phone: phone || null,
    role: role || 'employee',
    office_id: office_id || null,
    shift_start: shift_start || DEFAULT_SHIFT_START,
    shift_end: shift_end || DEFAULT_SHIFT_END,
    late_grace_min: DEFAULT_LATE_GRACE_MIN,
    halfday_hours: 4.5,
    leave_balance: leave_balance ?? 24,
    date_of_joining: date_of_joining || null,
    status: 'active',
    resignation_enabled: false,
  };
  await ddb.send(new PutCommand({ TableName: Tables.employees, Item: item }));
  res.json({ emp_code: item.emp_code, name: item.name, role: item.role });
}

export async function listEmployees(req, res) {
  const { Items } = await ddb.send(new ScanCommand({ TableName: Tables.employees }));
  const rows = Items.map(({ password_hash, ...rest }) => rest).sort((a, b) =>
    a.emp_code.localeCompare(b.emp_code)
  );
  res.json(rows);
}

export async function listOffices(req, res) {
  const { Items } = await ddb.send(new ScanCommand({ TableName: Tables.offices }));
  res.json(Items.sort((a, b) => a.id.localeCompare(b.id)));
}

export async function createOffice(req, res) {
  const { name, latitude, longitude, geofence_radius } = req.body;
  const item = {
    id: crypto.randomUUID(),
    name,
    latitude,
    longitude,
    geofence_radius: geofence_radius ?? 100,
  };
  await ddb.send(new PutCommand({ TableName: Tables.offices, Item: item }));
  res.json(item);
}

// Shared by the admin's direct manual regularization (below) and
// regularizationController's approval flow (self-service requests).
export async function regularizeAttendanceRecord({ emp_code, work_date, check_in, check_out, status, note, decidedBy }) {
  const sets = ['regularized_by = :by', 'regularized_note = :note'];
  const values = { ':by': decidedBy, ':note': note || null };

  if (check_in) { sets.push('check_in = :ci'); values[':ci'] = check_in; }
  if (check_out) { sets.push('check_out = :co'); values[':co'] = check_out; }
  if (status) {
    sets.push('#status = :status');
    values[':status'] = status;
  } else {
    sets.push('#status = if_not_exists(#status, :defaultStatus)');
    values[':defaultStatus'] = 'present';
  }

  const { Attributes: record } = await ddb.send(
    new UpdateCommand({
      TableName: Tables.attendance,
      Key: { emp_code, work_date },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );
  return record;
}

// Admin edits/regularizes any attendance record directly
export async function regularizeAttendance(req, res) {
  const { emp_code, work_date, check_in, check_out, status, note } = req.body;
  if (!emp_code || !work_date)
    return res.status(400).json({ error: 'emp_code and work_date required' });

  const record = await regularizeAttendanceRecord({
    emp_code, work_date, check_in, check_out, status, note, decidedBy: req.user.emp_code,
  });
  res.json(record);
}

// Admin grants/revokes an employee's ability to submit a resignation request —
// hidden on the employee's Profile page until an admin enables it for them.
export async function setResignationAccess(req, res) {
  const { emp_code } = req.params;
  const { enabled } = req.body;
  const { Attributes: employee } = await ddb.send(
    new UpdateCommand({
      TableName: Tables.employees,
      Key: { emp_code },
      UpdateExpression: 'SET resignation_enabled = :e',
      ConditionExpression: 'attribute_exists(emp_code)',
      ExpressionAttributeValues: { ':e': !!enabled },
      ReturnValues: 'ALL_NEW',
    })
  ).catch((e) => {
    if (e.name === 'ConditionalCheckFailedException') return {};
    throw e;
  });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  const { password_hash, ...rest } = employee;
  res.json(rest);
}

// Admin deletes a wrongly-recorded attendance entry for a given day.
export async function deleteAttendance(req, res) {
  const { emp_code, work_date } = req.body;
  if (!emp_code || !work_date)
    return res.status(400).json({ error: 'emp_code and work_date required' });
  await ddb.send(
    new DeleteCommand({ TableName: Tables.attendance, Key: { emp_code, work_date } })
  );
  res.json({ message: 'Attendance entry deleted', emp_code, work_date });
}

// Daily report for all employees
export async function dailyReport(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const { Items: employees } = await ddb.send(
    new ScanCommand({
      TableName: Tables.employees,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    })
  );
  employees.sort((a, b) => a.emp_code.localeCompare(b.emp_code));

  // BatchGetCommand caps at 100 keys — fine at this company's scale.
  let attendanceByEmp = {};
  if (employees.length) {
    const { Responses } = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [Tables.attendance]: {
            Keys: employees.map((e) => ({ emp_code: e.emp_code, work_date: date })),
          },
        },
      })
    );
    attendanceByEmp = Object.fromEntries(
      (Responses?.[Tables.attendance] || []).map((a) => [a.emp_code, a])
    );
  }

  const records = employees.map((e) => {
    const a = attendanceByEmp[e.emp_code];
    return {
      emp_code: e.emp_code,
      name: e.name,
      check_in: a?.check_in ?? null,
      check_out: a?.check_out ?? null,
      is_late: a?.is_late ?? null,
      is_halfday: a?.is_halfday ?? null,
      worked_hours: a?.worked_hours ?? null,
      status: a?.status ?? null,
      absence_reason: a?.absence_reason ?? null,
    };
  });

  res.json({ date, records });
}

function eachDateInclusive(from, to) {
  const dates = [];
  const start = from.slice(0, 10);
  const end = to.slice(0, 10);
  let [y, m, d] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  while (y < ey || (y === ey && m < em) || (y === ey && m === em && d <= ed)) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return dates;
}

function weekdayName(dateStr) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(`${dateStr}T00:00:00Z`).getUTCDay()
  ];
}

// Month-long attendance + leave rollup for one employee (salary / deduction).
export async function monthlyAttendance(req, res) {
  const { emp_code, month } = req.query;
  if (!emp_code || !/^\d{4}-\d{2}$/.test(month || ''))
    return res.status(400).json({ error: 'emp_code and month (YYYY-MM) required' });

  const { Item: emp } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code } })
  );
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const { Items: attendance } = await ddb.send(
    new QueryCommand({
      TableName: Tables.attendance,
      KeyConditionExpression: 'emp_code = :e AND begins_with(work_date, :m)',
      ExpressionAttributeValues: { ':e': emp_code, ':m': month },
    })
  );
  const attByDate = Object.fromEntries((attendance || []).map((a) => [a.work_date, a]));

  const { Items: leaves } = await ddb.send(
    new QueryCommand({
      TableName: Tables.leaves,
      IndexName: 'emp_code-index',
      KeyConditionExpression: 'emp_code = :e',
      ExpressionAttributeValues: { ':e': emp_code },
    })
  );
  const leaveByDate = {};
  for (const l of leaves || []) {
    if (l.status !== 'approved' || l.leave_type === 'regularization') continue;
    const from = l.from_date?.slice(0, 10);
    const to = l.to_date?.slice(0, 10);
    if (!from || !to) continue;
    for (const ds of eachDateInclusive(from, to)) {
      if (ds.slice(0, 7) === month) leaveByDate[ds] = l;
    }
  }

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days = [];
  const summary = {
    present: 0,
    late: 0,
    halfday: 0,
    leave: 0,
    lwp: 0,
    absent: 0,
    unmarked: 0,
    off: 0,
    payable_days: 0,
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const weekday = weekdayName(date);
    const isSunday = weekday === 'Sunday';
    const leave = leaveByDate[date];
    const att = attByDate[date];

    let status = 'unmarked';
    let leave_type = null;
    if (leave) {
      leave_type = leave.leave_type || 'leave';
      if (leave_type === 'unpaid') {
        status = 'lwp';
        summary.lwp += 1;
      } else {
        status = 'leave';
        summary.leave += 1;
        summary.payable_days += 1;
      }
    } else if (att?.status === 'halfday' || att?.is_halfday) {
      status = 'halfday';
      summary.halfday += 1;
      summary.payable_days += 0.5;
    } else if (att?.status === 'LM' || att?.is_late) {
      status = 'LM';
      summary.late += 1;
      summary.payable_days += 1;
    } else if (att?.status === 'absent') {
      status = 'absent';
      summary.absent += 1;
    } else if (att?.status === 'present' || att?.check_in) {
      status = 'present';
      summary.present += 1;
      summary.payable_days += 1;
    } else if (isSunday) {
      status = 'off';
      summary.off += 1;
    } else {
      summary.unmarked += 1;
    }

    days.push({
      date,
      weekday,
      status,
      leave_type,
      check_in: att?.check_in ?? null,
      check_out: att?.check_out ?? null,
      worked_hours: att?.worked_hours ?? null,
      is_late: att?.is_late ?? false,
      is_halfday: att?.is_halfday ?? false,
    });
  }

  summary.payable_days = Number(summary.payable_days.toFixed(2));

  const { password_hash, ...empSafe } = emp;
  res.json({
    month,
    employee: { emp_code: empSafe.emp_code, name: empSafe.name, role: empSafe.role },
    summary,
    days,
  });
}
