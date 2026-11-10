import { useEffect, useState } from 'react';
import { Copy, Download, Images, LoaderCircle } from 'lucide-react';
import { svgUrl } from './render';
import type { Project } from './types';
import type { ExportType } from './render';
import type { DailyDay } from './daily-layout';
import { rangeLabel } from './dates';

function useSvgUrl(svg?: string) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!svg) { setUrl(''); return; }
    const next = svgUrl(svg); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [svg]);
  return url;
}

export function ExportOptions({ project, days, daily, previewDay, weeklySvg, weeklySlides, dailySvg, page, type, onType, exporting, weeklyDisabled, slideDisabled, packageIssue, canShare, sharePrepared, onDownload, onCaption }: {
  project: Project; days: string[];
  daily: DailyDay[]; previewDay?: DailyDay; weeklySvg?: string; weeklySlides: number; dailySvg?: string;
  page: number; type: ExportType; onType: (type: ExportType) => void;
  exporting: boolean; weeklyDisabled: boolean; slideDisabled: boolean; packageIssue: string;
  canShare: boolean; sharePrepared?: 'photos' | 'photo-slide';
  onDownload: (output: 'package' | 'weekly' | 'slide' | 'photos' | 'photo-slide') => void; onCaption: () => void;
}) {
  const dailySlides = daily.reduce((sum, day) => sum + day.pages.length, 0);
  const weeklyUrl = useSvgUrl(weeklySvg), dailyUrl = useSvgUrl(dailySvg);
  const schedule = `${project.layout === 'weekend' ? 'Weekend' : project.layout === 'full-week' ? 'Full week' : 'Weekday'} schedule`;
  // Single-slide actions follow the output shown in the preview, so name it on the button.
  const current = previewDay ? `Daily Story slide ${page + 1}` : `weekly slide ${page + 1}`;
  return <div className="export-dialog-body">
    <div className="export-summary">
      <div className="export-thumbnails"><div className="export-thumbnail">{weeklyUrl && <img src={weeklyUrl} alt="Weekly schedule preview"/>}</div>{dailySlides > 0 && <div className="export-thumbnail story">{dailyUrl && <img src={dailyUrl} alt="Daily Story preview"/>}</div>}</div>
      <div><h3>Your media package</h3><p>{rangeLabel(days)}</p>
        <span>{schedule} · {weeklySlides} slide{weeklySlides === 1 ? '' : 's'}</span>
        <span>{dailySlides ? `${dailySlides} daily Story slide${dailySlides === 1 ? '' : 's'} across ${daily.length} date${daily.length === 1 ? '' : 's'}` : 'No Daily Stories yet'}</span>
        <span>Captions and event links included</span>
      </div>
    </div>
    <label className="field-label">File format<select value={type} onChange={event => onType(event.target.value as ExportType)}><option value="png">PNG · Best quality for Instagram</option><option value="jpeg">JPG · Smaller file</option><option value="svg">SVG · Scalable vector artwork</option></select></label>
    {packageIssue && <p className="package-issue" role="status">{packageIssue}</p>}
    {canShare && <div className="photos-actions">
      <button className="button primary full" disabled={!!packageIssue || exporting} onClick={() => onDownload('photos')}>{exporting ? <LoaderCircle className="spinning" size={16}/> : <Images size={16}/>}{sharePrepared === 'photos' ? 'Open share sheet' : 'Save all images to Photos'}</button>
      <button className="button secondary full" disabled={slideDisabled || exporting} onClick={() => onDownload('photo-slide')}>{sharePrepared === 'photo-slide' ? 'Open share sheet' : `Save ${current} to Photos`}</button>
      <p className="download-note">Opens your share sheet. Choose <strong>Save Images</strong> to add them to Photos, or share straight to Instagram. SVG is saved as PNG.</p>
    </div>}
    <button className={`button ${canShare ? 'secondary' : 'primary'} full`} disabled={!!packageIssue || exporting} onClick={() => onDownload('package')}>{exporting ? <LoaderCircle className="spinning" size={16}/> : <Download size={16}/>}Download everything as ZIP</button>
    <button className="button secondary full" disabled={weeklyDisabled || exporting} onClick={() => onDownload('weekly')}>Download weekly slides + caption</button>
    <button className="button secondary full" disabled={slideDisabled || exporting} onClick={() => onDownload('slide')}>Download {current}</button>
    <button className="caption-button" disabled={slideDisabled || exporting} onClick={onCaption}><Copy size={14}/>Copy {previewDay ? 'Daily Story' : 'weekly'} caption</button>
    {!canShare && <p className="download-note">ZIP files open in Finder, Explorer, or the Files app. Single images download directly.</p>}
  </div>;
}
