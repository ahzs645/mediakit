"""Keep the supplied Figma vectors; remove only the outlined dates for dynamic replacements."""
import xml.etree.ElementTree as E
from pathlib import Path
E.register_namespace('', 'http://www.w3.org/2000/svg')
E.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
source=Path('design-reference'); out=Path('public/assets'); out.mkdir(parents=True,exist_ok=True)
for name,filename,remove in [
 ('weekly','Instagram post - 131.svg',[8,9,10,13,16,19,22,25]),
 ('weekend','Instagram post - 136.svg',[6,9,11,12,13]),
 ('story','Instagram story - 15.svg',[3,4,5,13,16,19,22,25])]:
 r=E.parse(source/filename).getroot();g=r[0]
 for i in sorted(remove,reverse=True):g.remove(g[i])
 # Use semantic paint tokens for all three original colourways and custom palettes.
 colors={'#155329':'__ACCENT__','#262626':'__INK__','#FFFBF3':'__PAPER__'}
 if name=='weekend':colors={'#155329':'__PAPER__','#FFFBF3':'__INK__','#262626':'__BADGEINK__','#E3EFCF':'__ACCENT__'}
 else:colors['white']='__BADGEINK__'
 for e in r.iter():
  for k in ['fill','stroke']:
   if e.get(k) in colors:e.set(k,colors[e.get(k)])
 # Badge artwork remains textured; for the dark weekend template it is the light accent.
 (out/f'{name}.svg').write_text(E.tostring(r,encoding='unicode'))
 print('Prepared',name)
# Semantic layers make it possible to omit/reflow dates without stretching the artwork.
import json
parts={}
for name,filename in [('weekly','Instagram post - 131.svg'),('weekend','Instagram post - 136.svg'),('story','Instagram story - 15.svg')]:
 r=E.parse(source/filename).getroot();g=r[0]
 colors={'#155329':'__ACCENT__','#262626':'__INK__','#FFFBF3':'__PAPER__','white':'__BADGEINK__'}
 if name=='weekend': colors={'#155329':'__PAPER__','#FFFBF3':'__INK__','#262626':'__BADGEINK__','#E3EFCF':'__ACCENT__'}
 for e in r.iter():
  for k in ['fill','stroke']:
   if e.get(k) in colors:e.set(k,colors[e.get(k)])
 serialize=lambda e:E.tostring(e,encoding='unicode')
 badges=[[g[23],g[24]],[g[11],g[12]],[g[14],g[15]],[g[17],g[18]],[g[20],g[21]]] if name!='weekend' else [[g[4],g[5]],[g[7],g[8]]]
 parts[name]={'background':serialize(g[0])+serialize(g[1]),'header':serialize(g[10] if name=='weekend' else g[2]),'defs':serialize(r[1]),'badges':[''.join(map(serialize,b)) for b in badges]}
(out/'design-parts.json').write_text(json.dumps(parts,separators=(',',':')))
