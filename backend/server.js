/* ============================================================================
   foodpanda × Carnelian — RISE ALIGNMENT · Leadership Offsite
   Backend  ·  backend/server.js
   Express + Socket.io + Claude
============================================================================ */

require("dotenv").config();

const fs      = require("fs");
const path    = require("path");
const http    = require("http");
const express = require("express");
const cors    = require("cors");
const { Server } = require("socket.io");
const Anthropic  = require("@anthropic-ai/sdk");
const deck       = require("./deck");
const ExcelJS    = require("exceljs");

const PORT          = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const MODEL         = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const HOST_KEY      = process.env.HOST_KEY || "rise2026";   // reclaims the dashboard if the laptop is lost
// Optional: comma-separated names that must never appear in a deck (e.g. an acquiring company).
const REDACT_TERMS  = String(process.env.REDACT_TERMS || "").split(",").map(t => t.trim()).filter(Boolean);
const DATA_DIR      = path.join(__dirname, ".data");
const DATA_FILE     = path.join(DATA_DIR, "sessions.json");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ─────────────────────────────────────────────────────────────────────────────
   1 · ACTIVITY SCHEMA  (mirrors the frontend, used for tallying only)
───────────────────────────────────────────────────────────────────────────── */
const SCHEMA = {
  1: { anonymous: true,  questions: [{ key: "headline", type: "text" }] },
  2: { anonymous: true,  questions: [{ key: "q1", type: "choice" }, { key: "q2", type: "choice" }] },
  3: { anonymous: true,  rounds: 5, questions: [1, 2, 3, 4, 5].map(r => ({ key: `r${r}`, type: "choice" })) },
  4: { anonymous: true,  questions: [
        { key: "fn",         type: "choice" },
        { key: "behaviours", type: "multi"  },
        { key: "missing",    type: "text"   },
        { key: "good",       type: "text"   },
        { key: "stuck",      type: "text"   },
        { key: "message",    type: "text"   },
      ] },
  5: { anonymous: true,  questions: [{ key: "commitments", type: "multi" }] },
  6: { anonymous: true,  questions: [{ key: "q1", type: "text" }] },
  7: { anonymous: false, questions: [{ key: "q1", type: "text" }] },
};

const BEHAVIOUR_LABELS = {
  prioritisation: "Strategic prioritisation",
  ownership:      "Ownership under ambiguity",
  translation:    "Translation and change communication",
  aidata:         "AI and data in decisions",
  commercial:     "Commercial judgement",
  leading:        "Leading through others",
};

const COMMITMENT_LABELS = {
  c1: "Make clear what stops when priorities compete",
  c2: "Give decision rights and escalation guardrails",
  c3: "Create room to redesign the work, not just add tools",
  c4: "Translate strategy locally and share the economics",
  c5: "Build development visibility, mentoring and succession",
  c6: "Manage capacity openly as teams get leaner",
};

/* ─────────────────────────────────────────────────────────────────────────────
   2 · STORE  (in-memory, mirrored to disk so a restart does not lose the room)
───────────────────────────────────────────────────────────────────────────── */
let sessions = {};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      sessions = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) || {};
      console.log(`Restored ${Object.keys(sessions).length} session(s) from disk.`);
    }
  } catch (e) { console.error("Store load failed:", e.message); sessions = {}; }
}

let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(sessions), "utf8");
    } catch (e) { console.error("Store save failed:", e.message); }
  }, 300);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";       // no I, O
function makeCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join(""); }
  while (sessions[c]);
  return c;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** One offsite, one room. Whoever creates it holds it until they end it. */
const activeSession = () => Object.values(sessions)[0] || null;
const isHost = (s, token) => !!s && !!token && s.hostToken === token;

/* stable per-participant sort key so anonymous answers are not in arrival order */
function hashKey(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ─────────────────────────────────────────────────────────────────────────────
   3 · PROJECTIONS
───────────────────────────────────────────────────────────────────────────── */
function publicState(s) {
  if (!s) return null;
  return {                                   // hostToken is never included here
    code:          s.code,
    sessionName:   s.sessionName,
    liveActivity:  s.liveActivity,
    liveRound:     s.liveRound,
    startedAt:     s.startedAt,
    participants:  s.participants.map(p => ({ id: p.id, name: p.name })),
  };
}

/** Aggregate every activity into { count, rows, tally } for the dashboard. */
function aggregate(s) {
  const out = {};

  for (const idStr of Object.keys(SCHEMA)) {
    const id     = Number(idStr);
    const schema = SCHEMA[id];
    const bucket = s.responses[id] || {};
    const entries = Object.entries(bucket);

    const tally = {};
    schema.questions.forEach(q => { if (q.type !== "text") tally[q.key] = {}; });

    const rows = entries.map(([pid, r]) => {
      schema.questions.forEach(q => {
        const v = r.answers?.[q.key];
        if (v == null || v === "") return;
        if (q.type === "choice") {
          tally[q.key][v] = (tally[q.key][v] || 0) + 1;
        } else if (q.type === "multi" && Array.isArray(v)) {
          v.forEach(k => { tally[q.key][k] = (tally[q.key][k] || 0) + 1; });
        }
      });
      return {
        pid,
        name:    schema.anonymous ? null : r.name || null,
        answers: r.answers || {},
        at:      r.at,
        _sort:   schema.anonymous ? hashKey(pid) : r.at,
      };
    });

    rows.sort((a, b) => a._sort - b._sort);
    rows.forEach(r => delete r._sort);

    out[id] = { count: rows.length, rows, tally };
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
   4 · APP + SOCKET
───────────────────────────────────────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: CLIENT_ORIGIN, exposedHeaders: ["Content-Disposition"] }));
app.use(express.json({ limit: "2mb" }));

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
  pingTimeout: 30000,
});

const roomOf     = (code) => `s:${code}`;
const hostRoomOf = (code) => `s:${code}:host`;

function broadcastState(code) {
  const s = sessions[code];
  if (!s) return;
  io.to(roomOf(code)).emit("session:state", publicState(s));
  saveStore();
}

function broadcastResponses(code) {
  const s = sessions[code];
  if (!s) return;
  io.to(hostRoomOf(code)).emit("responses:update", aggregate(s));
}

io.on("connection", (socket) => {

  /* ── LOBBY ────────────────────────────────────────────────────────────── */
  socket.on("lobby:status", () => {
    const s = activeSession();
    socket.emit("lobby:status", { active: !!s, code: s?.code || null });
  });

  /* ── HOST ─────────────────────────────────────────────────────────────── */
  function attachHost(socket, s) {
    socket.join(roomOf(s.code));
    socket.join(hostRoomOf(s.code));
    socket.data.code = s.code;
    socket.data.role = "host";
    socket.emit("session:state", publicState(s));
    socket.emit("responses:update", aggregate(s));
  }

  socket.on("host:create", ({ sessionName } = {}, ack) => {
    const existing = activeSession();
    if (existing) {
      // the room is already held; the first facilitator keeps it
      if (typeof ack === "function") {
        ack({ error: `A session is already running on room code ${existing.code}. Only one facilitator can hold the room.`, code: existing.code });
      }
      return;
    }

    const code  = makeCode();
    const token = uid() + uid();
    sessions[code] = {
      code,
      hostToken: token,
      sessionName: (sessionName || "Leadership Offsite").trim(),
      startedAt: Date.now(),
      liveActivity: null,
      liveRound: 1,
      participants: [],
      responses: {},
    };

    attachHost(socket, sessions[code]);
    saveStore();
    if (typeof ack === "function") ack({ code, token });
    io.emit("lobby:status", { active: true, code });
    console.log(`[create] ${code} — ${sessions[code].sessionName}`);
  });

  socket.on("host:resume", ({ code, token } = {}) => {
    const s = sessions[code];
    if (!s) return socket.emit("host:error", "That session has ended.");
    if (!isHost(s, token)) return socket.emit("host:error", `Another device is holding room ${s.code}.`);
    attachHost(socket, s);
  });

  /** Recovery path: the facilitator lost localStorage but knows the key from .env */
  socket.on("host:claim", ({ code, key } = {}, ack) => {
    const s = sessions[code] || activeSession();
    if (!s)                return typeof ack === "function" && ack({ ok:false });
    if (key !== HOST_KEY)  return typeof ack === "function" && ack({ ok:false });

    s.hostToken = uid() + uid();          // rotate, so the old device drops out
    attachHost(socket, s);
    saveStore();
    if (typeof ack === "function") ack({ ok:true, token: s.hostToken });
    console.log(`[claim]  ${s.code} — facilitator reclaimed the room`);
  });

  socket.on("activity:open", ({ code, token, activityId } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token) || !SCHEMA[activityId]) return;
    s.liveActivity = Number(activityId);
    s.liveRound = 1;
    broadcastState(code);
    broadcastResponses(code);
    console.log(`[open]   ${code} — activity ${activityId}`);
  });

  socket.on("activity:close", ({ code, token } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token)) return;
    console.log(`[close]  ${code} — activity ${s.liveActivity}`);
    s.liveActivity = null;
    broadcastState(code);
  });

  socket.on("activity:round", ({ code, token, round } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token)) return;
    s.liveRound = Math.max(1, Number(round) || 1);
    broadcastState(code);
    broadcastResponses(code);
  });

  socket.on("session:reset", ({ code, token } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token)) return;
    s.responses    = {};
    s.liveActivity = null;
    s.liveRound    = 1;
    s.decks        = {};
    dropDecks(code);
    io.to(roomOf(code)).emit("session:reset");   // tells phones to clear their local "done" list
    broadcastState(code);
    broadcastResponses(code);
    console.log(`[reset]  ${code} — answers cleared, ${s.participants.length} participant(s) kept`);
  });

  socket.on("session:end", ({ code, token } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token)) return;
    io.to(roomOf(code)).emit("session:ended");
    dropDecks(code);
    delete sessions[code];
    saveStore();
    io.emit("lobby:status", { active: false, code: null });
    console.log(`[end]    ${code}`);
  });

  /* ── PARTICIPANT ──────────────────────────────────────────────────────── */
  socket.on("participant:join", ({ code, name, participantId } = {}) => {
    const c = String(code || "").toUpperCase().trim();
    const s = sessions[c];
    if (!s) return socket.emit("join:error", "Room code not found. Check the screen.");

    let p = participantId && s.participants.find(x => x.id === participantId);
    if (p) {
      if (name && name.trim()) p.name = name.trim();
    } else {
      p = { id: uid(), name: (name || "Guest").trim(), joinedAt: Date.now() };
      s.participants.push(p);
    }

    socket.join(roomOf(c));
    socket.data.code = c;
    socket.data.pid  = p.id;
    socket.data.role = "participant";

    // round-based activities report per round ("3:2"), everything else reports "5"
    const submitted = [];
    for (const idStr of Object.keys(SCHEMA)) {
      const id = Number(idStr);
      const stored = s.responses[id]?.[p.id];
      if (!stored) continue;
      if (SCHEMA[id].rounds) {
        for (let n = 1; n <= SCHEMA[id].rounds; n++) {
          if (stored.answers?.[`r${n}`] != null) submitted.push(`${id}:${n}`);
        }
      } else {
        submitted.push(String(id));
      }
    }

    socket.emit("join:ok", { participantId: p.id, session: publicState(s), submitted });
    broadcastState(c);
    broadcastResponses(c);
  });

  socket.on("response:submit", ({ code, participantId, activityId, answers } = {}) => {
    const s = sessions[code];
    if (!s || !SCHEMA[activityId] || !participantId) return;

    const p = s.participants.find(x => x.id === participantId);
    if (!s.responses[activityId]) s.responses[activityId] = {};

    const prev = s.responses[activityId][participantId];
    s.responses[activityId][participantId] = {
      name:    p?.name || null,
      answers: { ...(prev?.answers || {}), ...(answers || {}) },   // merge so rounds accumulate
      at:      Date.now(),
    };

    saveStore();
    broadcastResponses(code);
  });

  socket.on("participant:leave", ({ code, participantId } = {}) => {
    const s = sessions[code];
    if (!s) return;
    s.participants = s.participants.filter(p => p.id !== participantId);
    broadcastState(code);
    broadcastResponses(code);
  });

  socket.on("disconnect", () => { /* phones lock; keep the participant in the room */ });
});

/* ─────────────────────────────────────────────────────────────────────────────
   5 · REST
───────────────────────────────────────────────────────────────────────────── */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, sessions: Object.keys(sessions).length, model: MODEL, uptime: Math.round(process.uptime()) });
});

/** Facilitator-only: every answer, including Activity 4 by function. */
app.get("/api/sessions/:code", (req, res) => {
  const s = sessions[String(req.params.code).toUpperCase()];
  if (!s) return res.status(404).json({ error: "Not found" });
  if (!isHost(s, req.query.token)) return res.status(403).json({ error: "Facilitator only" });
  res.json({ ...publicState(s), data: aggregate(s) });
});

/** CSV export, one row per leader. Facilitator-only: /api/sessions/ABCD/export/4?token=... */
app.get("/api/sessions/:code/export/:activityId", (req, res) => {
  const s = sessions[String(req.params.code).toUpperCase()];
  const id = Number(req.params.activityId);
  if (!s || !SCHEMA[id]) return res.status(404).send("Not found");
  if (!isHost(s, req.query.token)) return res.status(403).send("Facilitator only");

  const schema = SCHEMA[id];
  const keys   = schema.questions.map(q => q.key);
  const header = [...(schema.anonymous ? [] : ["name"]), ...keys];
  const esc = (v) => {
    if (Array.isArray(v)) v = v.map(k => BEHAVIOUR_LABELS[k] || COMMITMENT_LABELS[k] || k).join("; ");
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
  };
  const rows = Object.values(s.responses[id] || {}).map(r =>
    [...(schema.anonymous ? [] : [r.name]), ...keys.map(k => r.answers?.[k])].map(esc).join(",")
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="activity-${id}-${s.code}.csv"`);
  res.send([header.join(","), ...rows].join("\n"));
});

/* ─────────────────────────────────────────────────────────────────────────────
   5a · EXCEL EXPORT  (every answer, one sheet per activity)
   Anonymity matches what leaders were told on their phones: names appear only
   on My One Change. Anonymous sheets carry no timestamps, and each sheet is
   shuffled differently so rows cannot be lined up across activities.
───────────────────────────────────────────────────────────────────────────── */
const XL = { M: "FFD7136B", MAR: "FF7A1538", INK: "FF1C1A22", BLUSH: "FFFBE4EC", W: "FFFFFFFF" };
const saltHash = (pid, salt) => hashKey(`${salt}:${pid}`);

async function buildWorkbook(s) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Carnelian";
  wb.created = new Date();
  const when = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric",
    month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const rowsOf = (id) => Object.entries(s.responses[id] || {}).map(([pid, r]) => ({ pid, ...r }));
  const anon = (id) => rowsOf(id).sort((a, b) => saltHash(a.pid, id) - saltHash(b.pid, id));

  const sheet = (name, columns, { freeze = true } = {}) => {
    const ws = wb.addWorksheet(name, { views: freeze ? [{ state: "frozen", ySplit: 1 }] : [] });
    ws.columns = columns.map(c => ({ header: c.h, key: c.k, width: c.w }));
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: XL.W }, name: "Calibri", size: 11 };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.M } };
    hr.alignment = { vertical: "middle", wrapText: true };
    hr.height = 24;
    return ws;
  };
  const finish = (ws) => {
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.alignment = { vertical: "top", wrapText: true };
      if (i % 2 === 1) row.eachCell({ includeEmpty: true }, c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.BLUSH } }; });
    });
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  const bLabel = (k) => BEHAVIOUR_LABELS[k] || k || "";
  const cLabel = (k) => COMMITMENT_LABELS[k] || k || "";

  /* Session */
  const info = sheet("Session", [{ h: "Item", k: "a", w: 34 }, { h: "Value", k: "b", w: 46 }, { h: "", k: "c", w: 16 }], { freeze: false });
  info.addRows([
    { a: "Room code", b: s.code },
    { a: "Session", b: s.sessionName },
    { a: "Started", b: when(s.startedAt) },
    { a: "Exported", b: when(Date.now()) },
    { a: "Leaders joined", b: s.participants.length },
    {},
  ]);
  const hdr = info.addRow({ a: "Activity", b: "Shown with names", c: "Responses" });
  hdr.font = { bold: true, color: { argb: XL.MAR } };
  const NAMES = { 1: "1 · Headline 2027", 2: "2 · Predict the Number", 3: "3 · Whose Floor?", 4: "4 · What your function needs next",
    5: "5 · Reality Check", 6: "6 · Question Bank", 7: "7 · My One Change" };
  for (const id of Object.keys(SCHEMA).map(Number)) {
    info.addRow({ a: NAMES[id], b: SCHEMA[id].anonymous ? (id === 4 ? "No, by function only" : "No, anonymous") : "Yes", c: rowsOf(id).length });
  }
  info.getColumn("b").alignment = { horizontal: "left" };
  info.getColumn("c").alignment = { horizontal: "right" };

  /* Participation: who joined and which activities they answered (never what they said) */
  const part = sheet("Participation", [
    { h: "Name", k: "name", w: 22 }, { h: "Joined", k: "joined", w: 20 },
    ...[1, 2, 3, 4, 5, 6, 7].map(id => ({ h: `A${id}`, k: `a${id}`, w: 7 })),
  ]);
  [...s.participants].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const row = { name: p.name, joined: when(p.joinedAt) };
    for (let id = 1; id <= 7; id++) {
      const r = s.responses[id]?.[p.id];
      row[`a${id}`] = r ? "✓" : "";      // a tick only: partial counts could single out a row
    }
    part.addRow(row);
  });
  for (let id = 1; id <= 7; id++) part.getColumn(`a${id}`).alignment = { horizontal: "center" };
  finish(part);

  /* 1 */
  const s1 = sheet("1 Headline 2027", [{ h: "#", k: "n", w: 5 }, { h: "Headline for September 2027", k: "t", w: 90 }]);
  anon(1).forEach((r, i) => s1.addRow({ n: i + 1, t: r.answers?.headline || "" }));
  finish(s1);

  /* 2 */
  const s2 = sheet("2 Predict the Number", [
    { h: "#", k: "n", w: 5 },
    { h: "High-potentials regularly working beyond normal hours (real: 58.6%)", k: "q1", w: 42 },
    { h: "Say the efficiency agenda is rarely explained well (real: 44.8%)", k: "q2", w: 42 },
  ]);
  anon(2).forEach((r, i) => s2.addRow({ n: i + 1, q1: r.answers?.q1 || "", q2: r.answers?.q2 || "" }));
  finish(s2);

  /* 3 */
  const s3 = sheet("3 Whose Floor", [{ h: "#", k: "n", w: 5 }, ...[1, 2, 3, 4, 5].map(r => ({ h: `Round ${r}`, k: `r${r}`, w: 16 }))]);
  anon(3).forEach((r, i) => s3.addRow({ n: i + 1, ...Object.fromEntries([1, 2, 3, 4, 5].map(k => [`r${k}`, r.answers?.[`r${k}`] || ""])) }));
  finish(s3);

  /* 4: by function, never by name */
  const fnOrder = (f) => { const i = deck.FUNCTIONS.indexOf(f); return i < 0 ? 99 : i; };
  const s4 = sheet("4 Function needs next", [
    { h: "Function", k: "fn", w: 24 }, { h: "Behaviour 1", k: "b1", w: 28 }, { h: "Behaviour 2", k: "b2", w: 28 },
    { h: "Missing behaviour or skill", k: "missing", w: 32 }, { h: "What good looks like", k: "good", w: 48 },
    { h: "Where priorities clashed or a decision got stuck", k: "stuck", w: 60 },
    { h: "Message the team needs to hear", k: "message", w: 44 },
  ]);
  anon(4).sort((a, b) => fnOrder(a.answers?.fn) - fnOrder(b.answers?.fn)).forEach(r => {
    const a = r.answers || {}, b = a.behaviours || [];
    s4.addRow({ fn: a.fn || "", b1: bLabel(b[0]), b2: bLabel(b[1]), missing: a.missing || "", good: a.good || "",
      stuck: a.stuck || "", message: a.message || "" });
  });
  finish(s4);

  /* 5 */
  const s5 = sheet("5 Reality Check", [{ h: "#", k: "n", w: 5 }, ...[1, 2, 3].map(i => ({ h: `Commitment ${i}`, k: `c${i}`, w: 44 }))]);
  anon(5).forEach((r, i) => { const c = r.answers?.commitments || []; s5.addRow({ n: i + 1, c1: cLabel(c[0]), c2: cLabel(c[1]), c3: cLabel(c[2]) }); });
  finish(s5);

  /* 6 */
  const s6 = sheet("6 Question Bank", [{ h: "#", k: "n", w: 5 }, { h: "Hardest question the team is likely to ask", k: "q", w: 90 }]);
  anon(6).forEach((r, i) => s6.addRow({ n: i + 1, q: r.answers?.q1 || "" }));
  finish(s6);

  /* 7: shown with names, as leaders were told */
  const s7 = sheet("7 My One Change", [{ h: "Name", k: "name", w: 20 }, { h: "One change the team will notice in 30 days", k: "t", w: 90 }]);
  rowsOf(7).sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(r => s7.addRow({ name: r.name || "", t: r.answers?.q1 || "" }));
  finish(s7);

  /* Totals */
  const agg = aggregate(s);
  const tot = sheet("Totals", [{ h: "Measure", k: "a", w: 52 }, { h: "", k: "b", w: 14 }, { h: "", k: "c", w: 14 }, { h: "", k: "d", w: 14 }, { h: "", k: "e", w: 14 }], { freeze: false });
  tot.getRow(1).values = ["Totals, counted from every answer"];
  const section = (title, head) => {
    tot.addRow({});
    const t = tot.addRow({ a: title }); t.font = { bold: true, size: 12, color: { argb: XL.MAR } };
    const h = tot.addRow(head); h.font = { bold: true }; h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.BLUSH } }; });
  };
  section("Predict the Number · guesses per band", { a: "Band", b: "Q1", c: "Q2" });
  deck.BANDS.forEach(b => tot.addRow({ a: b, b: agg[2].tally.q1?.[b] || 0, c: agg[2].tally.q2?.[b] || 0 }));
  tot.addRow({ a: "Real answer", b: "58.6%", c: "44.8%" }).font = { italic: true };
  section("Whose Floor? · votes per round", { a: "Round", b: "Senior leader", c: "MD-2", d: "IC3", e: "Total" });
  [1, 2, 3, 4, 5].forEach(r => {
    const t = agg[3].tally[`r${r}`] || {};
    const v = deck.VOICES.map(x => t[x] || 0);
    tot.addRow({ a: `Round ${r}`, b: v[0], c: v[1], d: v[2], e: v[0] + v[1] + v[2] });
  });
  section("What your function needs next · leaders picking each behaviour", { a: "Behaviour", b: "Leaders" });
  deck.BEHAVIOURS.map(b => ({ l: b.label, v: agg[4].tally.behaviours?.[b.key] || 0 })).sort((x, y) => y.v - x.v)
    .forEach(x => tot.addRow({ a: x.l, b: x.v }));
  section("Reality Check · leaders picking each commitment", { a: "Commitment", b: "Leaders" });
  deck.COMMITMENTS.map(c => ({ l: c.label, v: agg[5].tally.commitments?.[c.key] || 0 })).sort((x, y) => y.v - x.v)
    .forEach(x => tot.addRow({ a: x.l, b: x.v }));
  tot.getRow(1).font = { bold: true, size: 13, color: { argb: XL.W } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Facilitator-only Excel download of every answer. */
app.post("/api/export/xlsx", async (req, res) => {
  const { code, token } = req.body || {};
  const s = sessions[code];
  if (!isHost(s, token)) return res.status(403).json({ error: "Only the facilitator can download the data." });
  try {
    const buf = await buildWorkbook(s);
    const d = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="RISE-Alignment_responses_${s.code}_${d}.xlsx"`);
    res.send(buf);
    console.log(`[export] ${code} — xlsx`);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: `Could not build the file: ${err.message}` });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   5b · PRESENTATIONS
   Numbers come from the data (deck.js). Claude only writes the wording.
   "a4"      → the 7-slide "What you told us" deck for the break
   "session" → the full results deck, all seven activities
───────────────────────────────────────────────────────────────────────────── */
const deckBuffers = new Map();                 // `${code}:${kind}` → Buffer (rebuilt on demand after a restart)
function dropDecks(code) { for (const k of [...deckBuffers.keys()]) if (k.startsWith(code + ":")) deckBuffers.delete(k); }

const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function redactText(str, replacement) {
  let out = String(str ?? "");
  for (const t of REDACT_TERMS) out = out.replace(new RegExp(`\\b${escRe(t)}\\b`, "gi"), replacement);
  return out;
}
function redactDeep(v, replacement = "the pending transaction") {
  if (typeof v === "string") return redactText(v, replacement);
  if (Array.isArray(v)) return v.map(x => redactDeep(x, replacement));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x, replacement)]));
  return v;
}
/** Leaders' own words: keep them, but never show a redacted name. */
function redactStats(st) {
  if (!REDACT_TERMS.length) return st;
  const r = (x) => redactDeep(x, "[company]");
  return { ...st, a1: r(st.a1), a6: r(st.a6), a7: r(st.a7), a4: { ...st.a4, rows: r(st.a4.rows), perFunction: r(st.a4.perFunction) } };
}

/** Escapes raw line breaks and tabs that appear inside JSON strings (a common model slip). */
function repairJSON(t) {
  let out = "", inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === "\\") { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") continue;
      if (ch === "\t") { out += " "; continue; }
      out += ch; continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, "$1");     // trailing commas
}

function extractJSON(text) {
  const t = String(text || "").replace(/```json|```/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      const raw = t.slice(start, i + 1);
      try { return JSON.parse(raw); } catch { try { return JSON.parse(repairJSON(raw)); } catch { return null; } }
    }
  }
  return null;
}

/**
 * Asks Claude for structured output through a forced tool call, so the API returns
 * parsed JSON that matches the schema. Plain-text JSON is only a fallback.
 */
async function askJSON(system, user, maxTokens, tool) {
  let lastErr = "no response";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: MODEL, max_tokens: maxTokens, system,
        messages: [{ role: "user", content: user }],
        tools: [tool], tool_choice: { type: "tool", name: tool.name },
      });
      const call = msg.content.find(c => c.type === "tool_use" && c.name === tool.name);
      if (call && call.input && typeof call.input === "object") return call.input;
      const j = extractJSON(msg.content.map(c => c.text || "").join(""));
      if (j) return j;
      lastErr = msg.stop_reason === "max_tokens" ? "reply was cut off (too long)" : "reply had no usable content";
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

const str = (description) => ({ type: "string", description });
const A4_TOOL = {
  name: "write_what_you_told_us",
  description: "Write the wording for the seven-slide What you told us deck.",
  input_schema: {
    type: "object",
    properties: {
      summary: str("Five short lines, separated by newline characters, for the facilitator to sanity check before sharing."),
      s3_headline: str("One sentence, at most 9 words, on the overall pattern across functions."),
      s3_good: {
        type: "array", description: "Exactly one entry for every function listed.",
        items: { type: "object", properties: { function: str("Exact function name as given"),
          good: str("What good looks like in that function, at most 6 words, from its example") }, required: ["function", "good"] },
      },
      s4_headline: str("One sentence, at most 12 words, naming the most common way decisions got stuck (question 5)."),
      s4_themes: {
        type: "array", description: "Two or three themes. No function names.",
        items: { type: "object", properties: { title: str("At most 4 words"), line: str("One line of explanation, at most 12 words"),
          functions: { type: "integer", description: "How many functions described this" } }, required: ["title", "line", "functions"] },
      },
      s5_outliers: {
        type: "array", description: "Zero to three genuine outliers from question 3 or an unusual question 5 situation.",
        items: { type: "object", properties: { function: str("Exact function name as given"), need: str("The need in one line, at most 12 words") },
          required: ["function", "need"] },
      },
      s5_none_line: str("One line to use if there are no real outliers, otherwise an empty string."),
      s7_headline: str("One sentence, at most 12 words, naming the strongest theme in what teams need to hear (question 6). No function names."),
      s7_messages: { type: "array", description: "Three to five grouped messages, each at most 14 words, no function names.", items: { type: "string" } },
    },
    required: ["summary", "s3_headline", "s3_good", "s4_headline", "s4_themes", "s5_outliers", "s5_none_line", "s7_headline", "s7_messages"],
  },
};
const SESSION_TOOL = {
  name: "write_session_headlines",
  description: "Write headlines for the session results deck.",
  input_schema: {
    type: "object",
    properties: {
      a1_headline: str("One sentence, at most 12 words, stating the common thread in the 2027 headlines."),
      a1_picks: { type: "array", items: { type: "integer" }, description: "Numbers of the three strongest, most distinct headlines; prefer shorter ones." },
      a6_headline: str("One sentence, at most 12 words, naming the strongest theme in the questions."),
      a7_headline: str("One sentence, at most 12 words, naming the most common kind of change leaders committed to."),
    },
    required: ["a1_headline", "a1_picks", "a6_headline", "a7_headline"],
  },
};
/** s3_good arrives as a list from the tool; the deck wants a map keyed by function. */
function normaliseA4(j) {
  const out = { ...j };
  if (Array.isArray(j.s3_good)) out.s3_good = Object.fromEntries(j.s3_good.filter(x => x && x.function).map(x => [x.function, x.good]));
  return out;
}

const HOUSE_RULES = `- Use only what is in the answers. Do not invent examples, numbers or themes.
- Headlines are full sentences that state the finding, not labels.
- Never include a person's name.
- Never name any company involved in an acquisition or sale. If anyone mentions it, write "the pending transaction".
- Short verbatim phrases under 12 words are allowed where they sharpen a point. Fix obvious typos.
- Plain, natural British English. No em dashes. No consultant jargon ("leverage", "unlock", "synergy"). No "it's not just X, it's Y" phrasing.`;

const A4_SYSTEM = `You are helping Carnelian, a consulting firm, run a live leadership session for foodpanda Pakistan. You are given answers from senior leaders, one per function, collected in the room. You write the wording for a 7-slide summary called "What you told us". Numbers, charts and layout are produced elsewhere from the data: you only write text.

Rules:
${HOUSE_RULES}
- The fields for slides 4 and 7 must not contain any function name.

Reply by calling the write_what_you_told_us tool. The fields are described below for reference:
{
  "summary": "Five short lines separated by \\n, for the facilitator to sanity check before sharing.",
  "s3_headline": "One sentence, at most 9 words, on the overall pattern across functions.",
  "s3_good": [ { "function": "<exact function name>", "good": "What good looks like in that function, at most 6 words" } ],
  "s4_headline": "One sentence, at most 12 words, naming the most common way decisions got stuck (question 5).",
  "s4_themes": [ { "title": "At most 4 words", "line": "One line of explanation, at most 12 words", "functions": 3 } ],
  "s5_outliers": [ { "function": "<exact function name>", "need": "The need in one line, at most 12 words" } ],
  "s5_none_line": "One line to use if there are no real outliers, otherwise an empty string.",
  "s7_headline": "One sentence, at most 12 words, naming the strongest theme in what teams need to hear (question 6).",
  "s7_messages": ["Three to five grouped messages, each at most 14 words, no function names."]
}
s3_good must contain exactly one entry for every function listed, using the function name exactly as given.
s4_themes: two or three themes; "functions" is the whole number of functions that described it.
s5_outliers: zero to three genuine outliers, from question 3 (a missing behaviour or skill) or an unusual situation in question 5. Use the exact function name.`;

function a4Prompt(st) {
  const counts = deck.BEHAVIOURS.map(b => `${b.label}: ${st.a4.behaviourCounts[b.key]}`).join("\n");
  const leaders = st.a4.rows.map((r, i) => [
    `LEADER ${i + 1}`,
    `Function: ${r.fn}`,
    `Two behaviours that matter most: ${r.behaviours.join(" + ")}`,
    `Missing from the list: ${r.missing || "(left blank)"}`,
    `What good looks like: ${r.good}`,
    `Where priorities clashed or a decision got stuck: ${r.stuck}`,
    `Message their team needs to hear: ${r.message}`,
  ].join("\n")).join("\n\n");
  return `NUMBER OF LEADERS: ${st.a4.n}
FUNCTIONS (${st.a4.nf}): ${st.a4.functions.join(", ")}

BEHAVIOUR COUNTS (already tallied):
${counts}

ANSWERS:

${leaders}`;
}

const SESSION_SYSTEM = `You write short wording for a results deck from a foodpanda Pakistan leadership offsite run by Carnelian.

Rules:
${HOUSE_RULES}

Reply by calling the write_session_headlines tool:
{
  "a1_headline": "One sentence, at most 12 words, stating the common thread in the 2027 headlines.",
  "a1_picks": [0, 1, 2],
  "a6_headline": "One sentence, at most 12 words, naming the strongest theme in the questions teams will ask.",
  "a7_headline": "One sentence, at most 12 words, naming the most common kind of change leaders committed to."
}
a1_picks: the numbers of the three strongest, most distinct headlines for the closing slide; prefer shorter ones.
Use an empty string for any section that has no answers.`;

function sessionPrompt(st) {
  const list = (arr) => (arr.length ? arr.map((t, i) => `${i}. ${t}`).join("\n") : "(no answers)");
  return `ACTIVITY 1 · HEADLINES FOR SEPTEMBER 2027:
${list(st.a1)}

ACTIVITY 6 · HARDEST QUESTIONS TEAMS WILL ASK:
${list(st.a6)}

ACTIVITY 7 · ONE CHANGE EACH LEADER WILL MAKE IN 30 DAYS:
${list(st.a7.map(x => x.text))}`;
}

/** What the facilitator should check before the deck goes on screen. */
function qaReport(kind, st, ai, result, aiErrors) {
  const qa = [];
  const add = (status, label, detail = "") => qa.push({ status, label, detail });
  const a4 = st.a4;

  if (a4.n) {
    const a4ai = kind === "a4" ? ai : (ai.a4 || {});
    const a4Slides = result.sections.find(x => x.id === 4)?.slides || 0;
    add("pass", "Slide 1 count matches the data", `${a4.n} leaders, ${a4.nf} functions`);
    add(a4.picks === a4.n * 2 ? "pass" : "warn", "Behaviour chart totals twice the leaders",
      `${a4.picks} picks from ${a4.n} leaders${a4.picks === a4.n * 2 ? "" : ", someone did not pick exactly two"}`);
    add(a4Slides === 7 ? "pass" : "warn", "“What you told us” is exactly 7 slides",
      a4Slides === 7 ? "" : `${a4Slides} slides: the function table needed a second slide to stay readable`);
    const aiText = JSON.stringify(a4ai);
    const names = st.names.filter(n => new RegExp(`\\b${escRe(n)}\\b`, "i").test(aiText));
    add(names.length ? "warn" : "pass", "No leader names in “What you told us”",
      names.length ? `Mentioned: ${names.join(", ")}. Regenerate or edit before sharing.` : "");
    const s47 = JSON.stringify([a4ai.s4_headline, a4ai.s4_themes, a4ai.s7_headline, a4ai.s7_messages]);
    const fns = a4.functions.filter(f => f !== "Other" && new RegExp(`\\b${escRe(f)}\\b`, "i").test(s47));
    add(fns.length ? "warn" : "pass", "No function labels on slides 4 and 7", fns.length ? `Mentioned: ${fns.join(", ")}` : "");
    if (REDACT_TERMS.length) add("pass", "Company names redacted", REDACT_TERMS.join(", "));
  }
  const jargon = ["leverage", "unlock", "synergy", "synergies"].filter(j => new RegExp(`\\b${j}`, "i").test(JSON.stringify(ai)));
  add(jargon.length ? "warn" : "pass", "No consultant jargon", jargon.join(", "));

  const cut = result.warnings.filter(w => /shortened/.test(w));
  add(cut.length ? "warn" : "pass", "Every piece of text fits its box", cut.join("; "));

  const small = {};
  result.small.forEach(x => { const k = `Slide ${x.slide}: ${x.label.replace(/ text$/, "")}`; small[k] = Math.min(small[k] || 99, x.pt); });
  const smallList = Object.entries(small).map(([k, pt]) =>
    `${k} at ${pt}pt${/table/.test(k) ? ` (all ${a4.nf} functions on one slide, keeping the 7-slide structure)` : ""}`);
  add(smallList.length ? "info" : "pass", "Body text at 18pt or larger", smallList.join("; "));

  result.warnings.filter(w => !/shortened/.test(w)).forEach(w => add("info", w));
  if (result.skipped.length) add("info", "Left out, no answers", result.skipped.map(id => `Activity ${id}`).join(", "));
  aiErrors.forEach(e => add("warn", "AI wording unavailable, fallback wording used", e));
  return qa;
}

const fileName = (kind, s) => {
  const d = new Date(s.startedAt || Date.now()).toISOString().slice(0, 10);
  return kind === "a4" ? `What-you-told-us_${d}.pptx` : `RISE-Alignment_Leadership-Offsite_${d}.pptx`;
};

/** Generate (or regenerate) a deck. Facilitator only. */
app.post("/api/deck/generate", async (req, res) => {
  const { code, token, kind = "session", fresh = false } = req.body || {};
  const s = sessions[code];
  if (!isHost(s, token)) return res.status(403).json({ error: "Only the facilitator can generate a presentation." });
  if (!["a4", "session"].includes(kind)) return res.status(400).json({ error: "Unknown deck" });

  const t0 = Date.now();
  try {
    const st = redactStats(deck.computeStats(s));
    const hasAny = st.a1.length || st.a2.q1.n || st.a3.some(r => r.n) || st.a4.n || st.a5.n || st.a6.length || st.a7.length;
    if (kind === "a4" && !st.a4.n) return res.status(400).json({ error: "No answers for Activity 4 yet." });
    if (kind === "session" && !hasAny) return res.status(400).json({ error: "No answers yet. Run at least one activity first." });

    s.decks = s.decks || {};
    const aiErrors = [];
    const fp = deck.a4Fingerprint(st);
    let a4ai = !fresh && s.decks.a4ai?.fp === fp ? s.decks.a4ai.ai : null;   // reuse the read shown at the break
    let sessAi = {};
    const jobs = [];
    if (st.a4.n && !a4ai) {
      jobs.push(askJSON(A4_SYSTEM, a4Prompt(st), 8000, A4_TOOL)
        .then(j => { a4ai = redactDeep(normaliseA4(j)); s.decks.a4ai = { fp, ai: a4ai }; })
        .catch(e => { aiErrors.push(`Activity 4: ${e.message}`); a4ai = {}; }));
    }
    if (kind === "session" && (st.a1.length || st.a6.length || st.a7.length)) {
      jobs.push(askJSON(SESSION_SYSTEM, sessionPrompt(st), 2000, SESSION_TOOL)
        .then(j => { sessAi = redactDeep(j); })
        .catch(e => aiErrors.push(`Headlines: ${e.message}`)));
    }
    await Promise.all(jobs);

    const ai = kind === "a4" ? (a4ai || {}) : { ...sessAi, a4: a4ai || {} };
    const result = kind === "a4" ? await deck.buildA4Deck(st, ai) : await deck.buildSessionDeck(st, ai);
    s.decks[kind] = { st, ai, at: Date.now() };
    deckBuffers.set(`${code}:${kind}`, result.buffer);
    saveStore();

    const qa = qaReport(kind, st, ai, result, aiErrors);
    console.log(`[deck]   ${code} — ${kind}, ${result.slides} slides, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    res.json({
      ok: true, kind, slides: result.slides, sections: result.sections, skipped: result.skipped,
      summary: (a4ai && a4ai.summary) ? String(a4ai.summary).split(/\n+/).map(deck.tidy).filter(Boolean).join("\n") : "", qa,
      seconds: Math.round((Date.now() - t0) / 1000), fileName: fileName(kind, s), generatedAt: s.decks[kind].at,
    });
  } catch (err) {
    console.error("Deck error:", err);
    res.status(500).json({ error: `Could not build the presentation: ${err.message}` });
  }
});

/** Download the last generated deck. Facilitator only. */
app.post("/api/deck/file", async (req, res) => {
  const { code, token, kind = "session" } = req.body || {};
  const s = sessions[code];
  if (!isHost(s, token)) return res.status(403).json({ error: "Only the facilitator can download the presentation." });
  const saved = s.decks?.[kind];
  if (!saved) return res.status(404).json({ error: "Generate the presentation first." });
  try {
    let buf = deckBuffers.get(`${code}:${kind}`);
    if (!buf) {
      const r = kind === "a4" ? await deck.buildA4Deck(saved.st, saved.ai) : await deck.buildSessionDeck(saved.st, saved.ai);
      buf = r.buffer; deckBuffers.set(`${code}:${kind}`, buf);
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName(kind, s)}"`);
    res.send(buf);
  } catch (err) {
    console.error("Deck file error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   6 · BOOT
───────────────────────────────────────────────────────────────────────────── */
loadStore();
server.listen(PORT, () => {
  console.log(`\n  RISE Alignment backend`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}`);
  console.log(`  cors:  ${CLIENT_ORIGIN}\n`);
});