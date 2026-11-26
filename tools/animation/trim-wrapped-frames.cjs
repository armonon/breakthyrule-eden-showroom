// Repairs one-shot clips baked before tools/animation/bake.mjs clamped its last sample.
//
// The bake sampled frame n-1 at exactly t = duration, where a repeating AnimationAction wraps to t = 0, so a
// one-shot's stored last frame is a copy of its first pose. Held or fading out, the clip then snapped back to where it
// started. Every earlier frame was sampled correctly, so dropping the wrapped frame (and shortening the clip by one
// frame) is exact. Loops never read their last frame (character-anim.js samples them modulo n-1) and are left alone.
//
//   node tools/animation/trim-wrapped-frames.cjs          report and rewrite assets/anim/clips.json
//   node tools/animation/trim-wrapped-frames.cjs --check  report only; exit 1 if any clip still needs it
const fs=require('fs'),path=require('path');
const FILE=path.join(__dirname,'../../assets/anim/clips.json'),check=process.argv.includes('--check');
const lib=JSON.parse(fs.readFileSync(FILE,'utf8')),B=lib.bones.length;
const dec=s=>{const b=Buffer.from(s,'base64');return new Int16Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
const enc=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
// Largest bone rotation (radians) between two frames.
const apart=(q,a,b)=>{let m=0;for(let i=0;i<B;i++){let d=0;for(let k=0;k<4;k++)d+=q[(a*B+i)*4+k]*q[(b*B+i)*4+k];m=Math.max(m,2*Math.acos(Math.min(1,Math.abs(d)/32767/32767)));}return m;};
const fixed=[];
for(const [id,c] of Object.entries(lib.clips)){
 // Once per clip: clips that end on their start pose would otherwise look wrapped again. Mixamo clips were baked
 // after the fix.
 if(c.loop||c.n<4||c.src.startsWith('mixamo')||c.endTrimmed)continue;
 const q=dec(c.q),hip=dec(c.hip),last=c.n-1;
 // Wrapped: the last frame repeats the first (to int16 rounding) while the clip moved away from it in between.
 const same=apart(q,0,last)<.03&&Math.abs(hip[last]-hip[0])<30,moved=apart(q,0,last-1)>.03||apart(q,0,Math.floor(last/2))>.03;
 if(!same||!moved)continue;
 fixed.push(`${id} (${c.n} -> ${c.n-1} frames)`);
 if(check)continue;
 c.n--;c.q=enc(q.slice(0,c.n*B*4));c.hip=enc(hip.slice(0,c.n));c.duration=+((c.n-1)/c.fps).toFixed(3);c.endTrimmed=true;
}
console.log(fixed.length?(check?'Need trimming: ':'Trimmed: ')+fixed.join(', '):'No wrapped one-shot clips.');
if(check){process.exitCode=fixed.length?1:0;}else if(fixed.length)fs.writeFileSync(FILE,JSON.stringify(lib));
