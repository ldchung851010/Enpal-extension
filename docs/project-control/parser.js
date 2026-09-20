function countCheckboxes(text) {
  const matches = [...text.matchAll(/^\s*-\s*\[([ xX])\]\s+.+$/gm)];
  const completed = matches.filter((match) => match[1].toLowerCase() === 'x').length;
  return { completed, total: matches.length };
}

function percent(completed, total) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function deriveTaskStatus(completed, total, blocker) {
  if (blocker) return 'BLOCKED';
  if (total > 0 && completed === total) return 'DONE';
  if (completed > 0) return 'IN PROGRESS';
  return 'NOT STARTED';
}

function extractSection(markdown, headingPattern) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start === -1) return '';

  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#+\s+/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join('\n');
}

export function parseImplementationPlan(markdown) {
  const gateText = extractSection(markdown, /^##\s+Pre-Execution Gates\b/i);
  const gateMatches = [...gateText.matchAll(/^\s*-\s*\[([ xX])\]\s+(.+)$/gm)];
  const gateItems = gateMatches.map((match) => ({
    label: match[2].trim(),
    completed: match[1].toLowerCase() === 'x'
  }));
  const gateCounts = {
    completed: gateItems.filter((item) => item.completed).length,
    total: gateItems.length
  };
  const gates = {
    ...gateCounts,
    percent: percent(gateCounts.completed, gateCounts.total),
    items: gateItems
  };

  const taskHeading = /^###\s+Task\s+(\d+):\s*(.+?)\s*$/gm;
  const headings = [...markdown.matchAll(taskHeading)];
  const tasks = headings.map((heading, index) => {
    const sectionStart = heading.index + heading[0].length;
    const sectionEnd = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    const counts = countCheckboxes(section);
    const blockerMatch = section.match(/<!--\s*ENPAL_BLOCKED:\s*([^>]+?)\s*-->/i);
    const blocker = blockerMatch ? blockerMatch[1].trim() : null;

    return {
      number: Number(heading[1]),
      title: heading[2].trim(),
      completed: counts.completed,
      total: counts.total,
      percent: percent(counts.completed, counts.total),
      status: deriveTaskStatus(counts.completed, counts.total, blocker),
      blocker
    };
  });

  const completed = tasks.reduce((sum, task) => sum + task.completed, 0);
  const total = tasks.reduce((sum, task) => sum + task.total, 0);

  return {
    gates,
    tasks,
    implementation: {
      completed,
      total,
      percent: percent(completed, total)
    }
  };
}

export function parseDocumentStatus(markdown, language = 'en') {
  const pattern = language === 'vi'
    ? /^\*\*Trạng thái:\*\*\s*(.+?)\s*$/mi
    : /^\*\*Status:\*\*\s*(.+?)\s*$/mi;
  const match = markdown.match(pattern);
  return match ? match[1].trim() : 'UNKNOWN';
}
