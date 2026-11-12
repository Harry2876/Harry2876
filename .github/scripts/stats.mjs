// Generates minimal light/dark stats cards from the GitHub GraphQL API.
// Env: GH_TOKEN (personal access token with repo + read:user), LOGIN, MOCK=1 (offline preview)
import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.LOGIN || "Harry2876";
const TOKEN = process.env.GH_TOKEN;
const OUT = process.env.OUT_DIR || "assets";

const QUERY = `
query($login: String!) {
  user(login: $login) {
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
      contributions: 1590, commits: 1240, prs: 11, repos: 52,
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
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
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
    prs: cc.totalPullRequestContributions,
    repos: u.repositories.totalCount,
    langs,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => Number(n).toLocaleString("en-US");

function card(d, t) {
  const W = 800, H = 214, X = 40, IW = W - 2 * X;
  const stats = [
    [fmt(d.contributions), "contributions, last year"],
    [fmt(d.commits), "commits, last year"],
    [fmt(d.prs), "pull requests"],
    [fmt(d.repos), "repositories"],
  ];
  const total = d.langs.reduce((s, l) => s + l.size, 0) || 1;
  let x = X, bar = "", legend = "";
  const slot = IW / Math.max(d.langs.length, 1);
  d.langs.forEach((l, i) => {
    const w = (l.size / total) * IW;
    bar += `<rect x="${x.toFixed(1)}" y="132" width="${w.toFixed(1)}" height="8" fill="${l.color}"/>`;
    x += w;
    const lx = X + i * slot;
    legend += `<circle cx="${(lx + 5).toFixed(1)}" cy="166" r="5" fill="${l.color}"/>` +
      `<text x="${(lx + 16).toFixed(1)}" y="170" class="lg">${esc(l.name)} <tspan class="mu">${Math.round((l.size / total) * 100)}%</tspan></text>`;
  });
  const cols = stats.map(([n, label], i) =>
    `<text x="${X + i * (IW / 4)}" y="68" class="num">${esc(n)}</text>` +
    `<text x="${X + i * (IW / 4)}" y="90" class="lb">${esc(label)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(LOGIN)}">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.num{font-size:30px;font-weight:700;fill:${t.fg}}
.lb{font-size:12px;fill:${t.mu}}
.lg{font-size:13px;fill:${t.fg}}
.mu{fill:${t.mu}}
.ft{font-size:11px;fill:${t.mu}}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.bd}"/>
${cols}
<line x1="${X}" y1="108" x2="${W - X}" y2="108" stroke="${t.bd}"/>
<clipPath id="c"><rect x="${X}" y="132" width="${IW}" height="8" rx="4"/></clipPath>
<g clip-path="url(#c)"><rect x="${X}" y="132" width="${IW}" height="8" fill="${t.bd}"/>${bar}</g>
${legend}
<text x="${X}" y="198" class="ft">Most used languages · includes private repositories · updated daily</text>
</svg>`;
}

const d = await load();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/stats-light.svg`, card(d, { fg: "#1f2328", mu: "#656d76", bd: "#d0d7de" }));
writeFileSync(`${OUT}/stats-dark.svg`, card(d, { fg: "#e6edf3", mu: "#8b949e", bd: "#30363d" }));
console.log("Stats written:", JSON.stringify({ ...d, langs: d.langs.map((l) => l.name) }));
