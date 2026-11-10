import { Check, Plus } from 'lucide-react';
import type { Palette, Project } from './types';
import { PALETTES } from './types';

const customLabels: Record<keyof Palette, string> = { name: '', paper: 'Background', ink: 'Text', accent: 'Accent', badgeInk: 'Labels' };

/** A compact palette strip shown under the mobile preview, so colour changes are visible as they are made. */
export function PreviewPalette({ project, update }: { project: Project; update: (patch: Partial<Project>) => void }) {
  return <div className="preview-palette" role="group" aria-label="Preview colours">
    <div className="preview-palette-row">
      <span className="preview-palette-label">Colours</span>
      {Object.entries(PALETTES).map(([key, p]) => <button key={key} type="button" className="preview-swatch" aria-label={`${p.name} palette`} aria-pressed={project.palette === key} title={p.name} onClick={() => update({ palette: key })}>
        <span style={{ background: p.paper }}><span style={{ background: p.accent }}/>{project.palette === key && <Check className="preview-swatch-check" size={11}/>}</span>
      </button>)}
      <button type="button" className="preview-swatch custom" aria-label="Custom palette" aria-pressed={project.palette === 'custom'} title="Custom" onClick={() => update({ palette: 'custom' })}>
        <span style={project.palette === 'custom' ? { background: project.customPalette.paper } : undefined}>{project.palette === 'custom' ? <><span style={{ background: project.customPalette.accent }}/><Check className="preview-swatch-check" size={11}/></> : <Plus size={14}/>}</span>
      </button>
    </div>
    {project.palette === 'custom' && <div className="preview-custom-colors">
      {(['paper', 'ink', 'accent', 'badgeInk'] as const).map(key => <label key={key}>
        <input type="color" value={project.customPalette[key]} aria-label={`Custom ${key} color`} onChange={e => update({ customPalette: { ...project.customPalette, [key]: e.target.value } })}/>
        <span>{customLabels[key]}</span>
      </label>)}
    </div>}
  </div>;
}
