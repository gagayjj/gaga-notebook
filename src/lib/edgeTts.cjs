const WebSocket = require("ws");
const crypto = require("crypto");

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WSS_BASE =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const WIN_EPOCH = 11644473600;
const DEFAULT_VOICE = "Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)";

function normalizeVoice(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_VOICE;
  if (/^Microsoft Server Speech Text to Speech Voice \(/.test(raw)) return raw;
  const match = /^([a-z]{2,3}-[A-Z]{2})-(.+Neural)$/.exec(raw);
  if (match) return `Microsoft Server Speech Text to Speech Voice (${match[1]}, ${match[2]})`;
  return DEFAULT_VOICE;
}

function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const hash = crypto.createHash("sha256").update(`${ticks}${TRUSTED_CLIENT_TOKEN}`).digest("hex");
  return hash.toUpperCase();
}

function connectionId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function rateToProsody(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "+0.00%";
  const percent = Math.round((Math.max(0.3, Math.min(1.5, raw)) - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function parseTextMessage(message) {
  const sections = message.split("\r\n\r\n");
  const headers = {};
  for (const line of sections[0]?.split("\r\n") || []) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return { headers, body: sections[1] || "" };
}

function synthesize(text, options = {}) {
  const content = String(text || "").trim();
  if (!content) return Promise.resolve(Buffer.alloc(0));

  const id = connectionId();
  const url =
    `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${generateSecMsGec()}` +
    `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}` +
    `&ConnectionId=${id}`;

  const voice = normalizeVoice(options.voice);
  const rate = rateToProsody(Number(options.rate) || 0.6);

  const speechConfig = [
    `X-Timestamp:${timestamp()}`,
    "Content-Type:application/json; charset=utf-8",
    "Path:speech.config",
    "",
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false,
            },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    }),
  ].join("\r\n");

  const ssml = [
    `X-RequestId:${connectionId()}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${timestamp()}Z`,
    "Path:ssml",
    "",
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>`,
    `<voice name='${voice}'>`,
    `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>`,
    escapeXml(content),
    "</prosody>",
    "</voice>",
    "</speak>",
  ].join("\r\n");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      perMessageDeflate: false,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
      handshakeTimeout: 20000,
    });
    const audioChunks = [];
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (error) reject(error);
      else resolve(Buffer.concat(audioChunks));
    };

    const timeout = setTimeout(() => finish(new Error("TTS 合成超时，请检查网络后重试")), 60000);
    ws.on("open", () => {
      ws.send(speechConfig);
      ws.send(ssml);
    });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const { headers } = parseTextMessage(String(data));
        if (headers.path === "turn.end") finish();
        return;
      }
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buffer.length < 3) return;
      const headerLength = buffer.readUInt16BE(0);
      const audio = buffer.subarray(headerLength + 2);
      if (audio.length > 0) audioChunks.push(Buffer.from(audio));
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      finish(error);
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      if (!settled) finish();
    });
  });
}

module.exports = { synthesize, DEFAULT_VOICE, generateSecMsGec };
