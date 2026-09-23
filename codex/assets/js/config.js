/* ============================================================
   CODEX — branchement sur Supabase
   Les deux valeurs se trouvent dans Supabase > Project Settings > API.

   La clé « anon » (ou « publishable ») est faite pour être publique :
   ce n'est pas elle qui protège les cours, c'est la Row Level Security
   de supabase/schema.sql. Ne JAMAIS mettre ici la clé « service_role »
   (ou « secret ») : elle contourne toutes les règles.
   ============================================================ */
window.CODEX_CONFIG = {
  supabaseUrl: "https://zxgurhhrybheyctnvxie.supabase.co",
  supabaseCle: "sb_publishable_kd4CK4cPCaALNKw3ksCwwA_4p7dQDKx",

  // Bouton « Continuer avec Google » sur l'écran de connexion. Demande
  // d'avoir configuré le fournisseur Google dans Supabase (voir README).
  connexionGoogle: false,

  // Nom affiché aux comptes pas encore autorisés : « demande à … ».
  responsable: "Bastien"
};
