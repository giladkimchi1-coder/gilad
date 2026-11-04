#!/bin/bash
# Site-progress reel: bash build.sh <media-dir> <fonts-dir> <out.mp4>
# Each row: file | start | dur | title | kind
#   kind: wa   = phone clip (scaled to 1080x1920, our logo on top)
#         orig = clip from the branded layers video (old labels covered, its logo kept)
#         ext  = exterior shot from the layers video, zoomed into the wall (our logo)
set -e
D="$(cd "$(dirname "$0")" && pwd)"; M="$1"; FONTS="$2"; OUT="$3"
cd "$D"; rm -f seg_*.mp4 durs.txt st*.png
XF=0.45
L=layers_orig.mov
WA1="WhatsApp Video 2026-11-03 at 19.41.15.mp4"   # gypsum sanding
WA2="WhatsApp Video 2026-11-03 at 19.41.31.mp4"   # wooden beams
WA3="WhatsApp Video 2026-11-03 at 19.41.44.mp4"   # mesh + formwork
WA4="WhatsApp Video 2026-11-03 at 19.44.38.mp4"   # tying mesh
SEGS="$WA3|2.5|5.0|רשת ברזל ותבניות|wa
$WA4|0.8|4.5|קשירת רשת ברזל|wa
$L|3.04|2.76|ריסוס בטון|orig
$L|5.86|2.74|ריסוס בטון|orig
$L|8.66|2.74|שלד פלדה|orig
IMG_1121.MOV|5.5|6.0|קירות פנים: פלדה ועץ|wa
$L|11.46|2.74|שכבת עץ|orig
$WA2|0.5|4.5|הכנת קורות עץ|wa
$WA2|8.0|3.5|הכנת קורות עץ|wa
$L|14.26|2.74|לוח גבס|orig
$WA1|8.5|5.5|שיוף גבס|wa
$L|17.06|3.40|הבית מבפנים|orig
$L|0.40|3.50|הבית מבחוץ|ext"

TITLES=$(echo "$SEGS" | cut -d'|' -f4 | awk '!s[$0]++' | paste -sd'|')
python3 overlays.py "$D" "$FONTS" "$TITLES"

FIT="scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920"
KB(){ echo "scale=w='trunc(1080*(1+0.05*t/$1)/2)*2':h=-2:eval=frame:flags=bicubic,crop=1080:1920"; }
COVER="boxblur=60:4,hue=s=0.3,eq=brightness=-0.16"

render(){ # name file start dur overlay ovstart kind [extra]
  local name="$1" f="$2" st="$3" du="$4" ov="$5" os="$6" kind="$7" extra="$8" sl=30 fd=0.5 pre
  if [ "$os" = "0" ]; then sl=0; fd=0.01; fi
  case "$kind" in
    orig) pre="fps=30,split[p][q];[q]$COVER,format=rgba[qb];[2:v]format=gray[m];[qb][m]alphamerge[qm];[p][qm]overlay,$(KB $du)" ;;
    ext)  pre="setpts=1.4*PTS,fps=30,crop=630:1120:225:800,$FIT,$(KB $du)" ;;
    *)    pre="fps=30,$FIT,$(KB $du)" ;;
  esac
  local indu="$du"; [ "$kind" = "ext" ] && indu=$(python3 -c "print($du/1.4+0.05)")
  ffmpeg -nostdin -v error -y -ss "$st" -t "$indu" -i "$M/$f" -loop 1 -i "$ov" -loop 1 -i band_mask.png -filter_complex "
    [0:v]$pre${extra},format=yuv420p[c];
    [1:v]format=rgba,fade=in:st=$os:d=$fd:alpha=1[o];
    [c][o]overlay=x=0:y='if(lt(t,$os),$sl,$sl*pow(1-min(1,(t-$os)/0.5),3))':eval=frame:shortest=1,format=yuv420p[v]" \
    -map "[v]" -t "$du" -r 30 -c:v libx264 -crf 18 -preset medium "seg_$name.mp4"
  echo "seg_$name.mp4 $du" >> durs.txt
}

BLUR=",boxblur=18:2,eq=brightness=-0.22:saturation=0.7"
render 00intro "$WA3" 0.3 3.2 intro.png 0.25 wa "$BLUR"

i=0; prev=""
while IFS='|' read -r f st du title kind; do
  idx=$(echo "$TITLES" | tr '|' '\n' | grep -nxF "$title" | cut -d: -f1); idx=$((idx-1))
  os=$XF; [ "$title" = "$prev" ] && os=0
  ov="st$idx.png"; [ "$kind" = "orig" ] && ov="st${idx}_nl.png"
  i=$((i+1)); render "$(printf %02d $i)" "$f" "$st" "$du" "$ov" "$os" "$kind"
  prev="$title"
done <<< "$SEGS"

render 99outro "$L" 18.2 3.0 outro.png 0.35 orig "$BLUR"

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
