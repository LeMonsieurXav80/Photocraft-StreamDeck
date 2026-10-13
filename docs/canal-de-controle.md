# Le canal de controle de PhotoCraft, vu d'un plugin Stream Deck

Releve effectue sur **PhotoCraft 0.8.2 (d43db3e15, 2026-10-12)**, macOS, build officielle
telechargee — pas une compilation maison. Tout ce qui suit a ete verifie en executant les
requetes, pas en lisant la documentation.

`docs/recon-0.8.2.json` contient le releve brut : les 892 commandes avec leur libelle, leur
chemin de menu, leur raccourci et leur schema de parametres, plus un `ui.inspect` complet.
Il est regenerable par `node tools/recon.mjs <port> <fichier-jeton>`.

## Ce qu'il faut pour ouvrir le canal

```sh
/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft \
  --control 7878 \
  --control-token-file ~/.photocraft/control.token
```

Au demarrage, le journal confirme :

```
photocraft: control token file: /Users/…/.photocraft/control.token
photocraft: control server listening on 127.0.0.1:7878
```

Le jeton est un nombre de 256 bits ecrit en 64 caracteres hexadecimaux, dans un fichier cree
en `0600`. Il est **reecrit a chaque lancement** : un client doit le relire a chaque
connexion, jamais le mettre en cache.

Le serveur n'ecoute que sur la boucle locale.

## Le protocole en trois lignes

Une requete par ligne, une reponse par ligne, correlees par `id` :

```json
{"id":1,"method":"auth","params":{"token":"<64 hex>"}}
{"id":1,"ok":true,"result":{"authenticated":true}}
```

L'authentification est **par connexion**, et doit etre la premiere requete.

Limites constatees : 16 connexions simultanees, 1 Mio par requete, 8 Mio par reponse,
60 s d'attente cote serveur, 30 s de delai socket.

## Le point qui dicte toute l'architecture d'un plugin

> Le protocole est strictement requete/reponse. **Il n'emet aucune notification.**

Il n'existe donc aucun moyen d'etre prevenu qu'un calque a ete masque ou que l'outil a change.
Pour afficher un etat sur une touche, il faut le redemander.

Pour un Stream Deck, cela interdit deux implementations naives :

- **une connexion par touche** : le quota de 16 est atteint des la dix-septieme, et un MK.2
  en a quinze, auxquelles s'ajoutent les inspecteurs ouverts ;
- **un sondage par touche** : quinze `ui.inspect` par seconde pour quinze fois la meme
  reponse, servis par le thread d'interface d'une application dans laquelle quelqu'un est en
  train de peindre.

La forme qui tient : **une connexion, un sondage, un instantane diffuse**. C'est ce
qu'implemente `controle.js`, et c'est le meme patron que le hub Cockpit.

Deuxieme consequence : ne jamais laisser un sondage s'empiler sur le precedent. Pendant un
filtre lourd, les reponses tardent ; une rafale de `ui.inspect` ferait la queue au lieu de se
perimer. Un seul sondage en vol a la fois.

## Les methodes qui servent

| Methode | Usage dans le plugin |
|---|---|
| `engine.commands` | peuple l'inspecteur : 892 commandes avec `enabled`, libelle, menu, schema |
| `engine.execute {command, params}` | execute n'importe laquelle d'entre elles |
| `ui.inspect` | l'instantane unique : outil, brosse, calques, zoom, document |
| `ui.set {tool, zoom, …}` | outil actif et zoom — ils ne sont pas des commandes |
| `ui.screenshot` | non utilise ici, mais c'est ce qui permettrait un apercu sur la touche |

`engine.commands` renvoie, pour chaque entree, de quoi construire une interface sans rien
coder en dur :

```json
{
  "id": "file.new",
  "label": "New…",
  "menu": ["File"],
  "shortcut": "Cmd+N",
  "enabled": true,
  "needsDocument": false,
  "params": "{\"width\":1..300000=1920,\"height\":1..300000=1080,…}"
}
```

C'est ce qui rend l'action generique viable : l'inspecteur affiche le schema de parametres
que PhotoCraft lui donne. En alpha, c'est la seule source a jour.

## Ou vit l'etat dans `ui.inspect`

```
tool                      "Brush"                       outil actif, nom canonique
brush                     {size, hardness, opacity}
document.activeLayer      3
document.canUndo/canRedo  bool                          de quoi griser une touche
document.layers[]         {id, name, opacity, blend, visible, selected, kind, hasMask}
views[0].zoom             2                             PAS dans `view`, qui est le menu Affichage
session.foreground        [r,g,b,a]
```

Deux pieges de nommage : `view` est le menu Affichage (reglages, reperes), le zoom est dans
`views[n]`. Et `document` vaut `null` quand aucun document n'est ouvert — ce n'est pas une
erreur, c'est l'etat normal au lancement.

Troisieme piege, moins visible : **`brush` decrit l'outil actif, et chaque outil a ses propres
reglages.** Mesure faite en incrementant la taille :

```
outil Brush      39 → 49 → 61
outil Eraser     31 → 39          (sa propre valeur, intacte)
retour Brush     61               (celle de la brosse, restauree)
```

Une touche « Taille + » affiche donc un nombre qui change quand on change d'outil, sans que
rien n'ait ete modifie. C'est le comportement correct, mais il faut le dire a l'utilisateur,
sinon il ressemble a un bug d'affichage.

## Correspondance avec le plugin Photoshop officiel d'Elgato

Releve fait en prenant les notes de version du plugin Photoshop d'Elgato (1.0.0.3 a 2.2.2.5)
comme liste de courses.

| Action Elgato | PhotoCraft 0.8.2 | Etat |
|---|---|---|
| Undo / Redo | `edit.undo`, `edit.redo` | verifie |
| Select Tool | `ui.set {tool}` | verifie, 54 noms valides |
| Layer Control | `layer.selectAbove/Below`, `hideLayers`, `showOnly`, `duplicate`, `mergeDown`, `flattenImage` | verifie |
| Stamp Visible (2.2.2.5) | `layer.stampVisible` | verifie |
| Set Blend Mode | `layer.setProps {blend}` | verifie |
| Layer Opacity | `layer.setProps {opacity: 0..1}` | verifie |
| Adjust Hue/Saturation | `image.adjustments.hueSaturation` | present |
| Brightness/Contrast | `image.adjustments.brightnessContrast` | present |
| Create Fill/Adjustment Layer | `layer.newFillLayer.*`, `layer.newAdjustmentLayer.*` | present |
| Select Subject | `select.subject` | present |
| Content Aware Fill | `edit.contentAwareFill` | present |
| Transform | `edit.transform` et ses variantes | present |
| Rasterize Layer / Type | `layer.rasterize.*`, `type.rasterize` | present |
| Set Color | `tools.setColors {foreground, background}` | verifie |
| Image Size | `image.imageSize` | present |
| Zoom | `ui.set {zoom}` | verifie |
| Rotation View Tool | outil `RotateView` | present |
| Brush Control | `tools.increase/decreaseBrushSize`, `…BrushHardness` | verifie |
| Play Action | `photocraft-cli` et ses listes d'actions | hors perimetre v1 |

« verifie » = execute pendant le releve. « present » = l'identifiant existe dans le registre,
avec son schema, mais n'a pas ete declenche.

PhotoCraft expose donc deja tout ce que le plugin Photoshop officiel propose, a une exception
pres — les Dial Actions, qui n'ont pas d'objet ici : un MK.2 n'a ni molette ni ecran tactile.
Les reglages continus passent par des paires de touches, en reutilisant les pas de
l'application (`tools.increaseBrushSize`) plutot qu'en recalculant une progression qui
differerait de celle du clavier.

### Les noms d'outils

`ui.set {tool}` n'accepte pas n'importe quoi, et **aucune methode ne liste les outils**. Ils
ne sont pas davantage deductibles du registre : les commandes `paint.*` executent un trace,
elles ne designent pas l'outil. La liste a donc ete etablie par essais, un nom a la fois ; les
54 retenus sont ceux que le serveur a acceptes.

L'analyseur tolere des variantes (`"Dodge Tool"` est accepte et normalise en `Dodge`), mais
pas la casse libre (`"marquee"` est refuse). Les noms canoniques sont ceux que `ui.inspect`
renvoie — ce sont ceux que le plugin propose.

## Les deux frictions reelles

**1. Le canal n'est pas actif par defaut.** Il faut lancer PhotoCraft en ligne de commande
avec les bons arguments. Quelqu'un qui ouvre l'application depuis le Dock ou le ArtCraft
Launcher n'a pas de canal, et le plugin affiche « PhotoCraft non lance » alors que
l'application est a l'ecran — formulation volontairement explicite, mais qui decrit mal la
situation. C'est le seul obstacle serieux a une installation grand public, et c'est l'objet de
la proposition ci-dessous.

**2. L'absence de notifications** impose le sondage, donc un compromis entre reactivite et
charge. A 1 s, le retour sur les touches est correct et le cout reste modeste. Un flux
d'evenements, meme minimal (outil change, calque actif change, document ouvert/ferme),
supprimerait le sondage pour l'essentiel.

## Ce qu'il y aurait a proposer en amont

Rien de ce qui precede n'a demande de modifier PhotoCraft : le canal suffit. Les deux points
ci-dessous amelioreraient l'experience pour tout client externe, pas seulement pour un
Stream Deck.

1. **Un reglage persistant « activer le canal de controle au demarrage »**, avec port et
   chemin de jeton, dans les preferences. Supprime l'obligation de lancer l'application en
   ligne de commande, qui est aujourd'hui le seul vrai frein.
2. **Un flux d'evenements optionnel** — une methode `ui.subscribe` qui pousse une notification
   quand l'outil, le calque actif ou le document changent. Rend le sondage inutile dans le cas
   courant.
3. Accessoirement, **une methode listant les outils**, pour la meme raison que
   `engine.commands` existe : eviter que chaque client reconstitue la liste par essais, et
   qu'elle se perime en silence.
