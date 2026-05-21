import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditDir } from './paths.ts';

function mergeAndCleanCSVs(setPrefixes: string[], outputFile: string) {
  const allRows: string[][] = [];
  let header: string[] = [];

  for (const prefix of setPrefixes) {
    const filePath = join(auditDir, `${prefix.toLowerCase()}-extract.csv`);
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    // Parse CSV lines (simple parser for our specific format)
    const rows = lines.map(line => {
      const row: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current);
      return row;
    });

    if (header.length === 0) {
      header = rows[0];
    }

    // Add data rows (skip header)
    allRows.push(...rows.slice(1));
  }

  // Identify indices to keep (not Confidence, Score, or Name)
  const indicesToKeep = header
    .map((col, index) => ({ col, index }))
    .filter(item => 
      !item.col.includes('Confidence') && 
      !item.col.includes('Score') && 
      item.col !== 'name Value'
    )
    .map(item => item.index);

  const cleanHeader = indicesToKeep.map(i => header[i]);
  const cleanRows = allRows.map(row => 
    indicesToKeep.map(i => {
      const val = row[i];
      return val === 'null' ? '' : val;
    })
  );

  const csvContent = [cleanHeader, ...cleanRows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const outputPath = join(auditDir, outputFile);
  writeFileSync(outputPath, csvContent);
  console.log(`Merged and cleaned CSV written to ${outputPath}`);
}

mergeAndCleanCSVs(['sd01', 'sd02', 'sd03'], 'sd-all-clean.csv');
