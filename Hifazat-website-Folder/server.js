// ======================================================
// HIFAZAT FIRE SAFETY — WEBSITE BACKEND SERVER
// WITH GOOGLE SHEETS AUTO-RETRY EVERY 5 MINUTES
// + ADMIN DASHBOARD WHATSAPP LINK
// ======================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = 3000;

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || "03091666636";

// Immediate retry during a single sync attempt
const GOOGLE_SYNC_MAX_ATTEMPTS = 3;
const GOOGLE_SYNC_RETRY_DELAY_MS = 2500;
const GOOGLE_SYNC_TIMEOUT_MS = 20000;

// Background auto-retry queue
const AUTO_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let isAutoRetryRunning = false;

// Data storage
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "inquiries.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

function normalizePhone(phone = "") {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizeWhatsappPhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

function readInquiries() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeInquiries(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function saveInquiry(inquiry) {
  const inquiries = readInquiries();
  inquiries.push(inquiry);
  writeInquiries(inquiries);
}

function updateInquiryFields(id, updates) {
  const inquiries = readInquiries();
  const i = inquiries.findIndex((x) => x.id === id);

  if (i !== -1) {
    inquiries[i] = {
      ...inquiries[i],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeInquiries(inquiries);
  }
}

function updateInquirySyncStatus(id, googleSheetsSync) {
  updateInquiryFields(id, { googleSheetsSync });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFailedSync(sync) {
  if (!sync) return false;
  return sync.status === "failed";
}

function isSuccessfulSync(sync) {
  if (!sync) return false;
  return sync.status === "synced" || sync.status === "success";
}

function getLatestTimestampFromInquiry(item) {
  const candidates = [
    item.lastRetryFinishedAt,
    item.lastRetryStartedAt,
    item.googleSheetsSync?.attemptedAt,
    item.updatedAt,
    item.createdAt
  ].filter(Boolean);

  if (candidates.length === 0) return null;
  return candidates.sort().slice(-1)[0];
}

function buildWhatsAppMessage(inquiry) {
  if (!inquiry) return "";

  return [
    `Assalam o Alaikum ${inquiry.fullName || ""}.`,
    "Thank you for contacting HIFAZAT Fire Safety Solutions.",
    `We have received your inquiry regarding ${inquiry.serviceNeed || "fire safety services"}.`,
    "Our team will contact you shortly.",
    `For urgent assistance, please call ${BUSINESS_PHONE}.`
  ].join(" ");
}

function buildWhatsAppLink(inquiry) {
  if (!inquiry) return null;

  const whatsappPhone = normalizeWhatsappPhone(inquiry.phone || "");
  if (!whatsappPhone) return null;

  const text = encodeURIComponent(buildWhatsAppMessage(inquiry));
  return `https://wa.me/${whatsappPhone}?text=${text}`;
}

function getRiskLevel(buildingType) {
  const type = String(buildingType || "").toLowerCase().trim();

  if (!type) return "Medium";

  if (
    type.includes("residential") ||
    type.includes("house") ||
    type.includes("home")
  ) {
    return "Low";
  }

  if (
    type.includes("plaza") ||
    type.includes("factory") ||
    type.includes("industry") ||
    type.includes("industrial") ||
    type.includes("hospital") ||
    type.includes("school") ||
    type.includes("academy") ||
    type.includes("warehouse") ||
    type.includes("mall")
  ) {
    return "High";
  }

  if (
    type.includes("restaurant") ||
    type.includes("cafe") ||
    type.includes("office") ||
    type.includes("shop") ||
    type.includes("commercial")
  ) {
    return "Medium";
  }

  return "Medium";
}

function getPkDateParts(input = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const [{ value: year }, , { value: month }, , { value: day }] = formatter.formatToParts(new Date(input));

  return { year, month, day };
}

function formatPkSheetDate(input = new Date()) {
  const { year, month, day } = getPkDateParts(input);
  return `${day}/${month}/${year}`;
}

function buildDashboardStats() {
  const inquiries = readInquiries();
  const totalInquiries = inquiries.length;
  const synced = inquiries.filter((item) => isSuccessfulSync(item.googleSheetsSync)).length;
  const pendingRetry = inquiries.filter((item) => isFailedSync(item.googleSheetsSync)).length;
  const pendingInitialSync = inquiries.filter((item) => !item.googleSheetsSync || item.googleSheetsSync.status === "pending").length;
  const neverAttempted = inquiries.filter((item) => !item.googleSheetsSync || !item.googleSheetsSync.attemptedAt).length;
  const manualRetried = inquiries.filter((item) => item.lastRetrySource === "manual").length;
  const autoRetried = inquiries.filter((item) => Number(item.autoRetryCount || 0) > 0).length;
  const totalAutoRetryAttempts = inquiries.reduce((sum, item) => sum + Number(item.autoRetryCount || 0), 0);

  const latestInquiry = inquiries.reduce((latest, item) => {
    if (!latest) return item;
    return new Date(item.createdAt || 0) > new Date(latest.createdAt || 0) ? item : latest;
  }, null);

  const latestFailedInquiry = inquiries
    .filter((item) => isFailedSync(item.googleSheetsSync))
    .reduce((latest, item) => {
      if (!latest) return item;
      const latestTime = getLatestTimestampFromInquiry(latest) || 0;
      const itemTime = getLatestTimestampFromInquiry(item) || 0;
      return new Date(itemTime) > new Date(latestTime) ? item : latest;
    }, null);

  const lastRetryRunAt = inquiries.reduce((latest, item) => {
    const itemTime = getLatestTimestampFromInquiry(item);
    if (!itemTime) return latest;
    if (!latest) return itemTime;
    return new Date(itemTime) > new Date(latest) ? itemTime : latest;
  }, null);

  return {
    totalInquiries,
    synced,
    pendingRetry,
    pendingInitialSync,
    neverAttempted,
    manualRetried,
    autoRetried,
    totalAutoRetryAttempts,
    autoRetryWorkerRunning: isAutoRetryRunning,
    latestInquiryAt: latestInquiry?.createdAt || null,
    latestInquiryName: latestInquiry?.fullName || null,
    latestInquiryPhone: latestInquiry?.phone || null,
    latestInquiryServiceNeed: latestInquiry?.serviceNeed || null,
    latestInquiryWhatsappLink: buildWhatsAppLink(latestInquiry),
    latestInquiryWhatsappMessage: latestInquiry ? buildWhatsAppMessage(latestInquiry) : null,
    latestFailedInquiryId: latestFailedInquiry?.id || null,
    latestFailedInquiryAt: latestFailedInquiry ? getLatestTimestampFromInquiry(latestFailedInquiry) : null,
    lastRetryRunAt
  };
}

function generateLeadId() {
  return Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function syncToGoogleSheetsOnce(data) {
  if (!APPS_SCRIPT_URL) {
    return {
      ok: false,
      error: "APPS_SCRIPT_URL is missing"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    const text = await response.text();

    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok && parsed.ok !== false,
      httpOk: response.ok,
      status: response.status,
      response: parsed
    };
  } catch (err) {
    console.log("Google sync error:", err.message);

    return {
      ok: false,
      error: err.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function syncToGoogleSheetsWithRetry(data) {
  let lastResult = null;

  for (let attempt = 1; attempt <= GOOGLE_SYNC_MAX_ATTEMPTS; attempt++) {
    const result = await syncToGoogleSheetsOnce(data);

    if (result.ok) {
      return {
        status: "success",
        attemptedAt: new Date().toISOString(),
        attemptsUsed: attempt,
        response: result
      };
    }

    lastResult = result;

    if (attempt < GOOGLE_SYNC_MAX_ATTEMPTS) {
      console.log("Retrying Google Sheets sync...");
      await sleep(GOOGLE_SYNC_RETRY_DELAY_MS);
    }
  }

  return {
    status: "failed",
    attemptedAt: new Date().toISOString(),
    attemptsUsed: GOOGLE_SYNC_MAX_ATTEMPTS,
    response: lastResult
  };
}

async function resendOneInquiryToGoogleSheets(inquiry, source = "manual") {
  const currentAutoRetryCount = Number(inquiry.autoRetryCount || 0);

  updateInquiryFields(inquiry.id, {
    lastRetrySource: source,
    lastRetryStartedAt: new Date().toISOString(),
    autoRetryCount: source === "auto" ? currentAutoRetryCount + 1 : currentAutoRetryCount
  });

  const googleSheetsSync = await syncToGoogleSheetsWithRetry({
    websiteLeadId: inquiry.id,
    fullName: inquiry.fullName,
    phone: inquiry.phone,
    address: inquiry.address,
    buildingType: inquiry.buildingType,
    serviceNeed: inquiry.serviceNeed,
    message: inquiry.message,
    source: inquiry.source || "Website",
    sourceDetail: inquiry.sourceDetail || "Website Contact Form",
    createdAt: inquiry.createdAt,
    leadDate: formatPkSheetDate(inquiry.createdAt),
    riskLevel: getRiskLevel(inquiry.buildingType)
  });

  updateInquiryFields(inquiry.id, {
    googleSheetsSync,
    lastRetrySource: source,
    lastRetryFinishedAt: new Date().toISOString()
  });

  return googleSheetsSync;
}

async function processFailedLeadsQueue() {
  if (isAutoRetryRunning) {
    console.log("⏳ Auto-retry skipped because previous cycle is still running.");
    return;
  }

  if (!APPS_SCRIPT_URL) {
    console.log("⚠️ Auto-retry skipped because APPS_SCRIPT_URL is not set.");
    return;
  }

  isAutoRetryRunning = true;

  try {
    const failed = readInquiries().filter((item) => isFailedSync(item.googleSheetsSync));

    if (failed.length === 0) {
      console.log("✅ Auto-retry check complete: no failed leads waiting.");
      return;
    }

    console.log(`🔁 Auto-retry started for ${failed.length} failed lead(s).`);

    let successCount = 0;
    let failedCount = 0;

    for (const inquiry of failed) {
      const result = await resendOneInquiryToGoogleSheets(inquiry, "auto");

      if (isSuccessfulSync(result)) {
        successCount += 1;
        console.log(`✅ Lead synced after background retry: ${inquiry.id}`);
      } else {
        failedCount += 1;
        console.log(`❌ Lead still failed after background retry: ${inquiry.id}`);
      }
    }

    console.log(`📦 Auto-retry cycle finished. Success: ${successCount}, Still failed: ${failedCount}`);
  } catch (err) {
    console.error("Auto-retry queue error:", err);
  } finally {
    isAutoRetryRunning = false;
  }
}

function startAutoRetryWorker() {
  console.log(`🕒 Failed lead auto-retry worker started. Interval: ${AUTO_RETRY_INTERVAL_MS / 60000} minutes.`);

  setTimeout(() => {
    processFailedLeadsQueue().catch((err) => console.error("Initial auto-retry error:", err));
  }, 10000);

  setInterval(() => {
    processFailedLeadsQueue().catch((err) => console.error("Scheduled auto-retry error:", err));
  }, AUTO_RETRY_INTERVAL_MS);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJSON(res, {
      ok: true,
      service: "hifazat-backend",
      sheetsSyncEnabled: !!APPS_SCRIPT_URL,
      autoRetryEnabled: true,
      autoRetryIntervalMinutes: AUTO_RETRY_INTERVAL_MS / 60000,
      time: new Date().toISOString()
    });
  }

  if (req.method === "GET" && req.url === "/api/admin-dashboard") {
    return sendJSON(res, {
      ok: true,
      dashboard: buildDashboardStats(),
      sheetsSyncEnabled: !!APPS_SCRIPT_URL,
      autoRetryEnabled: true,
      autoRetryIntervalMinutes: AUTO_RETRY_INTERVAL_MS / 60000,
      time: new Date().toISOString()
    });
  }

  if (req.method === "GET" && req.url === "/api/inquiries") {
    return sendJSON(res, readInquiries());
  }

  if (req.method === "GET" && req.url === "/api/failed-inquiries") {
    const failed = readInquiries().filter((item) => isFailedSync(item.googleSheetsSync));
    return sendJSON(res, {
      ok: true,
      count: failed.length,
      failed
    });
  }

  if (req.method === "POST" && req.url === "/api/resend-failed-leads") {
    try {
      const failed = readInquiries().filter((item) => isFailedSync(item.googleSheetsSync));

      if (failed.length === 0) {
        return sendJSON(res, {
          ok: true,
          message: "No failed leads found",
          totalFailed: 0,
          resent: []
        });
      }

      const resent = [];

      for (const inquiry of failed) {
        const result = await resendOneInquiryToGoogleSheets(inquiry, "manual");

        resent.push({
          id: inquiry.id,
          fullName: inquiry.fullName,
          status: result.status,
          attemptsUsed: result.attemptsUsed,
          response: result.response || null
        });
      }

      const successCount = resent.filter((x) => x.status === "synced" || x.status === "success").length;
      const failedCount = resent.length - successCount;

      return sendJSON(res, {
        ok: true,
        message: "Failed lead resend completed",
        totalFailed: failed.length,
        successCount,
        failedCount,
        resent
      });
    } catch (err) {
      console.error("Resend failed leads error:", err);
      return sendJSON(
        res,
        {
          ok: false,
          error: "Failed to resend failed leads"
        },
        500
      );
    }
  }

  if (req.method === "POST" && req.url === "/api/inquiry") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");

        const inquiry = {
          id: generateLeadId(),
          fullName: data.fullName || "",
          phone: normalizePhone(data.phone || ""),
          address: data.address || "",
          buildingType: data.buildingType || "",
          serviceNeed: data.serviceNeed || "",
          message: data.message || "",
          source: "Website",
          sourceDetail: "Website Contact Form",
          createdAt: new Date().toISOString(),
          autoRetryCount: 0,
          googleSheetsSync: {
            status: "pending",
            attemptedAt: null,
            attemptsUsed: 0,
            response: null
          }
        };

        saveInquiry(inquiry);

        const googleSheetsSync = await syncToGoogleSheetsWithRetry({
          websiteLeadId: inquiry.id,
          fullName: inquiry.fullName,
          phone: inquiry.phone,
          address: inquiry.address,
          buildingType: inquiry.buildingType,
          serviceNeed: inquiry.serviceNeed,
          message: inquiry.message,
          source: inquiry.source,
          sourceDetail: inquiry.sourceDetail,
          createdAt: inquiry.createdAt,
          leadDate: formatPkSheetDate(inquiry.createdAt),
          riskLevel: getRiskLevel(inquiry.buildingType)
        });

        updateInquirySyncStatus(inquiry.id, googleSheetsSync);

        return sendJSON(res, {
          ok: true,
          inquiryId: inquiry.id,
          googleSheetsSync,
          queuedForAutoRetry: googleSheetsSync.status === "failed"
        });
      } catch (err) {
        console.error("Inquiry processing error:", err);
        return sendJSON(
          res,
          {
            ok: false,
            error: "Invalid request"
          },
          400
        );
      }
    });

    return;
  }

  // Remove query string before serving files
const requestUrl = new URL(req.url, `http://${req.headers.host}`);
const pathname = requestUrl.pathname;

let file = pathname === "/" ? "/index.html" : pathname;
const filePath = path.join(PUBLIC_DIR, file);

  fs.readFile(filePath, (err, data) => {
  if (err) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream"
  });

  res.end(data);
});
});

server.listen(PORT, () => {
  console.log("🔥 HIFAZAT server running at http://localhost:" + PORT);
  startAutoRetryWorker();
});
