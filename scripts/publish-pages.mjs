// Publishes the chronicle on GitHub Pages behind a password, for free: a
// separate public repository holds nothing but the encrypted page.
//
//   node scripts/publish-pages.mjs [--target ../rodokmen-web] [--domain rodokmen.example.cz] [--commit] [--push]
//
// 1. Builds the family edition and encrypts it (scripts/protect.mjs: AES-256-GCM,
//    key from the password by PBKDF2-SHA-256). The password comes from
//    RK_PASSWORD or is asked twice; it must have at least 16 characters,
//    because anybody can download the page and try passwords offline.
// 2. Decrypts the result again to prove the password opens it.
// 3. Writes into the target folder only index.html (the encrypted page),
//    .nojekyll, robots.txt (no indexing), README.md and, with --domain, CNAME.
//    Any other file in the target stops the run.
// 4. Checks every written file against the family data (names, IDs, places,
//    e-mails, note beginnings): one hit stops the run before anything is
//    written.
// 5. Commits with --commit and pushes with --push; nothing leaves the
//    computer without --push.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { webcrypto } from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { encryptHtml, wrapperHtml } from './protect.mjs';
import { createPrivacyChecker, formatFindings } from './lib/privacy.mjs';

const run = promisify(execFile);
export const MIN_PASSWORD_LENGTH = 16;
export const PUBLISHED_FILES = ['index.html', '.nojekyll', 'robots.txt', 'README.md', 'CNAME'];
const KEEP = new Set([...PUBLISHED_FILES, '.git']);

export async function decryptPayload(payload, password) {
  const bytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));
  const baseKey = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv) }, key, bytes(payload.data)));
}

// The files of the public repository, in memory. Nothing family-specific is
// in clear text: the page title and README are generic.
export async function preparePages(html, password, { domain = '', iterations } = {}) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Heslo pro zveřejnění musí mít aspoň ${MIN_PASSWORD_LENGTH} znaků (nejlépe 4–5 nesouvisejících slov). Stránku si může stáhnout kdokoli a hesla zkoušet bez omezení.`);
  }
  const payload = await encryptHtml(html, password, iterations ? { iterations } : undefined);
  if (await decryptPayload(payload, password) !== html) throw new Error('Kontrolní rozšifrování nesouhlasí; nic nebylo zapsáno.');
  const files = {
    'index.html': wrapperHtml(payload),
    '.nojekyll': '',
    'robots.txt': 'User-agent: *\nDisallow: /\n',
    'README.md': '# Rodová kronika\n\nZašifrovaná stránka. Obsah se otevře jen se správným heslem; bez něj z ní nic přečíst nejde.\n',
  };
  if (domain) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error(`Neplatná doména: ${domain}`);
    files.CNAME = `${domain}\n`;
  }
  return files;
}

export function checkPublicFiles(files, data) {
  const check = createPrivacyChecker(data);
  return Object.entries(files).flatMap(([name, content]) => check(name, content));
}

async function askPassword(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const muted = { write: rl._writeToOutput.bind(rl) };
  rl._writeToOutput = (text) => { if (text.includes(question)) muted.write(text); };
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function git(cwd, args) {
  const { stdout } = await run('git', args, { cwd });
  return stdout.trim();
}

async function main() {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const target = path.resolve(argument('target', '../rodokmen-web'));
  const domain = argument('domain', '');
  const commit = process.argv.includes('--commit') || process.argv.includes('--push');
  const push = process.argv.includes('--push');

  await fs.mkdir(target, { recursive: true });
  const foreign = (await fs.readdir(target)).filter((name) => !KEEP.has(name));
  if (foreign.length) throw new Error(`Ve složce ${target} jsou jiné soubory (${foreign.join(', ')}); do veřejného repozitáře patří jen zašifrovaná stránka.`);

  await run(process.execPath, ['scripts/build.mjs'], { maxBuffer: 64 * 1024 * 1024 });
  const html = await fs.readFile('dist/rodova-kronika.html', 'utf8');
  let password = process.env.RK_PASSWORD;
  if (!password) {
    password = await askPassword('Heslo pro zveřejněnou kroniku: ');
    if (password !== await askPassword('Heslo znovu: ')) throw new Error('Hesla se neshodují.');
  }
  const files = await preparePages(html, password, { domain });
  const data = JSON.parse(await fs.readFile('src/data/genealogy.json', 'utf8'));
  const findings = checkPublicFiles(files, data);
  if (findings.length) throw new Error(`Kontrola soukromí selhala, nic nebylo zapsáno:\n${formatFindings(findings)}`);

  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(target, name), content);
  if (!domain) await fs.rm(path.join(target, 'CNAME'), { force: true });
  console.log(`Zašifrovaná kronika je v ${target}${domain ? ` (doména ${domain})` : ''}.`);

  if (!commit) {
    console.log('Bez --commit se nic necommitovalo. Zveřejní se až příkazem s --push.');
    return;
  }
  try { await git(target, ['rev-parse', '--git-dir']); } catch (_) { await git(target, ['init', '-b', 'main']); }
  await git(target, ['add', '--all']);
  const changed = await git(target, ['status', '--porcelain']);
  if (changed) await git(target, ['commit', '-m', `Aktualizace kroniky ${new Date().toISOString().slice(0, 10)}`]);
  console.log(changed ? 'Změna je commitnutá.' : 'Beze změny proti poslednímu commitu.');
  if (push) {
    await git(target, ['push', 'origin', 'HEAD']);
    console.log('Odesláno na GitHub; Pages se obnoví do pár minut.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
