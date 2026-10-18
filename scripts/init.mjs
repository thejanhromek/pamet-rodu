// První spuštění: založí vlastní prázdnou kroniku, nebo vrátí ukázku.
//
//   node scripts/init.mjs                      (zeptá se na vše potřebné)
//   node scripts/init.mjs --vlastni --jmeno "Jana Nováková" [--pohlavi zena|muz] [--narozeni 1985]
//                         [--nazev "Rodová kronika Novákových"] [--email jana@example.com] [--force]
//   node scripts/init.mjs --ukazka [--force]   (vrátí vymyšlený ukázkový rod)
//
// Vlastní kronika začíná jedinou osobou – tebou. Ukázka zůstává v examples/ukazka/
// a dál ji používají testy. Existující vlastní data se bez --force nepřepíšou.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function slugify(value) {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function createEmptyDataset({ name, sex = 'unknown', birthYear = '', title = 'Rodová kronika', email = '', today = new Date() }) {
  const fullName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!fullName.includes(' ')) throw new Error('Zadej jméno i příjmení, např. „Jana Nováková“.');
  if (birthYear && !/^\d{4}$/.test(String(birthYear))) throw new Error('Rok narození zadej čtyřmi číslicemi, např. 1985.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail nevypadá platně.');
  const words = fullName.split(' ');
  const surname = words.at(-1);
  const id = slugify(`${surname} ${words.slice(0, -1).join(' ')} ${birthYear || ''}`);
  const date = today.toISOString().slice(0, 10);
  const person = {
    id, displayName: fullName, surnames: [surname], sex, lineage: 'self', branch: [surname.replace(/ová$/, '')],
    ...(birthYear ? { birth: { dateText: String(birthYear) } } : {}),
    sourceIds: ['src-vlastni-znalost'],
  };
  return {
    meta: {
      title, version: '0.1.0', updatedAt: date, defaultPersonId: id,
      ...(email ? { feedback: { email } } : {}),
      evidenceLabels: { verified: 'Ověřeno', supported: 'Podpořeno', 'family-record': 'Rodinný záznam', hypothesis: 'Hypotéza / rozpor' },
    },
    people: [person],
    relationships: [], events: [], places: [],
    claims: [],
    sources: [{
      id: 'src-vlastni-znalost', title: `Vlastní znalost – ${fullName}`, type: 'family-record',
      transcriptionLines: ['Údaje, které o sobě a nejbližší rodině vím sám/sama.'],
      reliabilityNote: 'Rodinný záznam; u žijících osob zapisuj jen to, s čím souhlasí.',
    }],
    media: [],
    researchTasks: [{
      id: 'task-prvni-rozhovor', title: 'Připravit první rozhovor s nejstarším pamětníkem', priority: 1, status: 'open',
      expectedPayoff: 'Jména, data a místa tří až čtyř generací a tipy, kde hledat dál.',
      nextAction: 'Projít docs/pruvodce-vyzkumem.md, vytisknout dotazník a domluvit termín nahrávání.',
      personIds: [id], sourceIds: ['src-vlastni-znalost'],
    }],
    changelog: [{ id: `change-${date}-zalozeni`, date, title: 'Založena vlastní kronika', categories: ['people'], items: [`Výchozí osoba: ${fullName}.`] }],
  };
}

async function isOwnData(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')).meta?.sample !== true; } catch (_) { return false; }
}

export async function initProject({ root = projectRoot, mode, force = false, ...answers }) {
  const dataFile = path.join(root, 'src/data/genealogy.json');
  const editionFile = path.join(root, 'src/data/family-edition.json');
  if (!force && await isOwnData(dataFile)) {
    throw new Error('src/data/genealogy.json už obsahuje vlastní data. Přepíšeš je jen s volbou --force (předtím si je zazálohuj).');
  }
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  for (const folder of ['assets/source', 'assets/optimized', 'assets/interviews']) await fs.mkdir(path.join(root, folder), { recursive: true });
  if (mode === 'ukazka') {
    await fs.copyFile(path.join(projectRoot, 'examples/ukazka/genealogy.json'), dataFile);
    await fs.copyFile(path.join(projectRoot, 'examples/ukazka/family-edition.json'), editionFile);
    return { mode, dataFile };
  }
  const data = createEmptyDataset(answers);
  await fs.writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`);
  await fs.writeFile(editionFile, `${JSON.stringify({ $comment: 'Volitelné přepisy pro rodinné vydání; popis v docs/data-contract.md.' }, null, 2)}\n`);
  return { mode: 'vlastni', dataFile, personId: data.meta.defaultPersonId };
}

const sexes = { muz: 'male', muž: 'male', m: 'male', zena: 'female', žena: 'female', z: 'female', ž: 'female' };

async function ask() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Rodová kronika – první spuštění\n');
    const choice = (await rl.question('Začít vlastní kronikou (v), nebo ponechat ukázku (u)? [v/u] ')).trim().toLowerCase();
    if (choice.startsWith('u')) return { mode: 'ukazka' };
    const name = await rl.question('Tvoje jméno a příjmení (výchozí osoba rodokmenu): ');
    const sex = sexes[(await rl.question('Pohlaví (muž / žena, Enter = neuvádět): ')).trim().toLowerCase()] || 'unknown';
    const birthYear = (await rl.question('Rok narození (Enter = neuvádět): ')).trim();
    const title = (await rl.question('Název kroniky (Enter = „Rodová kronika“): ')).trim() || 'Rodová kronika';
    const email = (await rl.question('E-mail pro návrhy oprav od rodiny (Enter = žádný): ')).trim();
    return { mode: 'vlastni', name, sex, birthYear, title, email };
  } finally {
    rl.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const flags = process.argv.slice(2);
  const force = flags.includes('--force');
  let options;
  if (flags.includes('--ukazka')) options = { mode: 'ukazka' };
  else if (flags.includes('--vlastni') || argument('jmeno')) {
    options = {
      mode: 'vlastni', name: argument('jmeno'), sex: sexes[String(argument('pohlavi') || '').toLowerCase()] || 'unknown',
      birthYear: argument('narozeni') || '', title: argument('nazev') || 'Rodová kronika', email: argument('email') || '',
    };
  } else options = await ask();
  try {
    const result = await initProject({ ...options, force });
    console.log(result.mode === 'ukazka'
      ? '\nUkázková kronika je zpět v src/data/genealogy.json.'
      : `\nZaložena vlastní kronika (výchozí osoba ${result.personId}) v src/data/genealogy.json.`);
    console.log('Další krok: node scripts/build.mjs a pak otevři dist/rodova-kronika.html v prohlížeči.');
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}
