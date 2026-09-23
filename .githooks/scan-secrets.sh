#!/usr/bin/env bash
# ============================================================
# Détecteur de secrets du dépôt.
#
# Le dépôt est PUBLIC et GitHub Pages sert tout ce qu'il contient :
# une clé commitée est une clé publiée, et elle reste dans l'historique
# même après suppression. Ce script refuse donc le commit AVANT qu'elle
# n'y entre.
#
#   .githooks/scan-secrets.sh           contenu indexé (ce qui va être commité)
#   .githooks/scan-secrets.sh --tout    idem, et taille de TOUS les fichiers (CI)
#
# Appelé par .githooks/pre-commit (activé par
# `git config core.hooksPath .githooks`) et par .github/workflows/securite.yml.
#
# Seuls des motifs à haute confiance sont cherchés : un détecteur qui
# crie au loup sur le mot « password » finit contourné par --no-verify.
# ============================================================
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

ROUGE=$'\033[31m'; JAUNE=$'\033[33m'; VERT=$'\033[32m'; RAZ=$'\033[0m'
echecs=0
signaler() { printf '%s✗ %s%s\n' "$ROUGE" "$1" "$RAZ"; echecs=$((echecs + 1)); }

EXCLUS=(':!.githooks/scan-secrets.sh' ':!.githooks/faux-positifs.txt')

# ---- 1. Fichiers qui n'ont rien à faire dans un dépôt public ----
while IFS= read -r -d '' f; do
  base=${f##*/}
  case "$base" in
    .env.example|.env.sample|.env.exemple) ;;
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*|credentials*.json|service-account*.json|*.sqlite|*.sqlite3|*.db|*.dump)
      signaler "Fichier sensible indexé : $f" ;;
  esac
done < <(git ls-files --cached -z)

# ---- 2. Motifs de secrets dans le contenu indexé ----
# « libellé|regex »
MOTIFS=(
  'clé secrète Supabase|sb_secret_[A-Za-z0-9_-]{10,}'
  'clé privée|-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'clé AWS|AKIA[0-9A-Z]{16}'
  'jeton GitHub|gh[pousr]_[A-Za-z0-9]{36}'
  'jeton GitHub|github_pat_[A-Za-z0-9_]{50,}'
  'clé Anthropic|sk-ant-[A-Za-z0-9_-]{20,}'
  'clé OpenAI|sk-(proj-)?[A-Za-z0-9_-]{32,}'
  'clé Google|AIza[0-9A-Za-z_-]{35}'
  'jeton Slack|xox[abprs]-[A-Za-z0-9-]{10,}'
  'URL de base avec mot de passe|(postgres(ql)?|mongodb(\+srv)?|mysql)://[^:/[:space:]]+:[^@[:space:]]+@'
)

# Faux positifs relus un par un : « chemin:fragment de la ligne ».
# N'ajouter une entrée qu'après avoir vérifié que ce n'est PAS un vrai
# secret (exemple de doc, valeur factice), et dire pourquoi en commentaire.
AUTORISES=()
if [ -f .githooks/faux-positifs.txt ]; then
  while IFS= read -r a; do
    case "$a" in ''|'#'*) continue ;; esac
    AUTORISES+=("$a")
  done < .githooks/faux-positifs.txt
fi
autorise() {  # $1 = « chemin:numéro:contenu »
  local a chemin
  chemin=${1%%:*}
  for a in "${AUTORISES[@]+"${AUTORISES[@]}"}"; do
    [ "$chemin" = "${a%%:*}" ] && [[ "$1" == *"${a#*:}"* ]] && return 0
  done
  return 1
}

for entree in "${MOTIFS[@]}"; do
  libelle=${entree%%|*}
  m=${entree#*|}
  if trouve=$(git grep --cached -I -n -E -e "$m" -- . "${EXCLUS[@]}" 2>/dev/null); then
    while IFS= read -r ligne; do
      autorise "$ligne" && continue
      signaler "Secret probable ($libelle) : ${ligne:0:160}"
    done <<< "$trouve"
  fi
done

# ---- 3. Jetons JWT : seule la clé « anon » de Supabase est publique ----
# La clé anon et la clé service_role ont exactement la même forme ; seul
# le rôle inscrit dans le jeton les distingue. On le décode.
decoder() {
  local p=${1//-/+}; p=${p//_//}
  case $(( ${#p} % 4 )) in 2) p="$p==" ;; 3) p="$p=" ;; esac
  printf '%s' "$p" | base64 -d 2>/dev/null
}
while IFS= read -r ligne; do
  [ -z "$ligne" ] && continue
  fichier=${ligne%%:*}
  jeton=${ligne#*:}
  charge=$(decoder "$(printf '%s' "$jeton" | cut -d. -f2)")
  if printf '%s' "$charge" | grep -Eq '"role"[[:space:]]*:[[:space:]]*"anon"'; then
    continue
  fi
  role=$(printf '%s' "$charge" | grep -Eo '"role"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1)
  signaler "Jeton JWT non public dans $fichier (${role:-rôle inconnu}) — une clé service_role donne TOUS les droits sur la base."
done < <(git grep --cached -I -o -E -e 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' -- . "${EXCLUS[@]}" 2>/dev/null)

# ---- 4. Poids des fichiers ----
# GitHub refuse au-delà de 100 Mo et ralentit tout clone bien avant.
# Les gros documents (polys, annales) vont dans le bucket privé de
# Codex, jamais dans le dépôt.
LIMITE=$((50 * 1024 * 1024))
if [ "${1:-}" = "--tout" ]; then
  liste() { git ls-files -z; }
else
  liste() { git diff --cached --name-only -z --diff-filter=AM; }
fi
while IFS= read -r -d '' f; do
  t=$(git cat-file -s ":$f" 2>/dev/null || echo 0)
  if [ "$t" -gt "$LIMITE" ]; then
    signaler "Fichier trop lourd ($((t / 1048576)) Mo > 50 Mo) : $f"
  fi
done < <(liste)

if [ "$echecs" -gt 0 ]; then
  printf '\n%s%d problème(s). Commit refusé.%s\n' "$ROUGE" "$echecs" "$RAZ"
  printf '%sRetire le secret de l index (git restore --staged <fichier>), mets-le dans un secret GitHub\nou une variable d environnement, et s il a déjà été poussé : RÉVOQUE-LE, le supprimer ne suffit pas.%s\n' "$JAUNE" "$RAZ"
  exit 1
fi
printf '%s✓ Aucun secret détecté.%s\n' "$VERT" "$RAZ"
