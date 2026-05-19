# Plan de Stabilisation - Correction SQL et Résilience

## Problème Identifié
Le bot crash car la table `bot_stats` dans Supabase ne contient pas les colonnes nécessaires au mécanisme de verrouillage distribué (`tg_lock_owner` et `tg_lock_expires`). De plus, des conflits de démarrage (`EADDRINUSE`) empêchaient le serveur web de répondre.

## Étapes de Résolution

### 1. Mise à jour de la Base de Données (Action Requise Utilisateur)
Vous devez exécuter ce script SQL dans l'éditeur SQL de votre tableau de bord Supabase :

```sql
-- Ajouter les colonnes de verrouillage à la table bot_stats
ALTER TABLE bot_stats 
ADD COLUMN IF NOT EXISTS tg_lock_owner TEXT,
ADD COLUMN IF NOT EXISTS tg_lock_expires TIMESTAMPTZ;

-- S'assurer que la ligne d'index 1 existe pour le verrou
INSERT INTO bot_stats (id) 
VALUES (1) 
ON CONFLICT (id) DO NOTHING;

-- Initialiser les colonnes si elles sont vides
UPDATE bot_stats SET tg_lock_owner = NULL WHERE id = 1;
```

### 2. Mise à jour du Code pour la Résilience
Même si les colonnes sont absentes, le bot ne doit pas crasher. J'ai mis à jour `database.js` pour ignorer les erreurs de schéma et permettre au bot de démarrer si une seule réplique est active.

### 3. Nettoyage de l'initialisation
Correction de `index.js` pour n'initialiser le serveur web qu'une seule fois, éliminant l'erreur `EADDRINUSE`.

---

> [!IMPORTANT]
> Après avoir exécuté le script SQL ci-dessus, le bot pourra obtenir son verrou et démarrer normalement sur Railway.
