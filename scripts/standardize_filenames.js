const fs = require('fs');
const path = require('path');

const songsDir = path.join(__dirname, '..', 'songs');

if (!fs.existsSync(songsDir)) {
  console.error('songs directory does not exist!');
  process.exit(1);
}

const entries = fs.readdirSync(songsDir, { withFileTypes: true })
  .filter(d => d.isDirectory());

console.log(`Found ${entries.length} song folders. Renaming internal files to standard names...`);

let renamedCount = 0;
let skippedCount = 0;

for (const entry of entries) {
  const folderPath = path.join(songsDir, entry.name);
  const files = fs.readdirSync(folderPath);

  // Map file patterns to standard names
  const targets = [
    { pattern: /_lossless\.flac$/i, standard: 'lossless.flac' },
    { pattern: /_uncompressed\.wav$/i, standard: 'uncompressed.wav' },
    { pattern: /_mp3_320k\.mp3$/i, standard: 'mp3_320k.mp3' },
    { pattern: /_mp3_128k\.mp3$/i, standard: 'mp3_128k.mp3' }
  ];

  for (const t of targets) {
    const matched = files.find(f => t.pattern.test(f));
    const alreadyStandard = files.find(f => f.toLowerCase() === t.standard);
    if (matched && matched !== t.standard) {
      const oldPath = path.join(folderPath, matched);
      const newPath = path.join(folderPath, t.standard);
      fs.renameSync(oldPath, newPath);
      renamedCount++;
    } else if (alreadyStandard) {
      skippedCount++;
    }
  }
}

console.log(`Finished: ${renamedCount} files renamed, ${skippedCount} already standardized.`);
