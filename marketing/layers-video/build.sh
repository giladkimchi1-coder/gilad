#!/bin/bash
set -e
D="$(cd "$(dirname "$0")" && pwd)"
V="$1"; OUT="$2"
cd "$D"
# usage: bash build.sh <source.mov> <out.mp4>
for w in 700:NGSpv5_NC0k9P_v6ZUCbLRAHxK1Ebiuccg 800:NGSpv5_NC0k9P_v6ZUCbLRAHxK1ECSuccg; do
  [ -f "heebo${w%%:*}.ttf" ] || curl -sS -o "heebo${w%%:*}.ttf" "https://fonts.gstatic.com/s/heebo/v28/${w#*:}.ttf"
done
python3 make_overlays.py "$D"
rm -f seg_*.mp4 list.txt

# name start dur slow zoom ov
SEGS="
intro 0.00 3.00 1 0 intro
s1 0.50 2.50 1.12 1 ov0
s2 3.04 2.76 1 0 ov1
s3 5.86 2.74 1 0 ov2
s4 8.66 1.36 2 0 ov3
s5 10.02 1.38 2 0 ov4
s6 11.46 2.74 1 0 ov5
s7 14.26 2.74 1 0 ov6
s8 17.06 1.74 1.6 0 ov7
s9 18.80 1.72 1.6 0 ov8
"
while read -r name st du slow zoom ov; do
  [ -z "$name" ] && continue
  outdur=$(python3 -c "print(round($du*$slow,3))")
  pre="setpts=(PTS-STARTPTS)*$slow"
  if [ "$slow" != "1" ]; then pre="$pre,minterpolate=fps=30:mi_mode=blend"; else pre="$pre,fps=30"; fi
  if [ "$zoom" = "1" ]; then pre="$pre,crop=630:1120:225:800,scale=1080:1920:flags=lanczos"; fi
  if [ "$ov" = "intro" ]; then
    mask=intro_mask.png; ovp=intro_ov.png; blur="crop=1080:1830:0:0,pad=1080:1920:0:90,boxblur=3:1"
  else
    mask=band_mask.png; ovp=$ov.png; blur="boxblur=60:4,hue=s=0.3,eq=brightness=-0.16"
  fi
  ffmpeg -nostdin -v error -y -ss "$st" -t "$du" -i "$V" -loop 1 -i "$mask" -loop 1 -i "$ovp" -filter_complex "
    [0:v]$pre,format=yuv420p,split[a][b];
    [b]$blur,format=rgba[bb];
    [1:v]format=gray,scale=1080:1920[m];
    [bb][m]alphamerge[bm];
    [a][bm]overlay=shortest=1[c];
    [2:v]format=rgba,fade=in:st=0.08:d=0.3:alpha=1[o];
    [c][o]overlay=shortest=1,format=yuv420p[v]" \
    -map "[v]" -t "$outdur" -r 30 -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p "seg_$name.mp4"
  echo "file 'seg_$name.mp4'" >> list.txt
  echo "$name -> $outdur s"
done <<< "$SEGS"

ffmpeg -v error -y -f concat -safe 0 -i list.txt -f lavfi -i anullsrc=r=44100:cl=stereo \
  -map 0:v -map 1:a -c:v copy -c:a aac -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
