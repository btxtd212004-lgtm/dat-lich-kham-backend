const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

router.use(auth);

// POST /api/appointments - đặt lịch
router.post('/', async (req, res) => {
  const { schedule_id, profile_id, patient_notes, payment_method } = req.body;
  try {
    // Kiểm tra slot còn không
    const [[sch]] = await db.query(`
      SELECT s.max_patients,
             (SELECT COUNT(*) FROM appointments WHERE schedule_id=s.id AND status != 'cancelled') AS booked
      FROM schedules s WHERE s.id = ?`, [schedule_id]);
    if (!sch) return res.json({ success: false, message: 'Không tìm thấy lịch' });
    if (sch.booked >= sch.max_patients) return res.json({ success: false, message: 'Lịch đã đầy, vui lòng chọn lịch khác' });

    // Kiểm tra trùng lịch
    const [dupCheck] = await db.query(`
      SELECT a.id FROM appointments a
      JOIN schedules s ON a.schedule_id = s.id
      WHERE a.profile_id = ? AND s.id = ? AND a.status != 'cancelled'`, [profile_id, schedule_id]);
    if (dupCheck.length) return res.json({ success: false, message: 'Hồ sơ này đã có lịch khám trong buổi này' });

    const queue_number = sch.booked + 1;
    const [r] = await db.query(
      'INSERT INTO appointments (schedule_id, profile_id, queue_number, patient_notes, payment_method) VALUES (?,?,?,?,?)',
      [schedule_id, profile_id, queue_number, patient_notes || '', payment_method || 'cash']
    );
    res.json({ success: true, data: { id: r.insertId, queueNumber: queue_number } });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// GET /api/appointments/my - lịch của tôi
router.get('/my', async (req, res) => {
  try {
    const { status } = req.query;
    const [profiles] = await db.query('SELECT id FROM patient_profiles WHERE user_id=?', [req.user.id]);
    if (!profiles.length) return res.json({ success: true, data: [] });
    const profileIds = profiles.map(p => p.id);

    let where = `a.profile_id IN (${profileIds.join(',')})`;
    const params = [];
    if (status) { where += ' AND a.status = ?'; params.push(status); }

    const [rows] = await db.query(`
      SELECT a.*, pp.full_name AS patient_name,
             u_doc.full_name AS doctor_name, dep.name AS department_name,
             s.date, s.start_time, s.end_time, s.current_queue
      FROM appointments a
      JOIN schedules s ON a.schedule_id = s.id
      JOIN doctors d ON s.doctor_id = d.id
      JOIN users u_doc ON d.user_id = u_doc.id
      JOIN departments dep ON s.department_id = dep.id
      JOIN patient_profiles pp ON a.profile_id = pp.id
      LEFT JOIN medical_records mr ON mr.appointment_id = a.id
      WHERE ${where}
      ORDER BY s.date DESC, a.queue_number`, params);
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// PUT /api/appointments/:id/cancel - hủy lịch
router.put('/:id/cancel', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.id, a.created_at FROM appointments a
      JOIN patient_profiles pp ON a.profile_id = pp.id
      WHERE a.id = ? AND pp.user_id = ?`, [req.params.id, req.user.id]);
    if (!rows.length) return res.json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    const createdAt = new Date(rows[0].created_at);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);
    if (diffHours > 5) return res.json({ success: false, message: 'Đã quá 5 giờ kể từ khi đặt lịch, không thể hủy!' });
    await db.query(`UPDATE appointments SET status='cancelled' WHERE id=?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
