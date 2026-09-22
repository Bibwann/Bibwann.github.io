#include <stdio.h>
#include <stdlib.h>
#include <conio.h>
#include <unistd.h>
#include <time.h>

#include "bibliotheque.h"
#include <dos.h>
#include <dir.h>
#include <time.h>

#define MAGRILLE

// Définir des codes de couleur ANSI
#define ANSI_COLOR_BLUE "\e[0;36m"
#define ANSI_COLOR_GREEN "\x1b[32m"
#define ANSI_COLOR_YELLOW "\x1b[33m"
#define ANSI_COLOR_RESET "\x1b[0m"

/// /////////////////////////////////////////////////////////////////////// ///
/// Procédure pour changer l'affichage du texte dans la console             ///
/// 0 : noir        4 : rouge       8  : gris foncé     12 : rouge clair    ///
/// 1 : bleu        5 : magenta     9  : bleu clair     13 : magenta clair  ///
/// 2 : vert        6 : brun        10 : vert clair     14 : paune          ///
/// 3 : cyan        7 : gris clair  11 : cyan clair     15 : blanc          ///
/// source de cette fonction : https://askcodez.com/comment-changer-la-     ///
/// couleur-du-texte-et-de-la-console-de-couleur-dans-codeblocks.html       ///
/// /////////////////////////////////////////////////////////////////////// ///

void clearScreen() {
    system("cls");
}

int randomNumber(int min, int max) {
    int nb = rand() % (max - min + 1) + min;

    return nb;
}

Player createPlayer() {
    Player p;
    p.x = 0;
    p.y = 0;
    return p;
}

Zombie createZombie(int id) {
    Zombie z;
    z.idZombie = id;
    z.x = 0;
    z.y = 0;
    return z;
}

void setRandomPosPlayer(Player *p, Grille *maGrille) {
    do {
        p -> x = randomNumber(0, maGrille->lignes - 1);
        p -> y = randomNumber(0, maGrille->colonnes - 1);
    } while (maGrille -> cellules[p -> x][p -> y] != 3);

    maGrille -> cellules[p -> x][p -> y] = 1;
}

void setRandomPosZombie(Zombie *z, Grille *maGrille) {
    do {
        z -> x = randomNumber(0, maGrille->lignes - 1);
        z -> y = randomNumber(0, maGrille->colonnes - 1);
    } while (maGrille -> cellules[z -> x][z -> y] != 3);

    maGrille -> cellules[z -> x][z -> y] = 2;
}

void setPosPlayer(Player *p, int x, int y){
    p -> x = x;
    p -> y = y;
}

void setPosZombie(Zombie *z, int x, int y){
    z->x=x;
    z->y=y;
}

int getPosXPlayer(Player *p) {
    return p -> x;
}
int getPosYPlayer(Player *p) {
    return p -> y;
}
int getPosXZombies(Zombie *z) {
    return z -> x;
}
int getPosYZombies(Zombie *z) {
    return z->y;
}

int getNbZombis(Grille *grille, char * fileName){
    int nb = 0;
    int c;
    FILE *file = fopen(fileName, "r");

    if (file == NULL) {
        printf("Erreur lors de l'ouverture du fichier.\n");
        return -1; // Indique une erreur
    }

     while ((c = fgetc(file)) != EOF) {
        if (c == '2') {
            nb++;
        }

    }
    return nb;
}

void getTabSize(Grille *grille, char * fileName) {

    int lignes = 0;
    int colonnes = 0;
    int c;
    FILE *file = fopen(fileName, "r");

    if (file == NULL) {
        printf("Erreur lors de l'ouverture du fichier.\n");
        return -1; // Indique une erreur
    }

     while ((c = fgetc(file)) != EOF) {
        // Si le caractère est un saut de ligne, incrémente le compteur de lignes

        if (c == '\n') {
            lignes++;
            colonnes = 0; // Réinitialise le compteur de colonnes à chaque saut de ligne
        } else {
            colonnes++; // Incrémente le compteur de colonnes
        }
    }


    fclose(file);
    grille->lignes = lignes+1 ;
    grille->colonnes = (colonnes/2) +1;
}


Grille creerGrilleDefault(char * fileName, Grille *grille){
    int lignes;
    int colonnes;


    getTabSize(grille,fileName);

    grille->cellules = malloc(grille->lignes * sizeof(int *));
         for (int i = 0; i < grille->lignes; i++) {
            grille->cellules[i] = malloc(grille->colonnes * sizeof(int));

        }

    // Initialiser le contenu du tableau
    if (isNew(grille)){
        for (int l = 0; l < grille->lignes; l++) {
            for (int c = 0; c < grille->colonnes; c++) {
                grille->cellules[l][c] = 3;
            }
        }
    }
}

int isNew(Grille *grille) {
    for (int i = 0; i < grille->lignes; i++) {
        for (int j = 0; j < grille->colonnes; j++) {
            if (grille->cellules[i][j] == 1) {
                return 1;
            }
        }
    }

    return 0;  // On n'a pas trouvé le chiffre 1
}


void showGridList(const Grille *grille) {
    for (int i=0; i<grille -> lignes; i++) {
        for (int p=0; p<grille-> colonnes; p++) {
            printf("(%d, %d) - Value: %d", i, p, grille -> cellules[i][p]);
        }
    }
}

void showGrid(const Grille *grille) {

    int lignes= grille->lignes;
    int colonnes= grille->colonnes;


   for (int i=0; i<lignes+2; i++) {
        printf("   ");
    }

    printf("\n");
    for (int i=0; i<lignes; i++) {
        for (int p=0; p<colonnes; p++) {
            if (grille -> cellules[i][p] == 3) { // Vide
                printf("| |");
            }
            else if (grille -> cellules[i][p] == 1) { // Player
                printf(ANSI_COLOR_BLUE "|P|" ANSI_COLOR_RESET );
            }
            else if (grille -> cellules[i][p] == 2) { // Zombie
                printf(ANSI_COLOR_GREEN "|Z|" ANSI_COLOR_RESET );
            }
            else { // Mur
                printf(ANSI_COLOR_YELLOW "|M|" ANSI_COLOR_RESET);
            }
        }
    printf("\n");


    for (int i=0; i <lignes+2; i++) {
        printf("   ");
    }


    printf("\n");
    }
}

void AlgoMobUneCaseMouvement(Zombie *z, Player *p, Grille *grille) {
    int randomValue = randomNumber(1, 6);

    if (randomValue == 1) {
        randomMoovZombie(z,grille);


    }else{
        int posPlayerX = getPosXPlayer(p);
        int posPlayerY = getPosYPlayer(p);

        int posZombieX = getPosXZombies(z);
        int posZombieY = getPosYZombies(z);

        if (posZombieX < posPlayerX && grille->cellules[posZombieX + 1][posZombieY] == 3) {
            downZombie(grille, z);
        } else if (posZombieX > posPlayerX && grille->cellules[posZombieX - 1][posZombieY] == 3) {
            upZombie(grille, z);
        } else if (posZombieY < posPlayerY && grille->cellules[posZombieX][posZombieY + 1] == 3) {
            rightZombie(grille, z);
        } else if (posZombieY > posPlayerY && grille->cellules[posZombieX][posZombieY - 1] == 3) {
            leftZombie(grille, z);
        }
    }
}

void randomMoovZombie(Zombie *z, Grille *grille) {
    int randomValue = randomNumber(1, 4);  // Génère un nombre aléatoire entre 1 et 4
    switch (randomValue) {
        case 1:
            downZombie(grille, z);
            break;
        case 2:
            upZombie(grille,z);
            break;
        case 3:
            leftZombie(grille,z);
            break;
        case 4:
            rightZombie(grille,z);
            break;
    }
}


void showPlayer(Player *p) {
    printf("Position du Player : (%d, %d)\n", p -> x, p -> y);
}

void showZombie(Zombie *z) {
    printf("Position du zombie : (%d, %d)\n", z -> x, z -> y);
}

void randomMur (Grille *grille, int nbMur) {
    int x, y;
    for (int i = 0; i < nbMur; i++) {
        do {
            x = rand() % 10;
            y = rand() % 10;
        } while (grille -> cellules[x][y] != 3);

        grille -> cellules[x][y] = 4;
    }
}

void playerTurn(Player *p, Grille *grille){

    printf("C'est au tour du joueur. \n");

    printf("Appuyez sur une touche jouer : \n");
    int input = getch();
    input = getch();
    // Double getch() car la recup de caractère n'est pas parfaitement fonctionnel (224 au lieu de 79)

    switch (input) {
        case 72: // Flèche haut
            upPlayer(grille, p);
            break;
        case 75: // Flèche gauche
            leftPlayer(grille, p);
            break;
        case 80: // Flèche bas
            downPlayer(grille, p);
            break;
        case 77: // Flèche droite
            rightPlayer(grille, p);
            break;
    }
    clearScreen();
    showGrid(grille);
    showPlayer(p);
}
void zombieTurn(Zombie *z, Grille *grille,Player *p){

    printf("C'est au tour du zombie %d. \n",z->idZombie);

    sleep(0.1);

    /// printf("Appuyez sur une touche jouer : \n");
    ///int input = getch();
    ///input = getch();
    // Double getch() car la recup de caractère n'est pas parfaitement fonctionnel (224 au lieu de 79)

    /*
    switch (input) {
        case 72: // Flèche haut
            upZombie(grille, z);
            break;
        case 75: // Flèche gauche
            leftZombie(grille, z);
            break;
        case 80: // Flèche bas
            downZombie(grille, z);
            break;
        case 77: // Flèche droite
            rightZombie(grille, z);
            break;
    }
    */
    AlgoMobUneCaseMouvement(z,p,grille);

    clearScreen();
    showGrid(grille);
    showZombie(z);
}

void upZombie(Grille *grille, Zombie *z) {
    if (getPosXZombies(z) != 0){

        int posX = getPosXZombies(z);
        int posY = getPosYZombies(z);
        int newPosX = (getPosXZombies(z) - 1);

        if (grille -> cellules[newPosX][posY] == 3) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[newPosX][posY] = 2;
            z -> x = newPosX;
            z -> y = posY;

        } else if (grille -> cellules[newPosX][posY] == 1) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[newPosX][posY] = 2;
            GameOver(grille);

        } else {
            printf("Mouvement Impossible ! \n");
        }
    }
}
void downZombie(Grille *grille, Zombie *z) {
    if (getPosXZombies(z) != grille->lignes-1){
        int posX = getPosXZombies(z);
        int posY = getPosYZombies(z);
        int newPosX = (getPosXZombies(z) + 1);

        if (grille -> cellules[newPosX][posY] == 3) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[newPosX][posY] = 2;
            z -> x = newPosX;
            z -> y = posY;

        } else if (grille -> cellules[newPosX][posY] == 1) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[newPosX][posY] = 2;
            GameOver(grille);

        } else {
            printf("Mouvement Impossible ! \n");
        }
    }
}
void rightZombie(Grille *grille, Zombie *z) {
    if (getPosXZombies(z) != grille->colonnes-1){
        int posX = getPosXZombies(z);
        int posY = getPosYZombies(z);
        int newPosY = (getPosYZombies(z) + 1);

        if (grille -> cellules[posX][newPosY] == 3) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[posX][newPosY] = 2;
            z -> x = posX;
            z -> y = newPosY;

        } else if (grille -> cellules[posX][newPosY] == 1) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[posX][newPosY] = 2;
            GameOver(grille);

        } else {
            printf("Mouvement Impossible ! \n");
        }
    }
}
void leftZombie(Grille *grille, Zombie *z) {
    if (getPosXZombies(z) != 0){
        int posX = getPosXZombies(z);
        int posY = getPosYZombies(z);
        int newPosY = (getPosYZombies(z) - 1);

        if (grille -> cellules[posX][newPosY] == 3) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[posX][newPosY] = 2;
            z -> x = posX;
            z -> y = newPosY;

        } else if (grille -> cellules[posX][newPosY] == 1) {
            grille -> cellules[posX][posY] = 3;
            grille -> cellules[posX][newPosY] = 2;
            GameOver(grille);

        } else {
            printf("Mouvement Impossible ! \n");
        }
    }
}

//Bastien and Enzo
void upPlayer(Grille *grille, Player *p){
    if (getPosXPlayer(p) != 0){

        int newPosX=(getPosXPlayer(p) - 1);
        int newPosY=(getPosYPlayer(p));

        if ((grille->cellules[newPosX][newPosY])==4 || newPosX < 0){ /// 1/2/3/4 Player/Zombie/Personne/Mur
            newPosX++;
        } else if ((grille->cellules[newPosX][newPosY])==2){
            GameOver(grille);
        }
        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 3;
        setPosPlayer(p, newPosX, newPosY);
        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 1;
    }
}
void downPlayer(Grille *grille, Player *p){
    if (getPosXPlayer(p) != grille->lignes-1){

        int newPosX=(getPosXPlayer(p) + 1);
        int newPosY=(getPosYPlayer(p));

        if ((grille->cellules[newPosX][newPosY])==4 || newPosX >= grille -> lignes){ /// 1/2/3/4 Player/Zombie/Personne/Mur
            newPosX--;
        } else if ((grille->cellules[newPosX][newPosY])==2){
            GameOver(grille);
        }

        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 3;
        setPosPlayer(p, newPosX, newPosY);
        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 1;
    }
}
void rightPlayer(Grille *grille, Player *p){
    if (getPosXPlayer(p) != grille->colonnes-1){
        int newPosX=(getPosXPlayer(p));
        int newPosY=(getPosYPlayer(p) + 1);

        if ((grille->cellules[newPosX][newPosY])==4 || newPosY >= grille -> colonnes ){ /// 1/2/3/4 Player/Zombie/Personne/Mur
            newPosY--;
        } else if ((grille->cellules[newPosX][newPosY])==2){
            GameOver(grille);
        }

        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 3;
        setPosPlayer(p, newPosX, newPosY);
        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 1;
    }
}
void leftPlayer(Grille *grille, Player *p){
    if (getPosXPlayer(p) != 0){
        int newPosX=(getPosXPlayer(p));
        int newPosY=(getPosYPlayer(p) - 1);

        if ((grille->cellules[newPosX][newPosY])==4 || newPosY < 0){ /// 1/2/3/4 Player/Zombie/Personne/Mur
            newPosY++;
        } else if ((grille->cellules[newPosX][newPosY])==2){
            GameOver(grille);
        }

        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 3;
        setPosPlayer(p, newPosX, newPosY);
        grille -> cellules[getPosXPlayer(p)][getPosYPlayer(p)] = 1;
    }
}

//Enzo
int validTurn() {
    int input;

    printf("Voulez vous continuer : \n");
    input = getch();

    switch (input) {
        case 13: //ENTRER
            return 1;
        case 79: //FIN
            return 0;
    }

    return 0;
}

void GameOver(Grille *grille) {
    printf("Les zombies gagnent ! \n");
    sleep(10);

    for (int i = 0; i < grille->lignes; i++) {
    free(grille->cellules[i]);
    }
    free(grille->cellules);
    free(grille);

    exit(EXIT_FAILURE);
}

void FatalError(char message) {
        perror(message);
        exit(EXIT_FAILURE);
}

int addTxtEndChar(char *str) {
    str = (char *)malloc(strlen(str) + 5);
    strcat(str, ".txt");
    free(str);
    return 0;
}

void EcritureDansFichier(const Grille *maGrille, const char *fileName) {
    FILE *file = fopen(fileName, "w");

    if (file == NULL) {
        perror("Erreur lors de l'ouverture du fichier");
        return;
    }

    for (int i = 0; i < maGrille->lignes; i++) {
        for (int j = 0; j < maGrille->colonnes; j++) {
            fprintf(file, "%d", maGrille->cellules[i][j]);

            if (j < maGrille->colonnes - 1) {
                fprintf(file, " ");
            }
        }
        fprintf(file, "\n");
    }

    fclose(file);
}

void resetPlayerAndZombies(Grille *maGrille, Player *p, Zombie *zombies, int nbZombies) {
    // reset zombies and player x and y for reload
    setRandomPosPlayer(p, maGrille);
    for (int i = 0; i < nbZombies; i++) {
        setRandomPosZombie(&zombies[i], maGrille);
    }
}

int chargerGrille(const char *fileName, Player *p, Zombie *zombies, int nbZombies,Grille *maGrille) {
    int idZombie=0;
    int isLoad = 0; // Game not load

    creerGrilleDefault(fileName,maGrille);

    FILE *file = fopen(fileName, "r");

    if (file == NULL) {
        printf("Erreur lors de l'ouverture du fichier.\n");
        return -1; // Indique une erreur
    }


    int valeur;
    int ligne = 0, colonne = 0;

    while (fscanf(file, "%d", &valeur) != EOF && ligne < maGrille->lignes) {
        // Mettre à jour la grille avec les nouvelles valeurs
        maGrille->cellules[ligne][colonne] = valeur;

        // Mettre à jour les positions des joueurs et zombies
        if (valeur == 1) {
            setPosPlayer(p, ligne, colonne);

        } else if (valeur == 2) {
            setPosZombie(&zombies[idZombie], ligne, colonne);
            (idZombie)++;

        }

        // Incrémenter les indices de la grille
        colonne++;
        if (colonne == maGrille->colonnes) {
            ligne++;
            colonne = 0;
        }
    }

    fclose(file);

    return 0; // Indique le succès
}
