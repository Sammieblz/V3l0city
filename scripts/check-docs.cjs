const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const inside = (root, file) => file === root || file.startsWith(`${root}${path.sep}`);

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.isFile() && entry.name.endsWith('.md') ? [file] : [];
  });
}

// Examples in fenced/inline code are not navigation links. Balance parentheses
// so real repository paths such as src/app/(product)/page.tsx remain intact.
function linkTargets(markdown) {
  const text = markdown.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm, '')
    .replace(/(`+)[^`\n]*?\1/g, '');
  const targets = [];
  const inline = /!?\[[^\]\n]*\]\(\s*/g;
  let match;
  while ((match = inline.exec(text))) {
    const start = inline.lastIndex;
    if (text[start] === '<') {
      const end = text.indexOf('>', start + 1);
      if (end !== -1) targets.push(text.slice(start + 1, end));
      continue;
    }
    let depth = 0, index = start;
    for (; index < text.length; index++) {
      const character = text[index];
      if (character === '(') depth++;
      else if (character === ')') { if (depth === 0) break; depth--; }
      else if (/\s/.test(character) && depth === 0) break;
    }
    if (index > start) targets.push(text.slice(start, index));
  }
  for (const definition of text.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) {
    targets.push(definition[1] ?? definition[2]);
  }
  return targets;
}

function checkDocumentation(root) {
  root = path.resolve(root);
  const files = [path.join(root, 'README.md'), path.join(root, 'web/README.md'),
    ...markdownFiles(path.join(root, 'docs')), ...markdownFiles(path.join(root, '.github'))]
    .filter((file) => existsSync(file) && statSync(file).isFile());
  const failures = [];
  for (const file of files) {
    for (const target of linkTargets(readFileSync(file, 'utf8'))) {
      if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
      let local;
      try { local = decodeURIComponent(target.split(/[?#]/, 1)[0]); }
      catch { failures.push(`${path.relative(root, file)}: malformed link ${target}`); continue; }
      if (!local) continue;
      const destination = local.startsWith('/') ? path.resolve(root, `.${local}`) : path.resolve(path.dirname(file), local);
      if (!inside(root, destination) || !existsSync(destination)) {
        failures.push(`${path.relative(root, file)}: missing repository target ${target}`);
      }
    }
  }
  return { files: files.length, failures };
}

if (require.main === module) {
  const result = checkDocumentation(path.resolve(__dirname, '..'));
  for (const failure of result.failures) console.error(failure);
  console.log(`Checked local file targets in ${result.files} documentation files; ${result.failures.length} broken links.`);
  process.exitCode = result.failures.length ? 1 : 0;
}

module.exports = { checkDocumentation, linkTargets };
