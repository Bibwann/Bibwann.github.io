# Sources: http://fsincere.free.fr/isn/python/cours_python_tkinter.php  et  http://tkinter.fdex.eu/doc/caw.html  et  http://s15847115.domainepardefaut.fr/python/tkinter/widget_canvas.html  et  http://tableauxmaths.fr/spip/spip.php?article48#Gerer-les-collisions


from tkinter import*
from math import*
SJ1=0
SJ2=0


Pong=Tk()

Pong.geometry('712x512')
Pong.title("Pong x64")

#Score

Score1=IntVar()
Score2=IntVar()
BS1=Label(Pong,textvariable=Score1,font="arial",fg="red",bg="cyan2",border=5)
BS1.pack(side=LEFT,padx=5,pady=5)
BS2=Label(Pong,textvariable=Score2,font="arial",fg="red",bg="cyan2",border=4)
BS2.pack(side=RIGHT,padx=5,pady=5)


#Variables

bouleX=306
bouleY=256

raquette1Y=140
raquette2Y=140


a1=140
a2=140

float=plusX=4
float=plusY=6

deco1X=305
deco2X=307

# Tout les canvas

canvas=Canvas(Pong,width = 612, height = 512 , bd=0, bg="black")
canvas.pack(padx=5,pady=5)
boule=canvas.create_oval(bouleX,bouleY,bouleX+5,bouleY+5,fill="cyan2" )
raquette1=canvas.create_rectangle(12,raquette1Y,16,raquette1Y+80,fill='white')
raquette2=canvas.create_rectangle(600,raquette2Y,604,raquette2Y+80,fill='white')

decor1=canvas.create_rectangle(deco1X,0,deco2X,65,fill='white')
decor2=canvas.create_rectangle(deco1X,85,deco2X,150,fill='white')
decor3=canvas.create_rectangle(deco1X,170,deco2X,235,fill='white')
decor4=canvas.create_rectangle(deco1X,255,deco2X,320,fill='white')
decor5=canvas.create_rectangle(deco1X,340,deco2X,405,fill='white')
decor6=canvas.create_rectangle(deco1X,426,deco2X,512,fill='white')

# Les touches pour les deux joueurs et les raquettes !!!

def ControlesJ1etJ2(event):
    global a1,a2, raquett1,raquette2

    Key=event.keysym

#J1
    if Key =="s" and a1+25<=446:
            canvas.move(raquette1,0,25)
            a1=a1+25

    elif Key =="z" and a1-25>=-25:

            canvas.move(raquette1,0,-25)
            a1=a1-25

#J2
    elif Key =="Down" and a2+25<=446:
            canvas.move(raquette2,0,25)
            a2=a2+25

    elif Key =="Up" and a2-25>=-25:
            canvas.move(raquette2,0,-25)
            a2=a2-25


canvas.focus_set()
canvas.bind('<Key>',ControlesJ1etJ2)

#La bouboule qui avance

def bouboule():
    global bouleX,bouleY,plusX,plusY,raquette1,raquette1Y,raquette2,raquette2Y,boule,a1,a2,SJ1,SJ2

    bouleX+=plusX
    bouleY+=plusY

    canvas.coords(boule,bouleX,bouleY,bouleX+5,bouleY+5)
    canvas.after(50,bouboule)


    # Les colisions de la bouboule sur les mure en haut et en bas !

    if bouleY<10:
        plusY=plusY*(-1)

    elif bouleY>486:
        plusY=plusY*(-1)

    # Les points si la bouboule touche le fond !

    if bouleX<1:
        SJ2=SJ2+1
        plusX=plusX*(-1)
        bouleX=306
        bouleY=256
        Score2.set("J2:"+str(SJ2))
        plusY=3
        plusX=2

    elif bouleX>612:
        SJ1=SJ1+1
        plusX=plusX*(-1)
        bouleX=306
        bouleY=256
        Score1.set("J1:"+str(SJ1))
        plusY=3
        plusX=2

    # Les collisions si la bouboule touche la raquette !

    if bouleX<18 and a1<bouleY<a1+80:
        plusX=plusX*(-1)
        plusY=plusY*1.259
        plusX=plusX*1.259



    elif bouleX>592 and a2<bouleY<a2+80:
        plusX=plusX*(-1)
        plusY=plusY*1.259
        plusX=plusX*1.259




bouboule()
Pong.mainloop()


