import crypto from 'crypto';
import bcrypt from 'bcryptjs';
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

export async function createEmployee(req, res) {
  const {
    emp_code, name, email, phone, password, role,
    office_id, shift_start, shift_end, date_of_joining, leave_balance,
  } = req.body;
  if (!emp_code || !name || !password)
    return res.status(400).json({ error: 'emp_code, name, password required' });

  const { Item: existing } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code } })
  );
  if (existing) return res.status(409).json({ error: 'emp_code or email exists' });

  if (email) {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: Tables.employees,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': email },
      })
    );
    if (Items.length) return res.status(409).json({ error: 'emp_code or email exists' });
  }

  const hash = await bcrypt.hash(password, 10);
  const item = {
    emp_code,
    name,
    email: email || null,
    phone: phone || null,
    password_hash: hash,
    role: role || 'employee',
    office_id: office_id || null,
    shift_start: shift_start || '09:30',
    shift_end: shift_end || '18:30',
    late_grace_min: 15,
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

// Admin edits/regularizes any attendance record
export async function regularizeAttendance(req, res) {
  const { emp_code, work_date, check_in, check_out, status, note } = req.body;
  if (!emp_code || !work_date)
    return res.status(400).json({ error: 'emp_code and work_date required' });

  const sets = ['regularized_by = :by', 'regularized_note = :note'];
  const values = { ':by': req.user.emp_code, ':note': note || null };

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
