# -*- coding: utf-8 -*-
"""Estampille les CSS/JS de codex/index.html et régénère le banc d'essai.

À relancer après CHAQUE modification d'un fichier CSS ou JS de Codex :

    python codex/tools/versionner.py

1. Ajoute ?v=<hash de contenu> aux assets locaux d'index.html. GitHub Pages
   sert des fichiers statiques : sans estampille, le navigateur garde
   l'ancien codex.css ou l'ancien app.js en cache et on croit que la
   modification n'a pas marché (le portfolio a déjà perdu une soirée
   là-dessus). Un fichier inchangé garde son ?v=, donc reste en cache.

   Exception : pdf-worker.js n'est pas dans index.html (compression.js le
   lance). Son empreinte est reportée dans compression.js, ce qui change à
   son tour l'empreinte de compression.js.

2. Régénère tools/banc.html depuis index.html : même <head>, mêmes scripts,
   faux Supabase à la place du vrai. Le banc ne peut donc pas dériver de
   la vraie page.
"""
import hashlib
import io
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(RACINE, "index.html")
BANC = os.path.join(RACINE, "tools", "banc.html")
COMPRESSION = os.path.join(RACINE, "assets", "js", "compression.js")

CIBLE = re.compile(r'((?:href|src)=")(assets/(?:css|js|img)/[^"?]+)(?:\?v=[0-9a-f]+)?(")')


def empreinte(chemin_rel):
    chemin = os.path.join(RACINE, chemin_rel.replace("/", os.sep))
    if not os.path.isfile(chemin):
        return None
    # Fins de ligne ramenées à LF : sous Windows, git peut extraire les
    # fichiers en CRLF ; sans cela l'empreinte changerait d'une machine à
    # l'autre pour un fichier identique dans le dépôt.
    with open(chemin, "rb") as f:
        contenu = f.read().replace(b"\r\n", b"\n")
    return hashlib.sha1(contenu).hexdigest()[:10]


def lire(p):
    return io.open(p, encoding="utf-8").read()


def ecrire(p, s):
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def estampiller_worker():
    v = empreinte("assets/js/pdf-worker.js")
    s = lire(COMPRESSION)
    sortie = re.sub(r'new URL\("pdf-worker\.js(?:\?v=[0-9a-f]+)?"', 'new URL("pdf-worker.js?v=%s"' % v, s)
    if sortie != s:
        ecrire(COMPRESSION, sortie)
    print("%-34s ?v=%s (dans compression.js)" % ("assets/js/pdf-worker.js", v))


def estampiller_page():
    s = lire(PAGE)
    manquants, vus = [], []

    def remplace(m):
        v = empreinte(m.group(2))
        if v is None:
            manquants.append(m.group(2))
            return m.group(0)
        vus.append((m.group(2), v))
        return m.group(1) + m.group(2) + "?v=" + v + m.group(3)

    sortie = CIBLE.sub(remplace, s)
    if manquants:
        print("FICHIERS INTROUVABLES :")
        for f in manquants:
            print("  -", f)
        sys.exit(1)
    if sortie != s:
        ecrire(PAGE, sortie)
    for f, v in vus:
        print("%-34s ?v=%s" % (f, v))
    return sortie


def generer_banc(page):
    s = page.replace('href="assets/', 'href="../assets/').replace('src="assets/', 'src="../assets/')
    # Pas de CSP dans le banc : le faux Supabase n'est pas sur *.supabase.co.
    s = re.sub(r'\s*<!-- Défense en profondeur.*?-->', "", s, flags=re.S)
    s = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', "", s)
    s, n = re.subn(r'<script defer src="https://cdn\.jsdelivr\.net/npm/@supabase/[^"]*"[^>]*></script>',
                   '<script defer src="faux-supabase.js"></script>', s)
    if n != 1:
        print("ERREUR : script supabase-js introuvable dans index.html")
        sys.exit(1)
    s = re.sub(r'\s*<script defer src="\.\./assets/js/config\.js[^"]*"></script>', "", s)
    s = s.replace("<title>Codex</title>", "<title>Codex · banc d'essai</title>")
    s = s.replace("<head>", "<head>\n  <!-- GÉNÉRÉ par tools/versionner.py depuis index.html : ne pas éditer.\n"
                  "       Paramètres : ?role=admin|editeur|lecteur|intrus|deconnecte  &vide -->", 1)
    ecrire(BANC, s)
    print("tools/banc.html régénéré.")


if __name__ == "__main__":
    estampiller_worker()
    generer_banc(estampiller_page())
