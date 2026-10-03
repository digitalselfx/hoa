// HOA Vendor & Project Management — website + contact form backend
// Deploys to Railway as-is. Storage: Postgres if DATABASE_URL is set, otherwise a local JSON file.
// Email notifications: sent via SMTP if SMTP_HOST is set.

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const COMPANY_NAME = process.env.COMPANY_NAME || "Dr. HOA – Project Management";

app.set("trust proxy", 1); // Railway sits behind a proxy
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

// ---------- Storage ----------
let pool = null;
const LEADS_FILE = path.join(__dirname, "data", "leads.json");

async function initStorage() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        community TEXT,
        units TEXT,
        project_type TEXT,
        budget TEXT,
        timeline TEXT,
        service TEXT,
        message TEXT,
        ip TEXT
      )`);
    console.log("Storage: Postgres");
  } else {
    fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
    if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, "[]");
    console.log("Storage: local JSON file (set DATABASE_URL on Railway for persistence)");
  }
}

async function saveLead(lead) {
  if (pool) {
    const cols = ["name", "email", "phone", "role", "community", "units", "project_type", "budget", "timeline", "service", "message", "ip"];
    await pool.query(
      `INSERT INTO leads (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})`,
      cols.map((c) => lead[c] || null)
    );
  } else {
    const all = JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
    all.push({ id: all.length + 1, created_at: new Date().toISOString(), ...lead });
    fs.writeFileSync(LEADS_FILE, JSON.stringify(all, null, 2));
  }
}

async function listLeads() {
  if (pool) return (await pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 500")).rows;
  return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")).reverse();
}

// ---------- Email ----------
let transporter = null;
if (process.env.SMTP_HOST) {
  const nodemailer = require("nodemailer");
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function notify(lead) {
  if (!transporter || !process.env.NOTIFY_EMAIL) return;
  const lines = Object.entries(lead)
    .filter(([k]) => k !== "ip")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v || "-"}`)
    .join("\n");
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    replyTo: lead.email,
    subject: `New consultation request — ${lead.community || lead.name}`,
    text: `New inquiry from the ${COMPANY_NAME} website:\n\n${lines}`,
  });
}

// ---------- Simple rate limit (per IP) ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5; // max 5 submissions / hour / IP
}

// ---------- Routes ----------
const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

app.post("/api/contact", async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot: bots fill hidden field

    const lead = {
      name: clean(b.name, 120),
      email: clean(b.email, 160),
      phone: clean(b.phone, 40),
      role: clean(b.role, 80),
      community: clean(b.community, 160),
      units: clean(b.units, 40),
      project_type: clean(b.project_type, 80),
      budget: clean(b.budget, 40),
      timeline: clean(b.timeline, 40),
      service: clean(b.service, 80),
      message: clean(b.message, 3000),
      ip: req.ip,
    };

    if (!lead.name || !EMAIL_RE.test(lead.email)) {
      return res.status(400).json({ ok: false, error: "Please provide your name and a valid email address." });
    }
    if (rateLimited(req.ip)) {
      return res.status(429).json({ ok: false, error: "Too many submissions. Please try again later or email us directly." });
    }

    await saveLead(lead);
    notify(lead).catch((e) => console.error("Email failed:", e.message));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
});

// Private lead list: /admin/leads?token=YOUR_ADMIN_TOKEN
app.get("/admin/leads", async (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.query.token !== process.env.ADMIN_TOKEN) return res.status(404).send("Not found");
  const leads = await listLeads();
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cols = ["created_at", "name", "email", "phone", "role", "community", "units", "project_type", "budget", "timeline", "service", "message"];
  res.send(`<!doctype html><meta charset="utf-8"><title>Leads</title>
  <style>body{font:14px system-ui;margin:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}th{background:#f3f4f6}</style>
  <h1>Leads (${leads.length})</h1><table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>
  ${leads.map((l) => `<tr>${cols.map((c) => `<td>${esc(l[c])}</td>`).join("")}</tr>`).join("")}</table>`);
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

initStorage()
  .then(() => app.listen(PORT, () => console.log(`${COMPANY_NAME} running on port ${PORT}`)))
  .catch((e) => {
    console.error("Startup failed:", e);
    process.exit(1);
  });
