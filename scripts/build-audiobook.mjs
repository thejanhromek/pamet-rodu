// Audiobook of the printed family book for relatives who see poorly: the
// book (scripts/build-book.mjs) is turned into Czech chapter texts written
// for listening, and when a local Czech text-to-speech voice is available
// (Windows SAPI through PowerShell System.Speech, e.g. "Microsoft Jakub")
// every chapter is also read into an MP3 or M4A file. Nothing is sent to
// the internet. Without a Czech voice the script says so and writes texts only.
//
//   node scripts/build-audiobook.mjs [--ego person-id] [--chapters 1,2] [--output-dir dist/audiokniha] [--format mp3|m4a] [--rate -2..2] [--voice "Microsoft Jakub"] [--text-only]
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildBook } from './build-book.mjs';
import { createFamilyEdition } from './family-edition.mjs';

const run = promisify(execFile);

const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Book markup and abbreviations rewritten into sentences a voice reads well.
export function speechText(html) {
  let text = String(html)
    .replace(/<p class="citations">[\s\S]*?<\/p>/g, '')
    .replace(/<span class="ref">→ č\. (\d+)<\/span>/g, ' (číslo $1)')
    .replace(/<span class="number">(\d+)<\/span>\s*/g, 'Číslo $1. ')
    .replace(/<span class="certainty">– ([\s\S]*?)<\/span>/g, ' To je $1.')
    .replace(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g, '$1: $2.\n')
    .replace(/<\/(?:h[1-6]|p|li|div|dd|dt|section|article|header)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text)
    .replace(/\(\* ?(\d{4}) – † ?(\d{4})\)/g, '(narození $1, úmrtí $2)')
    .replace(/\* ?(\d{4})/g, 'narození $1')
    .replace(/† ?(\d{4})/g, 'úmrtí $1')
    .replace(/(?<!\d)(\d{1,2})\. ?(\d{1,2})\. ?(\d{4})/g, (match, day, month, year) => (Number(month) >= 1 && Number(month) <= 12 ? `${Number(day)}. ${MONTHS[Number(month) - 1]} ${year}` : match))
    // \b does not work before "č" in JavaScript regular expressions.
    .replace(/(^|[\s(])čp\. ?/g, '$1číslo popisné ')
    .replace(/(^|[\s(])č\. ?/g, '$1číslo ')
    .replace(/\broz\. /g, 'rozená ')
    .replace(/\bcca /g, 'asi ')
    .replace(/\btab\. /g, 'tabulka ')
    .replace(/\bs\. ?r\. ?o\./g, 's. r. o.')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\) \(číslo (\d+)\)/g, ', číslo $1)')
    .replace(/([^.!?:\n])(?=\n|$)/g, '$1.')
    .replace(/\.\.+/g, '.')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text;
}

// Book sections do not nest, so the nearest closing tag ends each one.
function sectionsOf(html, className) {
  return [...html.matchAll(new RegExp(`<section class="${className}">([\\s\\S]*?)</section>`, 'g'))].map((match) => match[1]);
}

// Chapters for listening: an introduction, one chapter per generation and
// the places. Pedigree charts, the source list and the name index are visual
// aids of the printed book and are left out.
export function bookToChapters(bookHtml) {
  const title = decodeEntities((bookHtml.match(/<section class="cover">\s*<h1>([\s\S]*?)<\/h1>/) || [])[1] || 'Rodová kronika');
  const subtitle = speechText(((bookHtml.match(/<p class="subtitle">([\s\S]*?)<\/p>/) || [])[1] || '').replace(/<br\s*\/?>/g, ' '));
  const meta = speechText((bookHtml.match(/<p class="meta">([\s\S]*?)<\/p>/) || [])[1] || '');
  const intro = [
    `${title}. Zvuková podoba rodinné knihy.`,
    subtitle,
    meta,
    'Kniha je rozdělená do kapitol po generacích, od výchozí osoby až k nejstarším známým předkům. Každý předek má své číslo: otec má číslo dvojnásobné, matka o jedno vyšší. U toho, co o lidech víme, je vždy řečeno, jak jisté to je – zda to potvrzuje původní záznam, rodinné vyprávění, nebo jde zatím jen o možnost.',
    'Text přečetl počítačový hlas. Jména a místní názvy proto může vyslovit nepřesně; v tištěné knize jsou uvedeny správně.',
  ].filter(Boolean).join('\n');
  const chapters = [{ title: 'Úvod', text: intro }];
  for (const section of sectionsOf(bookHtml, 'chapter')) {
    const heading = decodeEntities((section.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || 'Kapitola');
    chapters.push({ title: heading, text: speechText(section) });
  }
  const places = [...bookHtml.matchAll(/<section class="back">\s*<h2>Místa<\/h2>([\s\S]*?)<\/section>/g)][0];
  if (places) chapters.push({ title: 'Místa', text: `Místa.\n${speechText(places[1]).replace(/– číslo /g, '– osoby číslo ')}` });
  return chapters.map((chapter, index) => ({ ...chapter, number: index + 1 }));
}

export function chapterFileName(chapter) {
  const slug = chapter.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kapitola';
  return `${String(chapter.number).padStart(2, '0')}-${slug}`;
}

// The first enabled Czech voice, or the requested one if it is Czech.
export function chooseVoice(voices = [], wanted = '') {
  const czech = voices.filter((voice) => voice.enabled !== false && /^cs(-|$)/i.test(voice.culture || ''));
  if (wanted) return czech.find((voice) => voice.name === wanted) || null;
  return czech[0] || null;
}

// PowerShell 7 (pwsh) also sees the newer OneCore voices such as Microsoft
// Jakub; Windows PowerShell 5.1 often lists only the older desktop voices.
const POWERSHELL_HOSTS = process.platform === 'win32' ? ['pwsh', 'powershell.exe'] : ['pwsh'];

async function powershell(host, script, env = {}) {
  const { stdout } = await run(host, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { env: { ...process.env, ...env }, maxBuffer: 4 * 1024 * 1024, timeout: 60 * 60 * 1000 });
  return stdout;
}

export async function listVoices() {
  const voices = [];
  for (const host of POWERSHELL_HOSTS) {
    try {
      const out = await powershell(host, '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { "{0}|{1}|{2}" -f $_.VoiceInfo.Name, $_.VoiceInfo.Culture.Name, $_.Enabled }; $s.Dispose()');
      for (const line of out.split(/\r?\n/).filter(Boolean)) {
        const [name, culture, enabled] = line.split('|');
        if (!voices.some((voice) => voice.name === name)) voices.push({ name, culture, enabled: enabled !== 'False', host });
      }
    } catch (_) {
      // This PowerShell host is not installed; try the next one.
    }
  }
  return voices;
}

async function speak(textFile, wavFile, voice, rate) {
  await powershell(voice.host, 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice($env:RK_TTS_VOICE); $s.Rate = [int]$env:RK_TTS_RATE; $s.SetOutputToWaveFile($env:RK_TTS_WAV); $s.Speak([IO.File]::ReadAllText($env:RK_TTS_TEXT, [Text.Encoding]::UTF8)); $s.Dispose()', {
    RK_TTS_VOICE: voice.name, RK_TTS_RATE: String(rate), RK_TTS_WAV: path.resolve(wavFile), RK_TTS_TEXT: path.resolve(textFile),
  });
}

async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-hide_banner', '-version']);
    return true;
  } catch (_) {
    return false;
  }
}

async function encode(wavFile, outFile, format, tags) {
  const codec = format === 'm4a' ? ['-c:a', 'aac', '-b:a', '64k'] : ['-c:a', 'libmp3lame', '-b:a', '64k', '-id3v2_version', '3'];
  const metadata = Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value}`]);
  await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', wavFile, '-ac', '1', ...codec, ...metadata, outFile]);
}

async function main() {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const source = JSON.parse(await fs.readFile(argument('data', 'src/data/genealogy.json'), 'utf8'));
  const data = createFamilyEdition(source);
  const egoId = argument('ego', data.meta.defaultPersonId);
  const partnerId = argument('partner', null);
  const outputDir = argument('output-dir', partnerId ? `dist/audiokniha-${egoId}-a-${partnerId}` : egoId === data.meta.defaultPersonId ? 'dist/audiokniha' : `dist/audiokniha-${egoId}`);
  const format = argument('format', 'mp3') === 'm4a' ? 'm4a' : 'mp3';
  const rate = Math.max(-10, Math.min(10, Number(argument('rate', '-1')) || 0));
  const only = new Set(String(argument('chapters', '')).split(',').map(Number).filter(Boolean));
  const history = JSON.parse(await fs.readFile('src/data/history.json', 'utf8'));
  const allChapters = bookToChapters(buildBook(data, { egoId, partnerId, history }));
  const chapters = allChapters.filter((chapter) => !only.size || only.has(chapter.number));
  await fs.mkdir(outputDir, { recursive: true });
  for (const chapter of chapters) {
    await fs.writeFile(path.join(outputDir, `${chapterFileName(chapter)}.txt`), `${chapter.text}\n`, 'utf8');
  }
  console.log(`Texty kapitol (${chapters.length}): ${outputDir}`);
  if (process.argv.includes('--text-only')) return;

  const voices = await listVoices();
  const voice = chooseVoice(voices, argument('voice', ''));
  if (!voice) {
    console.warn([
      'Český hlas pro předčítání nebyl nalezen, vytvořeny jsou jen texty kapitol.',
      voices.length ? `Dostupné hlasy: ${voices.map((item) => `${item.name} (${item.culture})`).join(', ')}.` : 'Hlasy Windows (System.Speech) nejsou dostupné.',
      'Ve Windows přidejte češtinu v Nastavení › Čas a jazyk › Řeč › Přidat hlasy (např. Microsoft Jakub) a skript spusťte znovu.',
    ].join('\n'));
    process.exitCode = 2;
    return;
  }
  const ffmpeg = await hasFfmpeg();
  if (!ffmpeg) console.warn('ffmpeg nebyl nalezen: kapitoly zůstanou ve formátu WAV. Pro MP3/M4A nainstalujte ffmpeg a skript spusťte znovu.');
  const title = data.meta.title || 'Rodová kronika';
  const playlist = ['#EXTM3U'];
  for (const chapter of chapters) {
    const base = path.join(outputDir, chapterFileName(chapter));
    console.log(`Čtu: ${chapter.number}. ${chapter.title} (${voice.name})`);
    await speak(`${base}.txt`, `${base}.wav`, voice, rate);
    let file = `${base}.wav`;
    if (ffmpeg) {
      file = `${base}.${format}`;
      await encode(`${base}.wav`, file, format, { title: `${chapter.number}. ${chapter.title}`, album: `${title} – audiokniha`, artist: title, track: `${chapter.number}/${allChapters.length}`, language: 'ces' });
      await fs.rm(`${base}.wav`);
    }
    playlist.push(`#EXTINF:-1,${chapter.number}. ${chapter.title}`, path.basename(file));
  }
  await fs.writeFile(path.join(outputDir, 'audiokniha.m3u'), `${playlist.join('\n')}\n`, 'utf8');
  console.log(`Audiokniha: ${outputDir} (${chapters.length} ${chapters.length === 1 ? 'kapitola' : chapters.length < 5 ? 'kapitoly' : 'kapitol'}, ${ffmpeg ? format.toUpperCase() : 'WAV'})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
