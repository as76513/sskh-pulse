import crypto from 'crypto';
import { ddb, Tables, GetCommand, PutCommand, QueryCommand } from '../config/dynamo.js';
import { presignUpload, presignDownload } from '../utils/s3.js';

// ---- DOCUMENTS ----
// Step 1: client asks for a presigned URL, uploads directly to S3
export async function requestDocUpload(req, res) {
  const { doc_type, file_name, content_type } = req.body;
  if (!doc_type || !file_name)
    return res.status(400).json({ error: 'doc_type and file_name required' });
  const key = `documents/${req.user.emp_code}/${Date.now()}_${file_name}`;
  const url = await presignUpload(key, content_type || 'application/octet-stream');
  res.json({ upload_url: url, s3_key: key });
}

// Step 2: after successful upload, register metadata
export async function confirmDoc(req, res) {
  const { doc_type, file_name, s3_key } = req.body;
  const item = {
    id: crypto.randomUUID(),
    emp_code: req.user.emp_code,
    doc_type,
    file_name,
    s3_key,
    uploaded_at: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: Tables.documents, Item: item }));
  res.json(item);
}

export async function myDocuments(req, res) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.documents,
      IndexName: 'emp_code-index',
      KeyConditionExpression: 'emp_code = :e',
      ExpressionAttributeValues: { ':e': req.user.emp_code },
      ScanIndexForward: false,
    })
  );
  res.json(Items);
}

export async function downloadDoc(req, res) {
  const { id } = req.params;
  const { Item } = await ddb.send(new GetCommand({ TableName: Tables.documents, Key: { id } }));
  if (!Item || Item.emp_code !== req.user.emp_code)
    return res.status(404).json({ error: 'Not found' });
  const url = await presignDownload(Item.s3_key);
  res.json({ download_url: url });
}

// ---- PAYSLIPS ----
// Admin uploads payslip
export async function requestPayslipUpload(req, res) {
  const { emp_code, pay_month, file_name, content_type } = req.body;
  if (!emp_code || !pay_month)
    return res.status(400).json({ error: 'emp_code and pay_month required' });
  const key = `payslips/${emp_code}/${pay_month}_${file_name || 'payslip.pdf'}`;
  const url = await presignUpload(key, content_type || 'application/pdf');
  res.json({ upload_url: url, s3_key: key });
}

export async function confirmPayslip(req, res) {
  const { emp_code, pay_month, s3_key } = req.body;
  const item = {
    emp_code,
    pay_month,
    s3_key,
    uploaded_by: req.user.emp_code,
    uploaded_at: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: Tables.payslips, Item: item }));
  res.json(item);
}

export async function myPayslips(req, res) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.payslips,
      KeyConditionExpression: 'emp_code = :e',
      ExpressionAttributeValues: { ':e': req.user.emp_code },
      ScanIndexForward: false,
    })
  );
  // pay_month doubles as the route "id" — see downloadPayslip.
  res.json(Items.map((p) => ({ id: p.pay_month, pay_month: p.pay_month, uploaded_at: p.uploaded_at })));
}

export async function downloadPayslip(req, res) {
  const { id: pay_month } = req.params;
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: Tables.payslips,
      Key: { emp_code: req.user.emp_code, pay_month },
    })
  );
  if (!Item) return res.status(404).json({ error: 'Not found' });
  const url = await presignDownload(Item.s3_key);
  res.json({ download_url: url });
}

// ---- RESIGNATION ----
export async function submitResignation(req, res) {
  const { reason, last_working_day } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  const item = {
    emp_code: req.user.emp_code,
    submitted_at: new Date().toISOString(),
    reason,
    last_working_day: last_working_day || null,
    status: 'pending',
  };
  await ddb.send(new PutCommand({ TableName: Tables.resignations, Item: item }));
  res.json(item);
}

export async function myResignation(req, res) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: Tables.resignations,
      KeyConditionExpression: 'emp_code = :e',
      ExpressionAttributeValues: { ':e': req.user.emp_code },
      ScanIndexForward: false,
      Limit: 1,
    })
  );
  res.json(Items[0] || null);
}
