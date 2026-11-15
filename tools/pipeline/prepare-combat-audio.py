#!/usr/bin/env python3
"""Trim licensed recordings; sources live outside git, reproducible edits in manifest."""
import json,subprocess,hashlib,sys
from pathlib import Path
import numpy as np
src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
urls=json.loads((src/'downloads.json').read_text());urls.update({'voice-a.zip':'https://opengameart.org/content/voice-clip-pack-male-adventurer-rpg','death.zip':'https://opengameart.org/content/death-sounds-0'});groups={};assets={}
def clip(group,file,start=0,length=1.4,filters=''):
 path=src/file;data=subprocess.check_output(['ffmpeg','-v','error','-ss',str(max(0,start)),'-i',str(path),'-t',str(length),'-ac','1','-ar','32000','-f','f32le','-'])
 pcm=np.frombuffer(data,dtype='<f4');peak=max(.001,float(np.abs(pcm).max()));gain=min(8,.82/peak);duration=len(pcm)/32000
 idx=len(groups.get(group,[]));name=f'{group}-{idx}.m4a'
 af=f'volume={gain},afade=t=in:d=0.002,afade=t=out:st={max(.005,duration-.06)}:d=0.06'+(','+filters if filters else '')
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','32000','-ac','1','-i','-','-af',af,'-c:a','aac','-b:a','64k','-movflags','+faststart',str(out/name)],input=data,check=True)
 groups.setdefault(group,[]).append(name)
 archive='voice-a.zip' if file.startswith('voice-a/') else 'death.zip' if file.startswith('death/') else file
 assets[name]={'source':urls.get(archive,archive),'sourceFile':file,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'start':round(start,4),'duration':round(duration,4),'gain':gain,'filters':filters,'license':'CC0-1.0'}
def onsets(file):
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(src/file),'-ac','1','-ar','24000','-f','f32le','-']);a=np.frombuffer(data,dtype='<f4');b=np.abs(a[:len(a)//240*240].reshape(-1,240)).max(1);hits=np.where(b>b.max()*.3)[0]/100;result=[]
 for t in hits:
  if not result or t-result[-1]>1.2:result.append(float(t))
 return result
spec={'pistol':('X_39P.wav','X_31P.wav',.48),'smg':('G_31P.wav','G_20P.wav',.3),'rifle':('C_28P.wav','C_31P.wav',.55),'pump':('N_30P.wav','N_26P.wav',.65),'sniper':('W_29P.wav','W_24P.wav',.85)}
for kind,(near,far,duration) in spec.items():
 ts=onsets(near)
 for t in ts[:4]:clip(kind+'-shot',near,t-.015,duration)
 if len(ts)<3:
  extra='O_21P.wav' if kind=='pump' else 'B_24P.wav';clip(kind+'-shot',extra,onsets(extra)[0]-.015,duration)
 for t in onsets(far)[:3]:clip(kind+'-distant',far,t-.015,1.2)
 for t in ts[:2]:clip(kind+'-tail',near,t+.15,min(.8,duration), 'lowpass=f=4000')
 for f in ['clipload1.wav','clipload2.wav']:clip(kind+'-mechanical',f,0,.3)
 for f in ['clipload1.wav','clipload2.wav']:clip(kind+'-dry',f,0,.08,'highpass=f=1200')
for group,stem in [('body','impactPunch_heavy'),('head','impactPunch_heavy'),('kill','impactPunch_heavy'),('metal','impactMetal_medium'),('stone','impactMining'),('wood','impactPlank_medium'),('dirt','impactSoft_medium'),('casing','impactTin_medium')]:
 for i in range(3):clip(group,f'{stem}_{i:03}.ogg',0,1, 'highpass=f=1200' if group=='head' else 'lowpass=f=800' if group=='kill' else '')
for i in range(4):clip('voice-a-pain',f'voice-a/RPG Male Adventurer/hurt{i}.wav',0,1)
for i in range(2):clip('voice-a-death',f'voice-a/RPG Male Adventurer/death{i}.wav',0,2.4)
for i in range(1,5):clip('voice-b-death',f'death/exewinDeathSoundsPack/{i}.ogg',0,2)
for i in range(5,9):clip('voice-b-pain',f'death/exewinDeathSoundsPack/{i}.ogg',0,.55)
# Short edited recorded rifle cracks (not recordings of projectiles passing a microphone).
for t in onsets('C_28P.wav')[:3]:clip('near-miss','C_28P.wav',t-.005,.08,'highpass=f=3000')
(out/'manifest.json').write_text(json.dumps({'version':1,'groups':groups,'assets':assets},indent=2)+'\n')
(out/'CREDITS.txt').write_text('''Recorded combat audio — all source recordings CC0-1.0 (public domain dedication).
Firearms: Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney — Free Firearm Sound Library.
https://opengameart.org/content/the-free-firearm-sound-library
Mirror: https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
Impacts/casings: Kenney — Impact Sounds. https://kenney.nl/assets/impact-sounds
Mirror: https://github.com/GeorgeQLe/assets-sfx-combat
Mechanical/reload/dry clicks: Brian MacIntosh (BMacZero).
https://opengameart.org/content/gun-reload-sound-effects
Voice A: Brandon Song (wolfwoot), Male Adventurer RPG.
https://opengameart.org/content/voice-clip-pack-male-adventurer-rpg
Voice B: Exewin, Death Sounds. Short edits are used for pain; full clips for deaths.
https://opengameart.org/content/death-sounds-0
Edits by Break Thy Rule: trimming, mono 32 kHz AAC, normalization, fades and indicated filters.
Head/kill accents derive from Kenney body impacts. Near-miss cracks are edited rifle transients.
manifest.json records source URLs, source-file hashes and every edit. No AI voice synthesis.
''')
for f in ['guns-CC0.txt','kenney-CC0.txt']:(out/f).write_bytes((src/f).read_bytes())
print(len(assets),'clips',sum(p.stat().st_size for p in out.iterdir()),'bytes')
