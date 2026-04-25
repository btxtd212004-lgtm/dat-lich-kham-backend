const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

router.use(auth);

// POST /api/appointments - đặt lịch
router.post('/', async (req, res) => {
  const { schedule_id, profile_id, patient_notes, payment_method } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Kiểm tra profile thuộc user đang đăng nhập
    const [[profileCheck]] = await conn.query(
      'SELECT id FROM patient_profiles WHERE id=? AND user_id=?',
      [profile_id, req.user.id]
    );
    if (!profileCheck) {
      await conn.rollback();
      return res.json({ success: false, message: 'Hồ sơ không hợp lệ' });
    }

    // Lock row để tránh race condition
    const [[sch]] = await conn.query(`
      SELECT s.max_patients,
             (SELECT COUNT(*) FROM appointments WHERE schedule_id=s.id AND status != 'cancelled') AS booked
      FROM schedules s WHERE s.id = ? FOR UPDATE`, [schedule_id]);
    if (!sch) { await conn.rollback(); return res.json({ success: false, message: 'Không tìm thấy lịch' }); }
    if (sch.booked >= sch.max_patients) { await conn.rollback(); return res.json({ success: false, message: 'Lịch đã đầy, vui lòng chọn lịch khác' }); }

    // Kiểm tra trùng lịch
    const [dupCheck] = await conn.query(`
      SELECT a.id FROM appointments a
      WHERE a.profile_id = ? AND a.schedule_id = ? AND a.status != 'cancelled'`, [profile_id, schedule_id]);
    if (dupCheck.length) { await conn.rollback(); return res.json({ success: false, message: 'Hồ sơ này đã có lịch khám trong buổi này' }); }

    const queue_number = sch.booked + 1;
    const [r] = await conn.query(
      'INSERT INTO appointments (schedule_id, profile_id, queue_number, patient_notes, payment_method) VALUES (?,?,?,?,?)',
      [schedule_id, profile_id, queue_number, patient_notes || '', payment_method || 'cash']
    );
    await conn.commit();
    res.json({ success: true, data: { id: r.insertId, queueNumber: queue_number } });
  } catch (e) {
    await conn.rollback();
    res.json({ success: false, message: 'Lỗi server' });
  } finally {
    conn.release();
  }
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
      SELECT a.id, a.status, s.date, s.start_time FROM appointments a
      JOIN patient_profiles pp ON a.profile_id = pp.id
      JOIN schedules s ON a.schedule_id = s.id
      WHERE a.id = ? AND pp.user_id = ?`, [req.params.id, req.user.id]);
    if (!rows.length) return res.json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    if (rows[0].status === 'cancelled') return res.json({ success: false, message: 'Lịch đã được hủy trước đó' });
    if (rows[0].status === 'done') return res.json({ success: false, message: 'Lịch đã khám xong, không thể hủy' });

    // Cho phép hủy nếu còn trước giờ khám ít nhất 5 tiếng
    const apptDate = new Date(rows[0].date);
    const [h, m] = rows[0].start_time.split(':').map(Number);
    apptDate.setHours(h, m, 0, 0);
    const now = new Date();
    const diffHours = (apptDate - now) / (1000 * 60 * 60);
    if (diffHours < 5) return res.json({ success: false, message: 'Chỉ được hủy trước giờ khám ít nhất 5 tiếng!' });

    await db.query(`UPDATE appointments SET status='cancelled' WHERE id=?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;