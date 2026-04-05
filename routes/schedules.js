const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// GET /api/schedules/departments - danh sách chuyên khoa
router.get('/departments', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM departments ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// GET /api/schedules?department_id=X&date=YYYY-MM-DD - lịch theo khoa + ngày
router.get('/', async (req, res) => {
  const { department_id, date } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT s.id, s.date, s.start_time, s.end_time, s.max_patients, s.current_queue,
             u.full_name AS doctor_name, d.id AS doctor_id, d.specialty,
             dep.name AS department_name, dep.id AS department_id,
             (SELECT COUNT(*) FROM appointments a WHERE a.schedule_id = s.id AND a.status != 'cancelled') AS booked_count
      FROM schedules s
      JOIN doctors d ON s.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN departments dep ON s.department_id = dep.id
      WHERE s.department_id = ? AND s.date = ?
      HAVING booked_count < s.max_patients
      ORDER BY s.start_time`, [department_id, date]);
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
