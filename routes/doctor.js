const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { requireRole } = auth;
const { sendPush } = require('../helpers/push');

router.use(auth, requireRole('doctor'));

// GET /api/doctor/me - thông tin bác sĩ đang đăng nhập
router.get('/me', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT d.id AS doctor_id, u.full_name, u.phone,
             dep.name AS department_name, dep.id AS department_id, d.specialty, d.bio
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN departments dep ON d.department_id = dep.id
      WHERE d.user_id = ?`, [req.user.id]);
    if (!rows.length) return res.json({ success: false, message: 'Không tìm thấy thông tin bác sĩ' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// GET /api/doctor/queue?date=YYYY-MM-DD - danh sách bệnh nhân theo ngày
router.get('/queue', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [doc] = await db.query('SELECT id FROM doctors WHERE user_id=?', [req.user.id]);
    if (!doc.length) return res.json({ success: false, message: 'Không tìm thấy bác sĩ' });
    const doctor_id = doc[0].id;

    const [rows] = await db.query(`
      SELECT a.id, a.queue_number, a.status, a.patient_notes,
             pp.full_name AS patient_name, pp.date_of_birth, pp.gender, pp.insurance_number,
             s.id AS schedule_id, s.date, s.start_time, s.end_time, s.current_queue,
             dep.name AS department_name,
             mr.id AS record_id, mr.diagnosis
      FROM appointments a
      JOIN schedules s ON a.schedule_id = s.id
      JOIN patient_profiles pp ON a.profile_id = pp.id
      JOIN departments dep ON s.department_id = dep.id
      LEFT JOIN medical_records mr ON mr.appointment_id = a.id
      WHERE s.doctor_id = ? AND s.date = ? AND a.status != 'cancelled'
      ORDER BY a.queue_number`, [doctor_id, date]);

    // Lấy số đang gọi từ schedule
    const [sch] = await db.query('SELECT current_queue FROM schedules WHERE doctor_id=? AND date=? LIMIT 1', [doctor_id, date]);
    const current_queue = sch.length ? sch[0].current_queue : 0;

    res.json({ success: true, data: rows, current_queue });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// PUT /api/doctor/appointments/:id/call - gọi bệnh nhân vào (in_progress)
router.put('/appointments/:id/call', async (req, res) => {
  try {
    const [appts] = await db.query(`
      SELECT a.*, pp.full_name AS patient_name, s.id AS schedule_id,
             u_pat.expo_push_token
      FROM appointments a
      JOIN patient_profiles pp ON a.profile_id = pp.id
      JOIN schedules s ON a.schedule_id = s.id
      JOIN users u_pat ON pp.user_id = u_pat.id
      WHERE a.id = ?`, [req.params.id]);
    if (!appts.length) return res.json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    const appt = appts[0];

    await db.query(`UPDATE appointments SET status='in_progress' WHERE id=?`, [appt.id]);
    await db.query(`UPDATE schedules SET current_queue=? WHERE id=?`, [appt.queue_number, appt.schedule_id]);

    // Gửi push notification cho bệnh nhân
    await sendPush(
      appt.expo_push_token,
      '🔔 Đến lượt của bạn!',
      `Số thứ tự #${appt.queue_number} - ${appt.patient_name}, vui lòng vào phòng khám!`,
      { appointmentId: appt.id }
    );

    res.json({ success: true, message: `Đã gọi số ${appt.queue_number}` });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// PUT /api/doctor/appointments/:id/done - hoàn thành khám
router.put('/appointments/:id/done', async (req, res) => {
  try {
    await db.query(`UPDATE appointments SET status='done' WHERE id=?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// POST /api/doctor/appointments/:id/record - nhập bệnh án
router.post('/appointments/:id/record', async (req, res) => {
  const { diagnosis, prescription, notes } = req.body;
  try {
    const [ex] = await db.query('SELECT id FROM medical_records WHERE appointment_id=?', [req.params.id]);
    if (ex.length) {
      await db.query(
        'UPDATE medical_records SET diagnosis=?, prescription=?, notes=? WHERE appointment_id=?',
        [diagnosis, prescription, notes, req.params.id]
      );
    } else {
      await db.query(
        'INSERT INTO medical_records (appointment_id, diagnosis, prescription, notes) VALUES (?,?,?,?)',
        [req.params.id, diagnosis, prescription, notes]
      );
    }
    // Tự động mark done
    await db.query(`UPDATE appointments SET status='done' WHERE id=?`, [req.params.id]);
    res.json({ success: true, message: 'Lưu bệnh án thành công' });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// GET /api/doctor/appointments/:id/record - xem bệnh án
router.get('/appointments/:id/record', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT mr.*, pp.full_name AS patient_name, pp.date_of_birth, pp.insurance_number,
             s.date, s.start_time, u_doc.full_name AS doctor_name, dep.name AS department_name
      FROM medical_records mr
      JOIN appointments a ON mr.appointment_id = a.id
      JOIN patient_profiles pp ON a.profile_id = pp.id
      JOIN schedules s ON a.schedule_id = s.id
      JOIN doctors d ON s.doctor_id = d.id
      JOIN users u_doc ON d.user_id = u_doc.id
      JOIN departments dep ON s.department_id = dep.id
      WHERE mr.appointment_id = ?`, [req.params.id]);
    if (!rows.length) return res.json({ success: false, message: 'Chưa có bệnh án' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
