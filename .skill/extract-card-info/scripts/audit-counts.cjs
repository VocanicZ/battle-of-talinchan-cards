
const fs = require('fs');
const { execSync } = require('child_process');

function parseFile(content) {
  const cards = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '{') {
      let braceCount = 1;
      let j = i + 1;
      let inString = null;
      while (j < content.length && braceCount > 0) {
        const char = content[j];
        if (inString) {
          if (char === inString && content[j-1] !== '\\') inString = null;
        } else {
          if (char === '"' || char === "'") inString = char;
          else if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
        }
        j++;
      }
      const objStr = content.substring(i, j);
      if (objStr.includes('print:')) {
        const printMatch = objStr.match(/print:\s*["']([^"']+)["']/);
        if (printMatch) {
          cards.push({ print: printMatch[1], content: objStr });
        }
      }
      i = j;
    } else i++;
  }
  return cards;
}

const files = fs.readdirSync('src/cards').filter(f => f.endsWith('.ts') && f !== 'index.ts');
files.forEach(file => {
  const filePath = `src/cards/${file}`;
  const localContent = fs.readFileSync(filePath, 'utf8');
  let upstreamContent;
  try { upstreamContent = execSync(`git show origin/main:${filePath}`, { encoding: 'utf8' }); } catch (e) { return; }
  
  const localCards = parseFile(localContent);
  const upstreamCards = parseFile(upstreamContent);

  const localPrints = new Set(localCards.map(c => c.print));
  const upstreamPrints = new Set(upstreamCards.map(c => c.print));

  if (localPrints.size !== upstreamPrints.size) {
    console.log(`[COUNT MISMATCH] ${file}: Local ${localPrints.size}, Upstream ${upstreamPrints.size}`);
    const missing = [...upstreamPrints].filter(p => !localPrints.has(p));
    const extra = [...localPrints].filter(p => !upstreamPrints.has(p));
    if (missing.length) console.log(`  Missing in local: ${missing.join(', ')}`);
    if (extra.length) console.log(`  New in local: ${extra.join(', ')}`);
  }
});
console.log("Audit complete.");
