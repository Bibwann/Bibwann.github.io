# -*- coding: utf-8 -*-
"""
Genere assets/lang/fr.json et en.json depuis une source unique.

Les deux fichiers DOIVENT avoir exactement le meme jeu de cles — c'est la
regle du projet, et la seule facon de la tenir est de ne jamais les ecrire
separement. Le script verifie en plus que ce jeu correspond exactement aux
data-i18n presents dans index.html (plus les deux cles lues par le JS).
"""
import io
import json
import os
import re
import sys

# cle : (francais, anglais)
D = {
    # ---- navigation ----
    "home_ref":       ("Accueil", "Home"),
    "about_ref":      ("À propos", "About"),
    "resume_ref":     ("Parcours", "Resume"),
    "portfolio_ref":  ("Projets", "Projects"),
    "showcase_ref":   ("Créations", "Creations"),
    "passions_ref":   ("Passions", "Passions"),
    "contact_ref":    ("Contact", "Contact"),

    # ---- hero ----
    "hero_status":       ("Dispo pour de nouveaux projets", "Available for new projects"),
    "mon_nom":           ("Bastien Nieto", "Bastien Nieto"),
    "hero_role":         ("Développeur Fullstack &amp; Expert en Intégration IA",
                          "Fullstack Developer &amp; AI Integration Expert"),
    "typed-items":       ("J'orchestre des agents IA, Je fine-tune des modèles (LoRA), Je code en fullstack, J'intègre l'IA dans de vrais produits",
                          "I orchestrate AI agents, I fine-tune models (LoRA), I code fullstack, I ship AI into real products"),
    "hero_cta_projects": ("Voir mes projets", "See my projects"),
    "hero_cta_terminal": ("Parler à mon IA", "Talk to my AI"),
    "hero_cta_cv":       ("Mon CV", "My resume"),
    "hero_scroll":       ("Embarquer", "Get on board"),

    # ---- a propos ----
    "about_title":    ("À propos", "About"),
    "about_subtitle": ("Développeur fullstack, à fond dans l'intégration de l'IA.",
                       "Fullstack developer, all-in on AI integration."),
    "about_headline": ("Ce que je fais, en trois phrases", "What I do, in three sentences"),
    "about_1": ("Développeur fullstack passé par trois ans d'alternance en entreprise, je construis et fais évoluer des applis web et mobiles en production (PHP/Symfony, Node.js, Java/Kotlin).",
                "A fullstack developer with three years of work-study experience in a company, I build and evolve production web and mobile apps (PHP/Symfony, Node.js, Java/Kotlin)."),
    "about_2": ("Du backend (API, bases de données, admin système) au frontend (UI/UX, intégration), je touche à toute la chaîne — et j'aime que ça parte en prod proprement.",
                "From the backend (APIs, databases, sysadmin) to the frontend (UI/UX, integration), I work across the whole chain — and I like shipping to production cleanly."),
    "about_3": ("Ma vraie passion : l'intégration de l'IA. J'orchestre des systèmes multi-agents, je fine-tune des modèles (LoRA) et je branche des LLM dans des produits concrets.",
                "My real passion: AI integration. I orchestrate multi-agent systems, fine-tune models (LoRA) and wire LLMs into concrete products."),
    "about_perso": ("⚡ Hors du code : les montres mécaniques, la Formule 1, les barres de traction et beaucoup (trop) de café.",
                    "⚡ Outside the code: mechanical watches, Formula 1, pull-up bars and far too much coffee."),

    "cap_ai":     ("Ingénierie IA &amp; multi-agents", "AI engineering &amp; multi-agent"),
    "cap_web":    ("Web fullstack", "Fullstack web"),
    "cap_mobile": ("Mobile", "Mobile"),
    "cap_legacy": ("Modernisation de legacy", "Legacy modernisation"),
    "cap_ops":    ("Serveurs &amp; déploiement", "Servers &amp; deployment"),
    "cap_auto":   ("RAG &amp; automatisation", "RAG &amp; automation"),

    "name_about":     ("Nom :", "Name:"),
    "profil_about":   ("Profil :", "Profile:"),
    "profil_about_2": ("Fullstack &amp; Intégration IA", "Fullstack &amp; AI Integration"),
    "email_about":    ("Email :", "Email:"),
    "phone_about":    ("Spot :", "Based in:"),
    "loc_about":      ("Côte d'Azur (83)", "French Riviera (83)"),
    "cv_download":    ("Télécharger mon CV", "Download my resume"),

    "skills_title":    ("Langues", "Languages"),
    "skills_fr":       ("Français", "French"),
    "skills_fr_level": ("Maternelle", "Native"),
    "skills_en":       ("Anglais", "English"),
    "skills_en_level": ("B2", "B2"),
    "skills_it":       ("Italien", "Italian"),
    "skills_it_level": ("A1", "A1"),

    "stack_title": ("Ma stack IA au quotidien", "My everyday AI stack"),

    # ---- parcours ----
    "resume_title":    ("Parcours", "Resume"),
    "resume_subtitle": ("Mon parcours, mes expériences et mes compétences clés.",
                        "My education, my experience and my key skills."),
    "resume_education_title": ("Formations", "Education"),
    "resume_polytech_title":  ("Polytech — Cycle ingénieur", "Polytech — Engineering cycle"),
    "resume_polytech_date":   ("2026 – aujourd'hui", "2026 – today"),
    "resume_polytech_school": ("École d'ingénieurs · 1re année", "Engineering school · 1st year"),
    "resume_but_title":       ("BUT Informatique (alternance)", "BUT in Computer Science (work-study)"),
    "resume_but_date":        ("2023 - 2026", "2023 - 2026"),
    "resume_but_school":      ("IUT de Sophia Antipolis", "IUT Sophia Antipolis"),
    "resume_peip_title":      ("Polytech Annecy — PeiP1", "Polytech Annecy — PeiP1"),
    "resume_peip_date":       ("2022 - 2023", "2022 - 2023"),
    "resume_peip_school":     ("Cycle préparatoire intégré", "Integrated preparatory year"),
    "resume_bac_title":       ("Bac Général Mathématiques / NSI", "High-school diploma — Maths / Computer Science"),
    "resume_bac_date":        ("2022", "2022"),
    "resume_bac_mention":     ("Mention Bien", "With honours"),

    "resume_exp_title":       ("Expérience professionnelle", "Professional experience"),
    "resume_valiance_title":  ("Développeur Full Stack &amp; Intégration IA (alternance)",
                               "Fullstack Developer &amp; AI Integration (work-study)"),
    "resume_valiance_date":   ("2023 – aujourd'hui", "2023 – today"),
    "resume_valiance_company": ("Valiance, Sophia Antipolis", "Valiance, Sophia Antipolis"),
    "resume_valiance_ai":  ("Intégration d'IA pour le service client : assistants, automatisation des réponses et des workflows internes.",
                            "AI integration for customer service: assistants, automated replies and internal workflows."),
    "resume_valiance_erp": ("Migration et évolution de l'ERP maison (Symfony 1.4 ➔ 4 ➔ 7), avec pont hybride pour la continuité de service.",
                            "Migration and evolution of the in-house ERP (Symfony 1.4 ➔ 4 ➔ 7), with a hybrid bridge for service continuity."),
    "resume_valiance_web": ("Développement web &amp; mobile fullstack. Portage Java ➔ Kotlin, premiers pas en Swift.",
                            "Fullstack web &amp; mobile development. Java ➔ Kotlin port, first steps in Swift."),
    "resume_valiance_sys": ("Administration système &amp; infra : serveurs OVH, NAS QNAP, sauvegardes.",
                            "Sysadmin &amp; infrastructure: OVH servers, QNAP NAS, backups."),
    "resume_valiance_team": ("Documentation, gestion de projet, réunions clients.",
                             "Documentation, project management, client meetings."),
    "resume_monaclean_title": ("Stagiaire — Monaclean", "Intern — Monaclean"),
    "resume_monaclean_date":  ("Juillet 2023", "July 2023"),
    "resume_monaclean_desc":  ("Découverte du monde pro et des métiers techniques et de gestion.",
                               "First look at the professional world, on both the technical and management sides."),

    # ---- chiffres ----
    "stat_projects":   ("Projets réalisés", "Projects shipped"),
    "stat_techs":      ("Technologies", "Technologies"),
    "stat_experience": ("Années de code", "Years of code"),
    "stat_agents":     ("Agents dans Aegis", "Agents inside Aegis"),

    # ---- ambition : creer mon entreprise ----
    "ambition_ref":      ("Ambition", "Ambition"),
    "ambition_title":    ("Créer mon entreprise", "Building my own company"),
    "ambition_subtitle": ("L'étape d'après, et le fil qui relie tout le reste de cette page.",
                          "The next step, and the thread running through everything else on this page."),
    "ambition_kicker":   ("// ce vers quoi je construis", "// what I am building toward"),
    "ambition_p1": ("Mon objectif n'est pas de rester à intégrer l'IA des autres : je veux monter ma propre entreprise, à mon nom, et vendre aux entreprises ce que je sais faire de mieux — installer de l'IA locale et souveraine directement chez elles. Aujourd'hui, une société qui veut de l'IA n'a en pratique qu'une seule porte d'entrée : envoyer ses données chez un fournisseur étranger, payer au token, et ne jamais vraiment savoir où ses documents atterrissent ni ce qu'ils entraînent. Je veux ouvrir l'autre porte. D'abord le conseil — venir regarder ce qu'il y a réellement dans leurs processus, et leur dire honnêtement ce que l'IA peut faire chez eux, ce qu'elle ne fera pas, et ce que ça coûte pour de vrai. Ensuite la construction — entraîner et fine-tuner les modèles sur leurs données à elles, les déployer sur leurs machines à elles, puis repartir en laissant leurs équipes capables de s'en servir sans moi. Le tout dans les clous du RGPD, pas comme une case cochée en fin de projet, mais comme la contrainte de départ qui décide de l'architecture. C'est exactement le fil qui relie tout ce qu'il y a sur cette page : Aegis tourne sans une seule API, Nano tourne dans votre navigateur et pas sur mon serveur, Cerber n'existe que pour empêcher des données de fuir. Je ne vendrai pas une techno parce qu'elle est à la mode — je vendrai la seule façon de faire que je pratique déjà, tous les jours, sur mes propres projets.",
                    "My goal is not to keep integrating other people's AI: I want to start my own company, under my own name, and sell businesses what I do best — installing local, sovereign AI directly on their premises. Today a company that wants AI has, in practice, a single door: ship its data to a foreign provider, pay per token, and never really know where its documents land or what they train. I want to open the other door. Advice first — actually looking at what is inside their processes, and telling them honestly what AI can do for them, what it will not do, and what it really costs. Then building — training and fine-tuning models on their own data, deploying them on their own machines, then leaving with their teams able to run it without me. All of it within GDPR, not as a box ticked at the end of a project, but as the starting constraint that decides the architecture. That is exactly the thread running through this whole page: Aegis runs without a single API, Nano runs in your browser and not on my server, Cerber exists only to stop data from leaking. I will not sell a technology because it is fashionable — I will sell the one way of working I already practise, every day, on my own projects."),
    "ambition_pill1_title": ("Conseiller", "Advise"),
    "ambition_pill1_desc":  ("Auditer les processus, cartographier ce qui est automatisable, et dire non quand l'IA n'est pas la réponse.",
                             "Audit the processes, map what can be automated, and say no when AI is not the answer."),
    "ambition_pill2_title": ("Entraîner &amp; déployer", "Train &amp; deploy"),
    "ambition_pill2_desc":  ("Fine-tuner des modèles sur les données de l'entreprise, et les faire tourner sur son infrastructure à elle.",
                             "Fine-tune models on the company's own data, and run them on the company's own infrastructure."),
    "ambition_pill3_title": ("Garder la souveraineté", "Keep sovereignty"),
    "ambition_pill3_desc":  ("RGPD posé comme contrainte d'architecture dès le premier schéma, pas comme une case cochée à la fin.",
                             "GDPR set as an architecture constraint from the first diagram, not a box ticked at the end."),
    "ambition_status":      ("Statut : en préparation", "Status: in preparation"),
    "ambition_cta":         ("En parler avec moi", "Talk to me about it"),

    # ---- projets : entete et rangs ----
    "portfolio_title":    ("Mes Projets", "My Projects"),
    "portfolio_subtitle": ("Trois projets au long cours, dix projets aboutis, et les travaux d'école qui m'ont appris le métier.",
                           "Three long-running projects, ten finished ones, and the school work that taught me the craft."),

    "tier_flagship_title": ("Les projets phares", "The flagship projects"),
    "tier_flagship_sub":   ("Ceux sur lesquels je travaille depuis des mois, et qui disent le mieux comment je bosse.",
                            "The ones I have been working on for months, and that best show how I work."),
    "tier_solid_title":    ("Les projets aboutis", "The finished projects"),
    "tier_solid_sub":      ("Finis, jouables ou en production. Clique sur une carte pour voir le détail et les vraies captures.",
                            "Finished, playable or in production. Click a card for the details and the real screenshots."),
    "tier_archive_title":  ("L'archive", "The archive"),
    "tier_archive_sub":    ("Les travaux d'école et les premiers projets. Ils ne me représentent plus, mais ils m'ont appris à coder — et le tout premier date de 2018.",
                            "School work and early projects. They no longer represent me, but they taught me to code — and the very first one is from 2018."),
    "archive_open":  ("Dérouler les 5 projets d'archive", "Show the 5 archived projects"),
    "archive_close": ("Replier l'archive", "Hide the archive"),
    "statut_encours": ("EN DÉVELOPPEMENT", "IN DEVELOPMENT"),
    "statut_conception": ("EN CONCEPTION", "IN DESIGN"),

    "filter_all":  ("Tout", "All"),
    "filter_ai":   ("IA", "AI"),
    "filter_web":  ("Web", "Web"),
    "filter_app":  ("Mobile", "Mobile"),
    "filter_game": ("Jeux", "Games"),

    # ---- phare 3 : Cerber ----
    "cerber_title": ("Cerber — bouclier de vie privée", "Cerber — a privacy shield"),
    "cerber_role":  ("// spécifié avant d'être codé", "// specified before it is coded"),
    "cerber_desc":  ("Cerber est l'outil que je veux pour moi-même : un garde-fou posé entre ma machine et tout ce qui essaie d'en faire sortir mon identité. Soyons clairs sur l'état des lieux — ce n'est pas encore du code. C'est une architecture complète, six modules spécifiés et un périmètre écrit noir sur blanc. Sur un outil de vie privée, se tromper de périmètre coûte bien plus cher que se tromper de langage : je pose donc le cahier des charges d'abord, et je le montre tel quel plutôt que de faire passer une intention pour un produit.",
                    "Cerber is the tool I want for myself: a guard rail between my machine and anything trying to push my identity out of it. Let's be clear about where it stands — it is not code yet. It is a complete architecture, six specified modules and a scope written down in black and white. On a privacy tool, getting the scope wrong costs far more than getting the language wrong: so I write the spec first, and I show it as it is rather than passing an intention off as a product."),
    "cerber_pt1": ("Un moteur DLP local qui surveille le presse-papiers et les frappes : dès qu'un motif correspond à mon IBAN, mon numéro de sécu ou mon vrai numéro, le flux sortant est coupé ou la valeur remplacée à la volée.",
                   "A local DLP engine watching the clipboard and keystrokes: as soon as a pattern matches my IBAN, my social-security number or my real phone number, the outgoing stream is killed or the value swapped on the fly."),
    "cerber_pt2": ("Un kill switch au niveau du noyau — nftables sous Linux, WFP sous Windows : si le tunnel chiffré tombe, plus un paquet ne sort en clair. DNS forcé en DoH/DoT, WebRTC neutralisé, télémétrie de l'OS envoyée au trou noir.",
                   "A kernel-level kill switch — nftables on Linux, WFP on Windows: if the encrypted tunnel drops, not one packet leaves in the clear. DNS forced to DoH/DoT, WebRTC neutralised, OS telemetry blackholed."),
    "cerber_pt4": ("Camouflage de l'empreinte matérielle et sessions jetables : rotation d'adresse MAC, normalisation des identifiants machine, et navigation dans des bacs à sable montés en RAM qui s'autodétruisent à la fermeture.",
                   "Hardware-fingerprint camouflage and disposable sessions: MAC address rotation, normalised machine identifiers, and browsing inside RAM-mounted sandboxes that self-destruct on close."),
    "cerber_pt3": ("Et le reste du périmètre : chiffrement à la volée des bases de cookies, memory scraping interdit sur les navigateurs et gestionnaires de mots de passe, purge EXIF automatique, broyage multi-passes et alias e-mail jetables par service.",
                   "And the rest of the scope: on-the-fly encryption of cookie stores, memory scraping blocked on browsers and password managers, automatic EXIF purging, multi-pass shredding and a throwaway email alias per service."),
    "cerber_btn": ("Spécification en cours", "Spec in progress"),

    # ---- phare 1 : Aegis ----
    "aegis_title": ("Aegis — IA souveraine", "Aegis — sovereign AI"),
    "aegis_role":  ("// de loin le plus gros projet de ma vie", "// by far the biggest project of my life"),
    "aegis_desc":  ("Aegis (nom de code « Luminai ») est une IA quasi-humaine qui tourne 100 % en local, sans aucune API. Son « Mind » est un Qwen2.5 que j'ai fine-tuné moi-même en LoRA, orchestré par une architecture multi-agents — chat, pensée, monologue intérieur, mémoire hiérarchique, émotions, vision et jeu. Concrètement, elle perçoit, décide et agit seule : elle joue à Pokémon en autonomie totale et discute en direct sur Twitch.",
                    "Aegis (codename « Luminai ») is a near-human AI running 100% locally, with no API at all. Its « Mind » is a Qwen2.5 I fine-tuned myself with LoRA, orchestrated by a multi-agent architecture — chat, thought, inner monologue, hierarchical memory, emotions, vision and game. It perceives, decides and acts on its own: it plays Pokémon fully autonomously and chats live on Twitch."),
    "aegis_pt1": ("Un score de « vivacité » mesuré sur 4 axes — initiative, variété, mémoire, à-propos — pour arrêter de juger à l'impression.",
                  "A « liveness » score measured on 4 axes — initiative, variety, memory, relevance — so it stops being judged on gut feeling."),
    "aegis_pt2": ("Pipeline voix complet (Piper), mémoire hiérarchique, file Redis et agents isolés en processus.",
                  "A full voice pipeline (Piper), hierarchical memory, a Redis queue and agents isolated in their own processes."),
    "aegis_pt3": ("Zéro euro d'API : tout tourne sur ma machine, modèles compris.",
                  "Zero API spend: everything runs on my own machine, models included."),
    "aegis_btn": ("Dépôt privé", "Private repo"),

    # ---- phare 2 : UnderGears ----
    "undergears_title": ("UnderGears — Sous les Rouages", "UnderGears — Sous les Rouages"),
    "undergears_role":  ("// je dirige, l'IA exécute", "// I direct, the AI executes"),
    "undergears_desc":  ("Un FPS de mouvement nerveux sous Godot, dont je n'ai pas écrit une seule ligne à la main : tout le code, les shaders et les outils sont produits par des agents IA que je pilote. Ce qui est à moi, c'est tout le reste — l'architecture, l'univers, le game design, et surtout l'arbitrage permanent de ce qui est acceptable ou non.",
                         "A fast movement-FPS built in Godot, in which I have not written a single line by hand: all the code, shaders and tools are produced by AI agents I direct. What is mine is everything else — the architecture, the world, the game design, and above all the constant arbitration of what is acceptable and what is not."),
    "undergears_pt1": ("Un registre de décisions et un journal de tâches : chaque arbitrage est écrit, daté et opposable — c'est ce qui empêche le projet de partir en vrille.",
                       "A decision register and a task log: every call is written down, dated and binding — that is what keeps the project from drifting."),
    "undergears_pt2": ("Des outils de contrôle qualité automatiques qui mesurent l'image rendue, les textures et le skinning, et refusent ce qui sort des seuils.",
                       "Automated quality-control tools that measure the rendered frame, the textures and the skinning, and reject anything outside the thresholds."),
    "undergears_pt3": ("Un Prologue jouable de 4 salles, un univers écrit (l'Aether, le Kronis, le Complexe Prométhée) et 73 salles cartographiées.",
                       "A playable 4-room prologue, a written world (the Aether, the Kronis, the Prométhée Complex) and 73 mapped rooms."),
    "undergears_btn": ("En chantier", "Work in progress"),

    # ---- projets aboutis ----
    "portfolio_tinyml_title": ("Reconnaissance de gestes (TinyML)", "Gesture recognition (TinyML)"),
    "portfolio_tinyml_desc":  ("Capture et nettoyage de datasets de mouvements, entraînement d'un modèle TinyML avec Edge Impulse, puis inférence directement sur Arduino — du capteur au modèle qui tourne sur microcontrôleur.",
                               "Capturing and cleaning motion datasets, training a TinyML model with Edge Impulse, then running inference directly on an Arduino — from the sensor to a model running on a microcontroller."),
    "portfolio_tinyml_btn":   ("Projet embarqué", "Embedded project"),

    "portfolio_beat_title": ("BeatForge", "BeatForge"),
    "portfolio_beat_desc":  ("Jeu de rythme web ultra-stylisé où tu forges tes armes au rythme de la musique : détection des temps, système de combos et feedback nerveux — le tout en néon, pensé pour être satisfaisant à jouer.",
                             "A heavily stylised web rhythm game where you forge weapons on the beat: beat detection, a combo system and punchy feedback — all in neon, designed to feel good to play."),
    "portfolio_beat_btn":   ("Jouer", "Play"),

    "portfolio_solar_title": ("Système Solaire (Hand Tracking)", "Solar System (hand tracking)"),
    "portfolio_solar_desc":  ("Système solaire 3D entièrement piloté à la main : la computer vision suit tes gestes pour naviguer, zoomer et explorer les planètes, sans clavier ni souris.",
                              "A 3D solar system driven entirely by hand: computer vision tracks your gestures to navigate, zoom and explore the planets — no keyboard, no mouse."),
    "portfolio_solar_btn":   ("Voir le projet", "View the project"),

    "portfolio_erp_title": ("Migration ERP Valiance", "Valiance ERP migration"),
    "portfolio_erp_desc":  ("Migration d'un ERP legacy de Symfony 1.4 jusqu'à 7, par étapes (1.4 → 4 → 7) avec des ponts hybrides faisant cohabiter ancien et nouveau code en production — sans tout casser d'un coup.",
                            "Migrating a legacy ERP from Symfony 1.4 all the way to 7, in stages (1.4 → 4 → 7), with hybrid bridges letting old and new code live together in production — without breaking everything at once."),
    "portfolio_erp_btn":   ("Valiance", "Valiance"),

    "portfolio_valorant_title": ("Valorant Tactical Protocol", "Valorant Tactical Protocol"),
    "portfolio_valorant_desc":  ("Générateur tactique exploitant l'API Valorant : roulette d'agents/armes avec bans, mode Nuzlocke (permadeath) persistant et mini-jeux intégrés (Reflexes, Gridshot, Defuse).",
                                 "A tactical generator built on the Valorant API: an agent/weapon roulette with bans, a persistent Nuzlocke (permadeath) mode and built-in mini-games (Reflexes, Gridshot, Defuse)."),
    "portfolio_valorant_btn":   ("Jouer", "Play"),

    "whiskers_title": ("Whiskers Rebellion II", "Whiskers Rebellion II"),
    "whiskers_desc":  ("Action-RPG narratif en Java : architecture de jeu complète, IA d'ennemis, système de combat et rendu — un vrai moteur maison plutôt qu'un assemblage.",
                       "A narrative action-RPG in Java: full game architecture, enemy AI, combat system and rendering — a real in-house engine rather than an assembly job."),
    "whiskers_btn":   ("Voir sur Github", "View on Github"),

    "portfolio_music_title": ("Potify (App Mobile)", "Potify (mobile app)"),
    "portfolio_music_desc":  ("Application mobile de lecture musicale : playlists, lecteur audio et intégration d'une API externe.",
                              "A mobile music app: playlists, an audio player and integration with an external API."),
    "portfolio_music_btn":   ("Télécharger", "Download"),

    "portfolio_steam_title": ("MongoDB Docker + Import", "MongoDB Docker + import"),
    "portfolio_steam_desc":  ("Stack MongoDB 7 et Mongo Express conteneurisée, avec des scripts d'import automatisés pour repartir d'un jeu de données propre en une commande.",
                              "A containerised MongoDB 7 and Mongo Express stack, with automated import scripts to rebuild a clean dataset in a single command."),
    "portfolio_steam_btn":   ("Voir le projet", "View the project"),

    # ---- archive ----
    "portfolio_tms_title": ("Gestionnaire de tâches (Python MVC)", "Task manager (Python MVC)"),
    "portfolio_tms_desc":  ("Appli de gestion en architecture MVC : MySQL, interface, tests pytest, doc Sphinx et CI GitLab.",
                            "A management app in MVC architecture: MySQL, a UI, pytest tests, Sphinx docs and GitLab CI."),
    "portfolio_tms_btn":   ("Projet IUT", "University project"),

    "portfolio_pendu_title": ("Jeu du Pendu (Docker &amp; CI/CD)", "Hangman (Docker &amp; CI/CD)"),
    "portfolio_pendu_desc":  ("Jeu web classique encapsulé dans un conteneur Docker et déployé automatiquement via une pipeline GitLab CI/CD.",
                              "The classic web game wrapped in a Docker container and deployed automatically through a GitLab CI/CD pipeline."),
    "portfolio_pendu_btn":   ("Voir sur GitLab", "View on GitLab"),

    "portfolio_steam2_title": ("BDD Steam Docker", "Steam database (Docker)"),
    "portfolio_steam2_desc":  ("Gestion et structuration d'une base de données Steam sous Docker.",
                               "Managing and structuring a Steam database under Docker."),
    "portfolio_steam2_btn":   ("Voir le projet", "View the project"),

    "portfolio_idle_title": ("Jeu Evolution Idle", "Evolution Idle"),
    "portfolio_idle_desc":  ("Idle game web (HTML/CSS/JS) avec progression et sauvegarde locale.",
                             "A web idle game (HTML/CSS/JS) with progression and local saves."),
    "portfolio_idle_btn":   ("Jouer", "Play"),

    "portfolio_zombie_title": ("Player vs Zombie (C)", "Player vs Zombie (C)"),
    "portfolio_zombie_desc":  ("Jeu de survie tactique en console C : 1 à 4 zombies dotés d'algorithmes de traque active, sur des cartes réelles. Sauvegarde locale.",
                               "A tactical survival game in the C console: 1 to 4 zombies with active hunting algorithms, on real-world maps. Local saves included."),
    "portfolio_zombie_btn":   ("Télécharger", "Download"),

    "portfolio_rollaball_title": ("Roll a Ball (Unity)", "Roll a Ball (Unity)"),
    "portfolio_rollaball_desc":  ("Mini-jeu Unity, scripts C#, collisions et score.",
                                  "A Unity mini-game: C# scripts, collisions and scoring."),
    "portfolio_rollaball_btn":   ("Télécharger", "Download"),

    "portfolio_pong_title": ("Pong Python", "Pong in Python"),
    "portfolio_pong_desc":  ("Reproduction de Pong en Python. Mon tout premier projet.",
                             "A Pong remake in Python. My very first project."),
    "portfolio_pong_btn":   ("Télécharger", "Download"),

    # ---- vitrines ----
    "showcase_title":    ("Mes capacités de création", "What I can design"),
    "showcase_subtitle": ("Huit sites, et surtout huit formats qui n'ont rien à voir entre eux : une boutique avec panier, un tableau de bord applicatif, un configurateur de produit, un moteur de réservation, un moteur de recherche d'annonces, un planning de cours, une revue en ligne et un parcours de qualification. Aucune base commune, aucune librairie — ouvre-les et sers-t'en.",
                          "Eight sites, and above all eight formats with nothing in common: a shop with a working cart, an application dashboard, a product configurator, a booking engine, a listings search engine, a class schedule, an online magazine and a qualification flow. No shared base, no library — open them and use them."),
    "showcase_note":     ("Ce sont des démonstrations que j'ai conçues et codées de A à Z, sans aucune librairie. Les marques, les textes, les prix et les disponibilités sont inventés — aucune de ces entreprises n'existe.",
                          "These are demos I designed and coded from scratch, with no library at all. The brands, copy, prices and availability are invented — none of these businesses exist."),
    "showcase_open":   ("Ouvrir le site", "Open the site"),
    "showcase_newtab": ("Nouvel onglet", "New tab"),

    "showcase_1_desc":  ("Vitrine éditoriale doublée d'un moteur de réservation : couverts, jour, service, créneaux réellement disponibles, salle ou terrasse, puis confirmation.",
                         "An editorial storefront wrapped around a real booking engine: covers, day, service, genuinely available slots, indoor or terrace, then confirmation."),
    "showcase_1_genre": ("Réservation", "Booking"),
    "showcase_2_desc":  ("Le planning de la salle, pas sa plaquette : grille hebdomadaire, filtres par discipline, places qui décrémentent, liste d'attente quand c'est complet.",
                         "The gym's schedule, not its brochure: weekly grid, filters by discipline, spots that actually decrement, a waiting list when a class is full."),
    "showcase_2_genre": ("Planning", "Scheduling"),
    "showcase_3_desc":  ("Un parcours de qualification en quatre étapes : il oriente le dossier vers le bon associé, motive une fourchette d'honoraires et pose le rendez-vous.",
                         "A four-step qualification flow: it routes the case to the right partner, justifies a fee range and books the meeting."),
    "showcase_3_genre": ("Parcours guidé", "Guided flow"),
    "showcase_4_desc":  ("Une vraie boutique : filtres, tailles en rupture, panier latéral avec quantités, seuil de livraison offerte et tunnel de commande en trois étapes.",
                         "An actual shop: filters, sold-out sizes, a side cart with quantities, a free-shipping threshold and a three-step checkout."),
    "showcase_4_genre": ("Boutique", "Storefront"),
    "showcase_5_desc":  ("L'intérieur du logiciel : KPI, graphes tracés à la main, table triable et filtrable, et un sélecteur de période qui recalcule tout le tableau de bord.",
                         "The inside of the product: KPIs, hand-drawn charts, a sortable and filterable table, and a period selector that recomputes the whole dashboard."),
    "showcase_5_genre": ("Tableau de bord", "Dashboard"),

    "showcase_6_desc":  ("Un configurateur : essence, largeur, piètement, options et gravure redessinent un aperçu SVG paramétré et recalculent le devis ligne à ligne, délai de fabrication compris.",
                         "A configurator: wood, width, legs, options and engraving redraw a parametric SVG preview and recompute the quote line by line, lead time included."),
    "showcase_6_genre": ("Configurateur", "Configurator"),
    "showcase_7_desc":  ("Une revue en ligne, donc une expérience de lecture : barre de progression, sommaire qui suit la section lue, notes en marge et temps restant qui décroît vraiment.",
                         "An online magazine, so a reading experience: progress bar, a table of contents that follows the section you are in, margin notes, and a remaining-time counter that actually counts down."),
    "showcase_7_genre": ("Lecture longue", "Long read"),
    "showcase_8_desc":  ("Un moteur de recherche d'annonces : filtres qui se combinent, tri, favoris, et une carte liée à la liste — survolez d'un côté, ça s'allume de l'autre.",
                         "A listings search engine: filters that combine, sorting, favourites, and a map wired to the list — hover on one side and it lights up on the other."),
    "showcase_8_genre": ("Recherche", "Search"),

    # ---- passions ----
    "passions_title":    ("Hors du code", "Outside the code"),
    "passions_subtitle": ("Ce qui m'anime quand je ne suis pas en train de faire tourner une IA.",
                          "What drives me when I am not running an AI."),
    "passions_music_title": ("Musique", "Music"),
    "passions_music_desc":  ("Toujours un son dans les oreilles — ma bande-son pour coder, créer et décrocher.",
                             "Always something in my ears — my soundtrack for coding, creating and switching off."),
    "passions_sport_title": ("Street workout, escalade &amp; salle", "Street workout, climbing &amp; gym"),
    "passions_sport_desc":  ("Cinq séances par semaine depuis un an, entre la salle, le mur et les barres. En ce moment je travaille le muscle-up et l'handstand — deux mouvements qui ne se négocient pas : soit la position tient, soit elle ne tient pas.",
                             "Balancing body and mind: burning energy to come back sharper and more disciplined."),
    "passions_watch_title": ("Montres &amp; horlogerie", "Watches &amp; horology"),
    "passions_watch_desc":  ("La mécanique, la précision, le tic-tac. Une Pierre Lannier squelette au poignet, choisie exprès pour voir les rouages tourner — et une Seiko sur la liste.",
                             "The mechanics, the precision, the ticking. A skeleton Pierre Lannier on the wrist, picked precisely so the gears stay in sight — and a Seiko on the list."),

    "passions_games_title": ("Jeux vidéo", "Video games"),
    "passions_games_desc":  ("Du compétitif au chill — Pokémon, Valorant et compagnie. D'ailleurs Aegis joue à Pokémon en autonomie.",
                             "From competitive to chill — Pokémon, Valorant and friends. Aegis plays Pokémon on its own, by the way."),
    "passions_cars_title":  ("Voitures &amp; F1", "Cars &amp; F1"),
    "passions_cars_desc":   ("Passionné par tout ce qui va vite et qui fait vroom. L'ingénierie automobile me fascine.",
                             "Hooked on anything fast and loud. Automotive engineering fascinates me."),

    # ---- contact ----
    "contact_title":    ("Contact", "Contact"),
    "contact_subtitle": ("Un projet, une opportunité, ou juste envie de parler IA ? Écris-moi.",
                         "A project, an opportunity, or just want to talk AI? Drop me a line."),
    "contact_appel_titre": ("Parlons de ce que vous voulez construire",
                            "Let's talk about what you want to build"),
    "contact_appel_texte": ("Une alternance, une mission, un projet d'IA locale à monter dans votre entreprise, ou juste une question technique — j'ouvre tous les messages et je réponds à tout le monde.",
                            "An apprenticeship, a contract, a local-AI project to set up inside your company, or just a technical question — I open every message and I answer everyone."),
    "contact_appel_mail":  ("M'écrire", "Email me"),
    "contact_appel_cv":    ("Télécharger mon CV", "Download my resume"),
    "contact_delai":       ("Je réponds sous 24 h, en français ou en anglais.",
                            "I reply within 24 hours, in French or English."),

    "contact_email_title":    ("Email", "Email"),
    "contact_github_title":   ("Github", "Github"),
    "contact_gitlab_title":   ("GitLab", "GitLab"),
    "contact_linkedin_title": ("LinkedIn", "LinkedIn"),
    "contact_location_title": ("Localisation", "Location"),
    "contact_location_value": ("Les Adrets-de-l'Esterel (83)", "Les Adrets-de-l'Esterel (83), France"),

    # ---- Nano ----
    "nano_bubble":    ("Salut ! Clique pour me parler.", "Hi! Click to talk to me."),
    "nano_state_off": ("en veille", "idle"),
    "nano_label":     ("Ta question pour Nano", "Your question for Nano"),
    "terminal_placeholder":        ("Pose ta question…", "Ask your question…"),
    "terminal_chip_who":           ("Qui es-tu ?", "Who are you?"),
    "terminal_chip_aegis":         ("C'est quoi Aegis ?", "What is Aegis?"),
    "terminal_chip_undergears":    ("C'est quoi UnderGears ?", "What is UnderGears?"),
    "terminal_chip_stack":         ("Quelle est sa stack ?", "What is his stack?"),
    "terminal_chip_contact":       ("Comment le contacter ?", "How do I contact him?"),

    # ---- HUD ----
    "hud_menu_solar":     ("SYSTÈME SOLAIRE", "SOLAR SYSTEM"),
    "hud_back":           ("RETOUR", "BACK"),
    "hud_close_3d":       ("RETOUR AU PORTFOLIO", "BACK TO PORTFOLIO"),

    # ---- pied de page ----
    "footer_copyright_prefix": ("© Copyright", "© Copyright"),
    "footer_site":             ("MyWorld", "MyWorld"),
    "footer_copyright_suffix": ("Tous droits réservés", "All rights reserved"),
    "footer_built":            ("Conçu avec un peu d'aide de Claude · codé maison.",
                                "Designed with a little help from Claude · hand-coded."),
}

# ---- verification de parite avec index.html --------------------------------

html = io.open("index.html", encoding="utf-8").read()
utilisees = set(re.findall(r'data-i18n(?:-placeholder)?="([^"]+)"', html))
# Deux cles ne vivent que dans le JS : le texte tape du hero, et le libelle
# de l'archive une fois depliee.
utilisees |= {"typed-items", "archive_close"}

fournies = set(D)
manquantes = utilisees - fournies
en_trop = fournies - utilisees

if manquantes:
    print("CLES MANQUANTES (utilisees dans le HTML, absentes du dictionnaire) :")
    for k in sorted(manquantes):
        print("  -", k)
if en_trop:
    print("CLES ORPHELINES (dans le dictionnaire, plus utilisees) :")
    for k in sorted(en_trop):
        print("  -", k)
if manquantes or en_trop:
    sys.exit(1)

# ---- ecriture --------------------------------------------------------------

os.makedirs("assets/lang", exist_ok=True)
for i, code in enumerate(("fr", "en")):
    donnees = {k: v[i] for k, v in D.items()}
    chemin = os.path.join("assets", "lang", code + ".json")
    with io.open(chemin, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("%s : %d cles" % (chemin, len(donnees)))

print("fr et en ont le meme jeu de cles, et il correspond exactement au HTML.")
