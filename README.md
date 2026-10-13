# PhotoCraft pour Stream Deck

Plugin Stream Deck non officiel pour [PhotoCraft](https://github.com/storytold/photocraft),
l'editeur d'images en Rust de la suite ArtCraft.

Il pilote PhotoCraft par son **canal de controle local** : une socket JSON sur la boucle
locale, protegee par jeton, que PhotoCraft expose deja. Le plugin ne modifie pas
l'application et n'embarque aucun code de PhotoCraft — il poste des identifiants de commande.

> Projet personnel, **non affilie a l'equipe ArtCraft ni a Elgato**.
> Teste contre PhotoCraft 0.8.2 sur macOS, avec un Stream Deck MK.2.
> PhotoCraft est en alpha : les identifiants de commandes bougeront.

## Ce que ca fait

PhotoCraft applique le principe « tout est une commande » : ses 892 entrees de menu et d'outil
vivent dans un seul registre, atteignable de l'exterieur. Le plugin en tire sa forme — il ne
reimplemente rien, il declenche.

| Action | Role |
|---|---|
| **Commande** | n'importe laquelle des 892 commandes, avec ses parametres en JSON |
| **Outil** | selectionne un outil ; la touche s'allume quand il est actif |
| **Calque** | navigation dans la pile, visibilite, duplication, fusion, tampon visible |
| **Opacite** | opacite du calque actif, par pas ou en valeur fixe |
| **Brosse** | taille et durete, par pas, avec la valeur courante sur la touche |

L'action **Commande** couvre a elle seule tout le registre : sa liste est lue dans PhotoCraft
au moment du reglage, avec le libelle, le chemin de menu, le raccourci et le schema de
parametres. Ajouter une touche « Fusionner les calques visibles » ne demande donc aucun code.

Les quatre autres actions existent uniquement parce qu'elles ont un **etat a afficher**. Une
touche qui ne sait pas ce qu'elle commande n'a pas besoin d'etre specialisee.

### Pas de molette

Le MK.2 n'a ni molette ni ecran tactile. Les reglages continus — taille de brosse, opacite —
se posent donc par **paires de touches**, et reutilisent les pas de PhotoCraft lui-meme
(`tools.increaseBrushSize`) plutot qu'une progression recalculee qui differerait du clavier.

## Installation

```sh
cd com.lemonsieurxav.photocraft.sdPlugin && npm install && cd ..
./deploy.sh
osascript -e 'quit app "Elgato Stream Deck"' && sleep 3 && open -a 'Elgato Stream Deck'
```

`deploy.sh` installe **par copie**, jamais par lien symbolique. Stream Deck demarre environ
une minute apres le Mac : un lien vers un disque externe pas encore monte donne un plugin
ignore et des touches a `?`.

## Lancer PhotoCraft avec le canal ouvert

Le canal **n'est pas actif par defaut** — c'est la seule contrainte reelle de l'installation :

```sh
/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft \
  --control 7878 \
  --control-token-file ~/.photocraft/control.token
```

Puis, dans n'importe quel inspecteur du plugin, renseigner le port et le chemin du fichier de
jeton. Ces deux reglages sont **globaux** : une seule fois pour toutes les touches.

Le jeton est reecrit a chaque lancement de PhotoCraft ; le plugin le relit a chaque
connexion, et se reconnecte tout seul avec un recul progressif. Redemarrer l'application ne
demande donc rien.

Tant que le canal est absent, les touches affichent `PhotoCraft non lance` plutot qu'un `?`
muet.

## Verifier ce que la version installee expose

```sh
node tools/recon.mjs 7878 ~/.photocraft/control.token releve.json
```

Produit le releve complet : commandes disponibles, etat d'activation, schemas de parametres,
instantane de l'interface. A relancer apres chaque mise a jour de PhotoCraft — en alpha, c'est
ce qui dit ce qui a bouge.

`docs/recon-0.8.2.json` est le releve de reference, et
**[`docs/canal-de-controle.md`](docs/canal-de-controle.md)** documente le protocole tel qu'il
se comporte vraiment : limites, pieges de nommage, et correspondance action par action avec le
plugin Photoshop officiel d'Elgato.

## Architecture

```
com.lemonsieurxav.photocraft.sdPlugin/
  controle.js    client du canal : une connexion, un sondage, un instantane diffuse
  plugin.js      les cinq actions
  inspector/     cinq inspecteurs, WebSocket brut, aucun CDN
tools/
  recon.mjs      releve des capacites de la version installee
  png.mjs        lecture/ecriture/reduction de PNG, sans dependance
  icones.mjs     teinte l'icone de PhotoCraft, une couleur par action
  NOTICE.md      provenance de l'icone et ce que son usage implique
```

Les touches reprennent **l'icone de PhotoCraft** — le renard a neuf queues — avec un fond
different par action, pour se distinguer sans etre lues. Seul le fond est recolore ; le dessin
n'est pas modifie. Voir [`tools/NOTICE.md`](tools/NOTICE.md) pour la provenance et la question
de marque, qui se pose avant toute soumission au Marketplace.

Le canal de controle est **strictement requete/reponse : il n'emet aucune notification**. Pour
afficher l'outil actif sur une touche, il faut le redemander. D'ou la regle qui structure tout
`controle.js` : **une seule connexion et un seul sondage pour l'ensemble des touches**, dont
l'instantane est diffuse. Quinze connexions epuiseraient le quota de 16 du serveur, et quinze
sondages feraient quinze fois le meme travail dans le thread d'interface d'une application
dans laquelle quelqu'un est en train de peindre.

## Licence

MIT. PhotoCraft est un projet distinct, sous licence MIT ou Apache-2.0 au choix,
[chez storytold](https://github.com/storytold/photocraft).
