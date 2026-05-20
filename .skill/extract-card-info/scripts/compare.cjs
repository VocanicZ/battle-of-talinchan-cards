
const fs = require('fs');
const { execSync } = require('child_process');

const Color = { Red: 'แดง', Blue: 'ฟ้า', Green: 'เขียว', Purple: 'ม่วง', Black: 'ดำ', None: 'ไม่มีสี' };
const CardType = { Avatar: 'Avatar', Magic: 'Magic', Life: 'Life', Construct: 'Construct' };
const MagicSubtype = { Modification: 'Modification', React: 'React', Normal: 'Normal', Land: 'Land' };
const Rarity = { SR: 'SR', UR: 'UR', PR: 'PR', CBR: 'CBR', C: 'C', SCR: 'SCR', R: 'R', USEC: 'USEC' };
const Symbol = { God: 'เทพ', Giant: 'ยักษ์', Mage: 'จอมเวทย์', Human: 'คน', Insect: 'แมลง', Animal: 'สัตว์', Rat: 'รัททาทุย', Hell: 'นรก', Ghost: 'ผี', Robot: 'หุ่นยนต์', Fish: 'ปลา', Building: 'สิ่งก่อสร้าง', Foreigner: 'ต่างชาติ', Tree: 'ต้นไม้', Pret: 'เปรต', Alien: 'เอเลี่ยน', Hermit: 'ฤษี', Lizard: 'กะปอม', WonderAnimal: 'สัตว์มหัศจรรย์', Soldier: 'ทหาร', Cyber: 'ไซเบอร์' };

function resolveValue(val) {
  if (val.startsWith('Color.')) return Color[val.split('.')[1]];
  if (val.startsWith('CardType.')) return CardType[val.split('.')[1]];
  if (val.startsWith('MagicSubtype.')) return MagicSubtype[val.split('.')[1]];
  if (val.startsWith('Rarity.')) return Rarity[val.split('.')[1]];
  if (val.startsWith('Symbol.')) return Symbol[val.split('.')[1]];
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
  const localCardsRaw = parseFile(localContent);
  const upstreamCardsRaw = parseFile(upstreamContent);
  const upstreamGroups = {};
  upstreamCardsRaw.forEach(card => {
    if (!upstreamGroups[card.print]) upstreamGroups[card.print] = { ...card, allRarities: new Set() };
    upstreamGroups[card.print].allRarities.add(card.rare);
  });
  const localGroups = {};
  localCardsRaw.forEach(card => {
    if (!localGroups[card.print]) {
      localGroups[card.print] = { ...card, allRarities: new Set() };
      localGroups[card.print].allRarities.add(card.rare);
      if (card.variants) card.variants.forEach(r => localGroups[card.print].allRarities.add(r));
    }
  });
  const allPrints = new Set([...Object.keys(localGroups), ...Object.keys(upstreamGroups)]);
  allPrints.forEach(print => {
    const local = localGroups[print];
    const upstream = upstreamGroups[print];
    if (!local) { console.log(`[MISSING LOCAL] ${print} (File: ${file})`); return; }
    if (!upstream) { console.log(`[NEW LOCAL] ${print} (File: ${file})`); return; }
    const diffs = [];
    const fieldsToCompare = ['name', 'type', 'soi', 'cost', 'gem', 'power', 'symbol', 'color', 'mainEffect', 'subtype', 'favorText', 'dropRate', 'customLimit', 'ex', 'gemColor'];
    function normalizeString(s) { if (typeof s !== 'string') return s; return s.trim().replace(/\s+/g, ' '); }
    fieldsToCompare.forEach(field => {
      const localVal = normalizeString(local[field]);
      const upstreamVal = normalizeString(upstream[field]);
      if (localVal !== upstreamVal) { if (!localVal && !upstreamVal) return; diffs.push(`${field}: "${upstreamVal}" -> "${localVal}"`); }
    });
    const localRarities = Array.from(local.allRarities).sort().join(',');
    const upstreamRarities = Array.from(upstream.allRarities).sort().join(',');
    if (localRarities !== upstreamRarities) diffs.push(`rarities: [${upstreamRarities}] -> [${localRarities}]`);
    if (diffs.length > 0) { console.log(`[DIFF] ${print} (File: ${file}):`); diffs.forEach(d => console.log(`  ${d}`)); }
  });
});
