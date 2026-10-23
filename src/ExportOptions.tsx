import { Copy, Download, Info, LoaderCircle } from 'lucide-react';
import type { Project } from './types';
import { rangeLabel } from './dates';

export type ExportType = 'png' | 'jpeg' | 'svg';
export function ExportOptions({ project, days, previewUrl, width, height, slides, page, type, onType, exporting, disabled, onDownload, onCaption }: {
  project: Project; days: string[]; previewUrl: string; width: number; height: number;
  slides: number; page: number; type: ExportType; onType: (type: ExportType) => void;
  exporting: boolean; disabled: boolean; onDownload: (all: boolean) => void; onCaption: () => void;
}) {
  return <div className="export-dialog-body">
    <div className="export-summary"><div className="export-thumbnail">{previewUrl && <img src={previewUrl} alt="Export preview"/>}</div><div><h3>{project.layout === 'weekend' ? 'Weekend' : project.layout === 'full-week' ? 'Full week' : 'Weekday'} schedule</h3><p>{rangeLabel(days)}</p><span>{width} × {height} px · {slides} slide{slides === 1 ? '' : 's'}</span></div></div>
    <label className="field-label">File format<select value={type} onChange={event => onType(event.target.value as ExportType)}><option value="png">PNG · Best quality for Instagram</option><option value="jpeg">JPG · Smaller file</option><option value="svg">SVG · Scalable vector artwork</option></select></label>
    <div className="info-box"><Info size={16}/><p>All slides includes a ZIP of your images and a ready-to-edit caption with event links. Dates and times use {project.timezone}.</p></div>
    <button className="button primary full" disabled={disabled || exporting} onClick={() => onDownload(true)}>{exporting ? <LoaderCircle className="spinning" size={16}/> : <Download size={16}/>}Download all slides + caption</button>
    <button className="button secondary full" disabled={disabled || exporting} onClick={() => onDownload(false)}>Download current slide ({page + 1})</button>
    <button className="caption-button" disabled={disabled || exporting} onClick={onCaption}><Copy size={14}/>Copy caption</button>
    <p className="download-note">On your phone, find the image in Downloads, then save or share it to Instagram.</p>
  </div>;
}
