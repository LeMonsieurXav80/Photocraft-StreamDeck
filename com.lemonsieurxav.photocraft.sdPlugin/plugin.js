// Plugin Stream Deck pour PhotoCraft.
//
// PhotoCraft applique le principe « tout est une commande » : les 892 entrees
// de menu et d'outil vivent dans un seul registre, atteignable de l'exterieur.
// Le plugin en tire sa forme : il ne reimplemente aucune fonction de l'editeur,
// il poste des identifiants de commande dans une socket.
//
// Consequence voulue, la meme que pour Cockpit : ajouter une touche « Fusion
// des calques visibles » ne demande pas de code ici. L'action `commande` couvre
// deja les 892, parce qu'elle les decouvre au lieu de les declarer.
//
// Les trois autres actions existent uniquement parce qu'elles ont besoin d'un
// ETAT a afficher — l'outil actif, le nom du calque, la taille de brosse. Une
// touche qui ne sait pas ce qu'elle commande n'a pas besoin d'etre specialisee.
//
// Materiel vise : Stream Deck MK.2 — 15 touches, ni molette ni ecran tactile.
// Les reglages continus (taille de brosse, opacite) sont donc rendus par paires
// de touches a pas fixe, jamais par rotation.

import streamDeck, { SingletonAction } from '@elgato/streamdeck';
import { Controle } from './controle.js';

const PERIODE_SONDAGE = 1000;
const DUREE_FLASH = 1200;

// ---------------------------------------------------------------------------
// Connexion partagee
// ---------------------------------------------------------------------------

const controle = new Controle({ periodeSondage: PERIODE_SONDAGE });

// Toutes les touches visibles, quelle que soit leur action. Un seul instantane
// les repeint toutes : voir l'en-tete de controle.js pour pourquoi.
const touches = new Map(); // id d'action -> { action, peindre(), flash: horodatage }

function peindreTout() {
  for (const touche of touches.values()) {
    if (touche.flash && Date.now() < touche.flash) continue; // ne pas ecraser un retour en cours
    try {
      touche.peindre();
    } catch (e) {
      streamDeck.logger.error(`peinture echouee : ${e.message}`);
    }
  }
}

controle.on('etat', peindreTout);
controle.on('connecte', () => streamDeck.logger.info('canal de controle connecte'));
controle.on('deconnecte', (motif) => streamDeck.logger.warn(`canal perdu : ${motif}`));

// Reglages globaux : port et fichier de jeton. Ils sont globaux et non par
// touche — il n'y a qu'une instance de PhotoCraft a piloter, et demander le
// jeton quinze fois serait quinze occasions de se tromper.
async function appliquerReglages(reglages) {
  const port = Number(reglages?.port) || 7878;
  const fichierJeton = reglages?.fichierJeton?.trim() || null;
  if (port === controle.port && fichierJeton === controle.fichierJeton) return;
  streamDeck.logger.info(`reconfiguration : port ${port}, jeton ${fichierJeton ?? '(absent)'}`);
  controle.reconfigurer({ port, fichierJeton });
}

// ---------------------------------------------------------------------------
// Outils de rendu des touches
// ---------------------------------------------------------------------------

// Un titre de touche MK.2 tient sur ~8 caracteres par ligne. On coupe sur les
// espaces et les separateurs de casse plutot que de laisser Stream Deck rogner
// au milieu d'un mot.
function titreCourt(texte, lignes = 3, largeur = 9) {
  if (!texte) return '';
  const mots = String(texte)
    .replace(/[…]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s/]+/)
    .filter(Boolean);
  const sortie = [];
  let courante = '';
  for (const mot of mots) {
    if (!courante) { courante = mot; continue; }
    if ((courante + ' ' + mot).length <= largeur) { courante += ' ' + mot; continue; }
    sortie.push(courante);
    courante = mot;
    if (sortie.length === lignes) break;
  }
  if (courante && sortie.length < lignes) sortie.push(courante);
  return sortie.slice(0, lignes).join('\n');
}

// Etat de la touche quand le canal est absent. C'est le cas le plus frequent au
// demarrage du Mac — Stream Deck se lance avant PhotoCraft — et c'est
// exactement la situation ou le plugin EcoFlow affichait « ? » sans rien dire.
function titreHorsLigne() {
  return controle.motif?.includes('ecoute') ? 'PhotoCraft\nnon lance' : 'canal\nabsent';
}

function enregistrer(action, peindre) {
  touches.set(action.id, { action, peindre, flash: 0 });
  peindre();
}

async function flash(action, texte, duree = DUREE_FLASH) {
  const touche = touches.get(action.id);
  if (touche) touche.flash = Date.now() + duree;
  await action.setTitle(texte);
  setTimeout(() => {
    const t = touches.get(action.id);
    if (!t) return;
    t.flash = 0;
    try { t.peindre(); } catch {}
  }, duree);
}

// Un echec de commande n'est jamais avale : PhotoCraft renvoie des messages
// exploitables ("unknown blend mode `X`", "no document"), et les montrer est la
// seule facon de diagnostiquer une touche mal reglee sans ouvrir les logs.
async function echec(action, erreur) {
  streamDeck.logger.warn(`commande refusee : ${erreur.message}`);
  await action.showAlert();
  await flash(action, titreCourt(erreur.message, 3, 10));
}

// ---------------------------------------------------------------------------
// Action generique : n'importe laquelle des 892 commandes
// ---------------------------------------------------------------------------

class ActionCommande extends SingletonAction {
  constructor() {
    super();
    // Pas de decorateur `@action` : ce fichier est du JS pur charge tel quel par
    // Stream Deck, sans etape de build, et Node ne sait pas lire les decorateurs.
    // Le `manifestId` pose a la main fait le meme travail. Sans lui, le SDK 3
    // leve « The action's manifestId cannot be undefined » et le plugin meurt au
    // demarrage, avant la premiere touche.
    this.manifestId = 'com.lemonsieurxav.photocraft.commande';
  }

  async onWillAppear(ev) {
    await appliquerReglages(await streamDeck.settings.getGlobalSettings());
    const peindre = () => {
      const reglages = ev.payload.settings ?? {};
      if (!controle.authentifie) { ev.action.setTitle(titreHorsLigne()); return; }
      ev.action.setTitle(titreCourt(reglages.libelle || reglages.commande || 'commande'));
    };
    enregistrer(ev.action, peindre);
    controle.demarrer();
  }

  onWillDisappear(ev) { touches.delete(ev.action.id); }

  async onKeyDown(ev) {
    const reglages = ev.payload.settings ?? {};
    if (!reglages.commande) { await flash(ev.action, 'a regler'); return; }

    let params = {};
    if (reglages.params?.trim()) {
      try {
        params = JSON.parse(reglages.params);
      } catch (e) {
        await echec(ev.action, new Error('parametres JSON invalides'));
        return;
      }
    }

    try {
      await controle.executer(reglages.commande, params);
      await controle.rafraichir();
      await ev.action.showOk();
    } catch (e) {
      await echec(ev.action, e);
    }
  }

  // L'inspecteur demande la liste des commandes pour peupler son menu : on la
  // lit dans PhotoCraft au moment ou on en a besoin. Rien n'est code en dur —
  // PhotoCraft est en alpha, les identifiants bougeront, et une liste figee
  // dans le plugin perimerait en silence.
  async onSendToPlugin(ev) {
    if (ev.payload?.demande !== 'commandes') return;
    try {
      const liste = await controle.commandes();
      await streamDeck.ui.current?.sendToPropertyInspector({
        reponse: 'commandes',
        commandes: liste
          .map((c) => ({
            id: c.id,
            libelle: c.label ?? c.id,
            menu: Array.isArray(c.menu) ? c.menu.join(' › ') : '',
            params: c.params ?? '',
            raccourci: c.shortcut ?? '',
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      });
    } catch (e) {
      await streamDeck.ui.current?.sendToPropertyInspector({ reponse: 'commandes', erreur: e.message });
    }
  }
}

// ---------------------------------------------------------------------------
// Outil actif
// ---------------------------------------------------------------------------

class ActionOutil extends SingletonAction {
  constructor() {
    super();
    // Pas de decorateur `@action` : ce fichier est du JS pur charge tel quel par
    // Stream Deck, sans etape de build, et Node ne sait pas lire les decorateurs.
    // Le `manifestId` pose a la main fait le meme travail. Sans lui, le SDK 3
    // leve « The action's manifestId cannot be undefined » et le plugin meurt au
    // demarrage, avant la premiere touche.
    this.manifestId = 'com.lemonsieurxav.photocraft.outil';
  }

  async onWillAppear(ev) {
    await appliquerReglages(await streamDeck.settings.getGlobalSettings());
    const peindre = () => {
      const voulu = ev.payload.settings?.outil;
      if (!controle.authentifie) { ev.action.setTitle(titreHorsLigne()); return; }
      if (!voulu) { ev.action.setTitle('a regler'); return; }
      // Marquer l'outil actif : c'est tout l'interet d'avoir une action dediee
      // plutot que de passer par `commande`.
      const actif = controle.outil === voulu;
      ev.action.setTitle((actif ? '● ' : '') + titreCourt(voulu, 2));
      ev.action.setState(actif ? 1 : 0);
    };
    enregistrer(ev.action, peindre);
    controle.demarrer();
  }

  onWillDisappear(ev) { touches.delete(ev.action.id); }

  async onKeyDown(ev) {
    const outil = ev.payload.settings?.outil;
    if (!outil) { await flash(ev.action, 'a regler'); return; }
    try {
      await controle.appeler('ui.set', { tool: outil });
      await controle.rafraichir();
    } catch (e) {
      await echec(ev.action, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Calque actif : navigation, visibilite, opacite, fusion
// ---------------------------------------------------------------------------

const OPERATIONS_CALQUE = {
  dessus:    { commande: 'layer.selectAbove', etiquette: 'Calque\n▲' },
  dessous:   { commande: 'layer.selectBelow', etiquette: 'Calque\n▼' },
  masquer:   { commande: 'layer.hideLayers',  etiquette: 'Visible' },
  seul:      { commande: 'layer.showOnly',    etiquette: 'Seul' },
  fusionner: { commande: 'layer.mergeDown',   etiquette: 'Fusion\nbas' },
  tampon:    { commande: 'layer.stampVisible', etiquette: 'Tampon\nvisible' },
  dupliquer: { commande: 'layer.duplicate',   etiquette: 'Dupli-\nquer' },
  aplatir:   { commande: 'layer.flattenImage', etiquette: 'Aplatir' },
};

class ActionCalque extends SingletonAction {
  constructor() {
    super();
    // Pas de decorateur `@action` : ce fichier est du JS pur charge tel quel par
    // Stream Deck, sans etape de build, et Node ne sait pas lire les decorateurs.
    // Le `manifestId` pose a la main fait le meme travail. Sans lui, le SDK 3
    // leve « The action's manifestId cannot be undefined » et le plugin meurt au
    // demarrage, avant la premiere touche.
    this.manifestId = 'com.lemonsieurxav.photocraft.calque';
  }

  async onWillAppear(ev) {
    await appliquerReglages(await streamDeck.settings.getGlobalSettings());
    const peindre = () => {
      const reglages = ev.payload.settings ?? {};
      const operation = reglages.operation ?? 'dessus';
      if (!controle.authentifie) { ev.action.setTitle(titreHorsLigne()); return; }
      if (!controle.documentOuvert) { ev.action.setTitle('aucun\ndocument'); return; }

      const calque = controle.calqueActif;
      const base = OPERATIONS_CALQUE[operation]?.etiquette ?? operation;

      // La navigation affiche le calque courant : sans ca, la touche ne dit pas
      // ou on en est dans une pile de trente calques.
      if (operation === 'dessus' || operation === 'dessous') {
        ev.action.setTitle(`${base}\n${titreCourt(calque?.name ?? '—', 1, 10)}`);
        return;
      }
      if (operation === 'masquer') {
        ev.action.setTitle(calque?.visible ? 'Visible\n●' : 'Masque\n○');
        ev.action.setState(calque?.visible ? 0 : 1);
        return;
      }
      ev.action.setTitle(base);
    };
    enregistrer(ev.action, peindre);
    controle.demarrer();
  }

  onWillDisappear(ev) { touches.delete(ev.action.id); }

  async onKeyDown(ev) {
    const operation = ev.payload.settings?.operation ?? 'dessus';
    const entree = OPERATIONS_CALQUE[operation];
    if (!entree) { await echec(ev.action, new Error(`operation inconnue : ${operation}`)); return; }
    try {
      await controle.executer(entree.commande);
      await controle.rafraichir();
    } catch (e) {
      await echec(ev.action, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Opacite du calque actif, par pas
// ---------------------------------------------------------------------------

class ActionOpacite extends SingletonAction {
  constructor() {
    super();
    // Pas de decorateur `@action` : ce fichier est du JS pur charge tel quel par
    // Stream Deck, sans etape de build, et Node ne sait pas lire les decorateurs.
    // Le `manifestId` pose a la main fait le meme travail. Sans lui, le SDK 3
    // leve « The action's manifestId cannot be undefined » et le plugin meurt au
    // demarrage, avant la premiere touche.
    this.manifestId = 'com.lemonsieurxav.photocraft.opacite';
  }

  async onWillAppear(ev) {
    await appliquerReglages(await streamDeck.settings.getGlobalSettings());
    const peindre = () => {
      if (!controle.authentifie) { ev.action.setTitle(titreHorsLigne()); return; }
      if (!controle.documentOuvert) { ev.action.setTitle('aucun\ndocument'); return; }
      const reglages = ev.payload.settings ?? {};
      const calque = controle.calqueActif;
      const pourcent = calque ? Math.round(calque.opacity * 100) : null;
      const signe = reglages.mode === 'absolu'
        ? `= ${Math.round(Number(reglages.valeur ?? 100))}%`
        : `${Number(reglages.pas ?? 10) >= 0 ? '+' : '−'}${Math.abs(Number(reglages.pas ?? 10))}%`;
      ev.action.setTitle(`Opacite\n${pourcent ?? '—'}%\n${signe}`);
    };
    enregistrer(ev.action, peindre);
    controle.demarrer();
  }

  onWillDisappear(ev) { touches.delete(ev.action.id); }

  async onKeyDown(ev) {
    const reglages = ev.payload.settings ?? {};
    try {
      let cible;
      if (reglages.mode === 'absolu') {
        cible = Number(reglages.valeur ?? 100) / 100;
      } else {
        // Un pas relatif se calcule sur l'etat REEL, pas sur une valeur gardee
        // par la touche : l'utilisateur a pu bouger le curseur dans PhotoCraft
        // entre deux appuis, et une touche qui compte toute seule derive.
        const calque = controle.calqueActif;
        if (!calque) throw new Error('aucun calque actif');
        cible = calque.opacity + Number(reglages.pas ?? 10) / 100;
      }
      cible = Math.min(1, Math.max(0, cible));
      await controle.executer('layer.setProps', { opacity: cible });
      await controle.rafraichir();
    } catch (e) {
      await echec(ev.action, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Brosse : taille et durete
// ---------------------------------------------------------------------------

// PhotoCraft expose deja les quatre pas en commandes dediees. On les utilise
// plutot que de recalculer une taille et de la poser avec `tools.setBrush` :
// les pas de l'application suivent sa propre progression (non lineaire), et la
// refaire a la main donnerait des increments differents du clavier.
const OPERATIONS_BROSSE = {
  'taille+':  { commande: 'tools.increaseBrushSize',     etiquette: 'Taille +' },
  'taille-':  { commande: 'tools.decreaseBrushSize',     etiquette: 'Taille −' },
  'durete+':  { commande: 'tools.increaseBrushHardness', etiquette: 'Durete +' },
  'durete-':  { commande: 'tools.decreaseBrushHardness', etiquette: 'Durete −' },
};

class ActionBrosse extends SingletonAction {
  constructor() {
    super();
    // Pas de decorateur `@action` : ce fichier est du JS pur charge tel quel par
    // Stream Deck, sans etape de build, et Node ne sait pas lire les decorateurs.
    // Le `manifestId` pose a la main fait le meme travail. Sans lui, le SDK 3
    // leve « The action's manifestId cannot be undefined » et le plugin meurt au
    // demarrage, avant la premiere touche.
    this.manifestId = 'com.lemonsieurxav.photocraft.brosse';
  }

  async onWillAppear(ev) {
    await appliquerReglages(await streamDeck.settings.getGlobalSettings());
    const peindre = () => {
      if (!controle.authentifie) { ev.action.setTitle(titreHorsLigne()); return; }
      const operation = ev.payload.settings?.operation ?? 'taille+';
      const entree = OPERATIONS_BROSSE[operation];
      const brosse = controle.brosse;
      const valeur = operation.startsWith('taille')
        ? (brosse ? `${Math.round(brosse.size)} px` : '—')
        : (brosse ? `${Math.round(brosse.hardness * 100)} %` : '—');
      ev.action.setTitle(`${entree?.etiquette ?? operation}\n${valeur}`);
    };
    enregistrer(ev.action, peindre);
    controle.demarrer();
  }

  onWillDisappear(ev) { touches.delete(ev.action.id); }

  async onKeyDown(ev) {
    const operation = ev.payload.settings?.operation ?? 'taille+';
    const entree = OPERATIONS_BROSSE[operation];
    if (!entree) { await echec(ev.action, new Error(`operation inconnue : ${operation}`)); return; }
    try {
      // Un appui maintenu envoie une rafale d'appuis : les enchainer en serie
      // suffit, le serveur traite une requete a la fois par connexion.
      await controle.executer(entree.commande);
      await controle.rafraichir();
    } catch (e) {
      await echec(ev.action, e);
    }
  }
}

// ---------------------------------------------------------------------------

streamDeck.settings.onDidReceiveGlobalSettings((ev) => appliquerReglages(ev.settings));

// INFO et non le defaut : comme pour Cockpit, le log du plugin est le seul
// moyen d'observation, et un log vide ne permet pas de distinguer « tout va
// bien » de « le code n'est jamais arrive la ».
streamDeck.logger.setLevel('info');
streamDeck.logger.info('plugin PhotoCraft demarre');

streamDeck.actions.registerAction(new ActionCommande());
streamDeck.actions.registerAction(new ActionOutil());
streamDeck.actions.registerAction(new ActionCalque());
streamDeck.actions.registerAction(new ActionOpacite());
streamDeck.actions.registerAction(new ActionBrosse());
streamDeck.connect();
