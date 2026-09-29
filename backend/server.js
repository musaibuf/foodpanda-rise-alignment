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
    else if (ch === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

async function askJSON(system, user, maxTokens) {
  let lastErr = "no response";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
      const j = extractJSON(msg.content.map(c => c.text || "").join(""));
      if (j) return j;
      lastErr = "reply was not valid JSON";
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
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

Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "summary": "Five short lines separated by \\n, for the facilitator to sanity check before sharing.",
  "s3_headline": "One sentence, at most 9 words, on the overall pattern across functions.",
  "s3_good": { "<exact function name>": "What good looks like in that function, at most 6 words, drawn from its example" },
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

Return ONLY valid JSON, no markdown, in exactly this shape:
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
      jobs.push(askJSON(A4_SYSTEM, a4Prompt(st), 6000)
        .then(j => { a4ai = redactDeep(j); s.decks.a4ai = { fp, ai: a4ai }; })
        .catch(e => { aiErrors.push(`Activity 4: ${e.message}`); a4ai = {}; }));
    }
    if (kind === "session" && (st.a1.length || st.a6.length || st.a7.length)) {
      jobs.push(askJSON(SESSION_SYSTEM, sessionPrompt(st), 1500)
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