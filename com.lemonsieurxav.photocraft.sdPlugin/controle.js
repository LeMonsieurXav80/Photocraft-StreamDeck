// Client du canal de controle PhotoCraft.
//
// Le protocole est un echange requete/reponse en JSON, une ligne par message,
// sur une socket TCP loopback. Il n'emet AUCUNE notification : pour savoir que
// l'outil actif a change, il faut redemander l'etat.
//
// D'ou les deux regles qui structurent ce fichier :
//
//   1. UNE SEULE connexion pour tout le plugin. Le serveur n'en accepte que 16
//      simultanees ; une par touche epuiserait le quota des le huitieme bouton,
//      et la quinzieme touche se verrait refuser l'acces.
//   2. UN SEUL `ui.inspect` periodique, dont le resultat est diffuse aux
//      touches abonnees. Quinze touches qui sondent chacune l'etat, c'est
//      quinze fois le meme travail dans le thread UI de PhotoCraft, pour une
//      application dont l'utilisateur est en train de peindre.
//
// L'etat circule donc dans un sens unique : le sondage produit un instantane,
// les touches le lisent. Elles n'interrogent jamais l'application elles-memes.

import net from 'node:net';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

const HOTE = '127.0.0.1';
const DELAI_REPONSE = 30000;
const RECONNEXION_MIN = 1000;
const RECONNEXION_MAX = 15000;

export class Controle extends EventEmitter {
  constructor({ port = 7878, fichierJeton = null, jeton = null, periodeSondage = 1000 } = {}) {
    super();
    this.port = port;
    this.fichierJeton = fichierJeton;
    this.jetonDirect = jeton;
    this.periodeSondage = periodeSondage;

    this.socket = null;
    this.connecte = false;
    this.authentifie = false;
    this.etat = null;           // dernier ui.inspect
    this.motif = null;          // pourquoi on n'est pas connecte

    this._tampon = '';
    this._attentes = new Map();
    this._prochainId = 1;
    this._reconnexion = RECONNEXION_MIN;
    this._minuteurReconnexion = null;
    this._minuteurSondage = null;
    this._arrete = false;
    this._sondageEnCours = false;
  }

  // --- cycle de vie -------------------------------------------------------

  demarrer() {
    this._arrete = false;
    this._connecter();
  }

  arreter() {
    this._arrete = true;
    clearTimeout(this._minuteurReconnexion);
    clearInterval(this._minuteurSondage);
    this.socket?.destroy();
    this.socket = null;
    this.connecte = false;
    this.authentifie = false;
  }

  // Relit la configuration et repart de zero : le port ou le jeton ont change.
  reconfigurer(options) {
    Object.assign(this, options);
    this.arreter();
    this.etat = null;
    this.demarrer();
  }

  _lireJeton() {
    if (this.jetonDirect) return this.jetonDirect.trim();
    if (!this.fichierJeton) throw new Error('aucun jeton : renseigner le fichier de jeton dans les reglages');
    // Le fichier est reecrit a chaque lancement de PhotoCraft si on lui passe
    // --control-token-file : le relire a chaque connexion, jamais le mettre en
    // cache, sinon toute reconnexion apres un redemarrage de l'app echoue en
    // boucle sur un jeton perime.
    return fs.readFileSync(this.fichierJeton, 'utf8').trim();
  }

  _connecter() {
    if (this._arrete) return;

    let jeton;
    try {
      jeton = this._lireJeton();
    } catch (e) {
      this._echec(`jeton illisible : ${e.message}`);
      return;
    }
    if (!/^[0-9a-f]{64}$/i.test(jeton)) {
      this._echec('jeton invalide : 64 caracteres hexadecimaux attendus');
      return;
    }

    const socket = net.createConnection({ host: HOTE, port: this.port });
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    socket.on('connect', async () => {
      this.connecte = true;
      try {
        const reponse = await this._envoyer('auth', { token: jeton });
        if (!reponse.ok) { this._echec(`authentification refusee : ${reponse.error}`); return; }
        this.authentifie = true;
        this._reconnexion = RECONNEXION_MIN;
        this.motif = null;
        this.emit('connecte');
        this._lancerSondage();
      } catch (e) {
        this._echec(`authentification sans reponse : ${e.message}`);
      }
    });

    socket.on('data', (bloc) => this._recevoir(bloc));

    socket.on('error', (e) => {
      // ECONNREFUSED est le cas NORMAL, pas une anomalie : PhotoCraft n'est pas
      // lance, ou l'est sans --control. Le dire en clair sur la touche plutot
      // que de laisser un "?" enigmatique.
      const motif = e.code === 'ECONNREFUSED'
        ? `rien n'ecoute sur ${HOTE}:${this.port} — PhotoCraft lance sans --control ?`
        : e.message;
      this._echec(motif);
    });

    socket.on('close', () => {
      if (this.authentifie || this.connecte) this._echec('connexion fermee');
    });
  }

  _echec(motif) {
    this.motif = motif;
    const etaitActif = this.authentifie;
    this.connecte = false;
    this.authentifie = false;
    clearInterval(this._minuteurSondage);
    this.socket?.destroy();
    this.socket = null;

    // Toute requete en vol ne recevra jamais sa reponse : la rejeter tout de
    // suite plutot que de laisser quinze promesses expirer dans 30 secondes.
    for (const [id, { rejeter }] of this._attentes) {
      this._attentes.delete(id);
      rejeter(new Error(motif));
    }

    if (etaitActif) this.emit('deconnecte', motif);
    this.emit('etat', null);

    if (this._arrete) return;
    clearTimeout(this._minuteurReconnexion);
    this._minuteurReconnexion = setTimeout(() => this._connecter(), this._reconnexion);
    this._reconnexion = Math.min(this._reconnexion * 2, RECONNEXION_MAX);
  }

  // --- protocole ----------------------------------------------------------

  _recevoir(bloc) {
    this._tampon += bloc;
    let coupe;
    while ((coupe = this._tampon.indexOf('\n')) !== -1) {
      const ligne = this._tampon.slice(0, coupe).trim();
      this._tampon = this._tampon.slice(coupe + 1);
      if (!ligne) continue;
      let message;
      try {
        message = JSON.parse(ligne);
      } catch {
        continue; // une ligne illisible ne doit pas tuer la connexion
      }
      const attente = this._attentes.get(String(message.id));
      if (!attente) continue;
      this._attentes.delete(String(message.id));
      clearTimeout(attente.minuteur);
      attente.resoudre(message);
    }
  }

  _envoyer(methode, params = {}) {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error(this.motif ?? 'non connecte'));
    const id = String(this._prochainId++);
    return new Promise((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        this._attentes.delete(id);
        rejeter(new Error(`pas de reponse a ${methode}`));
      }, DELAI_REPONSE);
      this._attentes.set(id, { resoudre, rejeter, minuteur });
      socket.write(JSON.stringify({ id, method: methode, params }) + '\n');
    });
  }

  // Appel brut, pour le reste du plugin. Leve si la commande a echoue, avec le
  // message de PhotoCraft tel quel : il est explicite ("unknown blend mode
  // `PasUnBlend`"), il n'y a rien a reformuler par-dessus.
  async appeler(methode, params = {}) {
    const reponse = await this._envoyer(methode, params);
    if (!reponse.ok) throw new Error(reponse.error ?? 'echec sans motif');
    return reponse.result;
  }

  // Execute une commande du registre. Un echec previsible — commande desactivee
  // faute de document ouvert, parametre hors bornes — remonte comme une erreur
  // normale : c'est a la touche de l'afficher, pas au client de la masquer.
  executer(commande, params = {}) {
    return this.appeler('engine.execute', { command: commande, params });
  }

  // Liste des 892 commandes, avec leur etat d'activation a cet instant.
  async commandes() {
    const resultat = await this.appeler('engine.commands');
    const brut = resultat?.commands ?? resultat ?? [];
    return Array.isArray(brut)
      ? brut
      : Object.entries(brut).map(([id, valeur]) => ({ id, ...valeur }));
  }

  // --- sondage ------------------------------------------------------------

  _lancerSondage() {
    clearInterval(this._minuteurSondage);
    this._sonder();
    this._minuteurSondage = setInterval(() => this._sonder(), this.periodeSondage);
  }

  async _sonder() {
    if (!this.authentifie || this._sondageEnCours) return;
    // Un sondage lent ne doit pas s'empiler sur le precedent : PhotoCraft repond
    // dans le thread UI, et une rafale de ui.inspect pendant un filtre lourd
    // ferait la queue au lieu de se perimer.
    this._sondageEnCours = true;
    try {
      this.etat = await this.appeler('ui.inspect');
      this.emit('etat', this.etat);
    } catch (e) {
      // Pas de _echec() ici : une reponse manquee n'est pas une rupture de
      // connexion. Si la socket est reellement morte, 'error'/'close' s'en
      // chargent.
    } finally {
      this._sondageEnCours = false;
    }
  }

  // Force un rafraichissement immediat : appele juste apres une commande, pour
  // que la touche montre le resultat sans attendre le prochain tick.
  rafraichir() {
    return this._sonder();
  }

  // --- lectures d'etat ----------------------------------------------------
  // Des accesseurs plutot que des acces directs dans les actions : les chemins
  // exacts (`views[0].zoom`, `document.layers`) sont de l'alpha, ils bougeront.
  // Un seul endroit a corriger le jour ou ils bougent.

  get outil() { return this.etat?.tool ?? null; }
  get brosse() { return this.etat?.brush ?? null; }
  get document() { return this.etat?.document ?? null; }
  get calques() { return this.etat?.document?.layers ?? []; }

  get calqueActif() {
    const document = this.document;
    if (!document) return null;
    return this.calques.find((c) => c.id === document.activeLayer) ?? null;
  }

  get zoom() { return this.etat?.views?.[0]?.zoom ?? null; }
  get documentOuvert() { return this.document != null; }
}
