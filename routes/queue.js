const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// GET /api/queue/:scheduleId - trạng thái hàng đợi của một lịch khám
router.get('/:scheduleId', async (req, res) => {
  try {
    const [[sch]] = await db.query(
      'SELECT id, current_queue, max_patients FROM schedules WHERE id=?',
      [req.params.scheduleId]
    );
    if (!sch) return res.json({ success: false, message: 'Không tìm thấy lịch' });

    const [[{ waiting_count }]] = await db.query(
      `SELECT COUNT(*) AS waiting_count FROM appointments WHERE schedule_id=? AND status='waiting'`,
      [req.params.scheduleId]
    );
    const [[{ done_count }]] = await db.query(
      `SELECT COUNT(*) AS done_count FROM appointments WHERE schedule_id=? AND status='done'`,
      [req.params.scheduleId]
    );

    res.json({
      success: true,
      data: {
        current_queue: sch.current_queue,   // STT đang được gọi
        waiting_count,                       // Số người còn chờ
        done_count,                          // Số người đã khám xong
        max_patients: sch.max_patients,
      }
    });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
