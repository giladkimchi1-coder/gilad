#!/bin/bash
# Weekly progress reel: bash build.sh <media-dir> <fonts-dir> <out.mp4>
set -e
D="$(cd "$(dirname "$0")" && pwd)"; M="$1"; FONTS="$2"; OUT="$3"
cd "$D"; rm -f seg_*.mp4 durs.txt
XF=0.45

# file | start | dur | title   (order = construction order)
SEGS="WhatsApp Video 2026-11-03 at 19.41.44.mp4|2.5|5.5|רשת ברזל ותבניות
WhatsApp Video 2026-11-03 at 19.44.38.mp4|0.8|5.0|קשירת רשת ברזל
IMG_1121.MOV|5.5|6.5|קירות פנים: פלדה ועץ
WhatsApp Video 2026-11-03 at 19.41.31.mp4|0.5|5.0|הכנת קורות עץ
WhatsApp Video 2026-11-03 at 19.41.31.mp4|8.0|4.0|הכנת קורות עץ
WhatsApp Video 2026-11-03 at 19.41.15.mp4|8.5|6.0|שיוף גבס"

TITLES=$(echo "$SEGS" | cut -d'|' -f4 | awk '!s[$0]++' | paste -sd'|')
python3 overlays.py "$D" "$FONTS" "$TITLES" "3 ו-4 בנובמבר 2026"

FIT="scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920"
# slow push-in for life
KB(){ echo "scale=w='trunc(1080*(1+0.05*t/$1)/2)*2':h=-2:eval=frame:flags=bicubic,crop=1080:1920"; }

render(){ # name file start dur overlay ovstart [bgblur]
  local name="$1" f="$2" st="$3" du="$4" ov="$5" os="$6" extra="$7" sl=30 fd=0.5
  if [ "$os" = "0" ]; then sl=0; fd=0.01; fi
  ffmpeg -nostdin -v error -y -ss "$st" -t "$du" -i "$M/$f" -loop 1 -i "$ov" -filter_complex "
    [0:v]fps=30,$FIT,$(KB $du)${extra},format=yuv420p[c];
    [1:v]format=rgba,fade=in:st=$os:d=$fd:alpha=1[o];
    [c][o]overlay=x=0:y='if(lt(t,$os),$sl,$sl*pow(1-min(1,(t-$os)/0.5),3))':eval=frame:shortest=1,format=yuv420p[v]" \
    -map "[v]" -t "$du" -r 30 -c:v libx264 -crf 18 -preset medium "seg_$name.mp4"
  echo "seg_$name.mp4 $du" >> durs.txt
}

first=$(echo "$SEGS" | head -1); last=$(echo "$SEGS" | tail -1)
render 00intro "$(echo "$first" | cut -d'|' -f1)" 0.3 3.2 intro.png 0.25 ",boxblur=18:2,eq=brightness=-0.22:saturation=0.7"

i=0; prev=""
while IFS='|' read -r f st du title; do
  idx=$(echo "$TITLES" | tr '|' '\n' | grep -nxF "$title" | cut -d: -f1); idx=$((idx-1))
  os=$XF; [ "$title" = "$prev" ] && os=0   # same step continues: label stays
  i=$((i+1)); render "$(printf %02d $i)" "$f" "$st" "$du" "st$idx.png" "$os"
  prev="$title"
done <<< "$SEGS"

lf=$(echo "$last" | cut -d'|' -f1); lst=$(echo "$last" | cut -d'|' -f2); ldu=$(echo "$last" | cut -d'|' -f3)
ost=$(python3 -c "print($lst+$ldu-0.2)")
render 99outro "$lf" "$ost" 3.0 outro.png 0.35 ",boxblur=18:2,eq=brightness=-0.25:saturation=0.7"

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
  -map "[v]" -map $N:a -t "$TOT" -c:v libx264 -crf 19 -preset medium -c:a aac -shortest -movflags +faststart "$OUT"
echo "done $TOT s"
