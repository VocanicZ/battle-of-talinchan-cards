
const fs = require('fs');
const { execSync } = require('child_process');

// Rarity order from lowest to highest
const RARITY_ORDER = ['C', 'R', 'SR', 'UR', 'PR', 'CBR', 'SCR', 'USEC'];

const Rarity = { SR: 'SR', UR: 'UR', PR: 'PR', CBR: 'CBR', C: 'C', SCR: 'SCR', R: 'R', USEC: 'USEC' };

function resolveValue(val) {
  if (val.startsWith('Rarity.')) return Rarity[val.split('.')[1]];
  return val;
}

function parseFile(content) {
  const cards = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '{' && content.substring(i, i + 500).includes('print:')) {
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
      const card = {};
      const fieldRegex = /(\w+):\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|(\[[\s\S]*?\])|([\w\.]+)|(\d+))/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(objStr)) !== null) {
        const key = fieldMatch[1];
        let value = fieldMatch[2] || fieldMatch[3] || fieldMatch[4] || fieldMatch[5] || fieldMatch[6];
        if (fieldMatch[4]) value = value.replace(/[\[\]\s]/g, '').split(',').filter(v => v).map(v => resolveValue(v));
        else if (fieldMatch[5]) value = resolveValue(value);
        else if (fieldMatch[6]) value = parseInt(value, 10);
        card[key] = value;
      }
      if (card.print) cards.push(card);
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

  // Group upstream rarities by print code
  const upstreamRarities = {};
  upstreamCards.forEach(card => {
    if (!upstreamRarities[card.print]) upstreamRarities[card.print] = [];
    upstreamRarities[card.print].push(card.rare);
  });

  localCards.forEach(local => {
    const upstream = upstreamRarities[local.print];
    if (!upstream) return;

    // Find the lowest rarity in upstream
    let lowestUpstream = upstream[0];
    upstream.forEach(r => {
      if (RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(lowestUpstream)) {
        lowestUpstream = r;
      }
    });

    if (local.rare !== lowestUpstream) {
      console.log(`[RARITY MISMATCH] ${local.print} (File: ${file}):`);
      console.log(`  Local Base: ${local.rare}`);
      console.log(`  Upstream Lowest: ${lowestUpstream}`);
      console.log(`  All Upstream: ${upstream.join(', ')}`);
    }
  });
});
