import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ddb, Tables, GetCommand, UpdateCommand } from '../config/dynamo.js';

export async function login(req, res) {
  const { emp_code, password } = req.body;
  if (!emp_code || !password)
    return res.status(400).json({ error: 'emp_code and password required' });

  const { Item: user } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code: emp_code.trim() } })
  );
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'active')
    return res.status(403).json({ error: 'Account is not active' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

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
  const { password_hash, ...rest } = Item;
  res.json(rest);
}

export async function changePassword(req, res) {
  const { old_password, new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: 'New password must be 6+ chars' });

  const { Item } = await ddb.send(
    new GetCommand({ TableName: Tables.employees, Key: { emp_code: req.user.emp_code } })
  );
  const ok = await bcrypt.compare(old_password || '', Item.password_hash);
  if (!ok) return res.status(401).json({ error: 'Old password incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  await ddb.send(
    new UpdateCommand({
      TableName: Tables.employees,
      Key: { emp_code: req.user.emp_code },
      UpdateExpression: 'SET password_hash = :h',
      ExpressionAttributeValues: { ':h': hash },
    })
  );
  res.json({ message: 'Password updated' });
}
