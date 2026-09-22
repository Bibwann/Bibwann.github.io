#ifndef BIBLIOTHEQUES_H

#define MAGRILLE

#define BIBLIOTHEQUES_H

/// 1/2/3/4 Player/Zombie/Vide/Mur -> Cellule
//Enzo
typedef struct {
    int lignes;
    int colonnes;
    int **cellules;
} Grille;

typedef struct {
    int x; //Ligne
    int y; //Colonne
} Player;

typedef struct {
    int idZombie;
    int x; // Ligne
    int y; // Colonne
} Zombie;

Grille creerGrilleDefault(char * fileName, Grille *grille);
void getTabSize(Grille *grille, char * fileName);
Player createPlayer();
Zombie createZombie(int id);
void setPosPlayer(Player *p, int x, int y);
void setPosZombie(Zombie *z, int x, int y);
void showGridList(const Grille *grille);
void showGrid(const Grille *grille);
void showPlayer(Player *p);
void showZombie(Zombie *z);
void setRandomPosPlayer(Player *p, Grille *maGrille);
void setRandomPosZombie(Zombie *z, Grille *maGrille);
void randomMur (Grille *grille, int nbMur);
int randomNumber(int min, int max);
void playerTurn(Player *p, Grille *grille);
void zombieTurn(Zombie *z, Grille *grille,Player *p);
int validTurn();
void GameOver();
void clearScreen();
int getPosXPlayer(Player *p);
int getPosYPlayer(Player *p);
int getPosXZombies(Zombie *z);
int getPosYZombies(Zombie *z);
void AlgoMobUneCaseMouvement(Zombie *z, Player *p, Grille *grille);
int isNew(Grille *grille);
void AddZombisMapChargement(Grille *grille,Zombie *zombies);

int addTxtEndChar(char *str);
void randomMoovZombie(Zombie *z, Grille *grille);

void upPlayer(Grille *grille,Player *p);
void downPlayer(Grille *grille, Player *p);
void rightPlayer(Grille *grille, Player *p);
void leftPlayer(Grille *grille, Player *p);
void upZombie(Grille *Grille, Zombie *z);
void downZombie(Grille *Grille, Zombie *z);
void rightZombie(Grille *Grille, Zombie *z);
void leftZombie(Grille *Grille, Zombie *z);

int getNbZombis(Grille *grille, char * fileName);
void EcritureDansFichier(const Grille *maGrille, const char *nomFichier);
int chargerGrille(const char *nomFichier, Player *p, Zombie *zombies, int nbZombies,Grille *maGrille);
void resetPlayerAndZombies(Grille *maGrille, Player *p, Zombie *zombies, int nbZombies);



#endif //BIBLIOTHEQUES_H
