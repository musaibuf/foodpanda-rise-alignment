"use strict";
/* ============================================================================
   RISE Alignment · deck engine  ·  backend/deck.js
   ----------------------------------------------------------------------------
   Builds two decks from live session data:
     • "session" — the full Leadership Offsite results deck (all 7 activities)
     • "a4"      — the 7-slide "What you told us" deck for the break

   Rules this file enforces:
     • Every number is computed here from the data. Claude only supplies wording.
     • Every text block is measured and fitted before it is placed, so nothing
       overflows its box or the slide. Long lists paginate onto extra slides.
     • Brand spec from the offsite brief: white background, soft pink cards
       (E7C6D0, FBE4EC), magenta D7136B for numbers and highlights, maroon
       7A1538 secondary, near-black 1C1A22 for dark panels and headlines,
       Arial bold headlines, Calibri body, small uppercase magenta tag top left,
       no images, no decorative lines under titles.
============================================================================ */

const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

/* ─────────────────────────────────────────────────────────────────────────────
   1 · CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const C = {
  M: "D7136B", MAR: "7A1538", INK: "1C1A22", PINK: "E7C6D0", BLUSH: "FBE4EC",
  W: "FFFFFF", GREY: "57515E", MUTE: "8A838F", SOFT: "F6EEF2",
};
const HEAD = "Arial";
const BODY = "Calibri";

const SW = 10, SH = 5.625;          // LAYOUT_16x9
const MX = 0.5, CW = SW - 2 * MX;   // side margins, content width
const BOTTOM = 5.12;                // content must end above this line
const MIN_BODY = 18;                // brief: minimum body font size

const BANDS = ["0-10%","11-20%","21-30%","31-40%","41-50%","51-60%","61-70%","71-80%","81-90%","91-100%"];
const A2_QUESTIONS = {
  q1: { text: "What share of your high-potentials regularly work beyond normal hours?", real: 58.6 },
  q2: { text: "What share say the efficiency agenda is rarely explained well?",           real: 44.8 },
};
const VOICES = ["Senior leader", "MD-2", "IC3"];
const FUNCTIONS = [
  "Logistics","Human Resources","Marketplace Experience","Finance","Commercial",
  "Quick Commerce","Marketing","MD Office","Public Affairs and PR","CEO Office","Other",
];
const BEHAVIOURS = [
  { key: "prioritisation", label: "Strategic prioritisation",             short: "Prioritisation" },
  { key: "ownership",      label: "Ownership under ambiguity",            short: "Ownership" },
  { key: "translation",    label: "Translation and change communication", short: "Translation" },
  { key: "aidata",         label: "AI and data in decisions",             short: "AI and data" },
  { key: "commercial",     label: "Commercial judgement",                 short: "Commercial" },
  { key: "leading",        label: "Leading through others",               short: "Leading others" },
];
const COMMITMENTS = [
  { key: "c1", label: "Make clear what stops when priorities compete" },
  { key: "c2", label: "Give decision rights and escalation guardrails" },
  { key: "c3", label: "Create room to redesign the work, not just add tools" },
  { key: "c4", label: "Translate strategy locally and share the economics" },
  { key: "c5", label: "Build development visibility, mentoring and succession" },
  { key: "c6", label: "Manage capacity openly as teams get leaner" },
];
const DISCUSSION_QUESTIONS = [
  "Is this a need for one function, or an early signal for all of us?",
  "Where does it sit: something people learn, something managers do, or something the organisation changes?",
];

const bLabel = (k) => BEHAVIOURS.find(b => b.key === k)?.label || k;
const bShort = (k) => BEHAVIOURS.find(b => b.key === k)?.short || k;
const lcFirst = (s = "") => (/^AI\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/* ─────────────────────────────────────────────────────────────────────────────
   2 · TEXT METRICS
   Exact advance widths (per 1000 em) taken from Liberation Sans and Carlito,
   which are metric-compatible with Arial and Calibri. Line heights from the
   fonts' own vertical metrics, plus 2% headroom.
───────────────────────────────────────────────────────────────────────────── */
const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2018\u2019\u201c\u201d\u2026\u2013\u2014\u00b7\u2022\u00e9";
const ADV = {"Arial":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,222,222,333,333,1000,556,1000,333,350,556],"Arial-b":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,278,278,500,500,1000,556,1000,333,350,556],"Calibri":[226,326,401,498,507,715,682,221,303,303,498,498,250,306,252,386,507,507,507,507,507,507,507,507,507,507,268,268,498,498,498,463,894,579,544,533,615,488,459,631,623,252,319,520,420,855,646,662,517,673,543,459,487,642,567,890,519,487,468,307,386,307,498,498,291,479,525,423,525,498,305,471,525,229,239,455,229,799,525,527,525,525,349,391,335,525,452,715,433,453,395,314,460,314,498,250,250,418,418,690,498,905,252,498,498],"Calibri-b":[226,326,438,498,507,729,705,233,312,312,498,498,258,306,267,430,507,507,507,507,507,507,507,507,507,507,276,276,498,498,498,463,898,606,561,529,630,488,459,637,631,267,331,547,423,874,659,676,532,686,563,473,495,653,591,906,551,520,478,325,430,325,498,498,300,494,537,418,537,503,316,474,537,246,255,480,246,813,537,538,537,537,355,399,347,537,473,745,459,474,397,344,475,344,498,258,258,435,435,711,498,905,268,498,503]};
const CHAR_IX = new Map([...CHARS].map((c, i) => [c, i]));
const LINE_K = { [HEAD]: 1.15 * 1.02, [BODY]: 1.221 * 1.02 };

function widthIn(str, pt, face, bold) {
  const table = ADV[face + (bold ? "-b" : "")] || ADV[HEAD];
  let u = 0;
  for (const ch of String(str)) {
    const i = CHAR_IX.get(ch);
    u += i !== undefined ? table[i] : (ch.codePointAt(0) > 0x2E7F ? 1000 : 600);
  }
  return (u / 1000) * (pt / 72);
}

function wrapText(text, wIn, pt, face, bold) {
  const maxW = wIn * 0.98;   // 2% headroom for renderer differences
  const lines = [];
  for (const para of String(text ?? "").split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let cur = "";
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word;
      if (widthIn(trial, pt, face, bold) <= maxW) { cur = trial; continue; }
      if (cur) lines.push(cur);
      if (widthIn(word, pt, face, bold) <= maxW) { cur = word; continue; }
      let chunk = "";                                   // a single word wider than the box
      for (const ch of word) {
        if (widthIn(chunk + ch, pt, face, bold) > maxW && chunk) { lines.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      cur = chunk;
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [""];
}

const blockH = (nLines, pt, face, ls = 1) => nLines * pt * (LINE_K[face] || 1.2) * ls / 72;

/** Largest size between max and min at which the text fits; truncates at min as a last resort. */
function fitText(text, { w, h, face = BODY, bold = false, max = 18, min = max, ls = 1, maxLines = Infinity }) {
  const src = String(text ?? "").trim();
  for (let pt = max; pt >= min; pt -= 1) {
    const n = wrapText(src, w, pt, face, bold).length;
    if (n <= maxLines && blockH(n, pt, face, ls) <= h + 1e-6) return { pt, lines: n, text: src, truncated: false };
  }
  const words = src.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    const t = words.join(" ").replace(/[\s,.;:–-]+$/, "") + "…";
    const n = wrapText(t, w, min, face, bold).length;
    if (n <= maxLines && blockH(n, min, face, ls) <= h + 1e-6) return { pt: min, lines: n, text: t, truncated: true };
  }
  return { pt: min, lines: 1, text: (words[0] || "").slice(0, 24) + "…", truncated: true };
}

/* ─────────────────────────────────────────────────────────────────────────────
   3 · TEXT HYGIENE
───────────────────────────────────────────────────────────────────────────── */
/** For wording Claude writes: British-English house rules from the brief. */
function tidy(s) {
  return String(s ?? "")
    .replace(/\*\*?|__|`|#+\s/g, "")
    .replace(/\s*—\s*/g, ", ")          // no em dashes
    .replace(/\s+–\s+/g, ", ")          // spaced en dash used as a dash
    .replace(/\s+,/g, ",").replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .trim();
}
/** For what leaders typed: keep their words, only clean spacing and stray wrapping quotes. */
function verbatim(s) {
  return String(s ?? "").replace(/\s+/g, " ").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").trim();
}
const words = (s, n) => { const w = String(s).split(/\s+/).filter(Boolean); return w.length <= n ? w.join(" ") : w.slice(0, n).join(" "); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const NUM_WORDS = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve"];
/** British style: a number that opens a sentence is written as a word. */
const lead = (n, one, many) => `${NUM_WORDS[n] || n} ${n === 1 ? one : many}`;
const ofN = (v, n) => `${v} of ${n} ${n === 1 ? "leader" : "leaders"}`;
/** Keeps a leader's phrase whole if it is short; otherwise cuts at a word and marks the cut. */
function phrase(s, maxWords) {
  const w = String(s || "").split(/\s+/).filter(Boolean);
  if (w.length <= maxWords) return w.join(" ").replace(/[\s,;:–-]+$/, "");
  const STOP = new Set(["a","an","the","by","of","to","and","or","in","on","at","for","with","from","our","their","my","your","is","are","be","we","it"]);
  let cut = w.slice(0, maxWords);
  while (cut.length > 3 && STOP.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ""))) cut.pop();
  return cut.join(" ").replace(/[\s,.;:–-]+$/, "") + "…";
}

/* ─────────────────────────────────────────────────────────────────────────────
   4 · STATS  (pure data → numbers; no wording)
───────────────────────────────────────────────────────────────────────────── */
function bandIndexOf(value) {
  return BANDS.findIndex(b => { const [lo, hi] = b.replace("%", "").split("-").map(Number); return value >= lo && value <= hi + 0.999; });
}

function computeStats(session) {
  const R = (id) => Object.values(session?.responses?.[id] || {}).sort((a, b) => (a.at || 0) - (b.at || 0));

  const a1 = R(1).map(r => verbatim(r.answers?.headline)).filter(Boolean);

  const a2 = {};
  for (const key of ["q1", "q2"]) {
    const counts = BANDS.map(() => 0);
    R(2).forEach(r => { const i = BANDS.indexOf(r.answers?.[key]); if (i >= 0) counts[i] += 1; });
    const n = counts.reduce((a, b) => a + b, 0);
    const top = Math.max(0, ...counts);
    const modes = n ? counts.map((c, i) => (c === top ? i : -1)).filter(i => i >= 0) : [];
    const flat = counts.flatMap((c, i) => Array(c).fill(i));
    const median = flat.length ? flat[Math.floor((flat.length - 1) / 2)] : -1;
    const realIdx = bandIndexOf(A2_QUESTIONS[key].real);
    a2[key] = { counts, n, modes, median, realIdx, real: A2_QUESTIONS[key].real, correct: counts[realIdx] || 0, question: A2_QUESTIONS[key].text };
  }

  const a3 = [1, 2, 3, 4, 5].map(r => {
    const counts = Object.fromEntries(VOICES.map(v => [v, 0]));
    R(3).forEach(x => { const v = x.answers?.[`r${r}`]; if (v in counts) counts[v] += 1; });
    return { round: r, counts, n: Object.values(counts).reduce((a, b) => a + b, 0) };
  });

  const a4rows = R(4).filter(r => r.answers?.fn);
  const behaviourCounts = Object.fromEntries(BEHAVIOURS.map(b => [b.key, 0]));
  let picks = 0, exactlyTwo = true;
  a4rows.forEach(r => {
    const b = Array.isArray(r.answers.behaviours) ? r.answers.behaviours : [];
    if (b.length !== 2) exactlyTwo = false;
    b.forEach(k => { if (k in behaviourCounts) { behaviourCounts[k] += 1; picks += 1; } });
  });
  const fnOrder = (f) => { const i = FUNCTIONS.indexOf(f); return i < 0 ? 99 : i; };
  const functions = [...new Set(a4rows.map(r => r.answers.fn))].sort((a, b) => fnOrder(a) - fnOrder(b));
  const perFunction = functions.map(fn => {
    const rows = a4rows.filter(r => r.answers.fn === fn);
    const c = {};
    rows.forEach(r => (r.answers.behaviours || []).forEach(k => { c[k] = (c[k] || 0) + 1; }));
    const top2 = BEHAVIOURS.map(b => b.key).filter(k => c[k]).sort((x, y) => (c[y] - c[x]) || (BEHAVIOURS.findIndex(b => b.key === x) - BEHAVIOURS.findIndex(b => b.key === y))).slice(0, 2);
    return { fn, leaders: rows.length, top2, goods: rows.map(r => verbatim(r.answers.good)).filter(Boolean) };
  });
  const a4 = {
    n: a4rows.length, functions, nf: functions.length, behaviourCounts, picks, exactlyTwo, perFunction,
    rows: a4rows.map(r => ({
      fn: r.answers.fn,
      behaviours: (r.answers.behaviours || []).map(bLabel),
      missing: verbatim(r.answers.missing), good: verbatim(r.answers.good),
      stuck: verbatim(r.answers.stuck), message: verbatim(r.answers.message),
    })),
  };

  const a5counts = Object.fromEntries(COMMITMENTS.map(c => [c.key, 0]));
  const a5rows = R(5);
  a5rows.forEach(r => (r.answers?.commitments || []).forEach(k => { if (k in a5counts) a5counts[k] += 1; }));
  const a5 = { n: a5rows.length, counts: a5counts, picks: Object.values(a5counts).reduce((a, b) => a + b, 0) };

  const a6 = R(6).map(r => verbatim(r.answers?.q1)).filter(Boolean);

  const a7 = R(7).map(r => ({ name: verbatim(r.name) || "Leader", text: verbatim(r.answers?.q1) }))
    .filter(x => x.text).sort((a, b) => a.name.localeCompare(b.name));

  const names = [...new Set((session?.participants || []).map(p => verbatim(p.name)).filter(n => n && n.length >= 3))];

  return {
    date: session?.startedAt || Date.now(),
    joined: (session?.participants || []).length,
    names, a1, a2, a3, a4, a5, a6, a7,
  };
}

/** Stable fingerprint of Activity 4 answers, so a cached AI read can be reused. */
function a4Fingerprint(stats) {
  const s = JSON.stringify(stats.a4.rows);
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${stats.a4.n}:${h}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   5 · DETERMINISTIC WORDING  (used for number-led headlines and as fallbacks)
───────────────────────────────────────────────────────────────────────────── */
function a2Headline(q) {
  if (!q.n) return "";
  const real = `${q.real}%`;
  const modeTxt = q.modes.length === 1 ? `most guessed ${BANDS[q.modes[0]]}`
    : q.modes.length === 2 ? `guesses split between ${BANDS[q.modes[0]]} and ${BANDS[q.modes[1]]}`
    : "guesses were spread widely";
  const lead = q.median < q.realIdx ? "The room underestimated it"
    : q.median > q.realIdx ? "The room overestimated it" : "The room called it";
  return `${lead}: ${modeTxt}, the real figure is ${real}`;
}

function a3Headline(rounds) {
  const live = rounds.filter(r => r.n > 0).map(r => {
    const [voice, v] = Object.entries(r.counts).sort((a, b) => b[1] - a[1])[0];
    return { ...r, voice, share: v / r.n };
  });
  if (!live.length) return "";
  if (live.length === 1) return `Round ${live[0].round}: most of the room said ${live[0].voice}`;
  const clear = [...live].sort((a, b) => b.share - a.share || a.round - b.round)[0];
  const split = [...live].sort((a, b) => a.share - b.share || a.round - b.round)[0];
  if (clear.round === split.round) return "Every round split the room in a similar way";
  return `Round ${clear.round} was the clearest call; round ${split.round} split the room most`;
}

function a4BarsHeadline(a4) {
  const sorted = BEHAVIOURS.map(b => ({ ...b, v: a4.behaviourCounts[b.key] })).sort((x, y) => y.v - x.v);
  const [a, b] = sorted;
  if (!a || !a.v) return "";
  if (b && b.v === a.v) return `${a.label} and ${lcFirst(b.label)} lead, each picked by ${ofN(a.v, a4.n)}`;
  return `${a.label} leads, picked by ${ofN(a.v, a4.n)}`;
}

function zeroNote(a4) {
  const zero = BEHAVIOURS.filter(b => !a4.behaviourCounts[b.key]).map(b => lcFirst(b.label));
  if (!zero.length) return "";
  if (zero.length === 1) return `No leader picked ${zero[0]}.`;
  if (zero.length === 2) return `No leader picked ${zero[0]} or ${zero[1]}.`;
  return `No leader picked ${zero.slice(0, -1).join(", ")} or ${zero[zero.length - 1]}.`;
}

function a5Headline(a5) {
  const sorted = COMMITMENTS.map(c => ({ ...c, v: a5.counts[c.key] })).sort((x, y) => y.v - x.v);
  if (!sorted[0]?.v) return "";
  if (sorted[1] && sorted[1].v === sorted[0].v) {
    const tied = sorted.filter(c => c.v === sorted[0].v).length;
    return `${NUM_WORDS[tied] || tied} commitments tie for first, each picked by ${ofN(sorted[0].v, a5.n)}`;
  }
  return `${sorted[0].label} leads, picked by ${ofN(sorted[0].v, a5.n)}`;
}

function a5Note(a5) {
  const sorted = COMMITMENTS.map(c => ({ ...c, v: a5.counts[c.key] })).sort((x, y) => x.v - y.v);
  const low = sorted.filter(c => c.v === sorted[0].v);
  if (low.length > 2) return "";
  const names = low.map(c => lcFirst(c.label)).join(" and ");
  return sorted[0].v === 0 ? `No leader picked ${names}.` : `Least picked: ${names}, by ${sorted[0].v} of ${a5.n}.`;
}

/** Highlight the top k values, keeping ties together (never highlights zeros). */
function topKeys(entries, k) {
  const vals = entries.map(e => e.v).filter(v => v > 0).sort((a, b) => b - a);
  if (!vals.length) return new Set();
  const cut = vals[Math.min(k, vals.length) - 1];
  return new Set(entries.filter(e => e.v > 0 && e.v >= cut).map(e => e.key));
}

/* ─────────────────────────────────────────────────────────────────────────────
   6 · DRAWING PRIMITIVES
───────────────────────────────────────────────────────────────────────────── */
function newDeck(title) {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_16x9";
  p.author = "Carnelian";
  p.company = "Carnelian";
  p.subject = "RISE Alignment · Leadership Offsite";
  p.title = title;
  return { p, n: 0, warnings: [], small: [] };
}

function addSlide(D, { dark = false, number = true } = {}) {
  const s = D.p.addSlide();
  s.background = { color: dark ? C.INK : C.W };
  D.n += 1;
  s._n = D.n;
  s._dark = dark;
  if (number) {
    s.addText(String(D.n), {
      x: SW - MX - 0.6, y: 5.3, w: 0.6, h: 0.18, fontFace: BODY, fontSize: 10,
      color: dark ? "8C8792" : C.MUTE, align: "right", margin: 0, isTextBox: true,
    });
  }
  return s;
}

/** Measured text placement. Records any shortening or sub-18pt body text for QA. */
function put(D, s, text, o) {
  const {
    x, y, w, h, face = BODY, bold = false, italic = false, color = C.INK,
    max = 18, min = max, ls = 1, align = "left", valign = "top", maxLines = Infinity,
    label = "text", body = true, charSpacing,
  } = o;
  const f = fitText(text, { w, h, face, bold, max, min, ls, maxLines });
  if (f.truncated) D.warnings.push(`Slide ${s._n}: ${label} was shortened to fit`);
  if (body && f.pt < MIN_BODY) D.small.push({ slide: s._n, label, pt: f.pt });
  const opts = {
    x, y, w, h, fontFace: face, fontSize: f.pt, bold, italic, color, align, valign,
    margin: 0, isTextBox: true, wrap: true, lineSpacingMultiple: ls,
  };
  if (charSpacing) opts.charSpacing = charSpacing;
  s.addText(f.text, opts);
  return { pt: f.pt, used: blockH(f.lines, f.pt, face, ls), lines: f.lines };
}

function rect(D, s, { x, y, w, h, color, round = 0 }) {
  const type = round ? D.p.ShapeType.roundRect : D.p.ShapeType.rect;
  const o = { x, y, w, h, fill: { color }, line: { color, width: 0.5 } };
  if (round) o.rectRadius = round;
  s.addShape(type, o);
}

function tag(s, text, color) {
  s.addText(String(text).toUpperCase(), {
    x: MX, y: 0.32, w: 6.2, h: 0.2, fontFace: HEAD, fontSize: 11, bold: true, color,
    charSpacing: 2.5, margin: 0, isTextBox: true, valign: "top",
  });
}

function meta(s, text, color) {
  if (!text) return;
  s.addText(text, {
    x: SW - MX - 2.6, y: 0.31, w: 2.6, h: 0.22, fontFace: BODY, fontSize: 12, bold: true, color,
    align: "right", margin: 0, isTextBox: true, valign: "top",
  });
}

/** Headline block. Returns the y where content can begin. */
const HEADLINE_Y = 0.64;
/** Height a one-or-two line note needs at the bottom of a chart slide (0 if none). */
function noteHeight(text) {
  if (!text) return 0;
  const f = fitText(text, { w: CW, h: 0.62, face: BODY, max: 18, min: 16, maxLines: 2 });
  return blockH(f.lines, f.pt, BODY);
}
function drawNote(D, s, text) {
  const h = noteHeight(text);
  put(D, s, text, { x: MX, y: BOTTOM - h, w: CW, h, max: 18, min: 16, color: C.MAR, maxLines: 2, label: "note" });
}
/** One line if it fits at 22pt or more, otherwise the largest size that fits on two. */
function headlineFit(text, { w = CW, max = 26, min = 20, maxLines = 2 } = {}) {
  const one = fitText(text, { w, h: 0.96, face: HEAD, bold: true, max, min: Math.max(min, 22), maxLines: 1 });
  if (!one.truncated) return one;
  return fitText(text, { w, h: 0.96, face: HEAD, bold: true, max, min, maxLines });
}
const measureHeadline = headlineFit;
function headline(D, s, text, { w = CW, max = 26, min = 20, color, maxLines = 2 } = {}) {
  text = String(text ?? "").trim().replace(/(?<!\.)\.$/, "");   // slide headlines carry no full stop
  const f = headlineFit(text, { w, max, min, maxLines });
  const r = put(D, s, f.text, {
    x: MX, y: HEADLINE_Y, w, h: 0.96, face: HEAD, bold: true, max: f.pt, min: f.pt, maxLines,
    color: color || (s._dark ? C.W : C.INK), label: "headline", body: false,
  });
  if (f.truncated) D.warnings.push(`Slide ${s._n}: headline was shortened to fit`);
  return HEADLINE_Y + r.used + 0.3;
}
/** Uses the preferred headline if it fits on one line at 20pt or more, else the short fallback. */
function oneLine(preferred, fallback) {
  const f = preferred ? measureHeadline(preferred, { maxLines: 1 }) : null;
  return f && !f.truncated ? preferred : fallback;
}

function header(D, s, { tagText, head, metaText, dark = false, maxLines = 2 }) {
  tag(s, tagText, dark ? C.PINK : C.M);
  meta(s, metaText, dark ? C.PINK : C.M);
  return headline(D, s, head, { maxLines });
}

/* ── image helpers (logos are optional; decks never depend on them) ───────── */
function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 1, 4) !== "PNG") return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
}
function logo(s, file, { x, y, h, alignRight = false }) {
  const sz = pngSize(file);
  if (!sz || !sz.w || !sz.h) return 0;
  const w = h * (sz.w / sz.h);
  s.addImage({ path: file, x: alignRight ? x - w : x, y, w, h });
  return w;
}

/* ── the RISE half-sun: arrowhead rays over a half disc on the slide edge ─── */
function sun(D, s, { cx, base, r }) {
  s.addShape(D.p.ShapeType.pie, {
    x: cx - r, y: base - r, w: 2 * r, h: 2 * r, angleRange: [180, 360],
    fill: { color: C.M }, line: { color: C.M, width: 0.5 },
  });
  const rays = 7, ri = r + 0.16, ro = r + 0.78;
  for (let i = 0; i < rays; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / (rays - 1));
    const x1 = cx - Math.cos(a) * ri, y1 = base - Math.sin(a) * ri;
    const x2 = cx - Math.cos(a) * ro, y2 = base - Math.sin(a) * ro;
    const bx = Math.min(x1, x2), by = Math.min(y1, y2);
    const bw = Math.max(Math.abs(x2 - x1), 0.001), bh = Math.abs(y2 - y1);
    const line = { color: i % 2 ? "E8193A" : C.M, width: 2.5 };
    const o = { x: bx, y: by, w: bw, h: bh, line };
    if (x2 < x1 - 0.001) { line.beginArrowType = "triangle"; }          // tip at top-left
    else if (x2 > x1 + 0.001) { o.flipV = true; line.endArrowType = "triangle"; } // tip at top-right
    else { line.beginArrowType = "triangle"; }                           // straight up
    s.addShape(D.p.ShapeType.line, o);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   7 · CHARTS
───────────────────────────────────────────────────────────────────────────── */
/** Horizontal bars, drawn as shapes so long labels wrap exactly and top bars can be coloured. */
function hBars(D, s, rows, { top, bottom, labelW = 4.3, maxPt = 18, minPt = 15, boldOn = true }) {
  const n = rows.length, gapMin = 0.08, avail = bottom - top;
  const rowH = (r, pt) => Math.max(0.36, blockH(wrapText(r.label, labelW, pt, BODY, boldOn && r.on).length, pt, BODY) + 0.08);
  let pt = maxPt, heights = rows.map(r => rowH(r, pt));
  while (pt > minPt && heights.reduce((a, b) => a + b, 0) + gapMin * (n - 1) > avail) {
    pt -= 1; heights = rows.map(r => rowH(r, pt));
  }
  let used = heights.reduce((a, b) => a + b, 0);
  if (used > avail) { heights = heights.map(h => h * (avail / used)); used = avail; }  // hard stop at `bottom`
  const gap = n > 1 ? Math.min(0.2, Math.max(0, (avail - used) / (n - 1))) : 0;
  const max = Math.max(1, ...rows.map(r => r.value));
  const barX = MX + labelW + 0.25;
  const barMax = CW - labelW - 0.25 - 0.7;
  let y = top;
  rows.forEach((r, i) => {
    const h = heights[i];
    put(D, s, r.label, { x: MX, y, w: labelW, h, max: pt, min: Math.min(pt, minPt), bold: boldOn && r.on,
      color: r.on ? C.INK : C.GREY, valign: "middle", label: "chart label", maxLines: 3 });
    const bw = r.value > 0 ? Math.max(0.08, barMax * (r.value / max)) : 0;
    const bh = 0.3, by = y + (h - bh) / 2;
    if (bw) rect(D, s, { x: barX, y: by, w: bw, h: bh, color: r.on ? C.M : C.PINK });
    put(D, s, String(r.value), { x: barX + bw + 0.1, y, w: 0.6, h, face: HEAD, bold: true, max: 18,
      color: r.on ? C.M : C.GREY, valign: "middle", body: false, label: "value" });
    y += h + gap;
  });
  return y;
}

/* ─────────────────────────────────────────────────────────────────────────────
   8 · CARD LISTS  (quotes, questions, commitments) with pagination
───────────────────────────────────────────────────────────────────────────── */
/**
 * Lays out cards in reading order. Two short cards share a row; a long card takes the
 * full width. Rows are then spread evenly across the fewest slides that hold them.
 */
function planCards(items, { top, bottom, pt = 18, quote = false, named = false }) {
  const avail = bottom - top, gap = 0.15, padX = 0.2, padY = 0.13;
  const nameH = 0;   // names now sit inline at the start of the card text
  // For inline names, pad the measured string so the bold name is never under-measured.
  const namePad = (nm) => {
    const extra = widthIn(nm, pt, BODY, true) - widthIn(nm, pt, BODY, false);
    return " ".repeat(2 + Math.ceil(extra / widthIn(" ", pt, BODY, false)) + 1);
  };
  const shown = (it) => (quote ? `\u201c${it.text}\u201d` : named ? `${it.name}${namePad(it.name)}${it.text}` : it.text);
  const halfW = (CW - gap) / 2, fullW = CW;
  const hAt = (it, w) => Math.min(avail,
    Math.max(0.58, nameH + blockH(wrapText(shown(it), w - 2 * padX, pt, BODY, false).length, pt, BODY) + 2 * padY));
  const SHORT = 1.3;

  const rows = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items[i + 1];
    const ha = hAt(a, halfW);
    if (b && ha <= SHORT && hAt(b, halfW) <= SHORT) {
      rows.push({ cells: [{ it: a, w: halfW }, { it: b, w: halfW }], h: Math.max(ha, hAt(b, halfW)) });
      i += 1;
    } else if (!b && ha <= SHORT && rows.length && rows[rows.length - 1].cells.length === 2) {
      rows.push({ cells: [{ it: a, w: halfW }], h: ha });          // lone short card keeps the grid
    } else {
      rows.push({ cells: [{ it: a, w: fullW }], h: hAt(a, fullW) });
    }
  }

  const pack = (cap) => {
    const pages = [[]]; let used = 0;
    rows.forEach(r => {
      const need = (pages[pages.length - 1].length ? gap : 0) + r.h;
      if (used + need > cap + 1e-6 && pages[pages.length - 1].length) { pages.push([r]); used = r.h; }
      else { pages[pages.length - 1].push(r); used += need; }
    });
    return pages;
  };
  const greedy = pack(avail);
  // smallest capacity that still needs no more slides than greedy: evens out the pages
  let lo = Math.max(...rows.map(r => r.h)), hi = avail;
  for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (pack(mid).length <= greedy.length) hi = mid; else lo = mid; }
  const pages = pack(hi);
  return { pages, gap, padX, padY, nameH, pt, shown, named };
}

function drawCards(D, s, plan, rows, { top, fill, textColor = C.INK, nameColor = C.M, border }) {
  let y = top;
  rows.forEach(r => {
    let x = MX;
    r.cells.forEach(({ it, w }) => {
      if (border) {
        s.addShape(D.p.ShapeType.roundRect, { x, y, w, h: r.h, rectRadius: 0.08,
          fill: { color: fill }, line: { color: border, width: 1 } });
      } else rect(D, s, { x, y, w, h: r.h, color: fill, round: 0.08 });
      const innerW = w - 2 * plan.padX, ty = y + plan.padY, th = r.h - 2 * plan.padY + 0.02;
      if (plan.named) {
        // "Name  commitment": name in bold magenta, measured together with the text
        const f = fitText(plan.shown(it), { w: innerW, h: th, face: BODY, bold: false, max: plan.pt, min: plan.pt });
        const body = "  " + (f.truncated ? f.text.slice(it.name.length).trimStart() : it.text);
        if (f.truncated) D.warnings.push(`Slide ${s._n}: a commitment was shortened to fit`);
        s.addText([
          { text: it.name, options: { bold: true, color: nameColor } },
          { text: body, options: { color: textColor } },
        ], { x: x + plan.padX, y: ty, w: innerW, h: th, fontFace: BODY, fontSize: plan.pt, valign: "top",
          margin: 0, isTextBox: true, wrap: true });
      } else {
        put(D, s, plan.shown(it), { x: x + plan.padX, y: ty, w: innerW, h: th,
          max: plan.pt, min: plan.pt, color: textColor, label: "card text" });
      }
      x += w + plan.gap;
    });
    y += r.h + plan.gap;
  });
}

/** Renders a titled, paginated card list. Returns number of slides added. */
function cardSection(D, { tagText, head, items, quote = false, named = false, fill = C.BLUSH, border, n, notes, footer }) {
  if (!items.length) return 0;
  const hh = measureHeadline(head);
  const top = HEADLINE_Y + blockH(hh.lines, hh.pt, HEAD) + 0.3;
  const bottom = footer ? BOTTOM - 0.42 : BOTTOM;
  const plan = planCards(items, { top, bottom, quote, named });
  plan.pages.forEach((rows, pi) => {
    const s = addSlide(D);
    const pageTxt = plan.pages.length > 1 ? ` · ${pi + 1} of ${plan.pages.length}` : "";
    header(D, s, { tagText, head, metaText: `n = ${n}${pageTxt}` });
    drawCards(D, s, plan, rows, { top, fill, border });
    if (footer) put(D, s, footer, { x: MX, y: BOTTOM - 0.32, w: CW - 0.8, h: 0.32, italic: true, color: C.MAR,
      max: 16, body: false, label: "footer" });
    if (notes) s.addNotes(notes);
  });
  return plan.pages.length;
}

/* ─────────────────────────────────────────────────────────────────────────────
   9 · SLIDES · SESSION DECK
───────────────────────────────────────────────────────────────────────────── */
function fmtDate(ms) {
  try {
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  } catch { return new Date(ms).toDateString(); }
}

function coverSlide(D, st, assets) {
  const s = addSlide(D, { number: false });
  rect(D, s, { x: 6.67, y: 0, w: SW - 6.67, h: SH, color: C.BLUSH });
  sun(D, s, { cx: 8.33, base: SH, r: 1.0 });

  // logos, small and side by side, top right
  const lh = 0.36;
  let right = SW - MX;
  const cw = assets.carnelian ? logo(s, assets.carnelian, { x: right, y: 0.42, h: lh, alignRight: true }) : 0;
  if (!cw) {
    const tw = widthIn("Carnelian", 15, HEAD, true) + 0.05;
    s.addText("Carnelian", { x: right - tw, y: 0.42, w: tw, h: lh, fontFace: HEAD, fontSize: 15, bold: true,
      color: C.INK, align: "right", valign: "middle", margin: 0, isTextBox: true });
    right -= tw;
  } else right -= cw;
  right -= 0.25;
  const wordW = widthIn("foodpanda", 15, HEAD, true) + 0.05;
  s.addText("foodpanda", { x: right - wordW, y: 0.42, w: wordW, h: lh, fontFace: HEAD, fontSize: 15, bold: true,
    color: C.INK, valign: "middle", margin: 0, isTextBox: true });
  right -= wordW + 0.06;
  if (assets.foodpanda) logo(s, assets.foodpanda, { x: right, y: 0.42, h: lh, alignRight: true });

  s.addText("RISE ALIGNMENT", { x: MX, y: 1.38, w: 5.8, h: 0.24, fontFace: HEAD, fontSize: 13, bold: true,
    color: C.M, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText([
    { text: "Leadership", options: { color: C.INK, breakLine: true } },
    { text: "Offsite", options: { color: C.M } },
  ], { x: MX, y: 1.72, w: 5.9, h: 1.72, fontFace: HEAD, fontSize: 50, bold: true, margin: 0, isTextBox: true,
    valign: "top", lineSpacingMultiple: 1.0 });
  s.addText("What the room said", { x: MX, y: 3.56, w: 5.9, h: 0.42, fontFace: BODY, fontSize: 24,
    color: C.MAR, margin: 0, isTextBox: true });
  const leaders = Math.max(st.joined, st.a4.n, st.a1.length);
  s.addText(`foodpanda Pakistan  ·  ${fmtDate(st.date)}  ·  ${plural(leaders, "leader", "leaders")}`, {
    x: MX, y: 4.1, w: 6.0, h: 0.32, fontFace: BODY, fontSize: 16, color: C.GREY, margin: 0, isTextBox: true });
  s.addNotes("RISE Alignment · Leadership Offsite. Results from every activity, in running order.");
}

function a2Slide(D, q, key) {
  const s = addSlide(D);
  const top = header(D, s, { tagText: "Predict the number", head: a2Headline(q), metaText: `n = ${q.n}` });
  const qr = put(D, s, q.question, { x: MX, y: top - 0.08, w: 6.55, h: 0.68, color: C.MAR, max: 18, maxLines: 2,
    label: "question" });

  // columns
  const chartX = MX, chartW = 6.55, slot = chartW / BANDS.length, colW = slot * 0.62;
  const baseY = 4.6, labelY = baseY + 0.07;
  const colTop = top - 0.08 + qr.used + 0.42;
  const maxH = Math.max(0.4, baseY - colTop);
  const peak = Math.max(1, ...q.counts);
  const modeSet = new Set(q.modes);
  q.counts.forEach((c, i) => {
    const x = chartX + i * slot + (slot - colW) / 2;
    const h = c ? Math.max(0.06, maxH * (c / peak)) : 0.04;
    rect(D, s, { x, y: baseY - h, w: colW, h, color: c && modeSet.has(i) ? C.M : C.PINK });
    if (c) put(D, s, String(c), { x: x - 0.1, y: baseY - h - 0.34, w: colW + 0.2, h: 0.3, face: HEAD, bold: true,
      max: 16, align: "center", color: modeSet.has(i) ? C.M : C.GREY, body: false, label: "count" });
    const lbl = BANDS[i].replace("%", "");
    if (i === q.realIdx) {
      rect(D, s, { x: chartX + i * slot + 0.03, y: labelY, w: slot - 0.06, h: 0.3, color: C.INK, round: 0.06 });
      put(D, s, lbl, { x: chartX + i * slot, y: labelY + 0.04, w: slot, h: 0.24, max: 13, min: 11, bold: true,
        align: "center", color: C.W, body: false, label: "band" });
    } else {
      put(D, s, lbl, { x: chartX + i * slot, y: labelY + 0.04, w: slot, h: 0.24, max: 13, min: 11,
        align: "center", color: C.GREY, body: false, label: "band" });
    }
  });
  put(D, s, "Guess bands, %. The dark label marks the real figure.", { x: MX, y: labelY + 0.38, w: chartW, h: 0.22,
    max: 11, color: C.MUTE, body: false, label: "caption" });

  // callout
  const cx = 7.35, cy = top - 0.08, cw = SW - MX - cx, ch = BOTTOM - cy;
  rect(D, s, { x: cx, y: cy, w: cw, h: ch, color: C.INK, round: 0.1 });
  s.addText("THE REAL FIGURE", { x: cx + 0.22, y: cy + 0.24, w: cw - 0.44, h: 0.2, fontFace: HEAD, fontSize: 10,
    bold: true, color: C.PINK, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText(`${q.real}%`, { x: cx + 0.22, y: cy + 0.5, w: cw - 0.44, h: 0.7, fontFace: HEAD, fontSize: 40,
    bold: true, color: C.W, margin: 0, isTextBox: true, valign: "top" });
  const cr = put(D, s, `${ofN(q.correct, q.n)} guessed the right band`, { x: cx + 0.22, y: cy + 1.35, w: cw - 0.44,
    h: 1.0, max: 18, min: 16, color: C.W, label: "callout" });
  if (q.modes.length && q.modes.length <= 2) {
    const my = cy + 1.35 + cr.used + 0.26;
    s.addText("MOST GUESSED", { x: cx + 0.22, y: my, w: cw - 0.44, h: 0.2, fontFace: HEAD, fontSize: 10, bold: true,
      color: C.PINK, charSpacing: 2, margin: 0, isTextBox: true });
    q.modes.forEach((i, k) => s.addText(BANDS[i], { x: cx + 0.22, y: my + 0.26 + k * 0.38, w: cw - 0.44, h: 0.36,
      fontFace: HEAD, fontSize: 20, bold: true, color: C.W, margin: 0, isTextBox: true, valign: "top" }));
  }
  s.addNotes(`${q.question}\nReal answer: ${q.real}% (band ${BANDS[q.realIdx]}). Most common guess: ${q.modes.map(i => BANDS[i]).join(", ") || "none"}.`);
}

function a3Slide(D, rounds) {
  const s = addSlide(D);
  const total = Math.max(...rounds.map(r => r.n));
  const top = header(D, s, { tagText: "Whose floor?", head: a3Headline(rounds), metaText: `n = ${total}` });
  const colors = { "Senior leader": C.M, "MD-2": C.MAR, "IC3": C.PINK };
  const ink = { "Senior leader": C.W, "MD-2": C.W, "IC3": C.INK };

  // legend
  let lx = MX;
  VOICES.forEach(v => {
    rect(D, s, { x: lx, y: top + 0.05, w: 0.2, h: 0.2, color: colors[v], round: 0.03 });
    const w = widthIn(v, 16, BODY, false) + 0.1;
    put(D, s, v, { x: lx + 0.28, y: top, w, h: 0.3, max: 16, color: C.INK, body: false, label: "legend" });
    lx += 0.28 + w + 0.35;
  });

  const rowsTop = top + 0.52, avail = BOTTOM - rowsTop;
  const rowH = Math.min(0.62, (avail - 0.1 * 4) / 5), gap = (avail - rowH * 5) / 4;
  const barX = MX + 1.35, barW = CW - 1.35 - 0.8;
  rounds.forEach((r, i) => {
    const y = rowsTop + i * (rowH + gap);
    put(D, s, `Round ${r.round}`, { x: MX, y, w: 1.25, h: rowH, bold: true, max: 18, valign: "middle", label: "round" });
    if (!r.n) {
      rect(D, s, { x: barX, y: y + 0.08, w: barW, h: rowH - 0.16, color: C.SOFT, round: 0.04 });
      put(D, s, "No votes", { x: barX, y, w: barW, h: rowH, max: 14, color: C.MUTE, align: "center", valign: "middle",
        body: false, label: "empty" });
    } else {
      let x = barX;
      VOICES.forEach(v => {
        const c = r.counts[v];
        if (!c) return;
        const w = barW * (c / r.n);
        rect(D, s, { x, y: y + 0.08, w, h: rowH - 0.16, color: colors[v] });
        const pct = `${Math.round((c / r.n) * 100)}%`;
        if (w >= 0.55) put(D, s, pct, { x, y, w, h: rowH, face: HEAD, bold: true, max: 14, color: ink[v],
          align: "center", valign: "middle", body: false, label: "share" });
        x += w;
      });
    }
    put(D, s, `n = ${r.n}`, { x: barX + barW + 0.12, y, w: 0.68, h: rowH, max: 14, color: C.MUTE, valign: "middle",
      body: false, label: "round n" });
  });
  s.addNotes(rounds.map(r => `Round ${r.round}: ${VOICES.map(v => `${v} ${r.counts[v]}`).join(", ")}`).join("\n"));
}

function a5Slide(D, a5) {
  const s = addSlide(D);
  const top = header(D, s, { tagText: "Reality check", head: a5Headline(a5), metaText: `n = ${a5.n}` });
  const entries = COMMITMENTS.map(c => ({ key: c.key, label: c.label, v: a5.counts[c.key] }));
  const on = topKeys(entries, 3);
  const note = a5Note(a5);
  const rows = entries.sort((a, b) => b.v - a.v).map(e => ({ label: e.label, value: e.v, on: on.has(e.key) }));
  const nh = noteHeight(note);
  hBars(D, s, rows, { top, bottom: BOTTOM - (nh ? nh + 0.18 : 0), labelW: 6.2, maxPt: 18, minPt: 15, boldOn: false });
  if (note) drawNote(D, s, note);
  s.addNotes(`Top three are highlighted. ${note}`);
}

function closingSlide(D, picks) {
  const s = addSlide(D, { dark: true });
  const top = header(D, s, { tagText: "Headline 2027", head: "The headlines we\u2019re working towards", dark: true });
  const avail = BOTTOM - top, gap = 0.26, w = CW - 0.6, n = picks.length;
  let pt = 24, hs;
  for (; pt >= 18; pt--) {
    hs = picks.map(q => blockH(wrapText(q, w, pt, BODY, false).length, pt, BODY));
    if (hs.reduce((a, b) => a + b, 0) + gap * (n - 1) <= avail) break;
  }
  if (pt < 18) { pt = 18; const each = (avail - gap * (n - 1)) / n; hs = hs.map(() => each); }
  let y = top;
  picks.forEach((q, i) => {
    s.addText("\u201c", { x: MX, y: y - 0.1, w: 0.5, h: 0.7, fontFace: HEAD, fontSize: 48, bold: true, color: C.M,
      margin: 0, isTextBox: true, valign: "top" });
    put(D, s, q, { x: MX + 0.6, y, w, h: hs[i] + 0.02, max: pt, min: 18, color: C.W, label: "closing quote" });
    y += hs[i] + gap;
  });
  s.addNotes("Three headlines picked from Activity 1 for the close.");
}

/* ─────────────────────────────────────────────────────────────────────────────
   10 · SLIDES · "WHAT YOU TOLD US" (Activity 4, 7 slides per the brief)
───────────────────────────────────────────────────────────────────────────── */
const A4TAG = "What you told us";

function a4Title(D, a4, { timing }) {
  const s = addSlide(D);
  rect(D, s, { x: 6.67, y: 0, w: SW - 6.67, h: SH, color: C.BLUSH });
  tag(s, A4TAG, C.M);
  s.addText("What you told us", { x: MX, y: 1.7, w: 5.9, h: 0.9, fontFace: HEAD, fontSize: 44, bold: true,
    color: C.INK, margin: 0, isTextBox: true, valign: "top" });
  put(D, s, `${plural(a4.n, "leader", "leaders")}, ${plural(a4.nf, "function", "functions")}, ${timing}`, {
    x: MX, y: 2.72, w: 5.9, h: 0.9, max: 24, min: 18, color: C.MAR, label: "subtitle" });

  s.addText(String(a4.n), { x: 6.67, y: 1.35, w: SW - 6.67, h: 1.3, fontFace: HEAD, fontSize: 88, bold: true,
    color: C.M, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText(a4.n === 1 ? "leader" : "leaders", { x: 6.67, y: 2.7, w: SW - 6.67, h: 0.4, fontFace: BODY, fontSize: 20,
    color: C.INK, align: "center", margin: 0, isTextBox: true });
  s.addText(`n = ${a4.n}`, { x: 6.67, y: 3.25, w: SW - 6.67, h: 0.3, fontFace: BODY, fontSize: 14, bold: true,
    color: C.MAR, align: "center", margin: 0, isTextBox: true });
  s.addNotes(`Responses: ${a4.n}. Functions: ${a4.functions.join(", ")}.`);
}

function a4Bars(D, a4) {
  const s = addSlide(D);
  const top = header(D, s, { tagText: A4TAG, head: a4BarsHeadline(a4), metaText: `n = ${a4.n}` });
  const entries = BEHAVIOURS.map(b => ({ key: b.key, label: b.label, v: a4.behaviourCounts[b.key] }));
  const on = topKeys(entries, 2);
  const note = zeroNote(a4);
  const rows = entries.sort((a, b) => b.v - a.v).map(e => ({ label: e.label, value: e.v, on: on.has(e.key) }));
  const nh = noteHeight(note);
  hBars(D, s, rows, { top, bottom: BOTTOM - (nh ? nh + 0.18 : 0), labelW: 4.6, maxPt: 18, minPt: 16 });
  if (note) drawNote(D, s, note);
  s.addNotes(`Each leader picked two. Total picks ${a4.picks} (expected ${a4.n * 2}).`);
}

/**
 * Function-by-function table. Fits on one slide at the largest size from 18pt down to 12pt.
 * Only if 12pt still cannot hold every row does it continue onto a second slide at 16pt,
 * because cutting a function's answer short is worse than one extra slide.
 */
function a4Table(D, a4, ai) {
  const head = oneLine(tidy(ai.s3_headline), "Each function named its two priorities");
  const cols = [
    { k: "fn", title: "Function", w: 2.25 },
    { k: "top", title: "Top two behaviours", w: 2.6 },
    { k: "good", title: "What “good” looks like", w: CW - 2.25 - 2.6 },
  ];
  const data = a4.perFunction.map(p => ({
    fn: p.fn,
    top: p.top2.map(bShort).join(", "),
    good: phrase(tidy(ai.s3_good?.[p.fn]) || p.goods[0] || "", 8),
  }));
  const headH = 0.3, pad = 0.035, cellW = (c) => c.w - 0.24;
  const hh = measureHeadline(head, { maxLines: 1 });
  const top = HEADLINE_Y + blockH(hh.lines, hh.pt, HEAD) + 0.26;
  const avail = BOTTOM - top - headH;
  const heightsAt = (pt) => data.map(r => Math.max(...cols.map(c =>
    blockH(wrapText(r[c.k], cellW(c), pt, BODY, c.k === "fn").length, pt, BODY))) + 2 * pad);

  let pt = 18, hs = heightsAt(pt);
  while (pt > 12 && hs.reduce((a, b) => a + b, 0) > avail) { pt -= 1; hs = heightsAt(pt); }
  let pages;
  if (hs.reduce((a, b) => a + b, 0) <= avail) pages = [data.map((r, i) => ({ r, h: hs[i] }))];
  else {
    pt = 16; hs = heightsAt(pt); pages = [[]];
    let used = 0;
    data.forEach((r, i) => {
      if (used + hs[i] > avail && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push({ r, h: hs[i] }); used += hs[i];
    });
    D.warnings.push(`Function table continued onto ${pages.length} slides so ${data.length} functions stay readable`);
  }

  pages.forEach((rows, pi) => {
    const s = addSlide(D);
    const pageTxt = pages.length > 1 ? ` · ${pi + 1} of ${pages.length}` : "";
    header(D, s, { tagText: A4TAG, head, metaText: `n = ${a4.n}${pageTxt}`, maxLines: 1 });
    rect(D, s, { x: MX, y: top, w: CW, h: headH, color: C.INK });
    let x = MX;
    cols.forEach(c => {
      put(D, s, c.title, { x: x + 0.12, y: top, w: cellW(c), h: headH, bold: true, max: 13, color: C.W,
        valign: "middle", body: false, label: "table header" });
      x += c.w;
    });
    let y = top + headH;
    rows.forEach(({ r, h }, i) => {
      rect(D, s, { x: MX, y, w: CW, h, color: i % 2 ? C.BLUSH : C.W });
      let cx = MX;
      cols.forEach(c => {
        put(D, s, r[c.k], { x: cx + 0.12, y: y + pad, w: cellW(c), h: h - 2 * pad, max: pt, min: pt,
          bold: c.k === "fn", color: c.k === "fn" ? C.MAR : C.INK, label: "table text" });
        cx += c.w;
      });
      y += h;
    });
    s.addNotes(rows.map(({ r }) => `${r.fn}: ${r.top}. Good looks like: ${r.good}`).join("\n"));
  });
  return pages.length;
}

function a4Themes(D, a4, ai) {
  const s = addSlide(D);
  const themes = (ai.s4_themes || []).slice(0, 3);
  const top = header(D, s, { tagText: A4TAG,
    head: tidy(ai.s4_headline) || "Decisions got stuck in different ways across the room", metaText: `n = ${a4.n}` });
  if (!themes.length) {
    put(D, s, "The situations described were too varied to group into shared themes.", {
      x: MX, y: top, w: CW, h: 0.8, max: 20, color: C.MAR, label: "empty themes" });
    D.warnings.push(`Slide ${s._n}: no themes came back for "Where decisions get stuck"`);
    return;
  }
  const gap = 0.25, k = themes.length, w = (CW - gap * (k - 1)) / k, h = BOTTOM - top;
  themes.forEach((t, i) => {
    const x = MX + i * (w + gap);
    rect(D, s, { x, y: top, w, h, color: C.BLUSH, round: 0.1 });
    const n = Math.max(1, Math.min(a4.nf, Number(t.functions) || 1));
    const px = 0.22, iw = w - 2 * px;
    s.addText(String(n), { x: x + px, y: top + 0.16, w: 1.2, h: 0.56, fontFace: HEAD, fontSize: 36, bold: true,
      color: C.M, margin: 0, isTextBox: true, valign: "top" });
    put(D, s, `${n === 1 ? "function" : "functions"} described this`, { x: x + px, y: top + 0.74, w: iw,
      h: 0.26, max: 14, color: C.MAR, body: false, label: "theme count" });
    const ty = top + 1.1;
    const tr = put(D, s, tidy(t.title), { x: x + px, y: ty, w: iw, h: 0.62, face: HEAD, bold: true,
      max: 20, min: 18, maxLines: 2, label: "theme title" });
    put(D, s, tidy(t.line), { x: x + px, y: ty + tr.used + 0.1, w: iw,
      h: top + h - (ty + tr.used + 0.1) - 0.16, max: 18, min: 16, color: C.INK, label: "theme line" });
  });
  s.addNotes(themes.map(t => `${tidy(t.title)} (${t.functions} functions): ${tidy(t.line)}`).join("\n"));
}

function a4Outliers(D, a4, ai) {
  const s = addSlide(D);
  const valid = new Set(a4.functions);
  const items = (ai.s5_outliers || []).filter(o => valid.has(o.function) && tidy(o.need)).slice(0, 3);
  const head = items.length ? "A few needs sit outside the common pattern" : "Every need fits the common pattern";
  const top = header(D, s, { tagText: A4TAG, head, metaText: `n = ${a4.n}` });

  if (items.length) {
    const gap = 0.24, avail = BOTTOM - top;
    const rowH = Math.min(1.0, (avail - gap * (items.length - 1)) / items.length);
    items.forEach((o, i) => {
      const y = top + i * (rowH + gap);
      rect(D, s, { x: MX, y, w: CW, h: rowH, color: C.BLUSH, round: 0.08 });
      rect(D, s, { x: MX + 0.2, y: y + (rowH - 0.46) / 2, w: 2.5, h: 0.46, color: C.M, round: 0.08 });
      put(D, s, o.function, { x: MX + 0.3, y: y + (rowH - 0.46) / 2, w: 2.3, h: 0.46, bold: true, max: 16, min: 12,
        color: C.W, align: "center", valign: "middle", maxLines: 1, body: false, label: "function pill" });
      put(D, s, tidy(o.need), { x: MX + 2.95, y: y + 0.1, w: CW - 3.15, h: rowH - 0.2, max: 18, min: 16,
        valign: "middle", label: "outlier need" });
    });
  } else {
    const least = BEHAVIOURS.map(b => ({ ...b, v: a4.behaviourCounts[b.key] })).sort((x, y) => x.v - y.v)[0];
    put(D, s, tidy(ai.s5_none_line) || "No function described a need outside the six behaviours.", {
      x: MX, y: top, w: CW, h: 0.6, max: 20, min: 18, color: C.MAR, maxLines: 2, label: "none line" });
    rect(D, s, { x: MX, y: top + 0.85, w: CW, h: 1.5, color: C.BLUSH, round: 0.1 });
    s.addText("LEAST CHOSEN BEHAVIOUR", { x: MX + 0.3, y: top + 1.05, w: 5, h: 0.22, fontFace: HEAD, fontSize: 11,
      bold: true, color: C.M, charSpacing: 2, margin: 0, isTextBox: true });
    put(D, s, least.label, { x: MX + 0.3, y: top + 1.35, w: 6.2, h: 0.5, face: HEAD, bold: true, max: 26, min: 20,
      maxLines: 1, label: "least label" });
    s.addText(`${least.v} of ${a4.n}`, { x: SW - MX - 2.3, y: top + 1.2, w: 2.0, h: 0.8, fontFace: HEAD, fontSize: 36,
      bold: true, color: C.M, align: "right", valign: "middle", margin: 0, isTextBox: true });
  }
  s.addNotes(items.map(o => `${o.function}: ${tidy(o.need)}`).join("\n") || "No outliers reported.");
}

function a4Discussion(D) {
  const s = addSlide(D, { dark: true });
  tag(s, A4TAG, C.PINK);
  s.addText("How do we cater to these?", { x: MX, y: 0.95, w: CW, h: 0.7, fontFace: HEAD, fontSize: 36, bold: true,
    color: C.W, margin: 0, isTextBox: true, valign: "top" });
  DISCUSSION_QUESTIONS.forEach((q, i) => {
    const y = 2.1 + i * 1.4;
    s.addText(String(i + 1), { x: MX, y, w: 0.6, h: 0.6, fontFace: HEAD, fontSize: 32, bold: true, color: C.M,
      margin: 0, isTextBox: true, valign: "top" });
    put(D, s, q, { x: MX + 0.75, y: y + 0.04, w: CW - 0.75, h: 1.15, max: 24, min: 20, color: C.W, label: "question" });
  });
  s.addNotes("Discussion. Take both questions to the room.");
}

function a4Messages(D, a4, ai) {
  const s = addSlide(D);
  let msgs = (ai.s7_messages || []).map(tidy).filter(Boolean).slice(0, 5);
  if (!msgs.length) {
    msgs = [...new Set(a4.rows.map(r => r.message).filter(Boolean))].slice(0, 5);
    if (msgs.length) D.warnings.push(`Slide ${D.n + 1}: AI grouping unavailable, showing leaders\u2019 own messages`);
  }
  const top = header(D, s, { tagText: A4TAG,
    head: tidy(ai.s7_headline) || "Your teams are waiting to hear a clear line from leadership", metaText: `n = ${a4.n}` });
  const footerY = BOTTOM - 0.3;
  if (!msgs.length) {
    put(D, s, "No shared messages came back.", { x: MX, y: top, w: CW, h: 0.6, max: 20, color: C.MAR, label: "empty" });
  } else {
    const gap = 0.16, avail = footerY - 0.15 - top;
    const each = Math.min(0.86, (avail - gap * (msgs.length - 1)) / msgs.length);
    msgs.forEach((m, i) => {
      const y = top + i * (each + gap);
      rect(D, s, { x: MX, y, w: CW, h: each, color: i % 2 ? C.SOFT : C.BLUSH, round: 0.08 });
      rect(D, s, { x: MX + 0.24, y: y + each / 2 - 0.07, w: 0.14, h: 0.14, color: C.M, round: 0.07 });
      put(D, s, m, { x: MX + 0.55, y: y + 0.06, w: CW - 0.8, h: each - 0.12, max: 20, min: 16, valign: "middle",
        label: "message" });
    });
  }
  put(D, s, "We\u2019ll build on these next.", { x: MX, y: footerY, w: CW - 0.8, h: 0.32, italic: true, max: 16,
    color: C.MAR, body: false, label: "footer" });
  s.addNotes(msgs.join("\n"));
}

function a4Section(D, a4, ai, { timing }) {
  const before = D.n;
  a4Title(D, a4, { timing });
  a4Bars(D, a4);
  a4Table(D, a4, ai);
  a4Themes(D, a4, ai);
  a4Outliers(D, a4, ai);
  a4Discussion(D);
  a4Messages(D, a4, ai);
  return D.n - before;
}

/* ─────────────────────────────────────────────────────────────────────────────
   11 · BUILDERS
───────────────────────────────────────────────────────────────────────────── */
function defaultAssets() {
  const dir = path.join(__dirname, "assets");
  const pick = (f) => (fs.existsSync(path.join(dir, f)) ? path.join(dir, f) : null);
  return { foodpanda: pick("foodpanda-logo.png"), carnelian: pick("logo.png") };
}

async function buildSessionDeck(st, ai = {}, assets = defaultAssets()) {
  const D = newDeck("RISE Alignment · Leadership Offsite");
  const skipped = [];
  const sections = [];

  coverSlide(D, st, assets);

  // 1 · Headline 2027
  if (st.a1.length) {
    const head = tidy(ai.a1_headline) || `${lead(st.a1.length, "headline", "headlines")} the room wants written about foodpanda Pakistan in 2027`;
    const k = cardSection(D, { tagText: "Headline 2027", head, items: st.a1.map(text => ({ text })), quote: true,
      n: st.a1.length, notes: "Read four or five aloud.\n\n" + st.a1.join("\n") });
    sections.push({ id: 1, slides: k });
  } else skipped.push(1);

  // 2 · Predict the number
  const q2live = ["q1", "q2"].filter(k => st.a2[k].n);
  q2live.forEach(k => a2Slide(D, st.a2[k], k));
  if (q2live.length) sections.push({ id: 2, slides: q2live.length }); else skipped.push(2);

  // 3 · Whose floor?
  if (st.a3.some(r => r.n)) { a3Slide(D, st.a3); sections.push({ id: 3, slides: 1 }); } else skipped.push(3);

  // 4 · What your function needs next
  if (st.a4.n) {
    const k = a4Section(D, st.a4, ai.a4 || {}, { timing: "earlier today" });
    sections.push({ id: 4, slides: k });
  } else skipped.push(4);

  // 5 · Reality check
  if (st.a5.n) { a5Slide(D, st.a5); sections.push({ id: 5, slides: 1 }); } else skipped.push(5);

  // 6 · Question bank
  if (st.a6.length) {
    const head = tidy(ai.a6_headline) || `${lead(st.a6.length, "question", "questions")} your teams are likely to ask next month`;
    const k = cardSection(D, { tagText: "The question bank", head, items: st.a6.map(text => ({ text })),
      fill: C.W, border: C.PINK, n: st.a6.length, notes: st.a6.join("\n") });
    sections.push({ id: 6, slides: k });
  } else skipped.push(6);

  // 7 · My one change
  if (st.a7.length) {
    const head = tidy(ai.a7_headline) || `${lead(st.a7.length, "change", "changes")} your teams should notice in the next 30 days`;
    const k = cardSection(D, { tagText: "My one change", head, items: st.a7, named: true, n: st.a7.length,
      footer: "We\u2019ll check in on these at day 30.", notes: st.a7.map(x => `${x.name}: ${x.text}`).join("\n") });
    sections.push({ id: 7, slides: k });
  } else skipped.push(7);

  // Close with three Activity 1 headlines
  if (st.a1.length) {
    const idx = [...new Set((ai.a1_picks || []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < st.a1.length))];
    const order = st.a1.map((t, i) => i).sort((a, b) => (st.a1[a].length > 140) - (st.a1[b].length > 140) || a - b);
    for (const i of order) { if (idx.length >= Math.min(3, st.a1.length)) break; if (!idx.includes(i)) idx.push(i); }
    closingSlide(D, idx.slice(0, 3).map(i => st.a1[i]));
  }

  const buffer = await D.p.write({ outputType: "nodebuffer" });
  return { buffer, slides: D.n, warnings: D.warnings, small: D.small, skipped, sections };
}

async function buildA4Deck(st, ai = {}) {
  const D = newDeck("What you told us");
  if (!st.a4.n) throw new Error("No Activity 4 responses yet.");
  const k = a4Section(D, st.a4, ai, { timing: "a few minutes ago" });
  const buffer = await D.p.write({ outputType: "nodebuffer" });
  return { buffer, slides: k, warnings: D.warnings, small: D.small, skipped: [], sections: [{ id: 4, slides: k }] };
}

module.exports = {
  computeStats, a4Fingerprint, buildSessionDeck, buildA4Deck, tidy,
  BANDS, VOICES, FUNCTIONS, BEHAVIOURS, COMMITMENTS, A2_QUESTIONS,
  // exported for tests
  _internal: { fitText, wrapText, widthIn, a2Headline, a3Headline, a4BarsHeadline, a5Headline, zeroNote, a5Note },
};