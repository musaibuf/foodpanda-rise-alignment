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

const PORT          = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const MODEL         = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const HOST_KEY      = process.env.HOST_KEY || "rise2026";   // reclaims the dashboard if the laptop is lost
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

app.use(cors({ origin: CLIENT_ORIGIN }));
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
    io.to(roomOf(code)).emit("session:reset");   // tells phones to clear their local "done" list
    broadcastState(code);
    broadcastResponses(code);
    console.log(`[reset]  ${code} — answers cleared, ${s.participants.length} participant(s) kept`);
  });

  socket.on("session:end", ({ code, token } = {}) => {
    const s = sessions[code];
    if (!isHost(s, token)) return;
    io.to(roomOf(code)).emit("session:ended");
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

app.get("/api/sessions/:code", (req, res) => {
  const s = sessions[req.params.code.toUpperCase()];
  if (!s) return res.status(404).json({ error: "Not found" });
  res.json({ ...publicState(s), data: aggregate(s) });
});

/** CSV export — one row per leader, for any activity. */
app.get("/api/sessions/:code/export/:activityId", (req, res) => {
  const s = sessions[req.params.code.toUpperCase()];
  const id = Number(req.params.activityId);
  if (!s || !SCHEMA[id]) return res.status(404).send("Not found");

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

/* ── Activity 4 → "What you told us" deck ──────────────────────────────────── */
const DECK_SYSTEM = `You are helping Carnelian, a consulting firm, run a live leadership session for foodpanda Pakistan. You are given responses from 8 to 11 senior leaders, one per function, collected in the room a few minutes ago.

Produce a 5-line plain-text sanity summary, then a structured 7-slide specification.

RULES
- Use only what is in the data. Do not invent examples, numbers or themes.
- Every count must match the data exactly.
- Headlines are full sentences that state the finding, not labels. "Prioritisation and ownership lead across almost every function", not "Top behaviours".
- About 25 words of body text per slide at most. This goes on a screen for senior leaders.
- Never show a person's name. Function labels only on slides 3 and 5. Slides 4 and 7 carry no function labels.
- If anyone mentions an acquisition or names an acquiring company, write "the pending transaction". Never name the company.
- Short verbatim phrases under 12 words are allowed where they sharpen a point. Fix obvious typos.
- Plain, natural British English. No em dashes. No consultant jargon (leverage, unlock, synergy). No "it's not just X, it's Y".
- Only include functions that actually responded.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "summary": "Five short lines separated by newlines, for the facilitator to sanity check.",
  "n": 0,
  "functions": 0,
  "slides": [
    { "n": 1, "type": "title", "title": "What you told us", "subtitle": "[n] leaders, [n] functions, a few minutes ago" },
    { "n": 2, "type": "bars", "headline": "One sentence naming the top one or two behaviours.",
      "bars": [ { "label": "Behaviour name", "value": 0, "emphasis": true } ],
      "note": "One line if a behaviour was picked by nobody, else empty string." },
    { "n": 3, "type": "table", "headline": "One sentence on the overall pattern.",
      "columns": ["Function", "Top two behaviours", "What good looks like"],
      "rows": [ ["Function", "Behaviour A, Behaviour B", "Max eight words"] ] },
    { "n": 4, "type": "themes", "headline": "One sentence naming the most common pattern in where decisions get stuck.",
      "themes": [ { "title": "Short bold title", "line": "One line of explanation.", "count": "3 functions described this" } ] },
    { "n": 5, "type": "outliers", "headline": "A few needs sit outside the common pattern",
      "items": [ { "function": "Function", "need": "The need in one line." } ],
      "fallback": "Use this line instead if there are no real outliers, else empty string." },
    { "n": 6, "type": "discussion", "headline": "How do we cater to these?",
      "questions": ["Is this a need for one function, or an early signal for all of us?",
                    "Where does it sit: something people learn, something managers do, or something the organisation changes?"] },
    { "n": 7, "type": "messages", "headline": "One sentence naming the strongest theme in what teams are waiting to hear.",
      "messages": ["Grouped message, no function label."],
      "footer": "We'll build on these next." }
  ]
}

Slide 2 must list all six behaviours highest first, with the top two marked emphasis true.
Slide 6 must carry exactly the two questions given above, unchanged.`;

function digest(responses = []) {
  return responses.map((r, i) => {
    const a = r.answers || {};
    const behaviours = (a.behaviours || []).map(k => BEHAVIOUR_LABELS[k] || k).join(" + ");
    return [
      `LEADER ${i + 1}`,
      `Function: ${a.fn || "Not given"}`,
      `Two behaviours that matter most: ${behaviours || "Not given"}`,
      `Missing from the list: ${a.missing?.trim() || "(left blank)"}`,
      `What good looks like: ${a.good || "Not given"}`,
      `Where a decision got stuck: ${a.stuck || "Not given"}`,
      `Message their team needs to hear: ${a.message || "Not given"}`,
    ].join("\n");
  }).join("\n\n———\n\n");
}

app.post("/api/ai/deck", async (req, res) => {
  try {
    const responses = req.body?.responses || [];
    if (!responses.length) return res.status(400).json({ error: "No responses to analyse yet." });

    const functions = [...new Set(responses.map(r => r.answers?.fn).filter(Boolean))];

    const counts = {};
    responses.forEach(r => (r.answers?.behaviours || []).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    const countLines = Object.entries(BEHAVIOUR_LABELS)
      .map(([k, label]) => `${label}: ${counts[k] || 0}`).join("\n");

    const user = [
      `NUMBER OF LEADERS: ${responses.length}`,
      `FUNCTIONS REPRESENTED (${functions.length}): ${functions.join(", ") || "none given"}`,
      ``,
      `BEHAVIOUR COUNTS (already tallied, use these exact numbers on slide 2):`,
      countLines,
      ``,
      `FULL RESPONSES:`,
      ``,
      digest(responses),
    ].join("\n");

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: DECK_SYSTEM,
      messages: [{ role: "user", content: user }],
    });

    const raw = msg.content[0].text;
    const start = raw.indexOf("{");
    let depth = 0, end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start === -1 || end === -1) throw new Error("Model did not return JSON");

    const parsed = JSON.parse(raw.slice(start, end + 1));
    parsed.n = parsed.n || responses.length;
    parsed.functions = parsed.functions || functions.length;

    res.json(parsed);
  } catch (err) {
    console.error("Deck error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* generic passthrough, handy for one-off prompts during the session */
app.post("/api/ai/ask", async (req, res) => {
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Number(req.body?.maxTokens) || 3000,
      system: req.body?.system || "You are a concise analyst. Plain British English. No em dashes.",
      messages: [{ role: "user", content: String(req.body?.user || "") }],
    });
    res.json({ text: msg.content[0].text });
  } catch (err) {
    console.error("Ask error:", err.message);
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