// Encrypts a built HTML edition with a password so the file can be shared
// through ordinary storage. The output opens offline in a browser, asks for
// the password and decrypts in place (PBKDF2-SHA-256 + AES-256-GCM, Web Crypto).
//
//   node scripts/protect.mjs [--input dist/rodova-kronika.html] [--output dist/rodova-kronika-zaheslovana.html]
//
// The password is read from the RK_PASSWORD environment variable or asked for
// interactively; it is never written to disk or to the repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const PBKDF2_ITERATIONS = 600000;

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

export async function encryptHtml(html, password, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (!password || password.length < 6) throw new Error('Heslo musí mít alespoň 6 znaků.');
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const baseKey = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cipher = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html)));
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  return { salt: b64(salt), iv: b64(iv), iterations, data: b64(cipher) };
}

export function wrapperHtml(payload, title = 'Rodová kronika') {
  const safeTitle = title.replace(/[<>&"]/g, '');
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f0e7; color: #1d2722; font: 17px/1.5 Georgia, 'Times New Roman', serif; }
  main { width: min(420px, calc(100vw - 32px)); padding: 32px 28px; border: 1px solid #d4caba; border-radius: 16px; background: #fbf9f3; box-shadow: 0 18px 50px rgba(62, 50, 37, .09); }
  h1 { margin: 0 0 6px; font-size: 32px; font-weight: 400; }
  p { margin: 0 0 18px; color: #566159; font-size: 15px; }
  label { display: block; margin-bottom: 6px; font: 700 12px/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #566159; }
  input { box-sizing: border-box; width: 100%; height: 48px; padding: 0 14px; border: 1px solid #b9ad9b; border-radius: 10px; font: 18px system-ui, sans-serif; background: #fff; }
  input:focus { outline: 3px solid rgba(123, 63, 75, .25); border-color: #7b3f4b; }
  button { width: 100%; height: 48px; margin-top: 14px; border: 0; border-radius: 10px; color: #fff; background: #7b3f4b; font: 650 17px system-ui, sans-serif; cursor: pointer; }
  button:disabled { opacity: .6; cursor: progress; }
  .error { min-height: 22px; margin: 12px 0 0; color: #a4543b; font: 15px system-ui, sans-serif; }
</style>
</head>
<body>
<main>
  <h1>${safeTitle}</h1>
  <p>Soubor je chráněný heslem. Po zadání hesla se kronika otevře; nic se neodesílá na internet.</p>
  <form id="unlock">
    <label for="password">Heslo</label>
    <input id="password" type="password" autocomplete="current-password" autofocus required>
    <button id="submit" type="submit">Otevřít kroniku</button>
    <p class="error" id="error" role="alert"></p>
  </form>
</main>
<script>
const PAYLOAD = ${JSON.stringify(payload)};
const form = document.getElementById('unlock');
const error = document.getElementById('error');
const submit = document.getElementById('submit');
const bytes = (b64) => Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
if (!window.crypto || !crypto.subtle) {
  error.textContent = 'Tento prohlížeč neumí soubor odemknout. Otevřete jej v prohlížeči Chrome, Edge, Firefox nebo Safari.';
  submit.disabled = true;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Odemykám…';
  try {
    const password = document.getElementById('password').value;
    const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(PAYLOAD.salt), iterations: PAYLOAD.iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(PAYLOAD.iv) }, key, bytes(PAYLOAD.data));
    const html = new TextDecoder().decode(plain);
    document.open();
    document.write(html);
    document.close();
  } catch (_) {
    error.textContent = 'Nesprávné heslo. Zkuste to prosím znovu.';
    submit.disabled = false;
    submit.textContent = 'Otevřít kroniku';
  }
});
</script>
</body>
</html>
`;
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

async function main() {
  const input = argument('input', 'dist/rodova-kronika.html');
  const output = argument('output', 'dist/rodova-kronika-zaheslovana.html');
  let password = process.env.RK_PASSWORD;
  if (!password) {
    password = await askPassword('Heslo pro kroniku: ');
    const again = await askPassword('Heslo znovu: ');
    if (password !== again) throw new Error('Hesla se neshodují.');
  }
  const html = await fs.readFile(input, 'utf8');
  const payload = await encryptHtml(html, password);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, wrapperHtml(payload));
  console.log(`Zaheslovaný soubor: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
