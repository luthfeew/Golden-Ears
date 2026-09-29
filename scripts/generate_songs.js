const fs = require('fs');
const path = require('path');

const songsDir = path.join(__dirname, '..', 'songs');

if (!fs.existsSync(songsDir)) {
  console.error('songs directory does not exist!');
  process.exit(1);
}

const entries = fs.readdirSync(songsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const songs = [];

for (let i = 0; i < entries.length; i++) {
  const folderName = entries[i].name;
  const folderPath = path.join(songsDir, folderName);
  const files = fs.readdirSync(folderPath);

  const flacFile = files.find(f => f.toLowerCase() === 'lossless.flac' || f.toLowerCase().endsWith('_lossless.flac'));
  const wavFile = files.find(f => f.toLowerCase() === 'uncompressed.wav' || f.toLowerCase().endsWith('_uncompressed.wav'));
  const mp3_320File = files.find(f => f.toLowerCase() === 'mp3_320k.mp3' || f.toLowerCase().endsWith('_mp3_320k.mp3'));
  const mp3_128File = files.find(f => f.toLowerCase() === 'mp3_128k.mp3' || f.toLowerCase().endsWith('_mp3_128k.mp3'));
  const coverFile = files.find(f => f.toLowerCase().startsWith('cover.'));

  if (!flacFile || !wavFile || !mp3_320File || !mp3_128File || !coverFile) {
    console.warn(`Skipping incomplete folder: ${folderName}`);
    continue;
  }

  // Parse title and artist from folder name: "Title - Artist"
  const lastHyphen = folderName.lastIndexOf(' - ');
  let title = folderName;
  let artist = 'Unknown Artist';
  if (lastHyphen !== -1) {
    title = folderName.substring(0, lastHyphen).trim();
    artist = folderName.substring(lastHyphen + 3).trim();
  }

  const getStat = (filename) => {
    try {
      return fs.statSync(path.join(folderPath, filename)).size;
    } catch {
      return 0;
    }
  };

  songs.push({
    id: `song_${String(songs.length + 1).padStart(3, '0')}`,
    folder: folderName,
    title,
    artist,
    cover: `songs/${encodeURIComponent(folderName)}/${encodeURIComponent(coverFile)}`,
    flac: `songs/${encodeURIComponent(folderName)}/${encodeURIComponent(flacFile)}`,
    wav: `songs/${encodeURIComponent(folderName)}/${encodeURIComponent(wavFile)}`,
    mp3_320: `songs/${encodeURIComponent(folderName)}/${encodeURIComponent(mp3_320File)}`,
    mp3_128: `songs/${encodeURIComponent(folderName)}/${encodeURIComponent(mp3_128File)}`,
    coverSize: getStat(coverFile),
    flacSize: getStat(flacFile),
    wavSize: getStat(wavFile),
    mp3_320Size: getStat(mp3_320File),
    mp3_128Size: getStat(mp3_128File)
  });
}

const outputPath = path.join(__dirname, '..', 'songs.json');
fs.writeFileSync(outputPath, JSON.stringify(songs, null, 2), 'utf8');

// Also write a js version songs.data.js so it can be loaded directly without fetch() restriction if needed
const jsOutputPath = path.join(__dirname, '..', 'songs.data.js');
fs.writeFileSync(jsOutputPath, `// Auto-generated song catalog\nwindow.SONG_CATALOG = ${JSON.stringify(songs, null, 2)};\n`, 'utf8');

console.log(`Successfully generated ${songs.length} songs catalog:`);
console.log(`- ${outputPath}`);
console.log(`- ${jsOutputPath}`);
