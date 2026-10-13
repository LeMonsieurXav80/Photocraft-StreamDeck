// Fabrique les images du plugin : SVG pour les actions, PNG pour l'icone.
//
// Pas de dependance de dessin : le PNG est encode a la main (zlib est dans
// node:). Le depot n'a aucune etape de build, et ajouter une chaine d'outils
// graphique pour deux fichiers de 72 pixels serait disproportionne.
//
// Usage : node tools/icones.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const dossier = path.join(ici, '..', 'com.lemonsieurxav.photocraft.sdPlugin', 'images');
fs.mkdirSync(dossier, { recursive: true });

// --- PNG ------------------------------------------------------------------

function crc32(donnees) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const octet of donnees) crc = table[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, somme]);
}

function ecrirePng(chemin, largeur, hauteur, pixel) {
  const brut = Buffer.alloc(hauteur * (largeur * 4 + 1));
  let p = 0;
  for (let y = 0; y < hauteur; y++) {
    brut[p++] = 0; // filtre: aucun
    for (let x = 0; x < largeur; x++) {
      const [r, v, b, a] = pixel(x / largeur, y / hauteur);
      brut[p++] = r; brut[p++] = v; brut[p++] = b; brut[p++] = a;
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8;   // 8 bits par canal
  entete[9] = 6;   // RGBA
  fs.writeFileSync(chemin, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', zlib.deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]));
}

// Trois rectangles decales : la pile de calques, qui est ce que le plugin
// manipule le plus. Lisible a 28 px sur une touche comme a 144 px en galerie.
const FEUILLES = [
  { x: 0.20, y: 0.46, l: 0.52, h: 0.30, couleur: [58, 74, 102] },
  { x: 0.26, y: 0.33, l: 0.52, h: 0.30, couleur: [74, 122, 170] },
  { x: 0.32, y: 0.20, l: 0.52, h: 0.30, couleur: [108, 182, 230] },
];

function pixelIcone(u, v) {
  let couleur = [26, 28, 33, 255]; // fond
  for (const f of FEUILLES) {
    if (u >= f.x && u <= f.x + f.l && v >= f.y && v <= f.y + f.h) {
      couleur = [...f.couleur, 255];
    }
  }
  return couleur;
}

ecrirePng(path.join(dossier, 'plugin.png'), 72, 72, pixelIcone);
ecrirePng(path.join(dossier, 'plugin@2x.png'), 144, 144, pixelIcone);
ecrirePng(path.join(dossier, 'category.png'), 28, 28, pixelIcone);
ecrirePng(path.join(dossier, 'category@2x.png'), 56, 56, pixelIcone);

// --- SVG ------------------------------------------------------------------

const svg = (contenu) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">` +
  `<rect width="72" height="72" rx="10" fill="#1a1c21"/>${contenu}</svg>\n`;

const ICONES = {
  // Chevrons : une commande qu'on declenche.
  commande: svg(
    `<path d="M24 26l10 10-10 10" fill="none" stroke="#6cb6e6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M40 46h10" fill="none" stroke="#6cb6e6" stroke-width="5" stroke-linecap="round"/>`),

  // Pointe de pinceau.
  outil: svg(
    `<path d="M26 46c0-6 4-8 4-14 0-4 3-8 6-8s6 4 6 8c0 6 4 8 4 14z" fill="#8d93a1"/>` +
    `<rect x="26" y="46" width="20" height="6" rx="2" fill="#5e636f"/>`),
  'outil-actif': svg(
    `<path d="M26 46c0-6 4-8 4-14 0-4 3-8 6-8s6 4 6 8c0 6 4 8 4 14z" fill="#6cb6e6"/>` +
    `<rect x="26" y="46" width="20" height="6" rx="2" fill="#4a7aaa"/>`),

  // Pile de calques.
  calque: svg(
    `<rect x="17" y="38" width="38" height="12" rx="2" fill="#3a4a66"/>` +
    `<rect x="17" y="30" width="38" height="12" rx="2" fill="#4a7aaa"/>` +
    `<rect x="17" y="22" width="38" height="12" rx="2" fill="#6cb6e6"/>`),
  'calque-masque': svg(
    `<rect x="17" y="38" width="38" height="12" rx="2" fill="#2e3340"/>` +
    `<rect x="17" y="30" width="38" height="12" rx="2" fill="#363c4b"/>` +
    `<rect x="17" y="22" width="38" height="12" rx="2" fill="#3e4556"/>` +
    `<path d="M18 54L54 18" stroke="#8d93a1" stroke-width="4" stroke-linecap="round"/>`),

  // Damier qui transparait sous un aplat : l'opacite.
  opacite: svg(
    `<rect x="18" y="18" width="18" height="18" fill="#4a4f5c"/>` +
    `<rect x="36" y="36" width="18" height="18" fill="#4a4f5c"/>` +
    `<rect x="18" y="18" width="36" height="36" fill="#6cb6e6" fill-opacity="0.55"/>`),

  // Deux disques : la taille de brosse.
  brosse: svg(
    `<circle cx="28" cy="40" r="8" fill="#5e636f"/>` +
    `<circle cx="47" cy="36" r="14" fill="#6cb6e6"/>`),
};

for (const [nom, contenu] of Object.entries(ICONES)) {
  fs.writeFileSync(path.join(dossier, `${nom}.svg`), contenu);
}

console.log(`images ecrites dans ${dossier} :`);
for (const f of fs.readdirSync(dossier).sort()) console.log('  ' + f);
