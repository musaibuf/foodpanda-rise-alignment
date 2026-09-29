/* ============================================================================
   RISE Alignment · load test
   Simulates leaders joining a live room on their phones and answering.

   node loadtest.js HKMD                 follow the facilitator (default)
   node loadtest.js HKMD --now           answer all seven activities straight away
   options:  --people 35   --fast   --url https://your-backend.onrender.com

   Follow mode: open activities on the dashboard as normal; the bots answer
   whatever is live, a few seconds apart, like real phones. Ctrl+C to stop.
============================================================================ */
const { io } = require("socket.io-client");

/* ── options ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const CODE   = (args.find(a => /^[A-Za-z0-9]{4}$/.test(a)) || "").toUpperCase();
const URL    = opt("url", "https://foodpanda-rise-alignment-backend.onrender.com").replace(/\/+$/, "");
const PEOPLE = Math.max(1, Math.min(200, parseInt(opt("people", "35"), 10) || 35));
const NOW    = flag("now");
const FAST   = flag("fast") || NOW;

if (!CODE) {
  console.log("Usage: node loadtest.js ROOMCODE [--now] [--people 35] [--fast] [--url https://...]");
  process.exit(1);
}

/* ── realistic answer pools ──────────────────────────────────────────────── */
const NAMES = ["Sara","Hamza","Ayesha","Bilal","Zainab","Omar","Fatima","Usman","Mahnoor","Ali","Hira","Kamran","Nida","Faraz",
  "Rabia","Saad","Amna","Danish","Sana","Haris","Maryam","Talha","Iqra","Zeeshan","Anam","Fahad","Komal","Shahzaib","Mehwish",
  "Asad","Laiba","Waqas","Sidra","Junaid","Hina","Adeel","Noor","Imran","Kiran","Taimoor"];

const HEADLINES = [
  "foodpanda Pakistan becomes the country's most trusted delivery brand",
  "Riders earn more and churn less as quick commerce turns profitable",
  "The team that made every rupee count",
  "From efficiency drive to growth engine: how foodpanda turned it around",
  "Pakistan's best place to build a tech career",
  "Customers stop comparing prices because the service wins",
  "Quick commerce live in 20 cities and profitable in all of them",
  "foodpanda leaders made the hard calls early and it paid off",
  "Merchants call foodpanda their growth partner, not a platform",
  "The leanest, fastest operations team in the region",
  "A culture of ownership drives record customer NPS",
  "foodpanda proves you can grow and stay efficient at the same time",
  "Every order on time, every rider respected",
  "foodpanda Pakistan named top employer for young talent",
  "The pandamart that beat the corner shop on speed",
  "Leaders who explained the why, and teams who delivered",
  "foodpanda Pakistan hits profitability a year early",
  "Data-driven decisions cut delivery times by a third",
  "From 30 minutes to 15: the quick commerce story",
  "Small merchants double revenue on foodpanda",
  "The company that kept its people through the change",
  "foodpanda becomes the default app for groceries in Karachi",
  "Trust rebuilt: riders, merchants and customers all say yes",
  "Decisions made in hours, not weeks",
  "foodpanda Pakistan leads the region on customer satisfaction",
  "A leaner foodpanda, and a happier one",
  "How a clear strategy turned uncertainty into momentum",
  "foodpanda's middle managers become its biggest strength",
  "Pakistan's delivery leader, and still growing",
  "foodpanda sets the standard for rider welfare",
  "we stoped doing too many things and won at the few that matter",   // typo on purpose
  "The team everyone wants to join",
  "foodpanda Pakistan: fast, fair and profitable",
  "Commercial discipline and customer love, finally together",
  "foodpanda grows while the market shrinks",
];

const B = ["prioritisation","ownership","translation","aidata","commercial","leading"];
const B_WEIGHT = [30, 25, 15, 8, 10, 12];
const FUNCTIONS = ["Logistics","Human Resources","Marketplace Experience","Finance","Commercial","Quick Commerce",
  "Marketing","MD Office","Public Affairs and PR","CEO Office","Other"];
const MISSING = [
  "Regulatory foresight: reading policy shifts before they land",
  "Scenario modelling under uncertainty",
  "Negotiation with large merchants",
  "Rider community management",
  "Crisis communication",
];
const GOOD = {
  prioritisation: ["A clear stop list agreed at the start of every sprint", "We drop two projects to fund one that matters",
    "Everyone knows the top three priorities without asking"],
  ownership: ["Riders reallocated between zones without waiting for HQ sign-off", "Managers make the call and tell us after",
    "Deals closed inside the guardrail without escalation"],
  translation: ["Managers explain the change in their own words", "Teams can say why we are doing this, not just what",
    "A one-page brief after every leadership decision"],
  aidata: ["Weekly demand forecasts actually used to plan shifts", "We test pricing changes with data before rollout",
    "Dashboards replace gut feel in the Monday review"],
  commercial: ["We know the cost of a scenario before we commit", "Every campaign has a margin target, not just volume",
    "Managers can explain the unit economics of their area"],
  leading: ["Leaders coach instead of doing the work themselves", "Team leads own delivery so managers can think ahead",
    "Capacity is discussed openly before new work is added"],
};
const STUCK = [
  "Two teams were chasing the same KPI with different definitions and nobody would make the call. It sat for three weeks until the MD stepped in.",
  "A pricing change needed sign-off from four people. By the time everyone agreed, the competitor had already moved.",
  "We were told everything is a priority. The team worked late for a month and delivered three things badly instead of one well.",
  "Marketing and Commercial both wanted the same budget for different campaigns. It was escalated twice and decided by default when the quarter ended.",
  "A rider incentive change was agreed locally but reversed centrally without explanation. The team stopped trusting local decisions.",
  "With the merger talk going on, everyone waited. Nobody wanted to commit to a plan that might change next month.",
  "We launched a new zone without enough riders because the ops and growth targets were never reconciled.",
  "A vendor contract decision stalled because finance and legal each assumed the other owned it.",
  "My team built a feature that was deprioritised two days before launch. Nobody told us why.",
  "Headcount was frozen but the targets were not. Managers had to choose what to drop and got blamed either way.",
  "An urgent regulatory request landed on three desks and each assumed someone else was handling it.",
  "We spent two weeks on a deck for a decision that was already made.",
];
const MESSAGES = [
  "Tell us plainly what the pending transaction means for our roles",
  "Name what stops, not only what starts",
  "Where does the efficiency agenda end?",
  "How will decisions be made in the interim?",
  "Is growth still a priority or only cost?",
  "Be honest about headcount",
  "Explain the economics behind the targets",
  "We need a timeline, even a rough one",
  "Who decides now?",
  "Say what stays the same",
  "Your effort is seen and it matters",
  "It is okay to push back on priorities",
];
const QUESTIONS = [
  "Are we next in line for cuts?", "What does the transaction mean for my job?", "Why should I stay?",
  "Who actually decides now?", "Will my bonus survive the efficiency drive?", "What stops so we can do this?",
  "Is growth still a priority?", "How long will the uncertainty last?", "Do you know more than you're telling us?",
  "What happens to our team if the plan changes again?", "Will promotions be frozen this year?",
  "Why are we still hiring in some teams and not others?", "Can we trust the numbers we are being given?",
  "What does success look like by December?", "Are the targets realistic with fewer people?",
  "Will the new owners keep the current leadership?", "Are we going to be merged with another team?",
  "Why do decisions keep changing after they are announced?", "How do I explain this to my riders?",
  "What happens to the projects we already started?",
];
const CHANGES = [
  "I will say what we are stopping, every Monday, in writing.",
  "I will stop joining calls my managers can run without me.",
  "I will share the monthly economics with my whole team.",
  "I will make one decision a week that I would normally escalate.",
  "I will hold a fortnightly open Q&A with no slides.",
  "I will coach, not fix, when my leads bring problems.",
  "I will name one priority we are dropping this quarter.",
  "I will publish decision rights for my function by the end of the month.",
  "I will stop sending late-night messages.",
  "I will give my team the real numbers, good and bad.",
  "I will run a skip-level with every team in 30 days.",
  "I will ask what should stop before approving anything new.",
  "I will explain the why behind every change before the what.",
  "I will protect one afternoon a week for my team's development.",
  "I will review capacity openly before we take on new work, and say no when we are full, even when it is uncomfortable for me to say it to my own manager.",
];

/* ── helpers ─────────────────────────────────────────────────────────────── */
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const weighted = (items, weights) => {
  let t = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { t -= weights[i]; if (t <= 0) return items[i]; }
  return items[items.length - 1];
};
const pickDistinct = (items, weights, k) => {
  const out = []; const it = [...items], w = [...weights];
  while (out.length < k && it.length) { const x = weighted(it, w); const i = it.indexOf(x); out.push(x); it.splice(i, 1); w.splice(i, 1); }
  return out;
};
const BANDS = ["0-10%","11-20%","21-30%","31-40%","41-50%","51-60%","61-70%","71-80%","81-90%","91-100%"];
const bandAround = (centre) => BANDS[Math.max(0, Math.min(9, centre + Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 2.4)))];
const VOICE_BIAS = { 1: [60, 25, 15], 2: [20, 30, 50], 3: [10, 15, 75], 4: [35, 35, 30], 5: [20, 60, 20] };
const delay = (lo, hi) => (FAST ? 150 + rnd(900) : lo + rnd(hi - lo));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function answerFor(bot, activityId, round) {
  switch (activityId) {
    case 1: return { headline: HEADLINES[bot.i % HEADLINES.length] };
    case 2: return { q1: bandAround(4), q2: bandAround(3) };
    case 3: {
      const r = round || 1;
      return { [`r${r}`]: weighted(["Senior leader", "MD-2", "IC3"], VOICE_BIAS[r]) };
    }
    case 4: {
      const behaviours = pickDistinct(B, B_WEIGHT, 2);
      return {
        fn: bot.fn,
        behaviours,
        missing: Math.random() < 0.15 ? pick(MISSING) : "",
        good: pick(GOOD[behaviours[0]]),
        stuck: pick(STUCK),
        message: pick(MESSAGES),
      };
    }
    case 5: return { commitments: pickDistinct(["c1","c2","c3","c4","c5","c6"], [30, 26, 10, 18, 8, 16], 3) };
    case 6: return { q1: pick(QUESTIONS) };
    case 7: return { q1: CHANGES[bot.i % CHANGES.length] };
    default: return {};
  }
}

/* ── stats ───────────────────────────────────────────────────────────────── */
const stats = { joined: 0, submitted: {}, errors: 0, reconnects: 0 };
const bump = (k) => { stats.submitted[k] = (stats.submitted[k] || 0) + 1; };
let lastLine = "";
function report(force) {
  const act = [1, 2, 3, 4, 5, 6, 7].map(id => {
    const n = id === 3 ? Object.keys(stats.submitted).filter(k => k.startsWith("3:")).reduce((a, k) => a + stats.submitted[k], 0)
      : (stats.submitted[String(id)] || 0);
    return `A${id}:${n}`;
  }).join("  ");
  const line = `joined ${stats.joined}/${PEOPLE}   ${act}   errors ${stats.errors}   reconnects ${stats.reconnects}`;
  if (force || line !== lastLine) { console.log(`[${new Date().toLocaleTimeString()}] ${line}`); lastLine = line; }
}

/* ── one simulated phone ─────────────────────────────────────────────────── */
function makeBot(i) {
  const bot = {
    i, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""),
    fn: FUNCTIONS[i % FUNCTIONS.length], pid: null, done: new Set(), pending: new Set(), sock: null,
  };
  const sock = io(URL, { transports: ["websocket"], reconnection: true, reconnectionDelay: 800 });
  bot.sock = sock;

  const submit = (activityId, round) => {
    const key = activityId === 3 ? `3:${round || 1}` : String(activityId);
    if (bot.done.has(key) || bot.pending.has(key)) return;
    bot.pending.add(key);
    const typing = activityId === 4 ? delay(6000, 22000) : activityId === 7 ? delay(4000, 14000) : delay(1500, 9000);
    setTimeout(() => {
      bot.pending.delete(key);
      if (bot.done.has(key) || !bot.pid) return;
      sock.emit("response:submit", { code: CODE, participantId: bot.pid, activityId, answers: answerFor(bot, activityId, round) });
      bot.done.add(key); bump(key);
    }, typing);
  };

  sock.on("connect", () => {
    if (bot.pid) stats.reconnects++;
    sock.emit("participant:join", { code: CODE, name: bot.name, participantId: bot.pid || undefined });
  });
  sock.on("join:ok", ({ participantId, session, submitted }) => {
    const first = !bot.pid;
    bot.pid = participantId;
    (submitted || []).forEach(k => bot.done.add(String(k)));
    if (first) stats.joined++;
    if (!NOW && session?.liveActivity) submit(session.liveActivity, session.liveRound);
  });
  sock.on("join:error", (m) => { stats.errors++; if (i === 0) console.log(`Join failed: ${m}`); });
  sock.on("session:state", (s) => { if (!NOW && s?.liveActivity) submit(s.liveActivity, s.liveRound); });
  sock.on("session:reset", () => { bot.done.clear(); bot.pending.clear(); });
  sock.on("session:ended", () => { console.log("Session ended by the facilitator."); process.exit(0); });
  sock.on("connect_error", () => { stats.errors++; });
  return bot;
}

/* ── run ─────────────────────────────────────────────────────────────────── */
(async () => {
  console.log(`\nRISE Alignment load test`);
  console.log(`  room    ${CODE}`);
  console.log(`  server  ${URL}`);
  console.log(`  people  ${PEOPLE}`);
  console.log(`  mode    ${NOW ? "now: answering all seven activities straight away" : "follow: answering whatever the facilitator opens"}\n`);

  // waking a sleeping server can take a while
  try { const r = await fetch(`${URL}/api/health`); console.log(`  server health: ${r.status === 200 ? "ok" : r.status}\n`); }
  catch (e) { console.log(`  server health check failed: ${e.message}\n`); }

  const bots = [];
  for (let i = 0; i < PEOPLE; i++) { bots.push(makeBot(i)); await wait(FAST ? 40 : 120 + rnd(200)); }   // staggered, like people scanning
  const ticker = setInterval(() => report(false), 2000);

  for (let t = 0; t < 60 && stats.joined < PEOPLE; t++) await wait(500);
  report(true);
  if (stats.joined === 0) { console.log("\nNobody could join. Check the room code and that the session is running."); process.exit(1); }

  if (NOW) {
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const rounds = id === 3 ? [1, 2, 3, 4, 5] : [undefined];
      for (const r of rounds) {
        for (const b of bots) {
          if (!b.pid) continue;
          const key = id === 3 ? `3:${r}` : String(id);
          if (b.done.has(key)) continue;
          b.sock.emit("response:submit", { code: CODE, participantId: b.pid, activityId: id, answers: answerFor(b, id, r) });
          b.done.add(key); bump(key);
          await wait(15 + rnd(40));
        }
      }
      report(true);
    }
    await wait(1500);
    clearInterval(ticker);
    report(true);
    console.log("\nDone. All seven activities answered.");
    console.log("On the dashboard: Make presentation, and Download data (.xlsx).");
    console.log("The simulated leaders stay listed in the room until you End the session.\n");
    bots.forEach(b => b.sock.close());
    setTimeout(() => process.exit(0), 300);
    return;
  } else {
    console.log("\nFollowing the dashboard. Open activities as normal (and step through rounds on Whose Floor?).");
    console.log("Leave this running. Ctrl+C when you are done.\n");
  }

  process.on("SIGINT", () => { clearInterval(ticker); report(true); bots.forEach(b => b.sock.close()); console.log("\nStopped."); process.exit(0); });
})();