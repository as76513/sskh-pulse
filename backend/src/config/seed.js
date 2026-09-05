import bcrypt from 'bcryptjs';
import { ddb, Tables, PutCommand } from './dynamo.js';

// Default password for seeded accounts. CHANGE after first login.
const DEFAULT_PWD = process.env.SEED_PASSWORD || 'admin123';
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
  const hash = await bcrypt.hash(DEFAULT_PWD, 10);
  const baseEmployee = {
    office_id: DEFAULT_OFFICE_ID,
    password_hash: hash,
    shift_start: '09:30',
    shift_end: '18:30',
    late_grace_min: 15,
    halfday_hours: 4.5,
    leave_balance: 24,
    date_of_joining: new Date().toISOString().slice(0, 10),
    status: 'active',
    resignation_enabled: false,
  };

  await putIfAbsent(
    Tables.employees,
    { ...baseEmployee, emp_code: 'ADMIN001', name: 'System Admin', email: 'admin@shubhshree.com', role: 'admin' },
    ['emp_code']
  );
  await putIfAbsent(
    Tables.employees,
    { ...baseEmployee, emp_code: 'EMP001', name: 'Test Employee', email: 'emp@shubhshree.com', role: 'employee' },
    ['emp_code']
  );

  console.log(`✅ Seed complete. Admin: ADMIN001 / ${DEFAULT_PWD}`);
  console.log('   Update the "Head Office" lat/long via the admin API before testing geofencing.');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
