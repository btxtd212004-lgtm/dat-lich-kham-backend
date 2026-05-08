const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Public - không cần token
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;