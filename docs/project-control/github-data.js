const OWNER = 'ldchung851010';
const REPO = 'Enpal-extension';
const BRANCH = 'main';

const RAW_ROOT = `https://raw.githubusercontent.com/${OWNER}/${REPO}`;
const RAW_BASE = `${RAW_ROOT}/${BRANCH}`;
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

const SOURCES = Object.freeze({
  plan: {
    label: 'implementation plan',
    path: 'docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md'
  },
  englishSpec: {
    label: 'English technical spec',
    path: 'docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md'
  },
  vietnameseSpec: {
    label: 'Vietnamese technical spec',
    path: 'docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec-vi.md'
  }
});

async function fetchText(fetchImpl, source, now, ref = BRANCH) {
  const sourceUrl = `${RAW_ROOT}/${ref}/${source.path}`;
  const freshUrl = `${sourceUrl}?v=${now()}`;
  const response = await fetchImpl(freshUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${source.label}: HTTP ${response.status ?? 'unknown'}`);
  }
  return response.text();
}

export function createGithubDataClient({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let latestMainSha = '';
  const currentRef = () => latestMainSha || BRANCH;

  return {
    loadPlan() {
      return fetchText(fetchImpl, SOURCES.plan, now, currentRef());
    },

    loadEnglishSpec() {
      return fetchText(fetchImpl, SOURCES.englishSpec, now, currentRef());
    },

    loadVietnameseSpec() {
      return fetchText(fetchImpl, SOURCES.vietnameseSpec, now, currentRef());
    },

    async loadRecentCommits() {
      const response = await fetchImpl(`${API_BASE}/commits?per_page=8`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) {
        throw new Error(`Failed to load recent commits: HTTP ${response.status ?? 'unknown'}`);
      }

      const items = await response.json();
      if (items[0]?.sha) latestMainSha = items[0].sha;
      return items.map((item) => ({
        sha: item.sha.slice(0, 7),
        message: String(item.commit?.message ?? '').split('\n')[0],
        date: item.commit?.author?.date ?? '',
        url: item.html_url
      }));
    }
  };
}

export const PROJECT_LINKS = Object.freeze({
  repository: `https://github.com/${OWNER}/${REPO}`,
  implementationPlan: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md`,
  englishSpec: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md`,
  vietnameseSpec: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec-vi.md`,
  audit: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/docs/superpowers/specs/2026-09-20-enpal-v1-multirole-audit.md`,
  auditClosure: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/docs/superpowers/specs/2026-09-20-enpal-v1-audit-closure.md`
});
