
import { readFileSync } from 'node:fs';
import { extractCardFull } from './extract.ts';

async function run() {
  const csvPath = new URL('../audit/CARD-EXTRACT-REPORT.csv', import.meta.url);
  const csvContent = readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  
  // Parse CSV
  // Print,Field,DB Value,Image Value,Note,Status
  const expectations: Record<string, Record<string, string>> = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < 4) continue;
    const [print, field, dbValue, imageValue] = row;
    if (!expectations[print]) expectations[print] = {};
    expectations[print][field] = imageValue;
  }

  const uniqueIds = Object.keys(expectations).sort();
  const changes: any[] = [];
  const failures: string[] = [];

  console.log(`Processing ${uniqueIds.length} cards...`);

  for (const id of uniqueIds) {
    try {
      const result = await extractCardFull(id);
      const fields = result.fields;

      const cardExpectations = expectations[id];
      for (const [field, expected] of Object.entries(cardExpectations)) {
        const actualValue = fields[field]?.value;
        let actual = (actualValue === null || actualValue === undefined) ? '∅' : String(actualValue);

        if (actual !== expected) {
          changes.push({
            Card: id,
            Field: field,
            Expected: expected,
            Actual: actual
          });
        }
      }
    } catch (err) {
      console.error(`Error processing ${id}:`, err instanceof Error ? err.message : err);
      failures.push(id);
    }
  }

  console.log('\n--- CHANGES FOUND ---');
  if (changes.length === 0) {
    console.log('No changes found compared to CSV Image Value.');
  } else {
    console.table(changes);
  }

  console.log('\n--- EXTRACTION FAILURES ---');
  if (failures.length === 0) {
    console.log('None.');
  } else {
    console.log(failures.join(', '));
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
