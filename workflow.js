export function validateProject(input) {
  const title = String(input.title || '').trim();
  const brief = String(input.brief || '').trim();
  const count = Number(input.count);
  const budget = Number(input.budget);
  if (!title || title.length > 120 || !brief || brief.length > 8000) throw new Error('Enter a title and a brief (up to 8,000 characters).');
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('Choose between 1 and 40 pages.');
  if (!Number.isFinite(budget) || budget < 0.1 || budget > 1000) throw new Error('Choose a budget between $0.10 and $1,000.');
  return { title, brief, count, budget };
}
export function reserve(project, amount) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid spending reservation.');
  if (project.reserved + amount > project.budget + 1e-8) throw new Error('Budget limit reached. Increase the limit to continue.');
  project.reserved = Math.round((project.reserved + amount) * 10000) / 10000;
}
export function pagePrompt(project, page) {
  return `Create one portrait coloring-book page. Black outlines on pure white, no shading, no grayscale, no text, no border. Clean closed shapes, coherent anatomy, no floating fragments, no stray strokes. Keep a generous blank margin. Book direction: ${project.brief}\nPage ${page.number}: ${page.idea}. ${page.feedback ? `Previous version needs these corrections: ${page.feedback}. Preserve the approved creative direction.` : ''}`;
}
