// Fabrique les images du plugin a partir de l'icone de PhotoCraft.
//
// Le renard a neuf queues est l'icone de PhotoCraft : le reprendre rend les
// touches immediatement identifiables, ce qu'un pictogramme invente ne fait
// pas. Seul le FOND change, une teinte par action, pour qu'on distingue cinq
// touches cote a cote sans les lire.
//
// Le trait du dessin n'est jamais touche : on isole les pixels de fond par leur
// dominante bleue et on ne recolore que ceux-la.
//
// Usage : node tools/icones.mjs
//
// La source est `tools/photocraft-icone-source.png`, extraite de la build
// officielle 0.8.2 (voir tools/NOTICE.md). Pour la regenerer depuis une version
// plus recente :
//   iconutil -c iconset /Applications/PhotoCraft.app/Contents/Resources/PhotoCraft.icns -o /tmp/pc
//   cp /tmp/pc/icon_512x512.png tools/photocraft-icone-source.png

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lirePng, ecrirePng, redimensionner } from './png.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(ici, 'photocraft-icone-source.png');
const dossier = path.join(ici, '..', 'com.lemonsieurxav.photocraft.sdPlugin', 'images');
fs.mkdirSync(dossier, { recursive: true });

// Couleur de fond de l'icone officielle, relevee sur la source.
const BLEU_ORIGINE = [48, 128, 240];

// Une teinte par action. Le bleu d'origine reste celui du plugin et de la
// categorie : c'est l'identite de l'application, elle ne doit pas bouger.
const TEINTES = {
  plugin:           BLEU_ORIGINE,
  category:         BLEU_ORIGINE,
  commande:         BLEU_ORIGINE,
  outil:            [88, 96, 112],    // gris ardoise : outil au repos
  'outil-actif':    [64, 176, 160],   // turquoise : outil actif
  calque:           [124, 92, 200],   // violet
  'calque-masque':  [72, 72, 80],     // gris eteint : calque masque
  opacite:          [214, 148, 48],   // ambre
  brosse:           [88, 168, 88],    // vert
};

// --- preparation de la source ---------------------------------------------

const brut = lirePng(source);

// Les icones macOS portent une marge transparente (l'icone de 512 px ne
// remplit qu'environ 410 px). Sur une touche de 19 mm, cette marge est du
// gachis : on recadre sur la boite opaque avant de reduire.
function recadrer({ largeur, hauteur, pixels }) {
  let minX = largeur, minY = hauteur, maxX = -1, maxY = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (pixels[(y * largeur + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const l = maxX - minX + 1, h = maxY - minY + 1;
  const sortie = Buffer.alloc(l * h * 4);
  for (let y = 0; y < h; y++) {
    pixels.copy(sortie, y * l * 4, ((y + minY) * largeur + minX) * 4, ((y + minY) * largeur + minX + l) * 4);
  }
  return { largeur: l, hauteur: h, pixels: sortie };
}

const recadree = recadrer(brut);

// --- recoloration du fond -------------------------------------------------

// Un pixel appartient au fond dans la mesure ou le bleu domine le rouge. Le
// dessin est en niveaux de gris (r ≈ v ≈ b), il obtient donc un masque nul et
// reste intact ; les pixels du bord, lisses entre le fond et le trait,
// obtiennent une valeur intermediaire et se melangent proprement.
function masqueFond(r, v, b) {
  const ecart = b - r;
  const reference = BLEU_ORIGINE[2] - BLEU_ORIGINE[0]; // 192
  return Math.max(0, Math.min(1, (ecart - 24) / (reference - 24)));
}

function teinter(image, couleur) {
  const pixels = Buffer.from(image.pixels);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const m = masqueFond(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (m === 0) continue;
    for (let canal = 0; canal < 3; canal++) {
      pixels[i + canal] = Math.round(pixels[i + canal] * (1 - m) + couleur[canal] * m);
    }
  }
  return { ...image, pixels };
}

// --- ecriture -------------------------------------------------------------

// Stream Deck demande 72 px pour les icones d'action et d'etat, et attend un
// @2x pour l'icone du plugin et celle de la categorie.
const TAILLES = { plugin: [72, 144], category: [28, 56] };

const resume = [];
for (const [nom, couleur] of Object.entries(TEINTES)) {
  const teintee = teinter(recadree, couleur);
  const [base, double] = TAILLES[nom] ?? [72, 144];

  const petite = redimensionner(teintee, base, base);
  ecrirePng(path.join(dossier, `${nom}.png`), base, base, petite.pixels);

  const grande = redimensionner(teintee, double, double);
  ecrirePng(path.join(dossier, `${nom}@2x.png`), double, double, grande.pixels);

  resume.push(`${nom} (${base}/${double} px, fond rgb(${couleur.join(' ')}))`);
}

// Les anciennes icones dessinees a la main n'ont plus de raison d'etre.
for (const fichier of fs.readdirSync(dossier)) {
  if (fichier.endsWith('.svg')) fs.unlinkSync(path.join(dossier, fichier));
}

console.log(`source : ${path.basename(source)} ${brut.largeur}x${brut.hauteur}, recadree a ${recadree.largeur}x${recadree.hauteur}`);
console.log(`images ecrites dans ${path.relative(process.cwd(), dossier)} :`);
for (const ligne of resume) console.log('  ' + ligne);
