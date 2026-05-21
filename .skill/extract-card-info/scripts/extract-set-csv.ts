import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditDir, imagesDir } from './paths.ts';
import { extractCardFull, resolveBasePrint, type FieldResult } from './extract.ts';

async function extractSet(setPrefix: string) {
  const ALL_FIELDS = ['type', 'color', 'gem', 'gemColor', 'symbol', 'ex',
    'subtype', 'cost', 'power', 'customLimit', 'name'] as const;

  const results: string[][] = [
    ['Print', ...ALL_FIELDS.flatMap(f => [`${f} Value`, `${f} Confidence`, `${f} Score`])]
  ];

  const setImages = readdirSync(imagesDir)
    .filter(f => f.startsWith(`${setPrefix}-`) && f.endsWith('.png'))
    .filter(f => {
      const print = f.replace('.png', '');
      return print === resolveBasePrint(print);
    })
    .sort();

  console.log(`Extracting data for ${setImages.length} ${setPrefix} base images...`);

  for (const imageFile of setImages) {
    const print = imageFile.replace('.png', '');
    
    console.log(`Processing ${print}...`);
    let result;
    try {
      result = await extractCardFull(print);
    } catch (e) {
      console.error(`Error processing ${print}: ${e}`);
      continue;
    }

    const row: string[] = [print];
    for (const field of ALL_FIELDS) {
      const fr = result.fields[field] as FieldResult | undefined;
      if (fr) {
        row.push(String(fr.value), fr.confidence, fr.score.toFixed(3));
      } else {
        row.push('', '', '');
      }
    }
    results.push(row);
  }

  const csv = results.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  mkdirSync(auditDir, { recursive: true });
  const csvPath = join(auditDir, `${setPrefix.toLowerCase()}-extract.csv`);
  writeFileSync(csvPath, csv);
  console.log(`${setPrefix} extraction CSV written to ${csvPath}`);
}

const set = process.argv[2];
if (!set) {
  console.error('Usage: tsx extract-set-csv.ts <SET-PREFIX>');
  process.exit(1);
}

extractSet(set).catch(console.error);
