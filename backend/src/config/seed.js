import { ddb, Tables, PutCommand, ScanCommand, UpdateCommand } from './dynamo.js';
import { ensureCognitoUser } from './cognito.js';
import { DEFAULT_LATE_GRACE_MIN, DEFAULT_SHIFT_END, DEFAULT_SHIFT_START } from '../utils/shift.js';

// Default password for seeded accounts. CHANGE after first login.
const DEFAULT_PWD = process.env.SEED_PASSWORD || 'Admin@12345';
const DEFAULT_OFFICE_ID = '1';

async function putIfAbsent(TableName, Item, keyAttrs) {
  try {
    await ddb.send(
      new PutCommand({
        TableName,
        Item,
        ConditionExpression: keyAttrs.map((k) => `attribute_not_exists(${k})`).join(' AND '),
      })
    );
    return true;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

async function run() {
  console.log('Seeding default office...');
  await putIfAbsent(
    Tables.offices,
    {
      id: DEFAULT_OFFICE_ID,
      name: 'Head Office',
      latitude: 0,
      longitude: 0,
      geofence_radius: 100,
    },
    ['id']
  );

  console.log('Seeding users...');
  const baseEmployee = {
    office_id: DEFAULT_OFFICE_ID,
    shift_start: DEFAULT_SHIFT_START,
    shift_end: DEFAULT_SHIFT_END,
    late_grace_min: DEFAULT_LATE_GRACE_MIN,
    halfday_hours: 4.5,
    leave_balance: 24,
    date_of_joining: new Date().toISOString().slice(0, 10),
    status: 'active',
    resignation_enabled: false,
  };

  // Deliberately synthetic identities (not a real person's name) on the real
  // company domain, so login username -> email resolution (usernameToEmail)
  // exercises the actual shared pool without colliding with any real employee.
  const domain = process.env.COGNITO_EMAIL_DOMAIN;
  const seedEmployees = [
    { emp_code: 'ADMIN001', name: 'Seed Admin', email: `seed.admin@${domain}`, role: 'admin' },
    { emp_code: 'EMP001', name: 'Seed Employee', email: `seed.employee@${domain}`, role: 'employee' },
  ];

  for (const emp of seedEmployees) {
    await ensureCognitoUser(emp.email, DEFAULT_PWD);
    await putIfAbsent(Tables.employees, { ...baseEmployee, ...emp }, ['emp_code']);
  }

  // Office hours live on each employee row (no admin UI to edit them).
  // Patch everyone so a policy change applies without re-creating accounts.
  const { Items: allEmps } = await ddb.send(new ScanCommand({ TableName: Tables.employees }));
  for (const emp of allEmps || []) {
    if (
      emp.shift_start === DEFAULT_SHIFT_START &&
      emp.shift_end === DEFAULT_SHIFT_END &&
      emp.late_grace_min === DEFAULT_LATE_GRACE_MIN
    ) continue;
    await ddb.send(
      new UpdateCommand({
        TableName: Tables.employees,
        Key: { emp_code: emp.emp_code },
        UpdateExpression: 'SET shift_start = :ss, shift_end = :se, late_grace_min = :g',
        ExpressionAttributeValues: {
          ':ss': DEFAULT_SHIFT_START,
          ':se': DEFAULT_SHIFT_END,
          ':g': DEFAULT_LATE_GRACE_MIN,
        },
      })
    );
  }

  console.log(`✅ Seed complete. Admin username: seed.admin / ${DEFAULT_PWD} (only if newly created — existing users keep their real password)`);
  console.log('   Update the "Head Office" lat/long via the admin API before testing geofencing.');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
