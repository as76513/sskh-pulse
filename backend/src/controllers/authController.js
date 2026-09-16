import jwt from 'jsonwebtoken';
import { ddb, Tables, GetCommand, QueryCommand } from '../config/dynamo.js';
import { verifyCognitoPassword, setCognitoPassword } from '../config/cognito.js';

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });

  // Screen only ever collects the username (e.g. "john.doe") — this resolves
  // it to the employee record, and from there the real email, which is what
  // actually gets sent to Cognito. The email itself is never shown on screen.
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.employees,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username.trim().toLowerCase() },
    })
  );
  const user = Items[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'active')
    return res.status(403).json({ error: 'Account is not active' });

  try {
    await verifyCognitoPassword(user.email, password);
  } catch (e) {
    if (e.name === 'NotAuthorizedException' || e.name === 'UserNotFoundException')
      return res.status(401).json({ error: 'Invalid credentials' });
    throw e;
  }

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
