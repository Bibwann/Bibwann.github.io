# TD IA - SolarMotion
Exploration du système solaire 3D en Babylon.js, contrôlée uniquement par les mouvements de la main via MediaPipe Hands.

## Lancement
```bash
python3 -m http.server 8000
```
Puis ouvrez [http://localhost:8000](http://localhost:8000)


## Contrôles main (v2)
- Activer avec le bouton en bas à gauche
- **Main droite** : déplacer = orbite (rotation α / inclinaison β)
- **Main gauche** : pincer / relâcher = zoom avant / arrière
- Aucune main détectée = retour progressif à la vue par défaut
