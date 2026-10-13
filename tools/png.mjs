// Lecture et ecriture de PNG, sans dependance.
//
// Le depot n'a volontairement aucune etape de build ni bibliotheque de dessin.
// Les images des touches derivent de l'icone de PhotoCraft, ce qui demande de
// lire des pixels : zlib (dans node:) et une cinquantaine de lignes suffisent,
// la ou une bibliotheque imposerait un npm install pour fabriquer huit fichiers.
//
// Couvre ce dont on a besoin : 8 bits par canal, RGB ou RGBA, non entrelace.

import fs from 'node:fs';
import zlib from 'node:zlib';

// --- lecture --------------------------------------------------------------

export function lirePng(chemin) {
  const fichier = fs.readFileSync(chemin);
  if (fichier.readUInt32BE(0) !== 0x89504e47) throw new Error(`${chemin} n'est pas un PNG`);

  let position = 8;
  let largeur = 0, hauteur = 0, profondeur = 0, type = 0, entrelace = 0;
  const morceaux = [];

  while (position < fichier.length) {
    const longueur = fichier.readUInt32BE(position);
    const nom = fichier.toString('ascii', position + 4, position + 8);
    const donnees = fichier.subarray(position + 8, position + 8 + longueur);
    if (nom === 'IHDR') {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      profondeur = donnees[8];
      type = donnees[9];
      entrelace = donnees[12];
    } else if (nom === 'IDAT') {
      morceaux.push(donnees);
    } else if (nom === 'IEND') {
      break;
    }
    position += 12 + longueur;
  }

  if (profondeur !== 8) throw new Error(`profondeur ${profondeur} non geree (8 attendue)`);
  if (type !== 2 && type !== 6) throw new Error(`type de couleur ${type} non gere (2 ou 6 attendus)`);
  if (entrelace !== 0) throw new Error('PNG entrelace non gere');

  const canaux = type === 6 ? 4 : 3;
  const brut = zlib.inflateSync(Buffer.concat(morceaux));
  const parLigne = largeur * canaux;
  const pixels = Buffer.alloc(hauteur * largeur * 4);

  let lignePrecedente = Buffer.alloc(parLigne);
  let lecture = 0;

  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[lecture++];
    const ligne = Buffer.from(brut.subarray(lecture, lecture + parLigne));
    lecture += parLigne;

    // Defiltrage : chaque ligne PNG est encodee en difference avec ses voisins.
    for (let i = 0; i < parLigne; i++) {
      const gauche = i >= canaux ? ligne[i - canaux] : 0;
      const haut = lignePrecedente[i];
      const diagonale = i >= canaux ? lignePrecedente[i - canaux] : 0;
      let valeur = ligne[i];
      switch (filtre) {
        case 0: break;
        case 1: valeur += gauche; break;
        case 2: valeur += haut; break;
        case 3: valeur += (gauche + haut) >> 1; break;
        case 4: {
          const p = gauche + haut - diagonale;
          const dg = Math.abs(p - gauche), dh = Math.abs(p - haut), dd = Math.abs(p - diagonale);
          valeur += (dg <= dh && dg <= dd) ? gauche : (dh <= dd ? haut : diagonale);
          break;
        }
        default: throw new Error(`filtre ${filtre} inconnu`);
      }
      ligne[i] = valeur & 0xff;
    }
    lignePrecedente = ligne;

    for (let x = 0; x < largeur; x++) {
      const source = x * canaux;
      const cible = (y * largeur + x) * 4;
      pixels[cible] = ligne[source];
      pixels[cible + 1] = ligne[source + 1];
      pixels[cible + 2] = ligne[source + 2];
      pixels[cible + 3] = canaux === 4 ? ligne[source + 3] : 255;
    }
  }

  return { largeur, hauteur, pixels };
}

// --- ecriture -------------------------------------------------------------

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(donnees) {
  let crc = 0xffffffff;
  for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bloc(nom, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(nom, 'ascii'), donnees]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, somme]);
}

export function ecrirePng(chemin, largeur, hauteur, pixels) {
  const brut = Buffer.alloc(hauteur * (largeur * 4 + 1));
  let ecriture = 0;
  for (let y = 0; y < hauteur; y++) {
    brut[ecriture++] = 0; // aucun filtre : les icones sont petites
    pixels.copy(brut, ecriture, y * largeur * 4, (y + 1) * largeur * 4);
    ecriture += largeur * 4;
  }
  fs.writeFileSync(chemin, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', Buffer.from([
      largeur >>> 24, (largeur >>> 16) & 255, (largeur >>> 8) & 255, largeur & 255,
      hauteur >>> 24, (hauteur >>> 16) & 255, (hauteur >>> 8) & 255, hauteur & 255,
      8, 6, 0, 0, 0,
    ])),
    bloc('IDAT', zlib.deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]));
}

// --- reechantillonnage ----------------------------------------------------

// Moyenne par boite : l'icone source fait 512 px, les touches en demandent 72.
// Un simple prelevement du plus proche voisin detruirait le trait fin du dessin.
export function redimensionner({ largeur, hauteur, pixels }, cibleL, cibleH) {
  const sortie = Buffer.alloc(cibleL * cibleH * 4);
  const facteurX = largeur / cibleL;
  const facteurY = hauteur / cibleH;

  for (let y = 0; y < cibleH; y++) {
    const y0 = Math.floor(y * facteurY), y1 = Math.max(y0 + 1, Math.floor((y + 1) * facteurY));
    for (let x = 0; x < cibleL; x++) {
      const x0 = Math.floor(x * facteurX), x1 = Math.max(x0 + 1, Math.floor((x + 1) * facteurX));
      let r = 0, v = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < hauteur; sy++) {
        for (let sx = x0; sx < x1 && sx < largeur; sx++) {
          const i = (sy * largeur + sx) * 4;
          const alpha = pixels[i + 3] / 255;
          // Moyenne ponderee par l'alpha : sans cela, les pixels transparents
          // des coins arrondis tireraient le trait vers du noir delave.
          r += pixels[i] * alpha; v += pixels[i + 1] * alpha; b += pixels[i + 2] * alpha;
          a += pixels[i + 3];
          n++;
        }
      }
      const i = (y * cibleL + x) * 4;
      const poids = a / 255 || 1;
      sortie[i] = Math.round(r / poids);
      sortie[i + 1] = Math.round(v / poids);
      sortie[i + 2] = Math.round(b / poids);
      sortie[i + 3] = Math.round(a / n);
    }
  }
  return { largeur: cibleL, hauteur: cibleH, pixels: sortie };
}
