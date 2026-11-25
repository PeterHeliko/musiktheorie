#!/bin/sh
# App-Symbole für Startbildschirm und Installation (public/icons/), aus
# demselben Zeichen wie das Favicon in index.html.
#
# Die PNG-Dateien liegen im Repository; neu erzeugen nur, wenn sich das
# Zeichen ändert. Braucht rsvg-convert (librsvg).
#
# Aufruf: sh scripts/make-icons.sh

set -eu
cd "$(dirname "$0")/../public/icons"

BLUE='#1d6fa5'
NOTE='M13 7v13.2A4 4 0 1 0 15 24V12h7V7z'

# Wie das Favicon: abgerundetes Quadrat mit durchsichtigen Ecken.
round="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='$BLUE'/><path d='$NOTE' fill='#fff'/></svg>"

# Randlos, das Zeichen in der Mitte: Android (Kreis, Tropfen …) und iOS
# (abgerundetes Quadrat) schneiden selbst zu. Bei Android muss alles Wichtige
# im Kreis mit 80 % Durchmesser liegen, darum dort kleiner.
full() {
  printf '%s' "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='$BLUE'/><path d='$NOTE' fill='#fff' transform='translate(16 16) scale($1) translate(-14.5 -17.35)'/></svg>"
}

printf '%s' "$round" | rsvg-convert -w 192 -h 192 -o icon-192.png
printf '%s' "$round" | rsvg-convert -w 512 -h 512 -o icon-512.png
full 0.8 | rsvg-convert -w 512 -h 512 -o icon-maskable-512.png
full 0.95 | rsvg-convert -w 180 -h 180 -o apple-touch-icon.png
