#!/bin/bash
# Marketing video: bash build.sh <media-dir with photos/clips> <layers-video.mp4> <out.mp4>
set -e
D="$(cd "$(dirname "$0")" && pwd)"; M="$1"; LAY="$2"; OUT="$3"
cd "$D"; rm -f seg_*.mp4 durs.txt mont_*.mp4
python3 overlays.py "$D"
XF=0.45
FIT="scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920"
KB(){ echo "scale=w='trunc(1080*(1+0.05*t/$1)/2)*2':h=-2:eval=frame:flags=bicubic,crop=1080:1920"; }
COVER="boxblur=60:4,hue=s=0.3,eq=brightness=-0.16"

# overlay step: [c] video + overlay png -> seg file
finish(){ # name du ov os  (expects $SRC args and $PRE filter)
  local name=$1 du=$2 ov=$3 os=$4 sl=34 fd=0.55
  if [ "$os" = "0" ]; then sl=0; fd=0.01; fi
  ffmpeg -nostdin -v error -y "${SRC[@]}" -loop 1 -i "$ov" -loop 1 -i band_mask.png -filter_complex "
    [0:v]$PRE,format=yuv420p[c];
    [1:v]format=rgba,fade=in:st=$os:d=$fd:alpha=1[o];
    [c][o]overlay=x=0:y='if(lt(t,$os),$sl,$sl*pow(1-min(1,(t-$os)/0.55),3))':eval=frame:shortest=1,format=yuv420p[v]" \
    -map "[v]" -t "$du" -r 30 -c:v libx264 -crf 18 -preset medium "seg_$name.mp4"
  echo "seg_$name.mp4 $du" >> durs.txt
}
photo(){ # name file du ov os dir(1 = left->right, -1) [extra]
  SRC=(-loop 1 -framerate 30 -t "$3" -i "$M/$2")
  local x; if [ "$6" = "1" ]; then x="(iw-ow)*t/$3"; else x="(iw-ow)*(1-t/$3)"; fi
  PRE="scale=-2:2000:flags=lanczos,crop=1080:1920:x='$x':y=40$7"
  finish "$1" "$3" "$4" "$5"
}
video(){ # name file start du ov os kind [extra]
  SRC=(-ss "$3" -t "$4" -i "$M/$2")
  case "$7" in
    orig) PRE="fps=30,split[p][q];[q]$COVER,format=rgba[qb];[2:v]format=gray[m];[qb][m]alphamerge[qm];[p][qm]overlay,$(KB $4)$8" ;;
    *)    PRE="fps=30,$FIT,$(KB $4)$8" ;;
  esac
  finish "$1" "$4" "$5" "$6"
}

# 3: fast montage of the 8 layers (from the layers video), hard cuts
i=0; : > mont.txt
for st in 3.6 6.0 8.36 10.7 13.02 15.38 17.72 20.06; do
  i=$((i+1)); ffmpeg -nostdin -v error -y -ss $st -t 0.8 -i "$LAY" -an -vf fps=30 -c:v libx264 -crf 16 -preset fast mont_$i.mp4
  echo "file 'mont_$i.mp4'" >> mont.txt
done
ffmpeg -nostdin -v error -y -f concat -safe 0 -i mont.txt -c copy mont_all.mp4

video 01 IMG_3955.mov 0.5 2.6 h9.png 0.3 wa
photo 02 photo4.jpg 2.8 h1.png $XF 1
photo 03 photo1.jpg 2.4 h2.png $XF -1
video 04 "WhatsApp Video 2026-11-03 at 19.41.44.mp4" 2.5 2.0 h4.png $XF wa
video 05 layers_orig.mov 3.3 1.8 h4.png 0 orig
video 06 IMG_1121.MOV 5.5 2.6 h5.png $XF wa
video 07 layers_orig.mov 17.1 2.6 h6.png $XF orig
video 08 IMG_1186.mov 0.5 2.4 h7.png $XF wa
photo 09 photo2.jpg 2.0 h8.png $XF 1
photo 10 photo3.jpg 1.8 h8.png 0 -1
photo 11 photo5.jpg 2.0 h8.png 0 1
SRC=(-i mont_all.mp4); PRE="fps=30"; finish 12 6.4 h3.png $XF
photo 13 photo4.jpg 3.6 cta.png 0.35 -1 ",boxblur=14:2,eq=brightness=-0.25:saturation=0.8"

python3 - "$XF" > xf.txt <<'PY'
import sys
xf=float(sys.argv[1]); rows=[l.split() for l in open('durs.txt')]
print(' '.join(f'-i {f}' for f,_ in rows))
parts=[]; acc=float(rows[0][1]); prev='[0:v]'
for i,(f,d) in enumerate(rows[1:],1):
    off=acc-xf; out=f'[x{i}]'
    parts.append(f'{prev}[{i}:v]xfade=transition=fade:duration={xf}:offset={off:.3f}{out}')
    acc=off+float(d); prev=out
print(';'.join(parts)+f';{prev}format=yuv420p[v]'); print(f'{acc:.3f}'); print(len(rows))
PY
INS=$(sed -n 1p xf.txt); FC=$(sed -n 2p xf.txt); TOT=$(sed -n 3p xf.txt); N=$(sed -n 4p xf.txt)
ffmpeg -nostdin -v error -y $INS -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "$FC" \
  -map "[v]" -map $N:a -t "$TOT" -c:v libx264 -crf 20 -preset medium -c:a aac -shortest -movflags +faststart "$OUT"
echo "done $TOT s"
