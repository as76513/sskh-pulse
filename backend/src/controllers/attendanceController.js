import {
  ddb,
  Tables,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '../config/dynamo.js';
import { distanceMeters } from '../utils/geo.js';

// Helper: fetch employee + their office in one shot
async function getEmpWithOffice(emp_code) {
  const { Item: emp } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code } })
  );
  if (!emp?.office_id) return emp;
  const { Item: office } = await ddb.send(
    new GetCommand({ TableName: Tables.offices, Key: { id: emp.office_id } })
  );
  return {
    ...emp,
    off_lat: office?.latitude,
    off_lng: office?.longitude,
    geofence_radius: office?.geofence_radius,
  };
}

export async function checkIn(req, res) {
  const { latitude, longitude } = req.body;
  const emp_code = req.user.emp_code;
  if (latitude == null || longitude == null)
    return res.status(400).json({ error: 'Location required' });

  const emp = await getEmpWithOffice(emp_code);
  if (!emp?.off_lat)
    return res.status(400).json({ error: 'No office assigned' });

  const dist = distanceMeters(latitude, longitude, emp.off_lat, emp.off_lng);
  if (dist > emp.geofence_radius)
    return res.status(403).json({
      error: `Outside office range (${Math.round(dist)}m away, allowed ${emp.geofence_radius}m)`,
    });

  const today = new Date().toISOString().slice(0, 10);

  const now = new Date();
  const [sh, sm] = emp.shift_start.split(':').map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(sh, sm + (emp.late_grace_min || 0), 0, 0);
  const isLate = now > shiftStart;

  try {
    const { Attributes: record } = await ddb.send(
      new UpdateCommand({
        TableName: Tables.attendance,
        Key: { emp_code, work_date: today },
        UpdateExpression:
          'SET check_in = :now, in_latitude = :lat, in_longitude = :lng, is_late = :late, #status = :present',
        ConditionExpression: 'attribute_not_exists(check_in)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':now': now.toISOString(),
          ':lat': latitude,
          ':lng': longitude,
          ':late': isLate,
          ':present': 'present',
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    res.json({ message: 'Checked in', is_late: isLate, record });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException')
      return res.status(409).json({ error: 'Already checked in today' });
    throw e;
  }
}

export async function checkOut(req, res) {
  const { latitude, longitude } = req.body;
  const emp_code = req.user.emp_code;
  const emp = await getEmpWithOffice(emp_code);
  const today = new Date().toISOString().slice(0, 10);

  const { Item: rec } = await ddb.send(
    new GetCommand({ TableName: Tables.attendance, Key: { emp_code, work_date: today } })
  );
  if (!rec?.check_in)
    return res.status(400).json({ error: 'Check in first' });
  if (rec.check_out)
    return res.status(409).json({ error: 'Already checked out' });

  const now = new Date();
  const workedHours = (now - new Date(rec.check_in)) / 36e5;
  const isHalfday = workedHours < Number(emp.halfday_hours);

  try {
    const { Attributes: record } = await ddb.send(
      new UpdateCommand({
        TableName: Tables.attendance,
        Key: { emp_code, work_date: today },
        UpdateExpression:
          'SET check_out = :now, out_latitude = :lat, out_longitude = :lng, worked_hours = :hrs, is_halfday = :half, #status = :status',
        ConditionExpression: 'attribute_exists(check_in) AND attribute_not_exists(check_out)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':now': now.toISOString(),
          ':lat': latitude,
          ':lng': longitude,
          ':hrs': Number(workedHours.toFixed(2)),
          ':half': isHalfday,
          ':status': isHalfday ? 'halfday' : 'present',
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    res.json({
      message: 'Checked out',
      worked_hours: Number(workedHours.toFixed(2)),
      is_halfday: isHalfday,
      record,
    });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException')
      return res.status(409).json({ error: 'Already checked out' });
    throw e;
  }
}

export async function todayStatus(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: Tables.attendance,
      Key: { emp_code: req.user.emp_code, work_date: today },
    })
  );
  res.json(Item || null);
}

export async function myHistory(req, res) {
  const { month } = req.query; // 'YYYY-MM' optional
  const params = {
    TableName: Tables.attendance,
    KeyConditionExpression: month
      ? 'emp_code = :e AND begins_with(work_date, :m)'
      : 'emp_code = :e',
    ExpressionAttributeValues: month
      ? { ':e': req.user.emp_code, ':m': month }
      : { ':e': req.user.emp_code },
    ScanIndexForward: false,
    Limit: 60,
  };
  const { Items } = await ddb.send(new QueryCommand(params));
  res.json(Items);
}

// Mark an absence with reason (for days with no check-in)
export async function markAbsence(req, res) {
  const { work_date, reason } = req.body;
  if (!work_date || !reason)
    return res.status(400).json({ error: 'work_date and reason required' });

  const emp_code = req.user.emp_code;
  const { Item: existing } = await ddb.send(
    new GetCommand({ TableName: Tables.attendance, Key: { emp_code, work_date } })
  );

  if (!existing) {
    const item = { emp_code, work_date, status: 'absent', absence_reason: reason };
    await ddb.send(new PutCommand({ TableName: Tables.attendance, Item: item }));
    return res.json(item);
  }

  const { Attributes: record } = await ddb.send(
    new UpdateCommand({
      TableName: Tables.attendance,
      Key: { emp_code, work_date },
      UpdateExpression: 'SET absence_reason = :r',
      ExpressionAttributeValues: { ':r': reason },
      ReturnValues: 'ALL_NEW',
    })
  );
  res.json(record);
}
