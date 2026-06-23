// netlify/functions/fb-chunk.js
// ส่ง chunk ตรงไป rupload.facebook.com ด้วย raw binary + headers

const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const q           = event.queryStringParameters || {};
  const token       = q.token;
  const startOffset = q.start_offset || "0";
  const uploadUrl   = q.upload_url ? decodeURIComponent(q.upload_url) : null;

  if (!token || !uploadUrl) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing: token, upload_url" }) };
  }

  try {
    const chunkBuf = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "binary");

    if (chunkBuf.length === 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Empty chunk" }) };
    }

    // rupload.facebook.com ต้องการ raw binary + specific headers
    const url  = new URL(uploadUrl);
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        path:     url.pathname + url.search,
        method:   "POST",
        headers: {
          "Authorization":        `OAuth ${token}`,
          "offset":               startOffset,
          "Content-Type":         "application/octet-stream",
          "Content-Length":       chunkBuf.length,
        },
      };
      const req = https.request(opts, (r) => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => {
          console.log("rupload response status:", r.statusCode, "body:", d.slice(0, 200));
          try { resolve(JSON.parse(d)); }
          catch { resolve({ raw: d, status: r.statusCode }); }
        });
      });
      req.on("error", reject);
      req.write(chunkBuf);
      req.end();
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
