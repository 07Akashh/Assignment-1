function ProtectRoutes(req, res, next) {
  try {
    const token = req.headers.authorization.split(" ")[1];

    if (!token) {
      return res.status(401).json({ msg: "Not authenticated" });
    }
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (!user) {
      return res.status(401).json({ msg: "Not authenticated" });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ msg: "Sorry Internal Server Error" });
  }
}

module.exports = { ProtectRoutes };
