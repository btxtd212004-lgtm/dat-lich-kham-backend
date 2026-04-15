const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!rows.length) return res.json({ success: false, message: 'Số điện thoại không tồn tại' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, message: 'Mật khẩu không đúng' });
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, data: { token, user: { id: user.id, phone: user.phone, full_name: user.full_name, role: user.role } } });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { full_name, phone, password } = req.body;
  try {
    const [ex] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (ex.length) return res.json({ success: false, message: 'Số điện thoại đã được đăng ký' });
    const hashed = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (full_name, phone, password, role) VALUES (?, ?, ?, ?)', [full_name, phone, hashed, 'patient']);
    res.json({ success: true, message: 'Đăng ký thành công' });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, full_name, phone, role FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return res.json({ success: false, message: 'Không tìm thấy người dùng' });
    const [profiles] = await db.query('SELECT * FROM patient_profiles WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, data: { ...users[0], profiles } });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// PUT /api/auth/push-token
router.put('/push-token', auth, async (req, res) => {
  try {
    await db.query('UPDATE users SET expo_push_token = ? WHERE id = ?', [req.body.expo_push_token, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { phone, new_password } = req.body;
  try {
    const [rows] = await db.query('SELECT id FROM users WHERE phone = ? AND role = ?', [phone, 'patient']);
    if (!rows.length) return res.json({ success: false, message: 'Số điện thoại không tồn tại' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE phone = ?', [hashed, phone]);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// POST /api/auth/profiles - thêm hồ sơ bệnh nhân
router.post('/profiles', auth, async (req, res) => {
  const { full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight } = req.body;
  try {
    const [r] = await db.query(
      'INSERT INTO patient_profiles (user_id, full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight]
    );
    res.json({ success: true, data: { id: r.insertId } });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// PUT /api/auth/profiles/:id - sửa hồ sơ
router.put('/profiles/:id', auth, async (req, res) => {
  const { full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight } = req.body;
  try {
    await db.query(
      'INSERT INTO patient_profiles (user_id, full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, full_name, date_of_birth, gender, address, insurance_number, cccd, ethnicity, occupation, height, weight]
    );
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

// DELETE /api/auth/profiles/:id
router.delete('/profiles/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM patient_profiles WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: 'Lỗi server' }); }
});

module.exports = router;
