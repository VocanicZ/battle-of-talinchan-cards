
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Enums mapping from src/types/base.ts
const Color: Record<string, string> = { Red: 'แดง', Blue: 'ฟ้า', Green: 'เขียว', Purple: 'ม่วง', Black: 'ดำ', None: 'ไม่มีสี' };
const Symbol: Record<string, string> = { God: 'เทพ', Giant: 'ยักษ์', Mage: 'จอมเวทย์', Human: 'คน', Insect: 'แมลง', Animal: 'สัตว์', Rat: 'รัททาทุย', Hell: 'นรก', Ghost: 'ผี', Robot: 'หุ่นยนต์', Fish: 'ปลา', Building: 'สิ่งก่อสร้าง', Foreigner: 'ต่างชาติ', Tree: 'ต้นไม้', Pret: 'เปรต', Alien: 'เอเลี่ยน', Hermit: 'ฤษี', Lizard: 'กะปอม', WonderAnimal: 'สัตว์มหัศจรรย์', Soldier: 'ทหาร', Cyber: 'ไซเบอร์' };
const Rarity: Record<string, string> = { SR: 'SR', UR: 'UR', PR: 'PR', CBR: 'CBR', C: 'C', SCR: 'SCR', R: 'R', USEC: 'USEC' };
const CardType: Record<string, string> = { Avatar: 'Avatar', Magic: 'Magic', Life: 'Life', Construct: 'Construct' };
const MagicSubtype: Record<string, string> = { Modification: 'Modification', React: 'React', Normal: 'Normal', Land: 'Land' };

function resolveValue(val: string): any {
  if (val.startsWith('Color.')) return Color[val.split('.')[1]] || val;
  if (val.startsWith('Symbol.')) return Symbol[val.split('.')[1]] || val;
  if (val.startsWith('Rarity.')) return Rarity[val.split('.')[1]] || val;
  if (val.startsWith('CardType.')) return CardType[val.split('.')[1]] || val;
  if (val.startsWith('MagicSubtype.')) return MagicSubtype[val.split('.')[1]] || val;
  
  // Handle string literals
  if ((val.startsWith('"') && val.endsWith('"')) || 
      (val.startsWith("'") && val.endsWith("'")) || 
      (val.startsWith('`') && val.endsWith('`'))) {
    return val.substring(1, val.length - 1);
  }
  
  // Handle numbers
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  
  return val;
}

function parseCards(content: string) {
  const cards: any[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '{' && content.substring(i, i + 1000).includes('print:')) {
      let braceCount = 1;
      let j = i + 1;
      let inString: string | null = null;
      while (j < content.length && braceCount > 0) {
        const char = content[j];
        if (inString) {
          if (char === inString && content[j - 1] !== '\\') inString = null;
        } else {
          if (char === '"' || char === "'" || char === '`') inString = char;
          else if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
        }
        j++;
      }
      const objStr = content.substring(i, j);
      const card: any = {};
      
      // Improved regex to capture keys and raw values (including enums, strings, numbers, arrays)
      const fieldRegex = /(\w+):\s*("([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'|`([^`\\]*(\\.[^`\\]*)*)`|(\[[\s\S]*?\])|([\w\.]+)|(\d+))/g;
      
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(objStr)) !== null) {
        const key = fieldMatch[1];
        const rawValue = fieldMatch[2];
        
        if (rawValue.startsWith('[')) {
          card[key] = rawValue.replace(/[\[\]\s]/g, '').split(',').filter(v => v).map(v => resolveValue(v));
        } else {
          card[key] = resolveValue(rawValue);
        }
      }
      if (card.print) cards.push(card);
      i = j;
    } else {
      i++;
    }
  }
  return cards;
}

const fieldsToCompare = ['name', 'soi', 'cost', 'power', 'symbol', 'gem', 'color', 'ex'];

const files = fs.readdirSync('src/cards').filter(f => f.endsWith('.ts') && f !== 'index.ts');

console.log(`Comparing ${files.length} files with exact enum resolution...`);

files.forEach(file => {
  const filePath = path.join('src/cards', file);
  const localContent = fs.readFileSync(filePath, 'utf8');
  let upstreamContent: string;
  try {
    upstreamContent = execSync(`git show origin/main:${filePath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    return;
  }

  const localRaw = parseCards(localContent);
  const upstreamRaw = parseCards(upstreamContent);

  const upstreamMap = new Map();
  upstreamRaw.forEach(c => upstreamMap.set(`${c.print}-${c.rare}`, c));

  const localMap = new Map();
  localRaw.forEach(c => {
    localMap.set(`${c.print}-${c.rare}`, c);
    if (c.variants) {
      c.variants.forEach((v: string) => {
        localMap.set(`${c.print}-${v}`, { ...c, rare: v });
      });
    }
  });

  const allKeys = new Set([...localMap.keys(), ...upstreamMap.keys()]);
  let fileHasDiff = false;

  allKeys.forEach(key => {
    const local = localMap.get(key);
    const upstream = upstreamMap.get(key);

    if (!local || !upstream) return;

    const diffs: string[] = [];
    fieldsToCompare.forEach(field => {
      let localVal = local[field];
      let upstreamVal = upstream[field];

      // Normalize for comparison (treat undefined/null as 'undefined' string for visibility)
      const lStr = localVal === undefined ? 'undefined' : String(localVal).trim();
      const uStr = upstreamVal === undefined ? 'undefined' : String(upstreamVal).trim();

      if (lStr !== uStr) {
        diffs.push(`${field}: [upstream] "${uStr}" vs [local] "${lStr}"`);
      }
    });

    if (diffs.length > 0) {
      if (!fileHasDiff) {
        console.log(`\n--- Differences in ${file} ---`);
        fileHasDiff = true;
      }
      console.log(`Card ${key}:`);
      diffs.forEach(d => console.log(`  ${d}`));
    }
  });
});
