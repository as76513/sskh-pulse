import { Router } from 'express';
import { authRequired, adminOnly } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as att from '../controllers/attendanceController.js';
import * as leave from '../controllers/leaveController.js';
import * as admin from '../controllers/adminController.js';
import * as files from '../controllers/filesController.js';

const r = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Auth ----
r.post('/auth/login', wrap(auth.login));
r.get('/auth/me', authRequired, wrap(auth.me));
r.post('/auth/change-password', authRequired, wrap(auth.changePassword));

// ---- Attendance ----
r.post('/attendance/check-in', authRequired, wrap(att.checkIn));
r.post('/attendance/check-out', authRequired, wrap(att.checkOut));
r.get('/attendance/today', authRequired, wrap(att.todayStatus));
r.get('/attendance/history', authRequired, wrap(att.myHistory));
r.post('/attendance/absence', authRequired, wrap(att.markAbsence));

// ---- Leaves ----
r.post('/leaves', authRequired, wrap(leave.applyLeave));
r.get('/leaves/mine', authRequired, wrap(leave.myLeaves));
r.get('/leaves/pending', authRequired, adminOnly, wrap(leave.pendingLeaves));
r.post('/leaves/:id/decide', authRequired, adminOnly, wrap(leave.decideLeave));

// ---- Documents ----
r.post('/docs/upload-url', authRequired, wrap(files.requestDocUpload));
r.post('/docs/confirm', authRequired, wrap(files.confirmDoc));
r.get('/docs/mine', authRequired, wrap(files.myDocuments));
r.get('/docs/:id/download', authRequired, wrap(files.downloadDoc));

// ---- Payslips ----
r.post('/payslips/upload-url', authRequired, adminOnly, wrap(files.requestPayslipUpload));
r.post('/payslips/confirm', authRequired, adminOnly, wrap(files.confirmPayslip));
r.get('/payslips/mine', authRequired, wrap(files.myPayslips));
r.get('/payslips/:id/download', authRequired, wrap(files.downloadPayslip));

// ---- Resignation ----
r.post('/resignation', authRequired, wrap(files.submitResignation));
r.get('/resignation/mine', authRequired, wrap(files.myResignation));

// ---- Admin ----
r.post('/admin/employees', authRequired, adminOnly, wrap(admin.createEmployee));
r.get('/admin/employees', authRequired, adminOnly, wrap(admin.listEmployees));
r.get('/admin/offices', authRequired, adminOnly, wrap(admin.listOffices));
r.post('/admin/offices', authRequired, adminOnly, wrap(admin.createOffice));
r.post('/admin/regularize', authRequired, adminOnly, wrap(admin.regularizeAttendance));
r.post('/admin/attendance/delete', authRequired, adminOnly, wrap(admin.deleteAttendance));
r.get('/admin/report', authRequired, adminOnly, wrap(admin.dailyReport));
r.post('/admin/employees/:emp_code/resignation-access', authRequired, adminOnly, wrap(admin.setResignationAccess));

export default r;
