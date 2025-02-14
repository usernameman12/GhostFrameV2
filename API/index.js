const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const compression = require("compression");
const cors = require("cors");
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const session = require("express-session");
const NodeCache = require("node-cache");
const path = require("path");
const serverless = require("serverless-http");

const app = express();

// TTL set to 60 seconds
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Middleware
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(morgan("combined"));

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // HOW DID YOU FUCK UP A READ ME :sob:
  })
);

// ghost v2 is real
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // skibidi
  max: 100, // fuck skids
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", apiLimiter);


function handleProxy(targetUrl, req, res, next, useCache = false) {
  const cacheKey = targetUrl;

  if (useCache) {
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.send(cachedResponse);
    }
  }

  const proxy = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: true,
    onProxyRes: (proxyRes, req, res) => {
      let body = "";
      proxyRes.on("data", (chunk) => {
        body += chunk;
      });
      proxyRes.on("end", () => {
        
        res.removeHeader("x-frame-options");
        res.removeHeader("content-security-policy");

        if (useCache) {
          cache.set(cacheKey, body);
        }
        res.send(body);
      });
    },
    onError: (err, req, res) => {
      console.error("Proxy error:", err);
      res.status(500).json({ error: "Proxy error", details: err.message });
    }
  });

  proxy(req, res, next);
}

// expects base64-encoded URL
app.get("/api/proxy/:encodedUrl", (req, res, next) => {
  try {
    const decodedUrl = Buffer.from(req.params.encodedUrl, "base64").toString();
    if (!decodedUrl.startsWith("http")) {
      return res.status(400).json({ error: "Invalid URL" });
    }
    handleProxy(decodedUrl, req, res, next, true);
  } catch (err) {
    console.error("Error decoding URL:", err);
    res.status(400).json({ error: "Error decoding URL" });
  }
});


app.post("/api/proxy", (req, res, next) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  if (!url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  handleProxy(url, req, res, next, false);
});


app.get("/api/session", (req, res) => {
  res.json({ session: req.session });
});


app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});


module.exports = serverless(app);
