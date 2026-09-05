import crypto from 'crypto';
import {
  ddb,
  Tables,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  BatchGetCommand,
} from '../config/dynamo.js';

function daysBetween(from, to) {
  const d = (new Date(to) - new Date(from)) / 86400000 + 1;
  return d > 0 ? d : 0;
}

export async function applyLeave(req, res) {
  const { leave_type, from_date, to_date, reason } = req.body;
  if (!from_date || !to_date || !reason)
    return res.status(400).json({ error: 'from_date, to_date, reason required' });
  const days = daysBetween(from_date, to_date);
  if (days <= 0) return res.status(400).json({ error: 'Invalid date range' });

  const item = {
    id: crypto.randomUUID(),
    emp_code: req.user.emp_code,
    leave_type: leave_type || 'casual',
    from_date,
    to_date,
    days,
    reason,
    status: 'pending',
    applied_at: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: Tables.leaves, Item: item }));
  res.json(item);
}

export async function myLeaves(req, res) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.leaves,
      IndexName: 'emp_code-index',
      KeyConditionExpression: 'emp_code = :e',
      ExpressionAttributeValues: { ':e': req.user.emp_code },
      ScanIndexForward: false,
      Limit: 50,
    })
  );
  res.json(Items);
}

// ---- Admin ----
export async function pendingLeaves(req, res) {
  const { Items: leaves } = await ddb.send(
    new QueryCommand({
      TableName: Tables.leaves,
      IndexName: 'status-index',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'pending' },
      ScanIndexForward: true,
    })
  );

  if (!leaves.length) return res.json([]);

  const empCodes = [...new Set(leaves.map((l) => l.emp_code))];
  const { Responses } = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [Tables.employees]: { Keys: empCodes.map((emp_code) => ({ emp_code })) },
      },
    })
  );
  const names = Object.fromEntries(
    (Responses?.[Tables.employees] || []).map((e) => [e.emp_code, e.name])
  );

  res.json(leaves.map((l) => ({ ...l, name: names[l.emp_code] })));
}

export async function decideLeave(req, res) {
  const { id } = req.params;
  const { decision, admin_note } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(decision))
    return res.status(400).json({ error: 'decision must be approved/rejected' });

  let leave;
  try {
    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: Tables.leaves,
        Key: { id },
        UpdateExpression: 'SET #s = :decision, admin_note = :note, approved_by = :by, decided_at = :now',
        ConditionExpression: 'attribute_exists(id) AND #s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':decision': decision,
          ':note': admin_note || null,
          ':by': req.user.emp_code,
          ':now': new Date().toISOString(),
          ':pending': 'pending',
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    leave = Attributes;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException')
      return res.status(404).json({ error: 'Leave not found or already decided' });
    throw e;
  }

  // Deduct balance on approval (atomic, no read-then-write race)
  if (decision === 'approved') {
    await ddb.send(
      new UpdateCommand({
        TableName: Tables.employees,
        Key: { emp_code: leave.emp_code },
        UpdateExpression: 'SET leave_balance = leave_balance - :days',
        ExpressionAttributeValues: { ':days': leave.days },
      })
    );
  }
  res.json(leave);
}
