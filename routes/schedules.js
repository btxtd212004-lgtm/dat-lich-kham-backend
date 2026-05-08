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
  SELECT s.start_time, s.end_time,
         dep.name AS department_name, dep.id AS department_id,
         MIN(s.id) AS schedule_id,
         SUM(s.max_patients) AS total_slots,
         (SELECT COUNT(*) FROM appointments a WHERE a.schedule_id IN (
           SELECT id FROM schedules s2 WHERE s2.department_id = s.department_id AND s2.date = s.date AND s2.start_time = s.start_time AND s2.end_time = s.end_time
         ) AND a.status != 'cancelled') AS booked_count
  FROM schedules s
  JOIN doctors d ON s.doctor_id = d.id
  JOIN departments dep ON s.department_id = dep.id
  WHERE s.department_id = ? AND s.date = ?
  GROUP BY s.start_time, s.end_time, dep.id
  HAVING booked_count < total_slots
  ORDER BY s.start_time`, [department_id, date]);
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
