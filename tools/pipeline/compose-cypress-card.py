"""Compose the cypress foliage card from the three fir-sapling top views (render-cypress-card.cjs), graded to an
Italian cypress's dark, cool green. Usage: compose-cypress-card.py <dir with fir-fir_sapling_*.png> <out.webp>"""
import sys
from PIL import Image,ImageEnhance
src,out=sys.argv[1],sys.argv[2]
a,b,c=[Image.open(f'{src}/fir-fir_sapling_{k}.png').convert('RGBA') for k in 'abc']
card=Image.new('RGBA',(1024,1024),(0,0,0,0))
def place(im,angle,scale):
    im=im.rotate(angle,resample=Image.BICUBIC);s=int(1024*scale);im=im.resize((s,s),Image.LANCZOS);card.alpha_composite(im,((1024-s)//2,(1024-s)//2))
place(c,110,.78);place(b,40,.9);place(a,0,1.0)
# Italian cypress: darker, cooler green than a fir sapling.
r,g,bb,al=card.split()
rgb=Image.merge('RGB',(r,g,bb))
rgb=ImageEnhance.Brightness(rgb).enhance(.72);rgb=ImageEnhance.Color(rgb).enhance(.85)
r,g,bb=rgb.split();r=r.point(lambda v:int(v*.82));bb=bb.point(lambda v:min(255,int(v*1.04)))
Image.merge('RGBA',(r,g,bb,al)).save(out,quality=86,method=6)
