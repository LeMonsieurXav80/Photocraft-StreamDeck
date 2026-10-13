# Provenance des images

`photocraft-icone-source.png` est l'icone d'application de **PhotoCraft**, extraite de la
build officielle 0.8.2 pour macOS :

```sh
iconutil -c iconset /Applications/PhotoCraft.app/Contents/Resources/PhotoCraft.icns -o /tmp/pc
cp /tmp/pc/icon_512x512.png tools/photocraft-icone-source.png
```

Les images des touches en derivent : `tools/icones.mjs` recadre la marge transparente des
icones macOS, puis remplace **uniquement le fond** par une teinte differente selon l'action.
Le dessin du renard n'est pas modifie.

## Pourquoi reprendre l'icone de l'application

Une touche doit se reconnaitre sans etre lue. L'icone de PhotoCraft fait ce travail
instantanement ; un pictogramme invente ne le fait pas.

## Ce que cela implique

PhotoCraft est publie par l'equipe ArtCraft sous licence MIT ou Apache-2.0 au choix, ce qui
couvre le code. **Une licence de code ne concede pas les droits de marque**, et une icone
d'application releve de l'identite du projet, pas de son code.

Consequences pratiques :

- **Distribution directe** (fichier `.streamDeckPlugin` publie ici) : usage descriptif d'un
  plugin tiers clairement identifie comme non officiel. C'est l'intention du README, et la
  raison de la mention « non affilie a l'equipe ArtCraft ni a Elgato ».
- **Soumission au Marketplace Elgato** : demander l'accord de l'equipe ArtCraft avant.
  C'est le point qui bloque une soumission tierce, bien plus souvent que le code lui-meme.
- Si l'equipe ArtCraft demande de ne pas utiliser son icone, la remplacer : l'historique
  git contient les pictogrammes dessines a la main qui servaient avant, et
  `TEINTES` dans `icones.mjs` reste utilisable tel quel avec une autre source.

En cas de doute, ecrire sur le Discord ArtCraft (discord.gg/artcraft) avant de diffuser.
