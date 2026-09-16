import { ddb, Tables, PutCommand } from './dynamo.js';
import { createCognitoUser } from './cognito.js';

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

// Never overwrites a password for a user that's already provisioned —
// only ever creates it once, same spirit as putIfAbsent above.
async function ensureCognitoUser(email, password) {
  try {
    await createCognitoUser(email, password);
  } catch (e) {
    if (e.name !== 'UsernameExistsException') throw e;
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
    shift_start: '09:30',
    shift_end: '18:30',
    late_grace_min: 15,
    halfday_hours: 4.5,
    leave_balance: 24,
    date_of_joining: new Date().toISOString().slice(0, 10),
    status: 'active',
    resignation_enabled: false,
  };

  const seedEmployees = [
    { emp_code: 'ADMIN001', name: 'System Admin', username: 'system.admin', email: 'admin@shubhshree.com', role: 'admin' },
    { emp_code: 'EMP001', name: 'Test Employee', username: 'test.employee', email: 'emp@shubhshree.com', role: 'employee' },
  ];

  for (const emp of seedEmployees) {
    await ensureCognitoUser(emp.email, DEFAULT_PWD);
    await putIfAbsent(Tables.employees, { ...baseEmployee, ...emp }, ['emp_code']);
  }

  console.log(`✅ Seed complete. Admin username: system.admin / ${DEFAULT_PWD}`);
  console.log('   Update the "Head Office" lat/long via the admin API before testing geofencing.');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
