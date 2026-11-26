"""Overlay real b-roll clips (assets/broll/*.mp4) onto build/video_silent_nobroll.mp4 -> build/video_silent.mp4 (idempotent). Clips sit in the window area with fade in/out, a frame and a source label."""
import json, subprocess, sys
P = 'projects/ideatoapps-freeclaude'; SRC = f'{P}/build/video_silent_nobroll.mp4'; OUT = f'{P}/build/video_silent.mp4'
BR = 'broll'
lt = json.load(open(f'{P}/timeline/shot_times.json'))
W, H = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', SRC], text=True).strip().split('x')); f = W / 1920
if W >= 2000: BR = 'broll_hi'
S = lambda k: lt[k]['start']; E = lambda k: lt[k]['end']
items = [  # clip, start (global s), duration, clip start offset, label
 ('b1_openrouter_free', S('s03_2') + 0.1, min(E('s03_2') - S('s03_2') - 0.3, 5.2), 2.6, 'openrouter.ai/models · free filter · real recording'),
 ('b2_freellm_providers', S('s05_3') + 0.1, (E('s05_3') - S('s05_3')) * 0.42 - 0.2, 3.2, 'github.com/tashfeenahmed/freellmapi · providers · real recording'),
 ('b3_dash_models', S('s05_8') + 0.05, 3.2, 1.2, 'router dashboard · my local install · real recording'),
 ('b4_dash_keys', E('s10_2') - 3.2, 3.0, 1.5, 'router dashboard · Keys · keyless providers off · real recording'),
]
ins = ['-i', SRC]; fl = []; last = '[0:v]'
cw, ch = round(1216 * f), round(634 * f); x, y = round(352 * f), round(150 * f); fs = round(26 * f)
for i, (c, t0, d, ss, label) in enumerate(items, 1):
    ins += ['-ss', f'{ss}', '-t', f'{d:.2f}', '-i', f'{P}/assets/{BR}/{c}.mp4']
    fl.append(f"[{i}:v]scale={cw}:{ch},setsar=1,drawbox=x=0:y=0:w=iw:h=ih:color=0x7357f5:t={max(3,round(6*f))},format=yuva420p,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st={d-0.3:.2f}:d=0.3:alpha=1,setpts=PTS-STARTPTS+{t0:.2f}/TB[c{i}]")
    fl.append(f"{last}drawbox=x=0:y=0:w=iw:h={round(840 * f)}:color=black@0.62:t=fill:enable='between(t,{t0:.2f},{t0 + d:.2f})'[k{i}]"); last = f'[k{i}]'
    fl.append(f"{last}[c{i}]overlay={x}:{y}:eof_action=pass:enable='between(t,{t0:.2f},{t0+d:.2f})'[v{i}]"); last = f'[v{i}]'
    fl.append(f"{last}drawtext=fontfile=/root/.fonts/Kalam-Regular.ttf:text='{label}':x={x + round(18 * f)}:y={y + ch - round(52 * f)}:fontsize={fs}:fontcolor=white:box=1:boxcolor=0x0b1230@0.8:boxborderw={round(10 * f)}:enable='between(t,{t0 + 0.35:.2f},{t0 + d - 0.35:.2f})'[w{i}]"); last = f'[w{i}]'
cmd = ['ffmpeg', '-y', '-v', 'error'] + ins + ['-filter_complex', ';'.join(fl), '-map', last, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'veryfast', '-r', '24', '-an', OUT + '.tmp.mp4']
subprocess.check_call(cmd); import os; os.replace(OUT + '.tmp.mp4', OUT)
print('composed', len(items), 'b-roll clips at', [(c, round(t0, 1), round(d, 1)) for c, t0, d, *_ in items])
