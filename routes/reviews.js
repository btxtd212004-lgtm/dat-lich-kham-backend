// ── reviews.js ──────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const auth     = require('../middleware/auth');

router.use(auth);

router.post('/', async (req, res) => {
  const { appointment_id, doctor_id, rating, comment } = req.body;
  try {
    const [ex] = await db.query('SELECT id FROM reviews WHERE appointment_id=?', [appointment_id]);
    if (ex.length) return res.json({ success: false, message: 'Bạn đã đánh giá lịch khám này rồi' });
    await db.query(
      'INSERT INTO reviews (appointment_id, doctor_id, rating, comment) VALUES (?,?,?,?)',
      [appointment_id, doctor_id, rating, comment]
    );
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
