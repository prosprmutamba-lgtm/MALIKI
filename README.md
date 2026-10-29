# Invitation et contrôle d'accès – Mariage Ansima Joyce & Maliki Didier (v2)

**Version 2 :** nouveau design (site bleu nuit et or, administration bleue), sections optionnelles, photos remplaçables. **Aucune table n'est modifiée ni supprimée** : `npm run db:migrate` reste sans danger (`CREATE IF NOT EXISTS`) et vos données sont conservées. Pour modifier contenus et photos : voir `GUIDE_MODIFICATION.md`.

Application Node.js (Express) + MySQL. Bilingue FR/EN (français par défaut). Aucun service payant, aucun SMS.

## 1. Lancer en local
1. Installez Node.js 18+ et MySQL (ou utilisez la base Hostinger si l'accès distant est activé).
2. Ouvrez ce dossier dans Visual Studio Code, puis dans le terminal : `npm install`
3. Copiez `.env.example` en `.env` et remplissez vos valeurs (voir §2). Le fichier `.env` n'est jamais à partager.
4. Créez les tables : `npm run db:migrate`
5. Créez l'administrateur : `npm run admin:create` (e-mail + mot de passe de 12 caractères minimum, stocké haché).
6. Lancez : `npm start` puis ouvrez http://localhost:3000/admin/login (avec `NODE_ENV=development` et `BASE_URL=http://localhost:3000`).
   La caméra du scanner exige HTTPS (localhost est accepté par les navigateurs).

## 2. Base MySQL et secrets
- hPanel Hostinger → Bases de données → Gestion → créez une base et un utilisateur ; notez nom, utilisateur, mot de passe.
- Variables : `DB_HOST` (souvent `localhost` sur Hostinger), `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `BASE_URL` (votre domaine en https, sans `/` final), `NODE_ENV=production`, `SESSION_SECRET`.
- Générer le secret : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Mises à jour de la base : `schema.sql` est rejouable ; ajoutez-y vos changements puis relancez `npm run db:migrate`.

## 3. Déploiement sur Hostinger (Node.js)
1. hPanel → Sites web → Ajouter un site → **Application web Node.js** → importez ce ZIP (sans `node_modules`).
2. Commande de démarrage : `npm start` ; fichier d'entrée : `server.js`.
3. Renseignez les variables d'environnement du §2 dans l'interface Hostinger (ne les mettez pas dans le code).
4. Activez le SSL (HTTPS) pour le domaine : indispensable pour les cookies sécurisés et la caméra.
5. Créez les tables et l'administrateur : exécutez `npm run db:migrate` puis `npm run admin:create` via le terminal SSH Hostinger (ou lancez-les en local sur la base distante si l'accès MySQL distant est autorisé pour votre IP).
6. Ouvrez `https://votre-domaine/admin/login`.

## 4. Utilisation
- **Détails du mariage** : date, cérémonie, réception, programme, histoire, cortège, FAQ, consignes en FR et EN (rien n'est pré-rempli ; une section vide est masquée). Si l'anglais est vide, le français s'affiche.
- **Menu admin** : Tableau de bord, Invitations et liens, Confirmations RSVP, Scanner, Détails, Paramètres et langues.
- **Invitations et liens** : « Créer les liens » génère jusqu'à 100 liens aléatoires (1 place chacun). Ajustez ensuite chaque foyer à 1 ou 2 places ; le total attribué ne peut pas dépasser 115. Copiez chaque lien et envoyez-le (WhatsApp, e-mail…).
- Rappel : toute personne qui reçoit un lien inutilisé peut l'ouvrir ; envoyez chaque lien uniquement à son destinataire.
- Un lien n'accepte **qu'une seule réponse** ; ensuite la page est en lecture seule et affiche le QR code (identifiant opaque, aucune donnée personnelle).
- **Scanner les invitations** : caméra (HTTPS) ou recherche manuelle par nom/numéro ; « Confirmer l'entrée » invalide le QR code (réutilisation refusée).

## 5. Sécurité
Requêtes préparées, validation serveur, échappement HTML (XSS), jeton CSRF, limitation de connexion (10 essais/15 min), mots de passe bcrypt, cookies `httpOnly`/`secure`/`sameSite`, en-têtes Helmet + CSP, secrets uniquement dans `.env`. Les plafonds (100 liens, 115 places) sont contrôlés dans des transactions verrouillées (`SELECT … FOR UPDATE`) **et** par des contraintes `CHECK` MySQL (MySQL 8 / MariaDB 10.2+ requis).

## 6. Sauvegarde et restauration MySQL
- Sauvegarde : `mysqldump -u UTILISATEUR -p NOM_BASE > sauvegarde.sql` (ou hPanel → phpMyAdmin → Exporter).
- Restauration : `mysql -u UTILISATEUR -p NOM_BASE < sauvegarde.sql` (ou phpMyAdmin → Importer).
- Les fichiers de sauvegarde contiennent des noms d'invités : ne les publiez pas.

## 7. Photos
Dossier `public/images/wedding/`, affectation dans `config/site.js`.

## 8. Traductions
Textes d'interface : `locales/fr.json` et `locales/en.json`.
