# Provenance des images

Deux sources distinctes, deux situations de droits differentes.

## Les icones d'action : Lucide, licence ISC

`tools/icones-source/*.svg` sont les icones que **PhotoCraft utilise dans son interface**,
reprises de `assets/icons` du depot `storytold/photocraft` :

| Fichier | Action du plugin |
|---|---|
| `play.svg` | Commande |
| `brush.svg` | Outil (au repos et actif) |
| `layers.svg` | Calque |
| `eye-off.svg` | Calque masque |
| `blend.svg` | Opacite |
| `circle-dot.svg` | Brosse |

Une touche « Calque » porte ainsi le pictogramme du panneau Calques de l'application. C'est le
but : on la reconnait sans la lire, et sans apprendre un symbole invente pour l'occasion.

Ce sont des **[Lucide](https://lucide.dev)**, sous **licence ISC** — texte complet dans
`LICENSE-lucide.txt`, conserve ici comme la licence l'exige. L'ISC autorise l'usage, la
modification et la redistribution a condition que la notice accompagne les copies. Ces icones
ne sont donc **pas** propres a PhotoCraft : le plugin et l'application puisent au meme
catalogue public.

`tools/icones.mjs` les recompose en SVG — fond arrondi teinte, trace en blanc par-dessus —
sans rien rasteriser. Le trace lui-meme n'est pas modifie, seuls la couleur et l'echelle le
sont.

Le depot de PhotoCraft contient aussi `LICENSE-noun-magnetic-lasso.txt` et
`LICENSE-symmetry-axes.txt`, pour des icones d'autre provenance. **Aucune de celles-la n'est
reprise ici** ; si l'une devait l'etre, rapatrier sa licence en meme temps.

## L'icone du plugin : celle de l'application

`tools/icones-source/photocraft-icone-source.png` est l'icone d'application de PhotoCraft — le
renard a neuf queues — extraite de la build officielle 0.8.2 :

```sh
iconutil -c iconset /Applications/PhotoCraft.app/Contents/Resources/PhotoCraft.icns -o /tmp/pc
cp /tmp/pc/icon_512x512.png tools/icones-source/photocraft-icone-source.png
```

Elle sert uniquement a `plugin.png` et `category.png` : la vignette de galerie et l'entree de
categorie. Ce sont les deux seuls endroits qui designent **le plugin**, pas une action, et donc
les deux seuls ou l'identite de PhotoCraft est le sujet.

### Ce que cela implique

PhotoCraft est publie sous licence MIT ou Apache-2.0 au choix, ce qui couvre **le code**. Une
licence de code ne concede pas les droits de marque, et une icone d'application releve de
l'identite du projet.

- **Distribution directe** (fichier `.streamDeckPlugin` publie ici) : usage descriptif d'un
  plugin tiers explicitement identifie comme non officiel — d'ou la mention « non affilie a
  l'equipe ArtCraft ni a Elgato » dans le README.
- **Soumission au Marketplace Elgato** : demander l'accord de l'equipe ArtCraft avant. C'est
  ce point qui bloque une soumission tierce, bien plus souvent que le code.
- Si l'equipe ArtCraft demande de ne pas l'utiliser, seuls `plugin.png` et `category.png` sont
  concernes : les icones d'action, etant des Lucide ISC, ne dependent pas de cette reponse.

En cas de doute, ecrire sur le Discord ArtCraft (discord.gg/artcraft) avant de diffuser.
