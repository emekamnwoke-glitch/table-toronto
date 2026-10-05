const jwt = require("jsonwebtoken");

const TOKEN_TTL = "7d";

// Called at startup so a missing/placeholder secret stops the server instead
// of failing later, e.g. after a registration INSERT has already happened.
function assertJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32 || s === "change_me") {
    throw new Error(
      "JWT_SECRET must be set to a random string of at least 32 characters " +
        '(e.g. node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")'
    );
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Requires "Authorization: Bearer <jwt>"; sets req.auth = { id, role }.
function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { assertJwtSecret, signToken, requireAuth };
