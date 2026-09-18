# -*- coding: utf-8 -*-
"""Estampille les CSS/JS locaux d'index.html avec un ?v=<hash de contenu>.

Le site est servi en statique (serveur local, puis GitHub Pages). Sans
estampille, le navigateur garde main.css et les .js en cache et continue
d'afficher l'ancienne version apres une modification — on croit que le
style est casse alors que le fichier sur le disque est bon. C'est arrive
une fois, ca a coute une soiree.

A relancer apres CHAQUE modification d'un fichier CSS ou JS :

    python tools/versionner.py

Le hash vient du contenu : un fichier inchange garde son ?v=, donc le
cache continue de servir ce qui n'a pas bouge.
"""
import hashlib
import io
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(RACINE, "index.html")

# Seuls nos fichiers sont estampilles : les vendors ne bougent jamais.
CIBLE = re.compile(r'((?:href|src)=")(assets/(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")')


def empreinte(chemin_rel):
    chemin = os.path.join(RACINE, chemin_rel.replace("/", os.sep))
    if not os.path.isfile(chemin):
        return None
    h = hashlib.sha1()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()[:10]


def main():
    s = io.open(PAGE, encoding="utf-8").read()
    manquants = []
    vus = []

    def remplace(m):
        avant, fichier, apres = m.group(1), m.group(2), m.group(3)
        v = empreinte(fichier)
        if v is None:
            manquants.append(fichier)
            return m.group(0)
        vus.append((fichier, v))
        return avant + fichier + "?v=" + v + apres

    sortie = CIBLE.sub(remplace, s)

    if manquants:
        print("FICHIERS INTROUVABLES :")
        for f in manquants:
            print("  -", f)
        return 1

    change = sortie != s
    if change:
        io.open(PAGE, "w", encoding="utf-8", newline="\n").write(sortie)

    for fichier, v in vus:
        print("%-34s ?v=%s" % (fichier, v))
    print("\n%d fichier(s) estampille(s) — index.html %s."
          % (len(vus), "mis a jour" if change else "deja a jour"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
