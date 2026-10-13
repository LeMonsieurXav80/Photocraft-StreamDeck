# CLAUDE.md

Guidance pour Claude Code dans ce depot.

## Ce que c'est

Plugin Stream Deck pour **PhotoCraft** (suite ArtCraft, `storytold/photocraft`), pilote par le
**canal de controle local** que PhotoCraft expose deja : socket TCP loopback, JSON ligne par
ligne, jeton de 64 hex.

Rien n'est compile, rien n'est transpile. JS pur ESM, SDK Stream Deck **3.x**, une seule
dependance (`@elgato/streamdeck`). Depot public, licence MIT.

**Lire [`docs/canal-de-controle.md`](docs/canal-de-controle.md) avant de toucher au code.** Il
contient le releve reel du protocole — limites, pieges de nommage, correspondance avec le
plugin Photoshop d'Elgato — et non ce que la documentation en dit.

## Les trois contraintes qui expliquent le code

**1. Le canal n'emet aucune notification.** Strictement requete/reponse. Pour afficher l'outil
actif, il faut le redemander. D'ou : **une seule connexion, un seul sondage, un instantane
diffuse** a toutes les touches (`controle.js`). Ne jamais ajouter une connexion ou un sondage
par touche — le serveur plafonne a 16 connexions, et un MK.2 a quinze touches plus les
inspecteurs ouverts.

**2. Un seul sondage en vol a la fois.** Pendant un filtre lourd, les reponses tardent ; une
rafale de `ui.inspect` ferait la queue au lieu de se perimer. C'est le role de
`_sondageEnCours`.

**3. Les chemins d'etat sont de l'alpha.** `views[0].zoom`, `document.layers` : ils bougeront.
Ils sont lus **uniquement** dans les accesseurs en bas de `controle.js`, jamais dans les
actions. Un seul endroit a corriger.

## Pieges deja payes

- **`manifestId` pose a la main** dans chaque constructeur d'action. Pas de decorateur
  `@action` : JS pur sans etape de build, Node ne lit pas les decorateurs. Sans lui, le SDK 3
  leve « The action's manifestId cannot be undefined » et le plugin meurt avant la premiere
  touche.
- **`Software.MinimumVersion` doit valoir au moins `7.1`**, pas `6.9`. Le comportement par
  defaut de `onDidReceiveGlobalSettings` l'exige, et le SDK refuse de se connecter sinon. 7.1
  satisfait aussi le plancher du Marketplace.
- **`streamdeck validate` ne voit ni l'un ni l'autre.** Les deux ont ete trouves en deployant
  et en lisant `logs/*.log`. Valider ne dispense pas de deployer et de lire le journal.
- **L'UUID de l'action arrive dans le 5e argument** de `connectElgatoStreamDeckSocket`. Sans
  lui, `sendToPlugin` part sans destinataire et la liste des commandes n'arrive jamais.
- **Installer par copie, jamais par symlink** vers `/Volumes/Samsung_T5`. Voir le CLAUDE.md du
  classeur : Stream Deck demarre avant que le disque externe soit monte.

## Commandes

```bash
# Ouvrir le canal sur PhotoCraft (il n'est PAS actif par defaut)
/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft \
  --control 7878 --control-token-file ~/.photocraft/control.token

# Relever ce que la version installee expose (892 commandes sur 0.8.2)
node tools/recon.mjs 7878 ~/.photocraft/control.token releve.json

# Refabriquer les images (teinte l'icone de PhotoCraft ; aucune dependance)
node tools/icones.mjs

# Valider, installer, recharger
streamdeck validate com.lemonsieurxav.photocraft.sdPlugin
./deploy.sh
osascript -e 'quit app "Elgato Stream Deck"' && sleep 3 && open -a 'Elgato Stream Deck'

# Le seul moyen d'observation
tail -f "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.lemonsieurxav.photocraft.sdPlugin/logs/"*.log
```

Pas de tests. `controle.js` s'exerce hors Stream Deck en l'important dans un script : c'est
ainsi que le scenario complet a ete valide.

## Langue

Francais — code, commentaires, UI, libelles. Les identifiants techniques restent en anglais
sans accent, et les identifiants de commandes PhotoCraft (`layer.stampVisible`) se citent tels
quels.

## A ne pas faire

- **Ne pas coder en dur la liste des commandes.** Elle se lit via `engine.commands` au moment
  du reglage. PhotoCraft est en alpha : une liste figee perimerait en silence.
- **Ne pas recalculer les pas de brosse.** `tools.increaseBrushSize` suit la progression de
  l'application (non lineaire) ; la refaire donnerait des increments differents du clavier.
  Taille et durete sont de plus **propres a chaque outil**.
- **Ne pas versionner le jeton.** Il donne un acces complet : ouvrir des fichiers, en ecrire,
  executer les 892 commandes. `.gitignore` couvre `*.token`.
- **Ne pas redessiner les icones.** Elles derivent de l'icone de PhotoCraft, seul le fond est
  teinte, et `tools/NOTICE.md` explique pourquoi et ce que cela implique cote marque. Changer
  une couleur se fait dans `TEINTES`, pas dans un editeur d'images.
- **Ne pas avaler les erreurs de PhotoCraft.** Ses messages sont exploitables
  (« unknown blend mode `X` ») ; les afficher sur la touche est le seul diagnostic disponible
  sans ouvrir les logs.
