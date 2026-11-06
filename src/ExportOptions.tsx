import { Copy, Download, Info, LoaderCircle } from 'lucide-react';
import type { Project } from './types';
import type { ExportType } from './render';
import type { DailyDay } from './daily-layout';
import { rangeLabel, readableDay } from './dates';

export function ExportOptions({ project, days, daily, previewDay, previewUrl, width, height, slides, page, type, onType, exporting, weeklyDisabled, slideDisabled, packageIssue, onDownload, onCaption }: {
  project: Project; days: string[]; previewUrl: string; width: number; height: number;
  daily: DailyDay[]; previewDay?: DailyDay;
  slides: number; page: number; type: ExportType; onType: (type: ExportType) => void;
  exporting: boolean; weeklyDisabled: boolean; slideDisabled: boolean; packageIssue: string;
  onDownload: (output: 'package' | 'weekly' | 'slide') => void; onCaption: () => void;
}) {
  const dailySlides = daily.reduce((sum, day) => sum + day.pages.length, 0);
  const title = previewDay ? 'Daily Stories' : `${project.layout === 'weekend' ? 'Weekend' : project.layout === 'full-week' ? 'Full week' : 'Weekday'} schedule`;
  return <div className="export-dialog-body">
    <div className="export-summary"><div className="export-thumbnail">{previewUrl && <img src={previewUrl} alt="Export preview"/>}</div><div><h3>{title}</h3><p>{previewDay ? readableDay(previewDay.day, { weekday:'long', month:'long', year:'numeric' }) : rangeLabel(days)}</p><span>{width} × {height} px · {slides} slide{slides === 1 ? '' : 's'}</span></div></div>
    <label className="field-label">File format<select value={type} onChange={event => onType(event.target.value as ExportType)}><option value="png">PNG · Best quality for Instagram</option><option value="jpeg">JPG · Smaller file</option><option value="svg">SVG · Scalable vector artwork</option></select></label>
    <div className="info-box"><Info size={16}/><p>The package includes the weekly schedule and {dailySlides} daily Story slide{dailySlides === 1 ? '' : 's'} across {daily.length} date{daily.length === 1 ? '' : 's'}, with captions and event links. Daily Stories are 1080 × 1920 px.</p></div>
    {packageIssue && <p className="package-issue" role="status">{packageIssue}</p>}
    <button className="button primary full" disabled={!!packageIssue || exporting} onClick={() => onDownload('package')}>{exporting ? <LoaderCircle className="spinning" size={16}/> : <Download size={16}/>}Download weekly + daily package</button>
    <button className="button secondary full" disabled={weeklyDisabled || exporting} onClick={() => onDownload('weekly')}>Download weekly slides + caption</button>
    <button className="button secondary full" disabled={slideDisabled || exporting} onClick={() => onDownload('slide')}>Download current slide ({page + 1})</button>
    <button className="caption-button" disabled={slideDisabled || exporting} onClick={onCaption}><Copy size={14}/>Copy caption</button>
    <p className="download-note">On your phone, find the image in Downloads, then save or share it to Instagram.</p>
  </div>;
}
