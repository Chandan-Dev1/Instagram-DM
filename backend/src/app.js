import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import rateLimit from "express-rate-limit";
import instagramRoutes from "./routes/instagram.routes.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

// Keep the exact raw bytes for Meta's X-Hub-Signature-256 validation.
app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
  limit: "1mb"
}));

app.use(session({
  name: "ig.oauth.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000
  }
}));

app.use("/api/instagram", rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Instagram AI DM backend is running"
  });
});

app.use("/api/instagram", instagramRoutes);

export default app;
