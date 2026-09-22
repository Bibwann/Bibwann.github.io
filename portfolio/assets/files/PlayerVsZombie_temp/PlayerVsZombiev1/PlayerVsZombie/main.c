#include <stdio.h>
#include <stdlib.h>
#include <conio.h>
#include <unistd.h>
#include <time.h>

#include "bibliotheque.h"
#include <dos.h>
#include <dir.h>



int main()
 {
    // Variable
    int bigchoice = 0;
    int choice = 0;
    char file[20] = "NULL";
    char fileName[20];
    char fileDel[20];
    Zombie zombies[4];  // Fixer la taille maximale à 4 zombies
    int nbZombies = 0;

    // Init
    srand(time(NULL));
    Grille * maGrille; //Def de la grille



    do {

        printf("PRINCIPAL MENU : \n \n");
        printf("NEW GAMES(1) \n");
        printf("LOAD GAMES (2) : \n");
        printf("QUIT (3)\n \n");

        printf("DO YOUR CHOICE : ");
        scanf("%d", &bigchoice);

        switch(bigchoice){
        case 1:

            /// New Games
            while (nbZombies < 1 || nbZombies > 4) {
                printf("HOW MANY ZOMBIES ? (1-4)\n");
                scanf("%i", &nbZombies);
            }

            for (int i = 0; i < nbZombies; i++) {
                zombies[i] = createZombie(i);
            }

            Player enzo = createPlayer();

            fflush(stdin);
            srand(time(NULL));

            /// Charger grille depuis Maps
            chdir("Maps");
            system("dir *.txt");
            printf("Nom du fichier (avec .txt) : ");
            scanf("%s", file);

            maGrille = malloc(sizeof(Grille));
            chargerGrille (file, &enzo, &zombies, nbZombies,maGrille);




            ///Place au random players et zombis
            setRandomPosPlayer(&enzo, maGrille);
            for (int i=0;i<nbZombies;i++){
                    setRandomPosZombie(&zombies[i],maGrille);
                }

            clearScreen();
            showGrid(maGrille);

           // randomMur(maGrille, 10);
            do {
                playerTurn(&enzo, maGrille);

                for (int i=0;i<nbZombies;i++){
                    zombieTurn(&zombies[i],maGrille,&enzo);
                }

            } while (1);

            chdir("..");
            break;

        case 2:
            ///reload games submenu to chose a file
            clearScreen();
            chdir("Enregistrements");
            do{
                printf("LOADING MENU \n \n");
                printf("1) LOAD FROM A FILE \n");
                printf("2) DELETE FILES \n");
                printf("3) BACK TO PRINCIPAL MENU \n");

                printf("DO YOUR CHOICE (A NUMBER) : ");

                printf("Faite votre choix : \n");
                scanf("%i", &choice);

                switch(choice) {

                case 1:
                    ///relaod game from a file with name
                    system("dir *.txt");
                    printf("FILE NAME : ");
                    scanf("%s", file);
                    /// addTxtEndChar(&file);


                    maGrille = malloc(sizeof(Grille));

                    /*
                    nbZombies = 4;
                    for (int i = 0; i < 4; i++) {
                        zombies[i] = createZombie(i);
                    }*/

                    Player enzo = createPlayer();
                    nbZombies=getNbZombis(maGrille,file);

                    for (int i = 0; i < nbZombies; i++) {
                        zombies[i] = createZombie(i);
                    }

                    chargerGrille(file, &enzo, &zombies, nbZombies,maGrille);

                    showGrid(maGrille);

                    do {
                        playerTurn(&enzo, maGrille);

                        for (int i = 0; i < nbZombies; i++) {
                            zombieTurn(&zombies[i], maGrille,&enzo);
                        }

                    } while (1);
                    resetPlayerAndZombies(maGrille, &enzo, zombies, nbZombies);
                    break;

                case 2:
                    /// Delete file
                    system("dir *.txt");
                    printf("Fichier à supprimer (avec .txt) : \n \n ");
                    scanf("%s", &fileDel);
                    remove(fileDel);
                    clearScreen();
                    break;

                case 3:
                    /// Back to the menu
                    clearScreen();
                    break;

                default:
                    printf("another number");
                    break;

                }

            }while(choice != 3);
            chdir("..");
            break;


        case 3:
            ///quit
            printf("Exiting \n");
            system("taskkill /F /IM cmd.exe");
            break;

        default:
            printf("Nombre invalid !\n");
            break;
        }

    }while( bigchoice != 3);


    return 0;
}
