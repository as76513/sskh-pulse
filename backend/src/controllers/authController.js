import jwt from 'jsonwebtoken';
import { ddb, Tables, GetCommand, QueryCommand } from '../config/dynamo.js';
import { verifyCognitoPassword, setCognitoPassword, usernameToEmail } from '../config/cognito.js';

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });

  // Cognito is authoritative here — anyone already in the shared pool (e.g.
  // real people the other app provisioned) can authenticate with whatever
  // password they already have, with zero setup on this app's side. Only
  // *after* Cognito confirms the password do we check whether they're also
  // a registered SSKH Pulse employee.
  const email = usernameToEmail(username);
  try {
    await verifyCognitoPassword(email, password);
  } catch (e) {
    if (e.name === 'NotAuthorizedException' || e.name === 'UserNotFoundException')
      return res.status(401).json({ error: 'Invalid credentials' });
    throw e;
  }

  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.employees,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': email },
    })
  );
  const user = Items[0];
  if (!user)
    return res.status(404).json({ error: 'No employee record found for this account. Contact your admin.' });
  if (user.status !== 'active')
    return res.status(403).json({ error: 'Account is not active' });

  const token = jwt.sign(
    { emp_code: user.emp_code, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' }
  );

  res.json({
    token,
    user: { emp_code: user.emp_code, name: user.name, role: user.role },
  });
}

export async function me(req, res) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code: req.user.emp_code } })
  );
  if (!Item) return res.json(null);
  // Legacy field on records created before the Cognito migration — never expose it.
  const { password_hash, ...rest } = Item;
  res.json(rest);
}

export async function changePassword(req, res) {
  const { old_password, new_password } = req.body;
  if (!new_password)
    return res.status(400).json({ error: 'New password required' });

  const { Item: user } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code: req.user.emp_code } })
  );

  try {
    await verifyCognitoPassword(user.email, old_password || '');
  } catch (e) {
    if (e.name === 'NotAuthorizedException' || e.name === 'UserNotFoundException')
      return res.status(401).json({ error: 'Old password incorrect' });
    throw e;
  }

  try {
    await setCognitoPassword(user.email, new_password);
  } catch (e) {
    if (e.name === 'InvalidPasswordException') return res.status(400).json({ error: e.message });
    throw e;
  }
  res.json({ message: 'Password updated' });
}
