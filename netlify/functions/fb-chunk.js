// netlify/functions/fb-chunk.js
// รับ raw binary chunk ส่งตรงไป Facebook upload_url (rupload.facebook.com)

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
  const sessionId   = q.session_id;
  const startOffset = q.start_offset || "0";
  const pageId      = q.page_id;
  const token       = q.token;
  const uploadUrl   = q.upload_url ? decodeURIComponent(q.upload_url) : null;

  if (!sessionId || !pageId || !token) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing: session_id, page_id, token" }) };
  }

  try {
    const chunkBuf = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "binary");

    if (chunkBuf.length === 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Empty chunk" }) };
    }

    const boundary = "----FBChunk" + Date.now();
    const pre = [
      `--${boundary}\r\nContent-Disposition: form-data; name="upload_phase"\r\n\r\ntransfer`,
      `--${boundary}\r\nContent-Disposition: form-data; name="start_offset"\r\n\r\n${startOffset}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="upload_session_id"\r\n\r\n${sessionId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${token}`,
    ].join("\r\n") + "\r\n";

    const videoHeader = `--${boundary}\r\nContent-Disposition: form-data; name="video_file_chunk"; filename="chunk.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
    const epilogue    = `\r\n--${boundary}--\r\n`;
    const body        = Buffer.concat([Buffer.from(pre + videoHeader, "utf8"), chunkBuf, Buffer.from(epilogue, "utf8")]);

    // ใช้ upload_url จาก init ถ้ามี มิฉะนั้นใช้ graph-video
    let hostname = "graph-video.facebook.com";
    let path     = `/v19.0/${pageId}/videos`;
    if (uploadUrl) {
      try {
        const u = new URL(uploadUrl);
        hostname = u.hostname;
        path     = u.pathname + u.search;
      } catch(e) {}
    }

    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname, path, method: "POST",
        headers: {
          "Content-Type":   `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      };
      const req = https.request(opts, (r) => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on("error", reject); req.write(body); req.end();
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
