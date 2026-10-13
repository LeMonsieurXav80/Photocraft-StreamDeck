// Fabrique les images du plugin.
//
// Deux familles, pour deux usages distincts :
//
//   - Les ICONES D'ACTION reprennent les icones de l'interface de PhotoCraft
//     (`assets/icons`, des Lucide sous licence ISC). Une touche « Calque »
//     porte ainsi le meme pictogramme que le panneau Calques de l'application :
//     on la reconnait sans la lire, et sans avoir a apprendre un symbole
//     invente pour l'occasion.
//
//   - L'ICONE DU PLUGIN et celle de la CATEGORIE reprennent l'icone de
//     l'application — le renard a neuf queues. Elles ne designent pas une
//     action mais le plugin lui-meme, dans la galerie et dans la liste des
//     categories : c'est le seul endroit ou l'identite de PhotoCraft est le
//     sujet.
//
// Les icones d'action sont composees en SVG, par simple assemblage de texte :
// un fond arrondi teinte, et le trace Lucide en blanc par-dessus. Aucune
// rasterisation, donc aucune bibliotheque de dessin. L'icone du plugin, elle,
// doit etre en PNG (le Marketplace l'exige) : `png.mjs` s'en charge.
//
// Usage : node tools/icones.mjs
//
// Sources dans `tools/icones-source/`, provenance dans `tools/NOTICE.md`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lirePng, ecrirePng, redimensionner } from './png.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const sources = path.join(ici, 'icones-source');
const dossier = path.join(ici, '..', 'com.lemonsieurxav.photocraft.sdPlugin', 'images');
fs.mkdirSync(dossier, { recursive: true });

// ---------------------------------------------------------------------------
// Icones d'action, en SVG
// ---------------------------------------------------------------------------

// Un fond colore par action : cinq touches cote a cote se distinguent d'abord
// par leur couleur, le pictogramme ne servant qu'a confirmer.
const ACTIONS = {
  commande:        { icone: 'play.svg',        fond: '#3080f0' }, // le bleu de PhotoCraft
  outil:           { icone: 'brush.svg',       fond: '#585f70' }, // ardoise : outil au repos
  'outil-actif':   { icone: 'brush.svg',       fond: '#40b0a0' }, // turquoise : outil actif
  calque:          { icone: 'layers.svg',      fond: '#7c5cc8' }, // violet
  'calque-masque': { icone: 'eye-off.svg',     fond: '#484850' }, // gris eteint : calque masque
  opacite:         { icone: 'blend.svg',       fond: '#d69430' }, // ambre
  brosse:          { icone: 'circle-dot.svg',  fond: '#58a858' }, // vert
};

// Les Lucide font 24 px ; on les pose a 40 px dans un carre de 72, ce qui
// laisse une marge suffisante pour que Stream Deck superpose son titre sans
// mordre sur le trace.
const COTE = 72;
const TAILLE_ICONE = 40;
const ECHELLE = TAILLE_ICONE / 24;
const MARGE = (COTE - TAILLE_ICONE) / 2;

// Recupere le contenu du SVG source, sans son enveloppe <svg>. Les attributs
// de trait sont reposes par le groupe parent : les Lucide utilisent
// `currentColor`, qui ne resoudrait rien dans un fichier autonome.
function traceLucide(nomFichier) {
  const brut = fs.readFileSync(path.join(sources, nomFichier), 'utf8');
  const debut = brut.indexOf('>', brut.indexOf('<svg')) + 1;
  const fin = brut.lastIndexOf('</svg>');
  return brut.slice(debut, fin).trim().split('\n').map((l) => '    ' + l.trim()).join('\n');
}

const resume = [];
for (const [nom, { icone, fond }] of Object.entries(ACTIONS)) {
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COTE} ${COTE}" width="${COTE}" height="${COTE}">
  <rect width="${COTE}" height="${COTE}" rx="12" fill="${fond}"/>
  <g transform="translate(${MARGE} ${MARGE}) scale(${ECHELLE})"
     fill="none" stroke="#ffffff" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
${traceLucide(icone)}
  </g>
</svg>
`;
  fs.writeFileSync(path.join(dossier, `${nom}.svg`), svg);
  resume.push(`${nom}.svg  ←  ${icone} sur ${fond}`);
}

// ---------------------------------------------------------------------------
// Icone du plugin et de la categorie, en PNG
// ---------------------------------------------------------------------------

// Les icones macOS portent une marge transparente (512 px dont ~410 utiles).
// Sur une vignette de galerie, cette marge est du gachis : on recadre sur la
// boite opaque avant de reduire.
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
    pixels.copy(sortie, y * l * 4,
      ((y + minY) * largeur + minX) * 4, ((y + minY) * largeur + minX + l) * 4);
  }
  return { largeur: l, hauteur: h, pixels: sortie };
}

const renard = recadrer(lirePng(path.join(sources, 'photocraft-icone-source.png')));

for (const [nom, base] of [['plugin', 72], ['category', 28]]) {
  for (const [suffixe, taille] of [['', base], ['@2x', base * 2]]) {
    const image = redimensionner(renard, taille, taille);
    ecrirePng(path.join(dossier, `${nom}${suffixe}.png`), taille, taille, image.pixels);
  }
  resume.push(`${nom}.png + @2x  ←  icone de l'application (${base}/${base * 2} px)`);
}

// Les PNG teintes de l'essai precedent n'ont plus de raison d'etre : les
// actions sont en SVG desormais.
for (const fichier of fs.readdirSync(dossier)) {
  const racine = fichier.replace(/(@2x)?\.png$/, '');
  if (fichier.endsWith('.png') && racine in ACTIONS) {
    fs.unlinkSync(path.join(dossier, fichier));
  }
}

console.log(`images ecrites dans ${path.relative(process.cwd(), dossier)} :`);
for (const ligne of resume) console.log('  ' + ligne);
