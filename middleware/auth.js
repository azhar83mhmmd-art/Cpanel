function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Belum login." });
    }
    return res.redirect("/login");
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ error: "Belum login." });
      }
      return res.redirect("/login");
    }
    if (!roles.includes(req.session.user.role)) {
      if (req.path.startsWith("/api/")) {
        return res.status(403).json({ error: "403 Forbidden" });
      }
      return res.status(403).sendFile(require("path").join(__dirname, "..", "views", "403.html"));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
