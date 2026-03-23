import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.auth_token;
  const authHeader = req.headers.authorization;
  const headerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "JWT_SECRET is not configured" });
  }

  try {
    const payload = jwt.verify(token, secret);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
