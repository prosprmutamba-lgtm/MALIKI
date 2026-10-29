# Guide de modification (pas à pas)

Légende : **[Admin]** = panneau `/admin` (aucun redéploiement) · **[Fichier]** = fichier du projet (redéploiement nécessaire).

## Règles d'or
- Ne partagez jamais votre fichier `.env`, ne supprimez/réinitialisez jamais la base MySQL (les invitations et réponses y sont).
- Avant un gros changement : faites une sauvegarde de la base (README §Sauvegarde).

## Contenus (tout se fait dans **[Admin] → Détails du mariage**, en FR et EN)
| À modifier | Où |
|---|---|
| Date et heure, cible du compte à rebours, calendrier (.ics) | Admin : « Date et heure » / « Cible du compte à rebours » |
| Message d'invitation | Admin : « Message d'invitation » |
| Cérémonie et réception : lieu, adresse, lien de carte | Admin (vide = section masquée ; sans lien de carte, le bouton ouvre une recherche à partir de l'adresse) |
| Programme (chronologie) | Admin, une ligne par étape : `17:30 | Cérémonie` |
| Notre histoire | Admin, une ligne par chapitre : `Titre | Texte` (vide = section masquée) |
| Cortège | Admin, une ligne par membre : `Nom | Rôle | Message` (vide = masqué) |
| FAQ | Admin, une ligne par question : `Question | Réponse` (vide = masquée) |
| Consignes | Admin : « Consignes » |
Si l'anglais est vide, le français est affiché.

## Noms des mariés — **[Fichier]** `config/site.js` (`names`).
## Textes fixes (boutons, libellés, messages) — **[Fichier]** `locales/fr.json` et `locales/en.json` (gardez les mêmes clés dans les deux).
## Couleurs
- Site invité : `public/public.css`, variables au début (`--n` fond, `--g` or, `--i` ivoire).
- Administration : `public/admin.css` (`--bl` bleu, `--bk` menu sombre).

## Photos — **[Fichier]** dossier `public/images/wedding/`
Déposez votre fichier avec **exactement** le nom ci-dessous (ou changez le nom dans `config/site.js`). Tant qu'il manque, un cadre « Photo à ajouter » s'affiche.
| Emplacement | Fichier | Taille conseillée |
|---|---|---|
| Couverture | `cover.jpg` | portrait 1200×1800 px |
| Galerie (4 cases) | `gallery-1.jpg` … `gallery-4.jpg` | portrait 900×1200 px |
| Lieu cérémonie / réception | `ceremony.jpg`, `reception.jpg` | paysage 1200×750 px |
| Cortège (dans l'ordre de la liste) | `party-1.jpg` … `party-6.jpg` | carré 600×600 px |
| Photo de fin | `closing.jpg` | portrait ou paysage 1200×1200 px |
Formats : JPG (ou PNG/WebP si vous changez l'extension dans `config/site.js`). Gardez chaque image sous ~500 Ko (compressez-la, ex. squoosh.app). Pour ajouter une photo de galerie, ajoutez un nom dans `images.gallery` de `config/site.js`.
**Vérifier en local** : `npm start`, ouvrez un lien d'invitation (`/i/…`) et rechargez (Ctrl+F5). **Après redéploiement** : rechargez le site en navigation privée.

## Invitations, places, QR codes — **[Admin]**
Invitations et liens : créer les 100 liens, copier chaque lien, régler 1 ou 2 places (total ≤ 115). Les QR codes sont créés automatiquement après la réponse de l'invité ; le scan se fait dans « Scanner les QR codes » (HTTPS requis).

## Travailler dans Visual Studio Code
1. Fichier → Ouvrir le dossier (la racine du projet). 2. Terminal → `npm install`. 3. Copiez `.env.example` en `.env` et remplissez-le. 4. `npm run db:migrate` puis `npm start` → http://localhost:3000.

## Redéployer sur Hostinger
Créez un ZIP du projet **sans** `node_modules` ni `.env`, importez-le dans votre application Node.js Hostinger (ou « Redéployer »), vérifiez les variables d'environnement, relancez `npm run db:migrate` si une nouvelle version le demande, puis redémarrez l'application.
