"""Extract semantic layers from the supplied, outlined Figma artwork."""
import copy
import json
import re
import xml.etree.ElementTree as E
from pathlib import Path

E.register_namespace('', 'http://www.w3.org/2000/svg')
E.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
source = Path('design-reference')
out = Path('src/assets')
out.mkdir(parents=True, exist_ok=True)
serialize = lambda e: E.tostring(e, encoding='unicode')


def referenced_defs(root, markup):
    """Follow local SVG references instead of shipping other montage frames' defs."""
    refs = lambda text: re.findall(r'(?:url\(#|href="#)([^)" ]+)', text)
    available = {e.get('id'): e for e in root[-1]}
    pending, needed = refs(markup), set()
    while pending:
        key = pending.pop()
        if key in needed or key not in available:
            continue
        needed.add(key)
        pending.extend(refs(serialize(available[key])))
    defs = E.Element('{http://www.w3.org/2000/svg}defs')
    for key, element in available.items():
        if key in needed:
            defs.append(copy.deepcopy(element))
    return defs


parts = {}
for name, filename in [
    ('weekly', 'Instagram post - 131.svg'),
    ('weekend', 'Instagram post - 136.svg'),
    ('story', 'Instagram story - 15.svg'),
    ('weekend-story', 'Section 1.svg'),
]:
    r = E.parse(source / filename).getroot()
    # The new montage contains the original weekend Story, in forest at (100,2174).
    g = r[13] if name == 'weekend-story' else r[0]
    ox, oy = (100, 2174) if name == 'weekend-story' else (0, 0)
    weekend = name.startswith('weekend')
    colors = {'#155329': '__ACCENT__', '#262626': '__INK__', '#FFFBF3': '__PAPER__', 'white': '__BADGEINK__'}
    if weekend:
        colors = {'#155329': '__PAPER__', '#FFFBF3': '__INK__', '#262626': '__BADGEINK__', '#E3EFCF': '__ACCENT__'}
    for e in r.iter():
        for key in ['fill', 'stroke']:
            if e.get(key) in colors:
                e.set(key, colors[e.get(key)])
    layer = lambda elements: f'<g transform="translate({-ox} {-oy})">' + ''.join(map(serialize, elements)) + '</g>'
    badge_indices = [4, 7] if weekend else [23, 11, 14, 17, 20]
    badges = []
    for idx in badge_indices:
        e = g[idx]
        shape = copy.deepcopy(e[0] if e.tag.endswith('mask') else e)
        # Keep the original polygon and paper image, tinting the image directly.
        # SVG image renderers disagree on Figma's blend modes.
        tokens = re.findall(r'[MLHVZ]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', shape.get('d'))
        xs, ys, cursor, x, y = [], [], 0, 0, 0
        while cursor < len(tokens):
            command = tokens[cursor]
            cursor += 1
            if command == 'Z':
                continue
            if command in ['M', 'L']:
                x, y = map(float, tokens[cursor:cursor+2])
                cursor += 2
            elif command == 'H':
                x = float(tokens[cursor])
                cursor += 1
            elif command == 'V':
                y = float(tokens[cursor])
                cursor += 1
            else:
                raise ValueError(f'Unsupported badge path command: {command}')
            xs.append(x)
            ys.append(y)
        x, y, width, height = min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)
        shape.set('filter', 'url(#badge-paper-tone)')
        shape.attrib.pop('style', None)
        badges.append({'artwork': f'<g transform="translate({-x} {-y})">{serialize(shape)}</g>',
                       'x': x-ox, 'y': y-oy, 'width': width, 'height': height})
    frames = []
    for e in list(g)[2:4] if weekend else list(g)[6:11] if name == 'story' else list(g)[3:8]:
        frames.append({key: float(e.get(key, '0')) - (ox if key == 'x' else oy if key == 'y' else 0)
                       for key in ['x', 'y', 'width', 'height', 'rx', 'stroke-width']})
    stamp_indices = [11, 12, 13] if weekend else [3, 4, 5] if name == 'story' else [8, 9, 10]
    g[stamp_indices[0]].set('fill', '__BADGEINK__')
    parts[name] = {
        'header': layer([g[10] if weekend else g[2]]),
        'stamp': layer([g[i] for i in stamp_indices]),
        'badges': badges, 'frames': frames,
    }
    parts[name]['defs'] = serialize(referenced_defs(r, parts[name]['header'] + parts[name]['stamp'] + ''.join(b['artwork'] for b in badges)))
    if name == 'weekend-story':
        reference = E.Element('{http://www.w3.org/2000/svg}svg', {'width': '1080', 'height': '1945', 'viewBox': '0 0 1080 1945'})
        wrapper = E.SubElement(reference, '{http://www.w3.org/2000/svg}g', {'transform': f'translate({-ox} {-oy})'})
        wrapper.append(copy.deepcopy(g))
        reference.append(referenced_defs(r, serialize(g)))
        text = serialize(reference)
        for color, token in colors.items():
            text = text.replace(token, color)
        (source / 'Weekend story.svg').write_text(text)

# One complete logo and the two staggered lattice vectors continue the original
# watermark seamlessly, including areas beyond the native Figma frame.
g = E.parse(source / 'Instagram post - 131.svg').getroot()[0][1]
logo = ''.join(serialize(e) for e in list(g)[106:117])
logo = re.sub(r'fill="[^"]*"', 'fill="__INK__"', logo)
parts['weekly']['watermark'] = logo
(out / 'design-parts.json').write_text(json.dumps(parts, separators=(',', ':')))
print('Prepared weekday/weekend Post and Story artwork, badges, and October stamp.')
