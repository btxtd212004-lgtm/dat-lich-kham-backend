const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.json({ success: false, message: 'Không có token xác thực' });

  const token = auth.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Middleware kiểm tra role
module.exports.requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.json({ success: false, message: 'Không có quyền truy cập' });
  next();
};
