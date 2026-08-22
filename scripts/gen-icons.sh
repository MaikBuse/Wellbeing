#!/usr/bin/env bash
#
# Derives every app icon from assets/logo-master.png.
#
# The master is a 1254px PNG without alpha: the mark sits on an off-white
# ground with barely visible rounded corners. Step 1 floods that ground away
# from the four corners — NOT `-transparent`, because the bowl is filled from
# the inside and a global colour-to-alpha swap would punch that fill out too.
#
# Run from the repo root after replacing the master. Needs ImageMagick 7.
set -euo pipefail

cd "$(dirname "$0")/.."

MASTER=assets/logo-master.png
GROUND='#fcf8f9'   # --color-bg, same as manifest background_color
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

magick "$MASTER" \
  -alpha set -fuzz 12% -fill none \
  -draw 'color 0,0 floodfill' \
  -draw 'color 1253,0 floodfill' \
  -draw 'color 0,1253 floodfill' \
  -draw 'color 1253,1253 floodfill' \
  -trim +repage \
  "$WORK/mark.png"

# tile() SIZE MARK_SIZE OUT — mark centred on an opaque ground.
#
# `-alpha remove` is not optional. The bowl is transparent on the inside as
# well as the outside, and -extent only fills the outside. Leaving the alpha
# channel in place makes Android render black inside the bowl.
tile() {
  magick "$WORK/mark.png" -resize "${2}x${2}" \
    -background "$GROUND" -gravity center -extent "${1}x${1}" \
    -alpha remove -alpha off \
    -strip "$3"
}

# Browser tabs. The 192px icon scaled down loses the leaf, so this gets a
# tighter margin than the rest.
tile 32 28 public/icons/icon-32.png

tile 192 146 public/icons/icon-192.png
tile 512 389 public/icons/icon-512.png

# Android crops maskable icons to the inner 80% and then masks to a circle,
# squircle or rounded square depending on the launcher. The binding constraint
# is that circle: every opaque pixel must sit within radius 204.8 of the
# centre. The leaf tip is the outermost point of the mark, and it is what sets
# this number — measured, not guessed. 307px puts the tip at radius 212.9 and
# a circle launcher clips it; 285px puts it at 198.0.
tile 512 285 public/icons/icon-512-maskable.png

# iOS applies its own mask, so no rounding here — a supplied radius would show
# up as a double seam along the corners.
tile 180 144 public/apple-touch-icon.png

# For the UI. Keeps its alpha so it sits correctly on both --color-bg and
# --color-card.
magick "$WORK/mark.png" -resize 256x256 \
  -background none -gravity center -extent 256x256 \
  -strip public/icons/logo-256.png

magick identify public/icons/*.png public/apple-touch-icon.png
