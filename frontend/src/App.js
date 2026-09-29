/* ============================================================================
   foodpanda × Carnelian — RISE ALIGNMENT · Leadership Offsite
   Single-file React app (CRA)  ·  frontend/src/App.js
   ----------------------------------------------------------------------------
   npm i @mui/material @emotion/react @emotion/styled @mui/icons-material \
         socket.io-client qrcode.react pptxgenjs

   public/logo.png            -> Carnelian logo
   public/foodpanda-logo.png  -> foodpanda bear mark (wordmark drawn in code)
============================================================================ */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import pptxgen from "pptxgenjs";
import {
  ThemeProvider, createTheme, CssBaseline,
  Box, Typography, Button, TextField, Paper, Chip, Stack,
  CircularProgress, LinearProgress, Divider, MenuItem, IconButton, Tooltip,
} from "@mui/material";

import ArrowBackIcon        from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon     from "@mui/icons-material/ArrowForward";
import CheckCircleIcon      from "@mui/icons-material/CheckCircle";
import LockIcon             from "@mui/icons-material/Lock";
import PlayArrowIcon        from "@mui/icons-material/PlayArrow";
import StopIcon             from "@mui/icons-material/Stop";
import QrCode2Icon          from "@mui/icons-material/QrCode2";
import CloseIcon            from "@mui/icons-material/Close";
import PeopleAltIcon        from "@mui/icons-material/PeopleAlt";
import AutoAwesomeIcon      from "@mui/icons-material/AutoAwesome";
import VisibilityIcon       from "@mui/icons-material/Visibility";
import RefreshIcon          from "@mui/icons-material/Refresh";
import LogoutIcon           from "@mui/icons-material/Logout";
import RestartAltIcon       from "@mui/icons-material/RestartAlt";
import DownloadIcon         from "@mui/icons-material/Download";
import BoltIcon             from "@mui/icons-material/Bolt";

/* ─────────────────────────────────────────────────────────────────────────────
   1 · BRAND TOKENS
───────────────────────────────────────────────────────────────────────────── */
const MAGENTA = "#D7136B";
const MAROON  = "#7A1538";
const INK     = "#1C1A22";
const PINK    = "#E7C6D0";
const BLUSH   = "#FBE4EC";
const FLAME   = "#E8193A";
const PAPER   = "#FFFFFF";
const CANVAS  = "#FBF7F9";
const MUTED   = "#6B6570";
const LINE    = "rgba(28,26,34,0.10)";

const theme = createTheme({
  palette: {
    mode: "light",
    primary:   { main: MAGENTA, dark: MAROON, light: "#EE4D92", contrastText: "#fff" },
    secondary: { main: INK, contrastText: "#fff" },
    background:{ default: CANVAS, paper: PAPER },
    text:      { primary: INK, secondary: MUTED },
    success:   { main: "#1E8E5A" },
  },
  typography: {
    fontFamily: "'Inter','Segoe UI',system-ui,-apple-system,sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.035em" },
    h2: { fontWeight: 800, letterSpacing: "-0.03em" },
    h3: { fontWeight: 800, letterSpacing: "-0.025em" },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.015em" },
    h6: { fontWeight: 700 },
    overline: { fontWeight: 800, letterSpacing: "0.18em", fontSize: "0.62rem", lineHeight: 1.6 },
    button: { fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 12, letterSpacing: "0.01em" },
        sizeLarge: { padding: "14px 24px", fontSize: "1rem" },
        containedPrimary: {
          background: `linear-gradient(135deg, ${MAGENTA} 0%, ${FLAME} 130%)`,
          boxShadow: "0 6px 18px rgba(215,19,107,0.30)",
          "&:hover": { background: `linear-gradient(135deg, #C10F5E 0%, ${MAGENTA} 120%)`, boxShadow: "0 8px 22px rgba(215,19,107,0.38)" },
          "&.Mui-disabled": { background: "#EADDE3", color: "#B9A9B1", boxShadow: "none" },
        },
        containedSecondary: { background: INK, "&:hover": { background: "#2E2A38" }, "&.Mui-disabled": { background: "#E4DEE1", color: "#ABA2A8" } },
        outlinedPrimary: { borderColor: PINK, color: MAROON, "&:hover": { borderColor: MAGENTA, background: BLUSH } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        elevation1: { boxShadow: "0 1px 2px rgba(28,26,34,0.05), 0 8px 28px rgba(122,21,56,0.06)" },
        elevation3: { boxShadow: "0 2px 6px rgba(28,26,34,0.06), 0 18px 48px rgba(122,21,56,0.10)" },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12, background: "#fff",
            "& fieldset": { borderColor: "rgba(28,26,34,0.14)" },
            "&:hover fieldset": { borderColor: PINK },
            "&.Mui-focused fieldset": { borderColor: MAGENTA, borderWidth: 2 },
          },
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, fontSize: "0.7rem", borderRadius: 8 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 99, height: 6, background: BLUSH } } },
  },
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · CONFIG
───────────────────────────────────────────────────────────────────────────── */
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";
const API_URL    = process.env.REACT_APP_API_URL    || "http://localhost:5000/api";
const JOIN_URL   = process.env.REACT_APP_JOIN_URL   || window.location.origin;

const SESSION_NAME = "foodpanda Pakistan · Leadership Offsite";

const BANDS  = ["0-10%","11-20%","21-30%","31-40%","41-50%","51-60%","61-70%","71-80%","81-90%","91-100%"];
const VOICES = ["Senior leader","MD-2","IC3"];

const FUNCTIONS = [
  "Logistics","Human Resources","Marketplace Experience","Finance","Commercial",
  "Quick Commerce","Marketing","MD Office","Public Affairs and PR","CEO Office","Other",
];

const BEHAVIOURS = [
  { key:"prioritisation", label:"Strategic prioritisation", desc:"knowing what wins and what stops when priorities compete" },
  { key:"ownership",      label:"Ownership under ambiguity", desc:"making the call without waiting for full clarity or approval" },
  { key:"translation",    label:"Translation and change communication", desc:"turning direction from above into something a team can act on" },
  { key:"aidata",         label:"AI and data in decisions", desc:"using AI and data on real work, not occasionally" },
  { key:"commercial",     label:"Commercial judgement", desc:"understanding the economics behind a decision" },
  { key:"leading",        label:"Leading through others", desc:"coaching, delegating and managing capacity instead of carrying delivery personally" },
];

const COMMITMENTS = [
  { key:"c1", label:"Make clear what stops when priorities compete" },
  { key:"c2", label:"Give decision rights and escalation guardrails" },
  { key:"c3", label:"Create room to redesign the work, not just add tools" },
  { key:"c4", label:"Translate strategy locally and share the economics" },
  { key:"c5", label:"Build development visibility, mentoring and succession" },
  { key:"c6", label:"Manage capacity openly as teams get leaner" },
];

const ACTIVITIES = [
  {
    id:1, name:"Headline 2027", cue:"Opening · slide 5", anonymous:true, result:"text",
    blurb:"One line. Anonymous. We'll come back to these at the end.",
    questions:[{ key:"headline", type:"short", required:true,
      label:"It's September 2027. What headline would you want written about foodpanda Pakistan?",
      placeholder:"Write the headline you'd want to read…" }],
  },
  {
    id:2, name:"Predict the Number", cue:"Opening · slide 6", anonymous:true, result:"bars",
    blurb:"Just guess. There's no wrong answer.",
    reveal:{ q1:"58.6%", q2:"44.8%" },
    questions:[
      { key:"q1", type:"choice", options:BANDS, required:true, dense:true,
        label:"What share of your high-potentials regularly work beyond normal hours?" },
      { key:"q2", type:"choice", options:BANDS, required:true, dense:true,
        label:"What share say the efficiency agenda is rarely explained well?" },
    ],
  },
  {
    id:3, name:"Whose Floor?", cue:"The story · slides 13–23", anonymous:true, result:"rounds", rounds:5,
    blurb:"Vote only on the round that is on screen. 20 seconds each.",
    questions:[1,2,3,4,5].map(r => ({
      key:`r${r}`, type:"choice", options:VOICES, required:true, round:r, label:`Round ${r}: who said it?`,
    })),
  },
  {
    id:4, name:"What your function needs next", cue:"Your input · slide 32", anonymous:true, result:"deck", long:true,
    blurb:"Six quick questions, about 6 minutes. Shown by function, never by name.",
    questions:[
      { key:"fn", type:"dropdown", options:FUNCTIONS, required:true, label:"Which function do you lead?" },
      { key:"behaviours", type:"multi", exact:2, options:BEHAVIOURS, required:true,
        label:"Of these six behaviours, which two matter most for your team over the next 12 months?" },
      { key:"missing", type:"short", required:false, help:"Leave blank if the six cover it.",
        label:"Is there a behaviour or skill specific to your function that is missing from this list?" },
      { key:"good", type:"para", required:true, help:"Two or three sentences is enough.",
        label:"Pick one of your two behaviours. What does it look like done well in your function? One real example." },
      { key:"stuck", type:"para", required:true, help:"No names. Three to five sentences.",
        label:"Describe a recent real situation where priorities clashed or a decision got stuck in your team." },
      { key:"message", type:"short", required:true,
        label:"What is one message your team needs to hear from leadership that they haven't heard yet?" },
    ],
  },
  {
    id:5, name:"Reality Check", cue:"Plan and trade · slide 40", anonymous:true, result:"bars",
    blurb:"Pick exactly three.",
    questions:[{ key:"commitments", type:"multi", exact:3, options:COMMITMENTS, required:true,
      label:"Which three can foodpanda genuinely commit to in the next 90 days, given everything that's moving?" }],
  },
  {
    id:6, name:"Question Bank", cue:"One voice · slide 46", anonymous:true, result:"text",
    blurb:"Anonymous. Write it the way your team would actually ask it.",
    questions:[{ key:"q1", type:"short", required:true,
      label:"What is the hardest question your team is likely to ask you in the next month?",
      placeholder:"The question you'd least like to be asked…" }],
  },
  {
    id:7, name:"My One Change", cue:"Commitments · slide 52", anonymous:false, result:"named",
    blurb:"This one is shown with your name.",
    questions:[{ key:"q1", type:"para", required:true, help:"Your first name is shown with this answer.",
      label:"One thing you'll do differently in the next 30 days that your team will notice." }],
  },
];

const byId = (id) => ACTIVITIES.find(a => a.id === id);
const opt  = (o) => (typeof o === "string" ? { key:o, label:o } : o);

/** Round-based activities are tracked per round: "3:2". Everything else: "5". */
const submitKey = (act, round) => (act?.rounds ? `${act.id}:${round || 1}` : String(act?.id));
const isActivityTouched = (done, id) => done.some(k => String(k).split(":")[0] === String(id));

/* ─────────────────────────────────────────────────────────────────────────────
   3 · SOCKET
───────────────────────────────────────────────────────────────────────────── */
let _socket = null;
function getSocket() {
  if (!_socket) _socket = io(SOCKET_URL, { transports:["websocket","polling"], autoConnect:true });
  return _socket;
}

function useSocket(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const s = getSocket();
    const names = Object.keys(ref.current || {});
    const bound = names.map(n => {
      const fn = (...args) => ref.current[n]?.(...args);
      s.on(n, fn);
      return [n, fn];
    });
    return () => bound.forEach(([n, fn]) => s.off(n, fn));
  }, []);
  return getSocket();
}

/* ─────────────────────────────────────────────────────────────────────────────
   4 · BRAND UI
───────────────────────────────────────────────────────────────────────────── */
function FoodpandaLogo({ height = 28, color = INK, showWord = true }) {
  return (
    <Box sx={{ display:"flex", alignItems:"center", gap: height * 0.28 + "px" }}>
      <Box component="img" src="/foodpanda-logo.png" alt="foodpanda"
        sx={{ height, width:"auto", display:"block" }}
        onError={(e)=>{ e.target.style.display = "none"; }} />
      {showWord && (
        <Typography component="span" sx={{
          color, fontWeight:800, lineHeight:1, fontSize: height * 0.72,
          letterSpacing:"-0.035em", fontFamily:"'Inter','Segoe UI',sans-serif", whiteSpace:"nowrap",
        }}>
          foodpanda
        </Typography>
      )}
    </Box>
  );
}

function CarnelianLogo({ height = 30, invert = false }) {
  return (
    <Box sx={{ display:"flex", alignItems:"center", gap:1.2 }}>
      <Typography sx={{
        fontSize:"0.64rem", lineHeight:1, fontWeight:700, letterSpacing:"0.1em",
        textTransform:"uppercase", color: invert ? "rgba(255,255,255,0.5)" : MUTED, whiteSpace:"nowrap",
      }}>
        Powered by
      </Typography>
      <Box component="img" src="/logo.png" alt="Carnelian"
        sx={{ height, width:"auto", display:"block", filter: invert ? "brightness(0) invert(1)" : "none",
          opacity: invert ? 0.92 : 1 }}
        onError={(e)=>{ e.target.style.display="none"; e.target.nextSibling && (e.target.nextSibling.style.display="block"); }} />
      <Typography sx={{ display:"none", fontWeight:800, fontSize: height * 0.55, letterSpacing:"-0.02em",
        color: invert ? "#fff" : INK }}>
        Carnelian
      </Typography>
    </Box>
  );
}

function SunRays({ size = 220, rays = 9, sx }) {
  const cx = size / 2, cy = size, R = size * 0.46, tip = size * 0.94;
  const id = useMemo(() => "sun" + Math.random().toString(36).slice(2, 8), []);
  const arms = Array.from({ length: rays }, (_, i) => {
    const a = Math.PI * (0.06 + (0.88 * i) / (rays - 1));
    const x1 = cx - Math.cos(a) * R,   y1 = cy - Math.sin(a) * R;
    const x2 = cx - Math.cos(a) * tip, y2 = cy - Math.sin(a) * tip;
    const hx = cx - Math.cos(a) * (tip - size * 0.075);
    const hy = cy - Math.sin(a) * (tip - size * 0.075);
    const px = -Math.sin(a) * size * 0.032, py = Math.cos(a) * size * 0.032;
    return { x1, y1, x2, y2, head:`${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}` };
  });
  return (
    <Box component="svg" viewBox={`0 0 ${size} ${size}`} sx={{ width:size, height:size, display:"block", ...sx }}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={MAGENTA}/><stop offset="100%" stopColor={FLAME}/>
        </linearGradient>
      </defs>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`} fill={`url(#${id})`} />
      {arms.map((r, i) => (
        <g key={i}>
          <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={`url(#${id})`} strokeWidth={size * 0.017} strokeLinecap="round" />
          <polygon points={r.head} fill={`url(#${id})`} />
        </g>
      ))}
    </Box>
  );
}

function BrandBar({ right, dark = false, compact = false }) {
  return (
    <Box sx={{
      px:{ xs:2, md:3.5 }, py: compact ? 1.2 : 1.6,
      display:"flex", alignItems:"center", gap:2,
      background: dark ? INK : PAPER,
      borderBottom: dark ? "none" : `1px solid ${LINE}`,
      position:"relative", zIndex:2,
    }}>
      <FoodpandaLogo height={compact ? 24 : 28} color={dark ? "#fff" : INK} />
      <Box sx={{ width:"1px", height:26, background: dark ? "rgba(255,255,255,0.18)" : LINE }} />
      <Box sx={{ minWidth:0 }}>
        <Typography variant="overline" sx={{ color:MAGENTA, display:"block", lineHeight:1 }}>RISE Alignment</Typography>
        <Typography sx={{ fontWeight:800, fontSize:"0.9rem", lineHeight:1.25, color: dark ? "#fff" : INK, letterSpacing:"-0.015em" }}>
          Leadership Offsite
        </Typography>
      </Box>
      <Box sx={{ flex:1 }} />
      {right}
      <Box sx={{ display:{ xs:"none", sm:"block" }, ml:1 }}>
        <CarnelianLogo height={compact ? 26 : 32} invert={dark} />
      </Box>
    </Box>
  );
}

function SectionTag({ children, color = MAGENTA }) {
  return <Typography variant="overline" sx={{ color, display:"block" }}>{children}</Typography>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   5 · CHART PRIMITIVES
───────────────────────────────────────────────────────────────────────────── */
function BarRow({ label, value, total, highlight, sub }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <Box sx={{ mb:1.4 }}>
      <Box sx={{ display:"flex", alignItems:"baseline", gap:1, mb:0.5 }}>
        <Typography sx={{ flex:1, fontSize:"0.86rem", fontWeight: highlight ? 700 : 500, color: highlight ? INK : "#443F4C", lineHeight:1.35 }}>
          {label}{sub && <Box component="span" sx={{ color:MUTED, fontWeight:400 }}> · {sub}</Box>}
        </Typography>
        <Typography sx={{ fontVariantNumeric:"tabular-nums", fontWeight:800, fontSize:"0.9rem", color: highlight ? MAGENTA : MUTED }}>
          {value}
        </Typography>
      </Box>
      <Box sx={{ height:10, borderRadius:99, background:BLUSH, overflow:"hidden" }}>
        <Box sx={{ width:`${pct}%`, height:"100%", borderRadius:99,
          background: highlight ? `linear-gradient(90deg, ${MAGENTA}, ${FLAME})` : PINK,
          transition:"width .5s cubic-bezier(.4,0,.2,1)" }} />
      </Box>
    </Box>
  );
}

function Donut({ data, size = 190 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const C = 2 * Math.PI * 42;
  const palette = [MAGENTA, MAROON, PINK, INK];
  let acc = 0;
  return (
    <Box sx={{ display:"flex", alignItems:"center", gap:2.5, flexWrap:"wrap" }}>
      <Box sx={{ position:"relative", width:size, height:size, flexShrink:0 }}>
        <Box component="svg" viewBox="0 0 100 100" sx={{ width:size, height:size, transform:"rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke={BLUSH} strokeWidth="14" />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * C;
            const el = <circle key={i} cx="50" cy="50" r="42" fill="none"
              stroke={palette[i % palette.length]} strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}
              style={{ transition:"stroke-dasharray .5s ease, stroke-dashoffset .5s ease" }} />;
            acc += len;
            return el;
          })}
        </Box>
        <Box sx={{ position:"absolute", inset:0, display:"grid", placeItems:"center" }}>
          <Box sx={{ textAlign:"center" }}>
            <Typography sx={{ fontWeight:800, fontSize:"1.7rem", lineHeight:1, color:INK }}>{total}</Typography>
            <Typography variant="overline" sx={{ color:MUTED }}>votes</Typography>
          </Box>
        </Box>
      </Box>
      <Stack spacing={1.1} sx={{ minWidth:150 }}>
        {data.map((d, i) => (
          <Box key={i} sx={{ display:"flex", alignItems:"center", gap:1.2 }}>
            <Box sx={{ width:12, height:12, borderRadius:"3px", background:palette[i % palette.length], flexShrink:0 }} />
            <Typography sx={{ fontSize:"0.85rem", fontWeight:600, flex:1, color:INK }}>{d.label}</Typography>
            <Typography sx={{ fontSize:"0.85rem", fontWeight:800, color:MUTED, fontVariantNumeric:"tabular-nums" }}>
              {total ? Math.round((d.value / total) * 100) : 0}%
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   6 · PPTX BUILDER  —  "What you told us", 7 slides, 16:9
───────────────────────────────────────────────────────────────────────────── */
const P = { M:"D7136B", MAR:"7A1538", INK:"1C1A22", PINK:"E7C6D0", BLUSH:"FBE4EC", W:"FFFFFF", GREY:"6B6570" };
const F_HEAD = "Arial", F_BODY = "Calibri";

function pTag(s, text = "WHAT YOU TOLD US", color = P.M) {
  s.addText(text, { x:0.5, y:0.3, w:5, h:0.24, fontSize:11, bold:true, color, charSpacing:2.6, fontFace:F_HEAD });
}
function pHeadline(s, text, color = P.INK, w = 9) {
  s.addText(String(text || ""), { x:0.5, y:0.62, w, h:0.78, fontSize:23, bold:true, color,
    fontFace:F_HEAD, valign:"top", wrap:true, shrinkText:true, lineSpacingMultiple:1.05 });
}

async function buildDeckPptx(spec) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";              // 10 x 5.625 in
  pptx.author = "Carnelian";
  pptx.company = "Carnelian";
  pptx.title = "What you told us";

  const find = (t) => (spec.slides || []).find(s => s.type === t) || {};
  const n  = spec.n || 0;
  const nf = spec.functions || 0;

  /* ── 1 · Title ─────────────────────────────────────────────────────────── */
  const t = find("title");
  const s1 = pptx.addSlide();
  s1.background = { color: P.W };
  s1.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.12, fill:{ color:P.M }, line:{ color:P.M } });
  s1.addShape(pptx.ShapeType.rect, { x:6.9, y:0.12, w:3.1, h:5.505, fill:{ color:P.BLUSH }, line:{ color:P.BLUSH } });
  pTag(s1);
  s1.addText(t.title || "What you told us",
    { x:0.5, y:1.75, w:6.3, h:1.2, fontSize:46, bold:true, color:P.INK, fontFace:F_HEAD, valign:"middle" });
  s1.addText(t.subtitle || `${n} leaders, ${nf} functions, a few minutes ago`,
    { x:0.5, y:3.0, w:6.3, h:0.5, fontSize:20, color:P.MAR, fontFace:F_BODY });
  s1.addText(`n = ${n}`,
    { x:0.5, y:3.62, w:3, h:0.35, fontSize:18, bold:true, color:P.M, fontFace:F_BODY });
  s1.addText("foodpanda Pakistan  ·  RISE Alignment  ·  Confidential",
    { x:0.5, y:4.95, w:6.3, h:0.3, fontSize:11, color:P.GREY, fontFace:F_BODY });

  /* ── 2 · Where the room agrees (bars) ──────────────────────────────────── */
  const b = find("bars");
  const s2 = pptx.addSlide();
  s2.background = { color: P.W };
  pTag(s2); pHeadline(s2, b.headline, P.INK, 8.2);
  s2.addText(`n = ${n}`, { x:8.5, y:0.28, w:1, h:0.3, fontSize:13, bold:true, color:P.M, fontFace:F_BODY, align:"right" });
  const bars = (b.bars || []).slice(0, 6);
  const maxV = Math.max(1, ...bars.map(x => Number(x.value) || 0));
  const BX = 4.15, BW = 4.55, ROW = 0.53, TOP = 1.62;
  bars.forEach((bar, i) => {
    const y = TOP + i * ROW;
    const v = Number(bar.value) || 0;
    const on = !!bar.emphasis;
    s2.addText(String(bar.label || ""), { x:0.5, y, w:3.5, h:0.4, fontSize:13,
      bold:on, color: on ? P.INK : P.GREY, fontFace:F_BODY, valign:"middle", wrap:false, shrinkText:true });
    s2.addShape(pptx.ShapeType.roundRect, { x:BX, y:y+0.09, w:BW, h:0.24, rectRadius:0.12,
      fill:{ color:P.BLUSH }, line:{ color:P.BLUSH } });
    if (v > 0) s2.addShape(pptx.ShapeType.roundRect, { x:BX, y:y+0.09, w:Math.max(0.24, BW * (v / maxV)), h:0.24,
      rectRadius:0.12, fill:{ color: on ? P.M : P.PINK }, line:{ color: on ? P.M : P.PINK } });
    s2.addText(String(v), { x:BX + BW + 0.12, y, w:0.6, h:0.4, fontSize:14, bold:true,
      color: on ? P.M : P.GREY, fontFace:F_BODY, valign:"middle" });
  });
  if (b.note) s2.addText(b.note, { x:0.5, y:4.92, w:9, h:0.45, fontSize:18, color:P.MAR, fontFace:F_BODY, wrap:true, shrinkText:true });

  /* ── 3 · Function by function (table) ──────────────────────────────────── */
  const tb = find("table");
  const s3 = pptx.addSlide();
  s3.background = { color: P.W };
  pTag(s3); pHeadline(s3, tb.headline);
  const cols = tb.columns || ["Function","Top two behaviours","What good looks like"];
  const body = (tb.rows || []).slice(0, 12);
  const fs   = body.length <= 6 ? 14 : body.length <= 9 ? 12 : 11;   // fit 9–11 functions on one slide
  const head = cols.map(c => ({ text:c, options:{ bold:true, color:P.W, fill:{ color:P.INK }, fontSize:fs, fontFace:F_HEAD } }));
  const rows = body.map((r, i) => r.map((c, j) => ({
    text: String(c ?? ""),
    options:{ fontSize:fs, fontFace:F_BODY, color: j === 0 ? P.MAR : P.INK, bold: j === 0,
      fill:{ color: i % 2 ? P.BLUSH : P.W } },
  })));
  s3.addTable([head, ...rows], {
    x:0.5, y:1.55, w:9, colW:[2.0, 3.7, 3.3], border:{ type:"solid", color:"EDE2E7", pt:1 },
    valign:"middle", rowH:0.34, margin:[4, 7, 4, 7], autoPage:false,
  });

  /* ── 4 · Where decisions get stuck (themes) ────────────────────────────── */
  const th = find("themes");
  const s4 = pptx.addSlide();
  s4.background = { color: P.W };
  pTag(s4); pHeadline(s4, th.headline);
  const themes = (th.themes || []).slice(0, 3);
  const TH = themes.length === 3 ? 1.12 : 1.55;
  themes.forEach((x, i) => {
    const y = 1.62 + i * (TH + 0.16);
    s4.addShape(pptx.ShapeType.rect, { x:0.5, y, w:9, h:TH, fill:{ color:P.BLUSH }, line:{ color:P.BLUSH } });
    s4.addShape(pptx.ShapeType.rect, { x:0.5, y, w:0.06, h:TH, fill:{ color:P.M }, line:{ color:P.M } });
    s4.addText(String(x.title || ""), { x:0.78, y:y+0.13, w:6.4, h:0.34, fontSize:18, bold:true, color:P.INK, fontFace:F_HEAD });
    s4.addText(String(x.line || ""),  { x:0.78, y:y+0.5,  w:6.4, h:TH-0.62, fontSize:18, color:P.MAR, fontFace:F_BODY, wrap:true, shrinkText:true, valign:"top" });
    if (x.count) s4.addText(String(x.count), { x:7.35, y:y+0.13, w:2.05, h:0.42, fontSize:14, bold:true,
      color:P.M, fontFace:F_BODY, align:"right", valign:"middle", wrap:true, shrinkText:true });
  });

  /* ── 5 · Unique to one function (outliers) ─────────────────────────────── */
  const ou = find("outliers");
  const s5 = pptx.addSlide();
  s5.background = { color: P.W };
  pTag(s5); pHeadline(s5, ou.headline || "A few needs sit outside the common pattern");
  const items = (ou.items || []).slice(0, 3);
  if (items.length) {
    items.forEach((x, i) => {
      const y = 1.72 + i * 1.02;
      s5.addShape(pptx.ShapeType.roundRect, { x:0.5, y, w:2.15, h:0.44, rectRadius:0.08, fill:{ color:P.M }, line:{ color:P.M } });
      s5.addText(String(x.function || ""), { x:0.5, y, w:2.15, h:0.44, fontSize:13, bold:true, color:P.W,
        fontFace:F_HEAD, align:"center", valign:"middle", wrap:false, shrinkText:true });
      s5.addText(String(x.need || ""), { x:2.85, y:y-0.05, w:6.65, h:0.75, fontSize:18, color:P.INK,
        fontFace:F_BODY, valign:"middle", wrap:true, shrinkText:true });
    });
  } else {
    s5.addText(ou.fallback || "No needs sat outside the common pattern.",
      { x:0.5, y:1.9, w:9, h:0.6, fontSize:20, color:P.MAR, fontFace:F_BODY, wrap:true });
  }

  /* ── 6 · Discussion (dark) ─────────────────────────────────────────────── */
  const ds = find("discussion");
  const s6 = pptx.addSlide();
  s6.background = { color: P.INK };
  pTag(s6, "WHAT YOU TOLD US", P.PINK);
  s6.addText(ds.headline || "How do we cater to these?",
    { x:0.5, y:0.95, w:9, h:0.8, fontSize:34, bold:true, color:P.W, fontFace:F_HEAD });
  const qs = (ds.questions && ds.questions.length ? ds.questions : [
    "Is this a need for one function, or an early signal for all of us?",
    "Where does it sit: something people learn, something managers do, or something the organisation changes?",
  ]).slice(0, 2);
  qs.forEach((q, i) => {
    const y = 2.25 + i * 1.35;
    s6.addText(String(i + 1), { x:0.5, y, w:0.55, h:0.55, fontSize:26, bold:true, color:P.M, fontFace:F_HEAD, valign:"middle" });
    s6.addText(String(q), { x:1.15, y:y-0.08, w:8.3, h:1.05, fontSize:22, color:P.W, fontFace:F_BODY,
      valign:"middle", wrap:true, shrinkText:true, lineSpacingMultiple:1.15 });
  });

  /* ── 7 · What your teams are waiting to hear ───────────────────────────── */
  const ms = find("messages");
  const s7 = pptx.addSlide();
  s7.background = { color: P.W };
  pTag(s7); pHeadline(s7, ms.headline);
  const msgs = (ms.messages || []).slice(0, 5);
  const MH = msgs.length <= 3 ? 0.82 : msgs.length === 4 ? 0.68 : 0.56;
  msgs.forEach((m, i) => {
    const y = 1.6 + i * (MH + 0.12);
    s7.addShape(pptx.ShapeType.rect, { x:0.5, y, w:9, h:MH, fill:{ color: i % 2 ? P.W : P.BLUSH }, line:{ color:"EDE2E7" } });
    s7.addShape(pptx.ShapeType.ellipse, { x:0.74, y:y + MH/2 - 0.07, w:0.14, h:0.14, fill:{ color:P.M }, line:{ color:P.M } });
    s7.addText(String(m), { x:1.08, y, w:8.2, h:MH, fontSize:18, color:P.INK, fontFace:F_BODY,
      valign:"middle", wrap:true, shrinkText:true });
  });
  s7.addText(ms.footer || "We'll build on these next.",
    { x:0.5, y:5.02, w:9, h:0.35, fontSize:14, italic:true, color:P.MAR, fontFace:F_BODY });

  const stamp = new Date().toISOString().slice(0, 10);
  await pptx.writeFile({ fileName: `What-you-told-us_${stamp}.pptx` });
}

/* ─────────────────────────────────────────────────────────────────────────────
   7 · LANDING
───────────────────────────────────────────────────────────────────────────── */
function Landing({ go }) {
  const [lobby, setLobby]   = useState({ checked:false, active:false, code:null });
  const [claim, setClaim]   = useState(false);
  const [key, setKey]       = useState("");
  const [err, setErr]       = useState("");
  const [busy, setBusy]     = useState(false);

  const socket = useSocket({
    "lobby:status": (s) => setLobby({ checked:true, active:!!s.active, code:s.code || null }),
    "connect": () => getSocket().emit("lobby:status"),
  });

  useEffect(() => { socket.emit("lobby:status"); }, [socket]);

  const savedCode  = localStorage.getItem("fp_host");
  const savedToken = localStorage.getItem("fp_host_token");
  const iAmHost    = lobby.active && savedCode === lobby.code && !!savedToken;
  const locked     = lobby.checked && lobby.active && !iAmHost;

  const facilitate = () => {
    if (locked) { setClaim(true); return; }
    go("host");                                   // Dashboard creates the session itself
  };

  const sendClaim = () => {
    setBusy(true); setErr("");
    socket.emit("host:claim", { code: lobby.code, key: key.trim() }, (res) => {
      setBusy(false);
      if (res?.ok) {
        localStorage.setItem("fp_host", lobby.code);
        localStorage.setItem("fp_host_token", res.token);
        go("host");
      } else setErr("That key isn't right.");
    });
  };

  return (
    <Box sx={{ minHeight:"100vh", background:CANVAS }}>
      <BrandBar />
      <Box sx={{ position:"relative", overflow:"hidden" }}>
        <SunRays size={520} sx={{ position:"absolute", right:-140, bottom:-260, opacity:0.10, pointerEvents:"none" }} />
        <Box sx={{ maxWidth:820, mx:"auto", px:2.5, pt:{ xs:6, md:9 }, pb:10, position:"relative" }}>
          <SectionTag>foodpanda Pakistan × Carnelian</SectionTag>
          <Typography variant="h2" sx={{ mt:1.2, mb:2, fontSize:{ xs:"2.4rem", md:"3.4rem" }, lineHeight:1.05 }}>
            Leadership{" "}<Box component="span" sx={{ color:MAGENTA }}>Offsite</Box>
          </Typography>
          <Typography sx={{ color:MUTED, fontSize:"1.05rem", maxWidth:520, lineHeight:1.75, mb:5 }}>
            Seven activities, one room, live on screen. Leaders answer on their phones, the room sees the result instantly.
          </Typography>

          <Box sx={{ display:"grid", gap:2.5, gridTemplateColumns:{ xs:"1fr", sm:"1fr 1fr" } }}>
            {/* facilitator */}
            <Paper elevation={locked ? 0 : 3} sx={{ p:3.5, display:"flex", flexDirection:"column",
              border:`1px solid ${LINE}`, background: locked ? "rgba(255,255,255,0.55)" : "#fff" }}>
              <Box sx={{ width:46, height:46, borderRadius:2.5, background: locked ? "#E4DEE1" : INK,
                display:"grid", placeItems:"center", mb:2.2 }}>
                {locked ? <LockIcon sx={{ color:MUTED, fontSize:22 }}/> : <QrCode2Icon sx={{ color:"#fff", fontSize:24 }}/>}
              </Box>
              <Typography variant="h6" sx={{ mb:1, color: locked ? MUTED : INK }}>Facilitator</Typography>
              <Typography variant="body2" sx={{ color:MUTED, mb:3, flex:1, lineHeight:1.7 }}>
                {locked
                  ? `A session is already running on room code ${lobby.code}. Only one facilitator can hold the room.`
                  : "Create the session, project the QR code, open each activity on cue and show results live."}
              </Typography>
              <Button fullWidth variant="contained" color="secondary" size="large"
                disabled={!lobby.checked || locked}
                endIcon={locked ? <LockIcon/> : <ArrowForwardIcon/>} onClick={facilitate}>
                {!lobby.checked ? "Checking…" : locked ? "Session in progress" : iAmHost ? "Back to dashboard" : "Start session"}
              </Button>
              {locked && (
                <Button size="small" onClick={()=>setClaim(true)}
                  sx={{ mt:1.2, color:MUTED, fontSize:"0.75rem", fontWeight:600 }}>
                  I'm the facilitator
                </Button>
              )}
            </Paper>

            {/* leader */}
            <Paper elevation={3} sx={{ p:3.5, display:"flex", flexDirection:"column", border:`1px solid ${LINE}` }}>
              <Box sx={{ width:46, height:46, borderRadius:2.5, background:`linear-gradient(135deg,${MAGENTA},${FLAME})`,
                display:"grid", placeItems:"center", mb:2.2 }}>
                <PeopleAltIcon sx={{ color:"#fff", fontSize:24 }} />
              </Box>
              <Typography variant="h6" sx={{ mb:1 }}>Leader</Typography>
              <Typography variant="body2" sx={{ color:MUTED, mb:3, flex:1, lineHeight:1.7 }}>
                Scan the QR on screen, or enter the room code here. Keep this page open for the whole session.
              </Typography>
              <Button fullWidth variant="contained" size="large" endIcon={<ArrowForwardIcon/>} onClick={()=>go("join")}>
                Join the session
              </Button>
            </Paper>
          </Box>

          {claim && (
            <Paper elevation={3} sx={{ mt:3, p:3, border:`1px solid ${PINK}` }}>
              <SectionTag color={MAROON}>Reclaim the room</SectionTag>
              <Typography sx={{ color:MUTED, fontSize:"0.88rem", lineHeight:1.7, mt:1, mb:2.2 }}>
                If this is your laptop and you lost the dashboard, enter the facilitator key from your backend <code>.env</code>.
              </Typography>
              <Stack direction="row" spacing={1.2}>
                <TextField fullWidth size="small" type="password" value={key} placeholder="Facilitator key"
                  onChange={(e)=>{ setKey(e.target.value); setErr(""); }}
                  onKeyDown={(e)=>{ if (e.key === "Enter") sendClaim(); }} />
                <Button variant="contained" onClick={sendClaim} disabled={!key.trim() || busy} sx={{ px:3 }}>
                  {busy ? <CircularProgress size={16} sx={{ color:"#fff" }}/> : "Unlock"}
                </Button>
                <Button onClick={()=>{ setClaim(false); setKey(""); setErr(""); }} sx={{ color:MUTED }}>Cancel</Button>
              </Stack>
              {err && <Typography sx={{ color:FLAME, fontSize:"0.82rem", mt:1.4, fontWeight:600 }}>{err}</Typography>}
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   8 · PARTICIPANT
───────────────────────────────────────────────────────────────────────────── */
function Participant({ initialCode, onExit }) {
  const [code, setCode]     = useState(localStorage.getItem("fp_code") || initialCode || "");
  const [name, setName]     = useState(localStorage.getItem("fp_name") || "");
  const [pid, setPid]       = useState(localStorage.getItem("fp_pid")  || "");
  const [joined, setJoined] = useState(!!localStorage.getItem("fp_pid"));
  const [state, setState]   = useState(null);
  const [done, setDone]     = useState(() => JSON.parse(localStorage.getItem("fp_done") || "[]"));
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState("");

  const clearLocal = () => ["fp_pid","fp_code","fp_name","fp_done"].forEach(k => localStorage.removeItem(k));

  const socket = useSocket({
    "session:state": (s) => setState(s),
    "join:ok": ({ participantId, session, submitted }) => {
      localStorage.setItem("fp_pid", participantId);
      localStorage.setItem("fp_code", session.code);
      localStorage.setItem("fp_name", name || localStorage.getItem("fp_name") || "");
      if (submitted) { localStorage.setItem("fp_done", JSON.stringify(submitted)); setDone(submitted); }
      setPid(participantId); setState(session); setJoined(true); setBusy(false); setErr("");
    },
    "join:error": (m) => { setErr(m || "Could not join. Check the room code."); setBusy(false); },
    "session:ended": () => { clearLocal(); setJoined(false); setState(null); },
    "session:reset": () => { localStorage.setItem("fp_done", "[]"); setDone([]); },
    "connect": () => {
      const c = localStorage.getItem("fp_code"), p = localStorage.getItem("fp_pid");
      if (c && p) getSocket().emit("participant:join", { code:c, name: localStorage.getItem("fp_name") || "", participantId:p });
    },
  });

  useEffect(() => {
    if (joined && pid && code) socket.emit("participant:join", { code, name, participantId: pid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = () => {
    if (!code.trim() || !name.trim()) return;
    setBusy(true); setErr("");
    socket.emit("participant:join", { code: code.trim().toUpperCase(), name: name.trim() });
  };

  const submit = (activity, answers) => {
    socket.emit("response:submit", { code, participantId: pid, activityId: activity.id, answers });
    const next = [...new Set([...done, submitKey(activity, state?.liveRound)])];
    setDone(next); localStorage.setItem("fp_done", JSON.stringify(next));
  };

  const leave = () => { socket.emit("participant:leave", { code, participantId: pid }); clearLocal(); onExit(); };

  if (!joined) {
    return (
      <Box sx={{ minHeight:"100vh", background:CANVAS }}>
        <BrandBar compact />
        <Box sx={{ maxWidth:440, mx:"auto", px:2.5, pt:5, pb:8 }}>
          <Button startIcon={<ArrowBackIcon/>} onClick={onExit} sx={{ color:MUTED, mb:2.5, ml:-1 }}>Back</Button>
          <SectionTag>Check in</SectionTag>
          <Typography variant="h4" sx={{ mt:1, mb:3.5, fontSize:"2rem" }}>Join the session</Typography>
          <Paper elevation={3} sx={{ p:3.2, border:`1px solid ${LINE}` }}>
            <Typography variant="overline" sx={{ color:INK, display:"block", mb:0.8 }}>Room code</Typography>
            <TextField fullWidth value={code} placeholder="ABCD"
              onChange={(e)=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4))}
              sx={{ mb:2.8, "& input":{ textAlign:"center", letterSpacing:"0.45em", fontWeight:800, fontSize:"2rem", py:1.6, textIndent:"0.45em" } }} />
            <Typography variant="overline" sx={{ color:INK, display:"block", mb:0.8 }}>Your first name</Typography>
            <TextField fullWidth value={name} placeholder="Sara" onChange={(e)=>setName(e.target.value)}
              helperText="Shown only on the final activity. Everything else is anonymous."
              sx={{ mb:3, "& input":{ fontWeight:600, fontSize:"1.05rem", py:1.4 } }} />
            {err && <Typography sx={{ color:FLAME, fontSize:"0.85rem", mb:2, fontWeight:600 }}>{err}</Typography>}
            <Button fullWidth variant="contained" size="large" disabled={code.length<4 || !name.trim() || busy}
              onClick={join} endIcon={busy ? <CircularProgress size={16} sx={{color:"#fff"}}/> : <ArrowForwardIcon/>}>
              {busy ? "Joining…" : "Join"}
            </Button>
          </Paper>
        </Box>
      </Box>
    );
  }

  if (!state) return <Box sx={{ minHeight:"100vh", display:"grid", placeItems:"center", background:CANVAS }}><CircularProgress sx={{ color:MAGENTA }} /></Box>;

  const live      = state.liveActivity;
  const activity  = live ? byId(live) : null;
  const submitted = activity ? done.includes(submitKey(activity, state.liveRound)) : false;

  return (
    <Box sx={{ minHeight:"100vh", background:CANVAS, pb:6 }}>
      <BrandBar compact right={
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={state.code} sx={{ background:BLUSH, color:MAROON, letterSpacing:"0.12em", fontWeight:800 }} />
          <Tooltip title="Leave session"><IconButton size="small" onClick={leave} sx={{ color:MUTED }}><LogoutIcon fontSize="small"/></IconButton></Tooltip>
        </Stack>
      } />

      <Box sx={{ display:"flex", gap:0.6, px:{ xs:2, md:3 }, py:1.4, background:PAPER, borderBottom:`1px solid ${LINE}` }}>
        {ACTIVITIES.map(a => {
          const isLive = a.id === live, isDone = isActivityTouched(done, a.id);
          return <Box key={a.id} sx={{ flex:1, height:5, borderRadius:99,
            background: isLive ? `linear-gradient(90deg,${MAGENTA},${FLAME})` : isDone ? PINK : "#EFE7EB",
            boxShadow: isLive ? `0 0 0 3px rgba(215,19,107,0.14)` : "none", transition:"all .3s" }} />;
        })}
      </Box>

      <Box sx={{ maxWidth:640, mx:"auto", px:2.5, pt:3.5 }}>
        {!activity   && <HoldScreen name={name} />}
        {activity && submitted && <ThanksScreen activity={activity} round={state.liveRound} />}
        {activity && !submitted && (
          <ActivityForm key={submitKey(activity, state.liveRound)} activity={activity} name={name}
            round={state.liveRound} onSubmit={(ans)=>submit(activity, ans)} />
        )}
      </Box>
    </Box>
  );
}

function HoldScreen({ name }) {
  return (
    <Box sx={{ textAlign:"center", pt:7 }}>
      <SunRays size={150} sx={{ mx:"auto", mb:4, opacity:0.95 }} />
      <SectionTag>You're in{name ? `, ${name}` : ""}</SectionTag>
      <Typography variant="h4" sx={{ mt:1.2, mb:1.8, fontSize:"1.9rem" }}>Keep this page open</Typography>
      <Typography sx={{ color:MUTED, lineHeight:1.8, maxWidth:380, mx:"auto" }}>
        An activity will appear here the moment it goes up on the screen. Nothing to tap until then.
      </Typography>
      <Box sx={{ mt:5, display:"inline-flex", alignItems:"center", gap:1.4, px:2.4, py:1.2, borderRadius:99, background:BLUSH }}>
        <Box sx={{ width:8, height:8, borderRadius:"50%", background:MAGENTA,
          animation:"fpPulse 1.6s ease-in-out infinite",
          "@keyframes fpPulse":{ "0%,100%":{ opacity:1, transform:"scale(1)" }, "50%":{ opacity:0.35, transform:"scale(0.75)" } } }} />
        <Typography sx={{ fontSize:"0.85rem", fontWeight:700, color:MAROON }}>Waiting for the room</Typography>
      </Box>
    </Box>
  );
}

function ThanksScreen({ activity, round }) {
  return (
    <Box sx={{ textAlign:"center", pt:7 }}>
      <Box sx={{ width:74, height:74, borderRadius:"50%", background:BLUSH, display:"grid", placeItems:"center", mx:"auto", mb:3 }}>
        <CheckCircleIcon sx={{ color:MAGENTA, fontSize:40 }} />
      </Box>
      <SectionTag>{activity.id} · {activity.name}{activity.rounds ? ` · Round ${round || 1}` : ""}</SectionTag>
      <Typography variant="h4" sx={{ mt:1.2, mb:1.5, fontSize:"1.9rem" }}>Thanks. Watch the screen.</Typography>
      <Typography sx={{ color:MUTED, lineHeight:1.8 }}>
        {activity.rounds ? "The next round will appear here." : "Your answer is in. The next activity will appear here."}
      </Typography>
    </Box>
  );
}

function ActivityForm({ activity, round, onSubmit }) {
  const [a, setA] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setA(p => ({ ...p, [k]: v }));

  const questions = activity.rounds
    ? activity.questions.filter(q => q.round === (round || 1))
    : activity.questions;

  const valid = questions.every(q => {
    if (!q.required) return true;
    const v = a[q.key];
    if (q.type === "multi") return Array.isArray(v) && v.length === q.exact;
    return v != null && String(v).trim().length > 0;
  });

  const go = () => { if (!valid) return; setBusy(true); onSubmit(a); };

  return (
    <Box sx={{ pb:4 }}>
      <Box sx={{ mb:3 }}>
        <SectionTag>Activity {activity.id}{activity.rounds ? ` · Round ${round || 1} of ${activity.rounds}` : ""}</SectionTag>
        <Typography variant="h4" sx={{ mt:0.8, mb:1.2, fontSize:"1.85rem" }}>{activity.name}</Typography>
        <Typography sx={{ color:MUTED, fontSize:"0.92rem", lineHeight:1.7 }}>{activity.blurb}</Typography>
      </Box>

      <Stack spacing={2.2}>
        {questions.map(q => (
          <Paper key={q.key} elevation={1} sx={{ p:2.8, border:`1px solid ${LINE}` }}>
            <Typography sx={{ fontWeight:700, fontSize:"1rem", lineHeight:1.5, mb: q.help ? 0.6 : 1.8, color:INK }}>
              {q.label}
              {!q.required && <Box component="span" sx={{ color:MUTED, fontWeight:500, fontSize:"0.85rem" }}> · optional</Box>}
            </Typography>
            {q.help && <Typography sx={{ color:MUTED, fontSize:"0.82rem", mb:1.8, lineHeight:1.6 }}>{q.help}</Typography>}
            <Field q={q} value={a[q.key]} onChange={(v)=>set(q.key, v)} />
          </Paper>
        ))}
      </Stack>

      <Button fullWidth variant="contained" size="large" sx={{ mt:3.5, py:1.7 }}
        disabled={!valid || busy} onClick={go}
        endIcon={busy ? <CircularProgress size={16} sx={{ color:"#fff" }}/> : <ArrowForwardIcon/>}>
        {busy ? "Sending…" : "Submit"}
      </Button>
      {!valid && (
        <Typography sx={{ textAlign:"center", color:MUTED, fontSize:"0.78rem", mt:1.5 }}>
          {questions.some(q => q.type === "multi")
            ? `Select exactly ${questions.find(q=>q.type==="multi").exact} to continue`
            : "Answer every question to continue"}
        </Typography>
      )}
    </Box>
  );
}

function Field({ q, value, onChange }) {
  if (q.type === "short" || q.type === "para") {
    return <TextField fullWidth multiline={q.type === "para"} rows={q.type === "para" ? 4 : 1}
      value={value || ""} onChange={(e)=>onChange(e.target.value)}
      placeholder={q.placeholder || (q.type === "para" ? "Write a few sentences…" : "Type your answer…")}
      sx={{ "& .MuiOutlinedInput-root":{ fontSize:"0.98rem", lineHeight:1.6 } }} />;
  }

  if (q.type === "dropdown") {
    return (
      <TextField select fullWidth value={value || ""} onChange={(e)=>onChange(e.target.value)}
        SelectProps={{ displayEmpty:true }}
        sx={{ "& .MuiSelect-select":{ fontSize:"0.98rem", fontWeight:600, color: value ? INK : MUTED } }}>
        <MenuItem value="" disabled>Choose your function…</MenuItem>
        {q.options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
      </TextField>
    );
  }

  if (q.type === "choice") {
    return (
      <Box sx={{ display:"grid", gap:1, gridTemplateColumns: q.dense ? { xs:"1fr 1fr", sm:"1fr 1fr 1fr" } : "1fr" }}>
        {q.options.map(raw => {
          const o = opt(raw), on = value === o.key;
          return (
            <Box key={o.key} onClick={()=>onChange(o.key)} role="button" sx={{
              px:2, py: q.dense ? 1.35 : 1.8, borderRadius:2.5, cursor:"pointer", userSelect:"none",
              border:`2px solid ${on ? MAGENTA : "rgba(28,26,34,0.10)"}`, background: on ? BLUSH : "#fff",
              transition:"all .16s", display:"flex", alignItems:"center",
              justifyContent: q.dense ? "center" : "flex-start", gap:1.4,
              "&:active":{ transform:"scale(0.985)" },
            }}>
              {!q.dense && (
                <Box sx={{ width:20, height:20, borderRadius:"50%", flexShrink:0,
                  border:`2px solid ${on ? MAGENTA : "rgba(28,26,34,0.20)"}`, display:"grid", placeItems:"center" }}>
                  {on && <Box sx={{ width:9, height:9, borderRadius:"50%", background:MAGENTA }} />}
                </Box>
              )}
              <Typography sx={{ fontWeight: on ? 800 : 600, color: on ? MAROON : INK,
                fontSize: q.dense ? "0.92rem" : "0.96rem", fontVariantNumeric:"tabular-nums" }}>{o.label}</Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (q.type === "multi") {
    const sel = value || [];
    const full = sel.length >= q.exact;
    const toggle = (k) => {
      if (sel.includes(k)) onChange(sel.filter(x => x !== k));
      else if (!full) onChange([...sel, k]);
    };
    return (
      <Box>
        <Box sx={{ display:"flex", alignItems:"center", gap:1, mb:1.6 }}>
          <Chip size="small" label={`${sel.length} of ${q.exact} selected`}
            sx={{ background: full ? MAGENTA : BLUSH, color: full ? "#fff" : MAROON }} />
          {full && <Typography sx={{ fontSize:"0.75rem", color:MUTED }}>Deselect one to change</Typography>}
        </Box>
        <Stack spacing={1}>
          {q.options.map(raw => {
            const o = opt(raw), on = sel.includes(o.key), lock = !on && full;
            return (
              <Box key={o.key} onClick={()=>toggle(o.key)} role="button" sx={{
                px:2, py:1.7, borderRadius:2.5, cursor: lock ? "not-allowed" : "pointer", userSelect:"none",
                border:`2px solid ${on ? MAGENTA : "rgba(28,26,34,0.10)"}`,
                background: on ? BLUSH : "#fff", opacity: lock ? 0.45 : 1,
                display:"flex", alignItems:"flex-start", gap:1.5, transition:"all .16s",
                "&:active":{ transform: lock ? "none" : "scale(0.99)" },
              }}>
                <Box sx={{ width:20, height:20, borderRadius:"6px", flexShrink:0, mt:0.2,
                  border:`2px solid ${on ? MAGENTA : "rgba(28,26,34,0.20)"}`,
                  background: on ? MAGENTA : "transparent", display:"grid", placeItems:"center" }}>
                  {on && <CheckCircleIcon sx={{ fontSize:14, color:"#fff" }} />}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: on ? 800 : 700, color: on ? MAROON : INK, fontSize:"0.94rem", lineHeight:1.45 }}>
                    {o.label}
                  </Typography>
                  {o.desc && <Typography sx={{ color:MUTED, fontSize:"0.82rem", lineHeight:1.55, mt:0.3 }}>{o.desc}</Typography>}
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>
    );
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   9 · DASHBOARD
───────────────────────────────────────────────────────────────────────────── */
function Dashboard({ onExit }) {
  const [code, setCode]   = useState(localStorage.getItem("fp_host") || "");
  const [token, setToken] = useState(localStorage.getItem("fp_host_token") || "");
  const [state, setState] = useState(null);
  const [data, setData]   = useState({});
  const [boot, setBoot]   = useState(true);
  const [qr, setQr]       = useState(false);
  const [fatal, setFatal] = useState("");

  const socket = useSocket({
    "session:state":    (s) => { setState(s); setBoot(false); },
    "responses:update": (d) => setData(d),
    "host:error":       (m) => {
      localStorage.removeItem("fp_host"); localStorage.removeItem("fp_host_token");
      setCode(""); setState(null); setBoot(false);
      setFatal(m || "This dashboard is no longer the facilitator.");
    },
    "session:ended":    () => {
      localStorage.removeItem("fp_host"); localStorage.removeItem("fp_host_token");
      setCode(""); setState(null); onExit();
    },
    "connect": () => {
      const c = localStorage.getItem("fp_host"), t = localStorage.getItem("fp_host_token");
      if (c && t) getSocket().emit("host:resume", { code:c, token:t });
    },
  });

  // resume if we already hold the room, otherwise create it straight away
  useEffect(() => {
    if (code && token) { socket.emit("host:resume", { code, token }); return; }
    socket.emit("host:create", { sessionName: SESSION_NAME }, (res) => {
      if (res?.code && res?.token) {
        localStorage.setItem("fp_host", res.code);
        localStorage.setItem("fp_host_token", res.token);
        setCode(res.code); setToken(res.token);
      } else {
        setBoot(false);
        setFatal(res?.error || "A session is already running. Ask the facilitator holding it, or reclaim it from the home screen.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openActivity  = (id) => socket.emit("activity:open",  { code, token, activityId:id });
  const closeActivity = ()   => socket.emit("activity:close", { code, token });
  const setRound      = (r)  => socket.emit("activity:round", { code, token, round:r });
  const endSession    = ()   => { if (window.confirm("End the session for everyone? The room code stops working.")) socket.emit("session:end", { code, token }); };
  const resetSession  = ()   => {
    if (window.confirm("Reset the session?\n\nThis clears every answer from all seven activities. Leaders stay joined and keep the same room code. Use this after a dry run."))
      socket.emit("session:reset", { code, token });
  };

  if (boot) return <Box sx={{ minHeight:"100vh", display:"grid", placeItems:"center", background:CANVAS }}><CircularProgress sx={{ color:MAGENTA }} /></Box>;

  if (fatal || !state) {
    return (
      <Box sx={{ minHeight:"100vh", background:CANVAS }}>
        <BrandBar />
        <Box sx={{ maxWidth:480, mx:"auto", px:2.5, pt:9, textAlign:"center" }}>
          <Box sx={{ width:64, height:64, borderRadius:"50%", background:BLUSH, display:"grid", placeItems:"center", mx:"auto", mb:3 }}>
            <LockIcon sx={{ color:MAROON, fontSize:30 }} />
          </Box>
          <Typography variant="h5" sx={{ mb:1.5 }}>Room is taken</Typography>
          <Typography sx={{ color:MUTED, lineHeight:1.8, mb:4 }}>{fatal}</Typography>
          <Button variant="contained" onClick={onExit} startIcon={<ArrowBackIcon/>}>Back to home</Button>
        </Box>
      </Box>
    );
  }

  const joinLink = `${JOIN_URL}/?s=${state.code}`;
  if (qr) return <QrPresent code={state.code} link={joinLink} count={state.participants?.length || 0} onClose={()=>setQr(false)} />;

  return (
    <Box sx={{ minHeight:"100vh", background:CANVAS }}>
      <BrandBar dark right={
        <Stack direction="row" spacing={1.2} alignItems="center">
          <LiveDot />
          <Chip icon={<PeopleAltIcon sx={{ fontSize:16, color:`${MAGENTA} !important` }}/>}
            label={`${state.participants?.length || 0} in the room`}
            sx={{ background:"rgba(255,255,255,0.08)", color:"#fff", fontWeight:700 }} />
          <Button size="small" variant="contained" startIcon={<QrCode2Icon/>} onClick={()=>setQr(true)}>Show QR</Button>
          <Tooltip title="Reset — clear all answers, keep the room">
            <IconButton size="small" onClick={resetSession} sx={{ color:"rgba(255,255,255,0.45)", "&:hover":{ color:"#fff" } }}><RestartAltIcon fontSize="small"/></IconButton>
          </Tooltip>
          <Tooltip title="End session">
            <IconButton size="small" onClick={endSession} sx={{ color:"rgba(255,255,255,0.45)", "&:hover":{ color:FLAME } }}><CloseIcon fontSize="small"/></IconButton>
          </Tooltip>
        </Stack>
      } />

      <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr", lg:"330px 1fr" }, alignItems:"start",
        maxWidth:1480, mx:"auto", px:{ xs:2, md:3 }, py:3, gap:3 }}>

        <Paper elevation={1} sx={{ p:2.2, border:`1px solid ${LINE}`, position:{ lg:"sticky" }, top:16 }}>
          <Box sx={{ display:"flex", alignItems:"center", justifyContent:"space-between", mb:0.4 }}>
            <SectionTag>Room code</SectionTag>
            <Tooltip title="Force refresh"><IconButton size="small" onClick={()=>socket.emit("host:resume",{code,token})}><RefreshIcon sx={{ fontSize:16, color:MUTED }}/></IconButton></Tooltip>
          </Box>
          <Typography sx={{ fontWeight:800, fontSize:"2.4rem", letterSpacing:"0.24em", color:INK, lineHeight:1.1, mb:2.4 }}>
            {state.code}
          </Typography>

          <SectionTag>Activities</SectionTag>
          <Stack spacing={1} sx={{ mt:1.2 }}>
            {ACTIVITIES.map(act => {
              const live = state.liveActivity === act.id;
              const n = data[act.id]?.count || 0;
              return (
                <Box key={act.id} sx={{ p:1.5, borderRadius:2.5,
                  border:`2px solid ${live ? MAGENTA : "rgba(28,26,34,0.08)"}`,
                  background: live ? BLUSH : "#fff", transition:"all .2s" }}>
                  <Box sx={{ display:"flex", alignItems:"center", gap:1.2 }}>
                    <Box sx={{ width:26, height:26, borderRadius:"8px", flexShrink:0, display:"grid", placeItems:"center",
                      background: live ? MAGENTA : n > 0 ? PINK : "#F0E9EC",
                      color: live ? "#fff" : n > 0 ? MAROON : MUTED, fontWeight:800, fontSize:"0.8rem" }}>{act.id}</Box>
                    <Box sx={{ flex:1, minWidth:0 }}>
                      <Typography sx={{ fontWeight:700, fontSize:"0.85rem", lineHeight:1.3, color:INK }} noWrap>{act.name}</Typography>
                      <Typography sx={{ fontSize:"0.68rem", color:MUTED }}>{act.cue}</Typography>
                    </Box>
                    <Typography sx={{ fontWeight:800, fontSize:"0.8rem", color: n > 0 ? MAGENTA : "#CFC4CA", fontVariantNumeric:"tabular-nums" }}>{n}</Typography>
                    {live
                      ? <Tooltip title="Close"><IconButton size="small" onClick={closeActivity} sx={{ background:INK, color:"#fff", width:28, height:28, "&:hover":{ background:"#333" } }}><StopIcon sx={{ fontSize:15 }}/></IconButton></Tooltip>
                      : <Tooltip title="Open"><IconButton size="small" onClick={()=>openActivity(act.id)} sx={{ background:MAGENTA, color:"#fff", width:28, height:28, "&:hover":{ background:MAROON } }}><PlayArrowIcon sx={{ fontSize:16 }}/></IconButton></Tooltip>}
                  </Box>
                  {live && act.rounds && (
                    <Stack direction="row" spacing={0.6} sx={{ mt:1.4 }}>
                      {Array.from({ length: act.rounds }, (_, i) => i + 1).map(r => (
                        <Button key={r} size="small" onClick={()=>setRound(r)}
                          variant={state.liveRound === r ? "contained" : "outlined"}
                          sx={{ minWidth:0, flex:1, px:0, py:0.4, fontSize:"0.72rem", fontWeight:800 }}>R{r}</Button>
                      ))}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Paper>

        <Box sx={{ minWidth:0 }}><Results state={state} data={data} /></Box>
      </Box>
    </Box>
  );
}

function LiveDot() {
  return (
    <Box sx={{ display:"flex", alignItems:"center", gap:0.8, pr:0.5 }}>
      <Box sx={{ width:7, height:7, borderRadius:"50%", background:"#3ED67F",
        animation:"lp 1.8s ease-in-out infinite",
        "@keyframes lp":{ "0%,100%":{ opacity:1 }, "50%":{ opacity:0.3 } } }} />
      <Typography sx={{ fontSize:"0.68rem", fontWeight:700, color:"rgba(255,255,255,0.55)", letterSpacing:"0.08em" }}>LIVE</Typography>
    </Box>
  );
}

function QrPresent({ code, link, count, onClose }) {
  return (
    <Box sx={{ minHeight:"100vh", background:PAPER, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
      <SunRays size={620} sx={{ position:"absolute", right:-200, bottom:-330, opacity:0.10, pointerEvents:"none" }} />
      <Box sx={{ position:"absolute", top:0, left:0, right:0, height:10, background:`linear-gradient(90deg,${MAGENTA},${FLAME})` }} />

      <Box sx={{ display:"flex", alignItems:"center", px:5, pt:4.5, position:"relative", zIndex:2 }}>
        <FoodpandaLogo height={38} />
        <Box sx={{ flex:1 }} />
        <CarnelianLogo height={40} />
        <IconButton onClick={onClose} sx={{ ml:3, color:MUTED }}><CloseIcon/></IconButton>
      </Box>

      <Box sx={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:{ xs:5, md:9 },
        flexWrap:"wrap", px:5, py:4, position:"relative", zIndex:2 }}>
        <Box sx={{ maxWidth:470 }}>
          <SectionTag>RISE Alignment</SectionTag>
          <Typography variant="h1" sx={{ fontSize:{ xs:"3rem", md:"4.6rem" }, lineHeight:1.02, mt:1.5, mb:3 }}>
            One scan.<br/><Box component="span" sx={{ color:MAGENTA }}>All session.</Box>
          </Typography>
          <Typography sx={{ color:MUTED, fontSize:"1.2rem", lineHeight:1.7, mb:4.5 }}>
            Scan with your phone camera, enter your first name, then leave the page open. Activities appear when they go up here.
          </Typography>
          <Box sx={{ display:"inline-block", px:3.5, py:2.2, borderRadius:4, background:INK }}>
            <Typography variant="overline" sx={{ color:PINK, display:"block", lineHeight:1, mb:0.8 }}>Or enter room code</Typography>
            <Typography sx={{ color:"#fff", fontWeight:800, fontSize:"2.8rem", letterSpacing:"0.28em", lineHeight:1 }}>{code}</Typography>
          </Box>
          <Typography sx={{ color:MUTED, fontSize:"0.9rem", mt:2.5, wordBreak:"break-all" }}>{link}</Typography>
        </Box>

        <Box sx={{ textAlign:"center" }}>
          <Paper elevation={3} sx={{ p:3.5, borderRadius:6, border:`3px solid ${MAGENTA}`, background:"#fff", display:"inline-block" }}>
            <QRCodeSVG value={link} size={310} level="M" bgColor="#FFFFFF" fgColor={INK} includeMargin={false} />
          </Paper>
          <Box sx={{ mt:3, display:"inline-flex", alignItems:"center", gap:1.4, px:2.6, py:1.3, borderRadius:99, background:BLUSH }}>
            <PeopleAltIcon sx={{ fontSize:19, color:MAGENTA }} />
            <Typography sx={{ fontWeight:800, color:MAROON, fontSize:"1rem" }}>
              {count} {count === 1 ? "leader" : "leaders"} joined
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function Results({ state, data }) {
  const live = state.liveActivity;
  const [viewing, setViewing] = useState(live || 1);
  useEffect(() => { if (live) setViewing(live); }, [live]);

  const act = byId(viewing);
  const d   = data[viewing] || { count:0, rows:[], tally:{} };

  return (
    <Box>
      <Paper elevation={1} sx={{ p:2.6, mb:2.5, border:`1px solid ${LINE}`,
        background: live === viewing ? `linear-gradient(100deg, ${BLUSH}, #fff 65%)` : "#fff" }}>
        <Box sx={{ display:"flex", alignItems:"flex-start", gap:2, flexWrap:"wrap" }}>
          <Box sx={{ flex:1, minWidth:220 }}>
            <Box sx={{ display:"flex", alignItems:"center", gap:1.2, mb:0.6 }}>
              <SectionTag>Activity {act.id}</SectionTag>
              {live === viewing
                ? <Chip size="small" label="LIVE" sx={{ background:MAGENTA, color:"#fff", letterSpacing:"0.1em" }} />
                : <Chip size="small" icon={<LockIcon sx={{ fontSize:12 }}/>} label="closed" sx={{ background:"#F0E9EC", color:MUTED }} />}
            </Box>
            <Typography variant="h5" sx={{ mb:0.6 }}>{act.name}</Typography>
            <Typography sx={{ color:MUTED, fontSize:"0.86rem" }}>{act.cue}</Typography>
          </Box>
          <Box sx={{ textAlign:"right" }}>
            <Typography sx={{ fontWeight:800, fontSize:"2.4rem", color:MAGENTA, lineHeight:1 }}>{d.count}</Typography>
            <Typography variant="overline" sx={{ color:MUTED }}>responses</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={0.7} sx={{ mt:2.2, flexWrap:"wrap", gap:0.7 }}>
          {ACTIVITIES.map(a => (
            <Button key={a.id} size="small" onClick={()=>setViewing(a.id)}
              variant={viewing === a.id ? "contained" : "outlined"}
              sx={{ minWidth:36, px:1.2, py:0.3, fontSize:"0.75rem", fontWeight:800 }}>{a.id}</Button>
          ))}
        </Stack>
      </Paper>

      {d.count === 0
        ? <EmptyStage live={live === viewing} />
        : <ResultBody activity={act} data={d} liveRound={state.liveRound} />}
    </Box>
  );
}

function EmptyStage({ live }) {
  return (
    <Paper elevation={0} sx={{ p:8, textAlign:"center", border:`2px dashed ${PINK}`, background:"rgba(255,255,255,0.6)" }}>
      <VisibilityIcon sx={{ fontSize:38, color:PINK, mb:2 }} />
      <Typography sx={{ fontWeight:700, color:INK, mb:0.8 }}>
        {live ? "Open on phones. Waiting for answers." : "No responses yet."}
      </Typography>
      <Typography sx={{ color:MUTED, fontSize:"0.88rem" }}>
        {live ? "Results appear here the moment leaders submit." : "Open this activity from the rail to collect answers."}
      </Typography>
    </Paper>
  );
}

function ResultBody({ activity, data, liveRound }) {
  const { rows = [], tally = {}, count = 0 } = data;

  if (activity.result === "text") {
    return (
      <Box sx={{ display:"grid", gap:1.6, gridTemplateColumns:{ xs:"1fr", md:"1fr 1fr" } }}>
        {rows.map((r, i) => (
          <Paper key={i} elevation={1} sx={{ p:2.4, border:`1px solid ${LINE}`, borderLeft:`4px solid ${MAGENTA}` }}>
            <Typography sx={{ fontSize:"1.02rem", lineHeight:1.6, color:INK, fontWeight:600 }}>
              “{Object.values(r.answers || {})[0]}”
            </Typography>
          </Paper>
        ))}
      </Box>
    );
  }

  if (activity.result === "named") {
    return (
      <Stack spacing={1.6}>
        {rows.map((r, i) => (
          <Paper key={i} elevation={1} sx={{ p:2.6, border:`1px solid ${LINE}`, display:"flex", gap:2.2 }}>
            <Box sx={{ width:46, height:46, borderRadius:"50%", flexShrink:0, display:"grid", placeItems:"center",
              background:`linear-gradient(135deg,${MAGENTA},${FLAME})`, color:"#fff", fontWeight:800, fontSize:"1.1rem" }}>
              {(r.name || "?").charAt(0).toUpperCase()}
            </Box>
            <Box>
              <Typography sx={{ fontWeight:800, color:MAROON, fontSize:"0.94rem", mb:0.5 }}>{r.name}</Typography>
              <Typography sx={{ fontSize:"1rem", lineHeight:1.65, color:INK }}>{Object.values(r.answers || {})[0]}</Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
    );
  }

  if (activity.result === "rounds") {
    const r = liveRound || 1;
    const t = tally[`r${r}`] || {};
    return (
      <Paper elevation={1} sx={{ p:3.2, border:`1px solid ${LINE}` }}>
        <SectionTag>Round {r} of {activity.rounds}</SectionTag>
        <Typography variant="h6" sx={{ mt:0.8, mb:3 }}>Who said it?</Typography>
        <Donut data={VOICES.map(v => ({ label:v, value:t[v] || 0 }))} />
      </Paper>
    );
  }

  if (activity.result === "deck") return <DeckPanel rows={rows} count={count} />;

  return (
    <Stack spacing={2.5}>
      {activity.questions.map(q => {
        const t = tally[q.key] || {};
        const options = q.options.map(opt);
        const max = Math.max(1, ...options.map(o => t[o.key] || 0));
        const top = [...options].sort((a,b)=>(t[b.key]||0)-(t[a.key]||0)).slice(0, q.exact || 2).map(o=>o.key);
        return (
          <Paper key={q.key} elevation={1} sx={{ p:3.2, border:`1px solid ${LINE}` }}>
            <Typography sx={{ fontWeight:700, fontSize:"1.02rem", lineHeight:1.5, mb:2.8, color:INK }}>{q.label}</Typography>
            {options.map(o => (
              <BarRow key={o.key} label={o.label} value={t[o.key] || 0} total={max}
                highlight={top.includes(o.key) && (t[o.key] || 0) > 0} />
            ))}
            {activity.reveal?.[q.key] && (
              <Box sx={{ mt:2.5, p:2, borderRadius:2.5, background:INK, display:"flex", alignItems:"center", gap:2 }}>
                <Typography variant="overline" sx={{ color:PINK }}>The real number</Typography>
                <Typography sx={{ color:"#fff", fontWeight:800, fontSize:"1.7rem", lineHeight:1 }}>{activity.reveal[q.key]}</Typography>
              </Box>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

function DeckPanel({ rows, count }) {
  const [busy, setBusy]   = useState(false);
  const [spec, setSpec]   = useState(null);
  const [err, setErr]     = useState("");
  const [dl, setDl]       = useState(false);

  const byFunction = useMemo(() => {
    const m = {};
    rows.forEach(r => { const f = r.answers?.fn || "Unknown"; m[f] = (m[f] || 0) + 1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  }, [rows]);

  const behaviourTally = useMemo(() => {
    const t = {};
    rows.forEach(r => (r.answers?.behaviours || []).forEach(b => { t[b] = (t[b] || 0) + 1; }));
    return t;
  }, [rows]);

  const generate = async () => {
    setBusy(true); setErr(""); setSpec(null);
    try {
      const res = await fetch(`${API_URL}/ai/deck`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ responses: rows }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setSpec(d);
    } catch (e) { setErr(e.message || "Generation failed."); }
    setBusy(false);
  };

  const download = async () => {
    setDl(true);
    try { await buildDeckPptx(spec); }
    catch (e) { setErr("Could not build the file: " + e.message); }
    setDl(false);
  };

  const maxB = Math.max(1, ...Object.values(behaviourTally));

  return (
    <Stack spacing={2.5}>
      <Paper elevation={1} sx={{ p:3, border:`1px solid ${LINE}`, background:`linear-gradient(100deg, ${BLUSH}, #fff 60%)` }}>
        <Box sx={{ display:"flex", alignItems:"center", gap:2, flexWrap:"wrap" }}>
          <Box sx={{ flex:1, minWidth:240 }}>
            <SectionTag>Not shown in the room</SectionTag>
            <Typography variant="h6" sx={{ mt:0.6, mb:0.8 }}>Build the "What you told us" deck</Typography>
            <Typography sx={{ color:MUTED, fontSize:"0.88rem", lineHeight:1.7 }}>
              Seven slides from these answers, in session branding. Run this at the break.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.2}>
            <Button variant={spec ? "outlined" : "contained"} size="large" onClick={generate} disabled={busy || count === 0}
              startIcon={busy ? <CircularProgress size={16} sx={{ color: spec ? MAROON : "#fff" }}/> : <AutoAwesomeIcon/>}>
              {busy ? "Analysing…" : spec ? "Regenerate" : "Generate deck"}
            </Button>
            {spec && (
              <Button variant="contained" size="large" onClick={download} disabled={dl}
                startIcon={dl ? <CircularProgress size={16} sx={{ color:"#fff" }}/> : <DownloadIcon/>}>
                Download .pptx
              </Button>
            )}
          </Stack>
        </Box>
        {busy && <LinearProgress sx={{ mt:2.5 }} />}
        {err && <Typography sx={{ color:FLAME, fontSize:"0.85rem", mt:2, fontWeight:600 }}>{err}</Typography>}
        {spec?.summary && (
          <Box sx={{ mt:2.8, p:2.4, borderRadius:3, background:"#fff", border:`1px solid ${PINK}` }}>
            <Box sx={{ display:"flex", alignItems:"center", gap:1, mb:1 }}>
              <BoltIcon sx={{ fontSize:16, color:MAGENTA }} />
              <SectionTag color={MAROON}>Sanity check before you send it</SectionTag>
            </Box>
            <Typography sx={{ whiteSpace:"pre-wrap", fontSize:"0.92rem", lineHeight:1.8, color:INK }}>{spec.summary}</Typography>
            <Divider sx={{ my:2 }} />
            <Typography sx={{ fontSize:"0.78rem", color:MUTED, lineHeight:1.7 }}>
              Check: n on slide 1 matches {count}. Bar totals equal {count * 2}. No names anywhere. The acquiring company is not named.
              Slides 4 and 7 carry no function labels.
            </Typography>
          </Box>
        )}
      </Paper>

      <Box sx={{ display:"grid", gap:2.5, gridTemplateColumns:{ xs:"1fr", md:"1fr 1fr" } }}>
        <Paper elevation={1} sx={{ p:3, border:`1px solid ${LINE}` }}>
          <SectionTag>Behaviours picked</SectionTag>
          <Typography variant="h6" sx={{ mt:0.6, mb:2.6 }}>Where the room agrees</Typography>
          {BEHAVIOURS.map(b => (
            <BarRow key={b.key} label={b.label} value={behaviourTally[b.key] || 0} total={maxB}
              highlight={(behaviourTally[b.key] || 0) === maxB && maxB > 0} />
          ))}
          <Typography sx={{ fontSize:"0.75rem", color:MUTED, mt:1.5 }}>
            Total picks: {Object.values(behaviourTally).reduce((a,b)=>a+b,0)} · expected {count * 2}
          </Typography>
        </Paper>

        <Paper elevation={1} sx={{ p:3, border:`1px solid ${LINE}` }}>
          <SectionTag>Coverage</SectionTag>
          <Typography variant="h6" sx={{ mt:0.6, mb:2.6 }}>Functions responded</Typography>
          <Stack spacing={1.2}>
            {byFunction.map(([f, n]) => (
              <Box key={f} sx={{ display:"flex", alignItems:"center", gap:1.5, py:0.9, borderBottom:`1px solid ${LINE}` }}>
                <CheckCircleIcon sx={{ fontSize:17, color:MAGENTA }} />
                <Typography sx={{ flex:1, fontSize:"0.9rem", fontWeight:600, color:INK }}>{f}</Typography>
                <Chip size="small" label={n} sx={{ background:BLUSH, color:MAROON }} />
              </Box>
            ))}
            {byFunction.length === 0 && <Typography sx={{ color:MUTED, fontSize:"0.88rem" }}>No responses yet.</Typography>}
          </Stack>
          <Divider sx={{ my:2.2 }} />
          <Typography sx={{ fontSize:"0.8rem", color:MUTED, lineHeight:1.7 }}>
            Answers stay anonymous. Function labels appear on slides 3 and 5 only.
          </Typography>
        </Paper>
      </Box>
    </Stack>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   10 · ROOT
───────────────────────────────────────────────────────────────────────────── */
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const scanned = (params.get("s") || "").toUpperCase();

  const [view, setView] = useState(() => {
    if (scanned) return "join";
    if (localStorage.getItem("fp_pid")) return "join";
    if (localStorage.getItem("fp_host") && localStorage.getItem("fp_host_token")) return "host";
    return "landing";
  });

  const exit = useCallback(() => {
    window.history.replaceState({}, "", window.location.pathname);
    setView("landing");
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {view === "landing" && <Landing go={setView} />}
      {view === "join"    && <Participant initialCode={scanned} onExit={exit} />}
      {view === "host"    && <Dashboard onExit={exit} />}
    </ThemeProvider>
  );
}