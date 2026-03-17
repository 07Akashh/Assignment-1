const express = require("express");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const customerRoutes = require("./routes/customers");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const { ProtectRoutes } = require("./middleware/auth");

// used a rate limiter to prevent apis abuse
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 50, // Limit each IP to 50 requests per `window` (here, per 1 minute).
  message: "Too many requests, please try again later.",
  // Message returned when the user exceeds the limit

  statusCode: 429,
  // HTTP status code returned when rate limit is exceeded (429 = Too Many Requests)
  standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
});

// Apply the rate limiting middleware to all requests.

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: [process.env.FRONTEND_ORIGIN, "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(express.json());
app.use(limiter);

// Routes
app.use("/api/customers", customerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes); // used a middleware so only the logged in users can access the endpoints (improves security)
// app.use("/api/orders", ProtectRoutes, orderRoutes); // used a middleware so only the logged in users can access the endpoints (improves security)

// Health check
app.get("/api/health", (req, res) => {
  return res.json({ status: "ok" });
});

// BUG: Global error handler that swallows errors and always returns 200
app.use((err, req, res, next) => {
  console.log("Something happened");
  return res.status(200).json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
