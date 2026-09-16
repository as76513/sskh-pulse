import { ddb, Tables, PutCommand } from './dynamo.js';
import { ensureCognitoUser } from './cognito.js';

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
    shift_start: '09:30',
    shift_end: '18:30',
    late_grace_min: 15,
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

  console.log(`✅ Seed complete. Admin username: seed.admin / ${DEFAULT_PWD} (only if newly created — existing users keep their real password)`);
  console.log('   Update the "Head Office" lat/long via the admin API before testing geofencing.');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
