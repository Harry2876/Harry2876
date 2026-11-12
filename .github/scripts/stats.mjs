// Generates minimal light/dark stats cards from the GitHub GraphQL API.
// Env: GH_TOKEN (personal access token with repo + read:user), LOGIN, MOCK=1 (offline preview)
import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.LOGIN || "Harry2876";
const TOKEN = process.env.GH_TOKEN;
const OUT = process.env.OUT_DIR || "assets";
const YEAR = new Date().getUTCFullYear();

const QUERY = `
query($login: String!, $from: DateTime!) {
  user(login: $login) {
    thisYear: contributionsCollection(from: $from) {
      totalCommitContributions
      restrictedContributionsCount
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      totalCount
      nodes {
        languages(first: 6, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function load() {
  if (process.env.MOCK) {
    return {
      contributions: 681, commits: 640, yearCommits: 590, prs: 4, repos: 115,
      langs: [
        { name: "TypeScript", color: "#3178c6", size: 380 },
        { name: "Kotlin", color: "#A97BFF", size: 290 },
        { name: "Java", color: "#b07219", size: 150 },
        { name: "JavaScript", color: "#f1e05a", size: 110 },
        { name: "Python", color: "#3572A5", size: 70 },
      ],
    };
  }
  if (!TOKEN) throw new Error("GH_TOKEN is missing");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN, from: `${YEAR}-01-01T00:00:00Z` } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error("GraphQL error: " + JSON.stringify(json.errors || json));
  const u = json.data.user;
  const cc = u.contributionsCollection;
  const map = new Map();
  for (const repo of u.repositories.nodes)
    for (const e of repo.languages.edges) {
      const cur = map.get(e.node.name) || { name: e.node.name, color: e.node.color || "#8b949e", size: 0 };
      cur.size += e.size;
      map.set(e.node.name, cur);
    }
  const ignore = new Set(["HTML", "CSS", "SCSS", "Shell", "Dockerfile", "Makefile", "Batchfile"]);
  const langs = [...map.values()].filter((l) => !ignore.has(l.name)).sort((a, b) => b.size - a.size).slice(0, 5);
  return {
    contributions: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
    yearCommits: u.thisYear.totalCommitContributions + u.thisYear.restrictedContributionsCount,
    prs: cc.totalPullRequestContributions,
    repos: u.repositories.totalCount,
    langs,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => Number(n).toLocaleString("en-US");

const ease = (x) => 1 - Math.pow(1 - x, 3);

// Count-up: many short-lived <text> frames, then the final value stays.
function countUp(value, x, y, delay) {
  const N = 16, dt = 0.06;
  let out = "";
  for (let k = 0; k < N; k++) {
    const v = Math.round(value * ease(k / N));
    out += `<text x="${x}" y="${y}" class="num k" style="animation-delay:${(delay + k * dt).toFixed(2)}s;animation-duration:${dt}s">${fmt(v)}</text>`;
  }
  out += `<text x="${x}" y="${y}" class="num fin" style="animation-delay:${(delay + N * dt).toFixed(2)}s">${fmt(value)}</text>`;
  return out;
}

function card(d, t) {
  const W = 800, H = 214, X = 40, IW = W - 2 * X;
  const stats = [
    [d.contributions, "contributions (12 mo)"],
    [d.commits, "commits (12 mo)"],
    [d.yearCommits, `commits in ${YEAR}`],
    [d.prs, "pull requests"],
    [d.repos, "repositories"],
  ];
  const total = d.langs.reduce((s, l) => s + l.size, 0) || 1;
  let x = X, bar = "", legend = "";
  const slot = IW / Math.max(d.langs.length, 1);
  d.langs.forEach((l, i) => {
    const w = (l.size / total) * IW;
    bar += `<rect x="${x.toFixed(1)}" y="132" width="${w.toFixed(1)}" height="8" fill="${l.color}"/>`;
    x += w;
    const lx = X + i * slot;
    legend += `<g class="pop" style="animation-delay:${(1.4 + i * 0.12).toFixed(2)}s"><circle cx="${(lx + 5).toFixed(1)}" cy="166" r="5" fill="${l.color}"/>` +
      `<text x="${(lx + 16).toFixed(1)}" y="170" class="lg">${esc(l.name)} <tspan class="mu">${Math.round((l.size / total) * 100)}%</tspan></text></g>`;
  });
  const cols = stats.map(([n, label], i) => {
    const cx = X + i * (IW / stats.length), delay = 0.15 + i * 0.12;
    return `<g class="pop" style="animation-delay:${delay.toFixed(2)}s"><text x="${cx}" y="90" class="lb">${esc(label)}</text></g>` + countUp(n, cx, 68, delay);
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(LOGIN)}">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.num{font-size:30px;font-weight:700;fill:${t.fg}}
.lb{font-size:12px;fill:${t.mu}}
.lg{font-size:13px;fill:${t.fg}}
.mu{fill:${t.mu}}
.ft{font-size:11px;fill:${t.mu}}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .7s cubic-bezier(.2,1.5,.4,1) both}
@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1;transform:none}}
.k{opacity:0;animation-name:tick;animation-timing-function:linear;animation-fill-mode:forwards}
@keyframes tick{0%{opacity:1}98%{opacity:1}100%{opacity:0}}
.fin{animation:show .01s both}
@keyframes show{from{opacity:0}to{opacity:1}}
.fade{animation:show .8s ease-out both}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.bd}"/>
${cols}
<line x1="${X}" y1="108" x2="${W - X}" y2="108" stroke="${t.bd}"/>
<clipPath id="c"><rect x="${X}" y="132" width="${IW}" height="8" rx="4"><animate attributeName="width" values="0;0;${IW}" keyTimes="0;0.25;1" dur="2.2s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.2 1"/></rect></clipPath>
<g clip-path="url(#c)"><rect x="${X}" y="132" width="${IW}" height="8" fill="${t.bd}"/>${bar}</g>
${legend}
<text x="${X}" y="198" class="ft fade" style="animation-delay:2s">Most used languages · includes private repositories · updated daily</text>
</svg>`;
}

// Rotating one-line ticker with a pulsing "live" dot.
function ticker(d, t) {
  const W = 800, H = 44, per = 3.5;
  const facts = [
    [fmt(d.commits), "commits in the last 12 months"],
    [d.langs[0]?.name || "TypeScript", "is my most used language"],
    ["5", "IndiaSkills awards across two editions"],
    ["Live graphics", "at BGMS 2026 Grand Finals"],
    [fmt(d.yearCommits), `commits so far in ${YEAR}`],
  ];
  const total = per * facts.length;
  const items = facts.map(([b, rest], i) =>
    `<text x="52" y="28" class="f" style="animation-delay:${(i * per).toFixed(1)}s"><tspan class="b">${esc(b)}</tspan> ${esc(rest)}</text>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rotating highlights">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:16px}
.f{fill:${t.mu};opacity:0;animation:slide ${total}s infinite}
.b{fill:${t.fg};font-weight:700}
@keyframes slide{0%{opacity:0;transform:translateY(10px)}4%,17%{opacity:1;transform:translateY(0)}21%,100%{opacity:0;transform:translateY(-10px)}}
</style>
<circle cx="30" cy="22" r="4" fill="#2da44e"/>
<circle cx="30" cy="22" r="4" fill="none" stroke="#2da44e" stroke-width="2"><animate attributeName="r" values="4;13" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite"/></circle>
${items}
</svg>`;
}

const d = await load();
mkdirSync(OUT, { recursive: true });
const themes = {
  light: { fg: "#1f2328", mu: "#656d76", bd: "#d0d7de" },
  dark: { fg: "#e6edf3", mu: "#8b949e", bd: "#30363d" },
};
for (const [name, t] of Object.entries(themes)) {
  writeFileSync(`${OUT}/stats-${name}.svg`, card(d, t));
  writeFileSync(`${OUT}/ticker-${name}.svg`, ticker(d, t));
}
console.log("Stats written:", JSON.stringify({ ...d, langs: d.langs.map((l) => l.name) }));
