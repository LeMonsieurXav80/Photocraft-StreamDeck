// Reconnaissance du canal de controle PhotoCraft.
// Usage: node recon.mjs <port> <token-file> [sortie.json]
import net from 'node:net';
import fs from 'node:fs';

const port = Number(process.argv[2] ?? 7878);
const tokenFile = process.argv[3];
const out = process.argv[4] ?? 'recon.json';
const token = fs.readFileSync(tokenFile, 'utf8').trim();

const sock = net.createConnection({ host: '127.0.0.1', port });
sock.setEncoding('utf8');

let tampon = '';
const attentes = new Map();
let prochainId = 1;

sock.on('data', (bloc) => {
  tampon += bloc;
  let coupe;
  while ((coupe = tampon.indexOf('\n')) !== -1) {
    const ligne = tampon.slice(0, coupe).trim();
    tampon = tampon.slice(coupe + 1);
    if (!ligne) continue;
    let msg;
    try { msg = JSON.parse(ligne); } catch { continue; }
    const resolve = attentes.get(String(msg.id));
    if (resolve) { attentes.delete(String(msg.id)); resolve(msg); }
  }
});

function appel(method, params = {}) {
  const id = String(prochainId++);
  return new Promise((resolve, reject) => {
    attentes.set(id, resolve);
    sock.write(JSON.stringify({ id, method, params }) + '\n');
    setTimeout(() => { if (attentes.delete(id)) reject(new Error(`timeout ${method}`)); }, 30000);
  });
}

await new Promise((r) => sock.once('connect', r));

const auth = await appel('auth', { token });
console.log('auth:', JSON.stringify(auth));
if (!auth.ok) { sock.end(); process.exit(1); }

const cmds = await appel('engine.commands');
const inspect = await appel('ui.inspect');

const liste = cmds.result?.commands ?? cmds.result ?? [];
const tableau = Array.isArray(liste) ? liste : Object.entries(liste).map(([id, v]) => ({ id, ...v }));

fs.writeFileSync(out, JSON.stringify({
  commandes: tableau,
  ui: inspect.result,
}, null, 2));

console.log(`commandes: ${tableau.length}`);
console.log('exemple:', JSON.stringify(tableau[0], null, 2).slice(0, 600));
console.log('clefs ui.inspect:', Object.keys(inspect.result ?? {}).join(', '));
sock.end();
