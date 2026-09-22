# 🏗️ Simulation 3D : Système de Tri Gravitaire (Three.js)

Ce projet implémente une simulation physique haute fidélité d'une trieuse mécanique à rails divergents. Il a été réalisé dans le cadre du module de Modélisation Mathématique (R512).

## 🚀 Fonctionnalités
* **Moteur Physique Personnalisé :** Gestion des collisions Sphère-Boîte, gravité, frottements et restitution d'énergie.
* **Simulation Graphique :** Rendu 3D fluide (60 FPS) via Three.js avec ombres et matériaux physiques.
* **Benchmark Automatisé :** Outil intégré pour tester la fiabilité du tri selon la vitesse d'injection (10ms à 1000ms).
* **Comparaison de Designs :** Bascule instantanée entre rails "Toit" (profilés) et rails "Tiges".

## 📦 Installation et Lancement
Ce projet utilise des modules ES6 natifs. Pour éviter les erreurs CORS, il doit être lancé via un serveur local HTTP.

**Méthode recommandée (VS Code) :**
1.  Ouvrir le dossier du projet dans VS Code.
2.  Installer l'extension **Live Server**.
3.  Clic droit sur `index.html` > **Open with Live Server**.

## 📄 Rapport de Modélisation
L'analyse mathématique complète et les résultats des benchmarks sont disponibles ici :
* 👉 **[Lire le Rapport de Modélisation (PDF)](https://www.overleaf.com/project/6964ced7d73b12a9eebe8970)**
* *Le code source LaTeX du rapport est disponible dans le fichier `main.tex` de la section rapport.*

## 📂 Structure du Projet
* `index.html` : Interface utilisateur et HUD.
* `js/moteur.js` : Calculs vectoriels et intégration d'Euler.
* `js/scene.js` : Construction géométrique des rails et des bacs.
* `js/logic.js` : Logique de jeu, spawning et collecte de statistiques.

---
*Université de Technologie - Janvier 2026*