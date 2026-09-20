import { parseImplementationPlan, parseDocumentStatus } from './parser.js';
import { createGithubDataClient, PROJECT_LINKS } from './github-data.js';

function chooseCurrentTask(tasks) {
  return tasks.find((task) => task.status === 'IN PROGRESS')
    ?? tasks.find((task) => task.status === 'BLOCKED')
    ?? tasks.find((task) => task.status === 'NOT STARTED')
    ?? null;
}

export function deriveDashboardState({
  planMarkdown = '',
  enSpecMarkdown = '',
  viSpecMarkdown = '',
  commits = [],
  lastUpdated = null
}) {
  const parsed = parseImplementationPlan(planMarkdown);
  const completedTasks = parsed.tasks.filter((task) => task.status === 'DONE').length;
  const blockers = parsed.tasks.filter((task) => task.status === 'BLOCKED');
  const acceptanceTasks = parsed.tasks.filter((task) => task.number >= 14 && task.number <= 16);

  return {
    overallPercent: parsed.implementation.percent,
    completedSteps: parsed.implementation.completed,
    totalSteps: parsed.implementation.total,
    completedTasks,
    totalTasks: parsed.tasks.length,
    currentTask: chooseCurrentTask(parsed.tasks),
    tasks: parsed.tasks,
    gates: parsed.gates,
    blockers,
    acceptanceTasks,
    englishSpecStatus: parseDocumentStatus(enSpecMarkdown, 'en'),
    vietnameseSpecStatus: parseDocumentStatus(viSpecMarkdown, 'vi'),
    commits,
    lastUpdated
  };
}

function errorMessage(result) {
  return result.status === 'rejected'
    ? (result.reason?.message ?? String(result.reason))
    : null;
}

export function createDashboardController({
  client,
  onState = () => {},
  onWarning = () => {},
  now = () => new Date()
}) {
  const sources = {
    planMarkdown: '',
    enSpecMarkdown: '',
    viSpecMarkdown: '',
    commits: []
  };

  let lastState = null;

  function emit(warnings = []) {
    lastState = deriveDashboardState({
      ...sources,
      lastUpdated: now().toISOString()
    });
    onState(lastState);
    onWarning(warnings.filter(Boolean).join(' · '));
    return lastState;
  }

  async function refreshDocuments() {
    const results = await Promise.allSettled([
      client.loadPlan(),
      client.loadEnglishSpec(),
      client.loadVietnameseSpec()
    ]);
    const keys = ['planMarkdown', 'enSpecMarkdown', 'viSpecMarkdown'];
    const warnings = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sources[keys[index]] = result.value;
      } else {
        warnings.push(errorMessage(result));
      }
    });

    return emit(warnings);
  }

  async function refreshCommits() {
    const result = await Promise.allSettled([client.loadRecentCommits()]);
    const warnings = [];
    if (result[0].status === 'fulfilled') {
      sources.commits = result[0].value;
    } else {
      warnings.push(errorMessage(result[0]));
    }
    return emit(warnings);
  }

  async function refreshAll() {
    const results = await Promise.allSettled([
      client.loadPlan(),
      client.loadEnglishSpec(),
      client.loadVietnameseSpec(),
      client.loadRecentCommits()
    ]);
    const keys = ['planMarkdown', 'enSpecMarkdown', 'viSpecMarkdown', 'commits'];
    const warnings = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sources[keys[index]] = result.value;
      } else {
        warnings.push(errorMessage(result));
      }
    });

    return emit(warnings);
  }

  return {
    refreshAll,
    refreshDocuments,
    refreshCommits,
    getState: () => lastState
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusClass(status) {
  return String(status).toLowerCase().replaceAll(' ', '-');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function renderTasks(tasks) {
  return tasks.map((task) => `
    <article class="task-card ${statusClass(task.status)}">
      <div class="task-card__top">
        <span class="task-number">${String(task.number).padStart(2, '0')}</span>
        <span class="status-pill ${statusClass(task.status)}">${escapeHtml(task.status)}</span>
      </div>
      <h3>${escapeHtml(task.title)}</h3>
      <div class="mini-progress" aria-label="${task.percent}%">
        <span style="width:${task.percent}%"></span>
      </div>
      <div class="task-meta">
        <span>${task.completed}/${task.total} bước</span>
        <strong>${task.percent}%</strong>
      </div>
      ${task.blocker ? `<p class="blocker-copy">${escapeHtml(task.blocker)}</p>` : ''}
    </article>
  `).join('');
}

function renderGates(gates) {
  if (!gates.items.length) return '<p class="empty">Chưa có gate dạng checklist.</p>';
  return gates.items.map((gate) => `
    <li class="gate-item ${gate.completed ? 'done' : ''}">
      <span class="gate-check">${gate.completed ? '✓' : '○'}</span>
      <span>${escapeHtml(gate.label)}</span>
    </li>
  `).join('');
}

function renderCommits(commits) {
  if (!commits.length) return '<p class="empty">Chưa tải được hoạt động gần đây.</p>';
  return commits.map((commit) => `
    <a class="commit-row" href="${escapeHtml(commit.url)}" target="_blank" rel="noreferrer">
      <code>${escapeHtml(commit.sha)}</code>
      <span class="commit-message">${escapeHtml(commit.message)}</span>
      <time>${formatDate(commit.date)}</time>
    </a>
  `).join('');
}

function renderBlockers(blockers) {
  if (!blockers.length) return '<p class="empty success-copy">Không có blocker đang được ghi nhận.</p>';
  return blockers.map((task) => `
    <div class="blocker-row">
      <strong>Task ${task.number}</strong>
      <span>${escapeHtml(task.blocker)}</span>
    </div>
  `).join('');
}

function renderAcceptance(tasks) {
  if (!tasks.length) return '<p class="empty">Chưa có dữ liệu acceptance.</p>';
  return tasks.map((task) => `
    <div class="acceptance-row">
      <div>
        <strong>Task ${task.number}</strong>
        <span>${escapeHtml(task.title)}</span>
      </div>
      <span class="status-pill ${statusClass(task.status)}">${escapeHtml(task.status)}</span>
    </div>
  `).join('');
}

export function renderDashboard(state, root = document) {
  root.querySelector('#overall-percent').textContent = `${state.overallPercent}%`;
  root.querySelector('#overall-progress').style.width = `${state.overallPercent}%`;
  root.querySelector('#step-count').textContent = `${state.completedSteps} / ${state.totalSteps}`;
  root.querySelector('#task-count').textContent = `${state.completedTasks} / ${state.totalTasks}`;
  root.querySelector('#current-task').textContent = state.currentTask
    ? `Task ${state.currentTask.number}: ${state.currentTask.title}`
    : 'Không còn task đang chờ';
  root.querySelector('#last-refresh').textContent = formatDate(state.lastUpdated);
  root.querySelector('#tasks-grid').innerHTML = renderTasks(state.tasks);
  root.querySelector('#gates-list').innerHTML = renderGates(state.gates);
  root.querySelector('#gate-summary').textContent = `${state.gates.completed}/${state.gates.total} hoàn tất`;
  root.querySelector('#spec-en-status').textContent = state.englishSpecStatus;
  root.querySelector('#spec-vi-status').textContent = state.vietnameseSpecStatus;
  root.querySelector('#blockers-list').innerHTML = renderBlockers(state.blockers);
  root.querySelector('#acceptance-list').innerHTML = renderAcceptance(state.acceptanceTasks);
  root.querySelector('#commits-list').innerHTML = renderCommits(state.commits);
}

function setWarning(message, root = document) {
  const element = root.querySelector('#refresh-warning');
  element.hidden = !message;
  element.textContent = message ? `Không thể cập nhật một phần dữ liệu mới: ${message}` : '';
}

function bindLinks(root = document) {
  const links = {
    'repo-link': PROJECT_LINKS.repository,
    'plan-link': PROJECT_LINKS.implementationPlan,
    'spec-en-link': PROJECT_LINKS.englishSpec,
    'spec-vi-link': PROJECT_LINKS.vietnameseSpec,
    'audit-link': PROJECT_LINKS.audit,
    'audit-closure-link': PROJECT_LINKS.auditClosure
  };
  Object.entries(links).forEach(([id, href]) => {
    const element = root.querySelector(`#${id}`);
    if (element) element.href = href;
  });
}

if (typeof document !== 'undefined') {
  const client = createGithubDataClient();
  const controller = createDashboardController({
    client,
    onState: (state) => renderDashboard(state),
    onWarning: (message) => setWarning(message)
  });

  const start = async () => {
    bindLinks();
    const refreshButton = document.querySelector('#refresh-now');
    refreshButton.addEventListener('click', async () => {
      refreshButton.disabled = true;
      try {
        await controller.refreshAll();
      } finally {
        refreshButton.disabled = false;
      }
    });

    await controller.refreshAll();
    setInterval(() => controller.refreshDocuments(), 60_000);
    setInterval(() => controller.refreshCommits(), 300_000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
