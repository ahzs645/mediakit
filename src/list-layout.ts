import type * as opentype from 'opentype.js';
import type { CalendarEvent, Project } from './types';
import type { RenderResult, DayCapacity, RenderedPage } from './render';
import { PALETTES } from './types';
import { dayLabel, daysFor, eventOnDay, formatTime, rangeLabel } from './dates';
import { escape, FONT_OPTIONS, textPath, wrap } from './vector-text';

type Fonts = Record<'sans'|'bold'|'italic'|'display',opentype.Font>;
type Run = {text:string;font:'bold'|'italic'};
// Wrap title and italic venue as one measured paragraph, preserving their styles.
function inlineLines(fonts:Fonts,runs:Run[],size:number,width:number):Run[][] {
  const lines:Run[][]=[];let line:Run[]=[],used=0;
  const finish=()=>{if(line.length)lines.push(line);line=[];used=0;};
  for(const run of runs)for(const word of run.text.trim().split(/\s+/).filter(Boolean)){
    const font=fonts[run.font];
    if(font.getAdvanceWidth(word,size,FONT_OPTIONS)>width){
      finish();const pieces=wrap(font,word,size,width);
      for(let i=0;i<pieces.length;i++){line=[{...run,text:pieces[i]}];used=font.getAdvanceWidth(pieces[i],size,FONT_OPTIONS);if(i<pieces.length-1)finish();}
      continue;
    }
    let text=(line.length?' ':'')+word;
    if(used+font.getAdvanceWidth(text,size,FONT_OPTIONS)>width){finish();text=word;}
    used+=font.getAdvanceWidth(text,size,FONT_OPTIONS);
    const previous=line.at(-1);
    if(previous?.font===run.font)previous.text+=text;else line.push({...run,text});
  }
  finish();return lines;
}

export function renderList(project:Project,fonts:Fonts,events:CalendarEvent[],days:string[],dims:{width:number;height:number}):RenderResult {
  const {width:w,height:h}=dims,scale=w/1080;
  const palette=project.palette==='custom'?project.customPalette:PALETTES[project.palette];
  const ink=project.palette==='custom'?palette.ink:palette.accent;
  const warnings:string[]=[];
  if(!days.length)warnings.push('Choose at least one date with an event to export.');
  const cancelled=events.filter(e=>/cancelled|canceled|postponed/i.test(e.status));
  if(cancelled.length)warnings.push(`${cancelled.length} selected event(s) are cancelled or postponed. Remove them before exporting.`);
  const title=project.layout==='weekend'?'WEEKEND SCHEDULE':project.layout==='weekly'?'WEEKDAY SCHEDULE':'WEEKLY SCHEDULE';
  const margin=w*.06,dateWidth=w*.18,contentX=w*.28,contentWidth=w*.66;
  const titleSize=w*.15;
  const titleBox=fonts.display.getPath(title,0,0,titleSize,FONT_OPTIONS).getBoundingBox();
  const titleY=h*.055-titleBox.y1;
  const bodyTop=Math.max(h*.155,titleY+titleBox.y2+48*scale),bodyBottom=h*.945;
  const dateLabelSize=25*scale,dateNumberSize=76*scale;
  const gap=Math.min(27*scale,h*.018),padding=19*scale;
  const size=30*scale*project.textScale,lineHeight=31.5*scale*project.textScale;
  const detailSize=22*scale*project.textScale,detailHeight=26*scale*project.textScale;
  const bulletX=contentX+padding+4*scale,textX=bulletX+18*scale;
  const textWidth=contentX+contentWidth-padding-textX;
  const rows=days.map(day=>{
    const entries=events.filter(e=>eventOnDay(e,day,project.timezone)).map(event=>{
      const edit=project.edits[event.id]||{},name=edit.title??event.title;
      const runs:Run[]=[];
      if(edit.showTitle??project.showTitle){if(!name.trim())warnings.push(`“${event.title}” has an empty title.`);else runs.push({text:name,font:'bold'});}
      const location=(edit.showLocation??project.showLocation)?edit.location??event.location:'';
      if(location)runs.push({text:`(${location})`,font:'italic'});
      const lines=inlineLines(fonts,runs,size,textWidth);
      const time=(edit.showTime??project.showTime)?edit.timeLabel??formatTime(event,day,project.timezone):'';
      const timeLines=wrap(fonts.sans,time,detailSize,textWidth);
      const description=(edit.showDescription??project.showDescription)?edit.description??event.description:'';
      const descriptionLines=wrap(fonts.sans,description,detailSize,textWidth);
      const visibleText=[...runs.map(run=>run.text),time,description].join('');
      if([...visibleText].some(char=>!fonts.sans.hasChar(char)&&char!=='\n'))warnings.push(`“${name}” contains a symbol the export font cannot draw. Replace it in the event editor.`);
      if(!lines.length&&!timeLines.length&&!descriptionLines.length)warnings.push(`“${event.title}” has every field hidden. Enable a field or deselect this event.`);
      const height=lines.length*lineHeight+(timeLines.length+descriptionLines.length)*detailHeight+5*scale;
      return {event,lines,timeLines,descriptionLines,height};
    });
    return {day,entries};
  });
  const usable=bodyBottom-bodyTop-gap*Math.max(0,days.length-1);
  const minimum=Math.min(128*scale,usable/Math.max(1,days.length));
  const desired=rows.map(row=>Math.max(minimum,row.entries.reduce((sum,e)=>sum+e.height,0)+padding*2));
  const extra=desired.map(height=>height-minimum),demand=extra.reduce((sum,n)=>sum+n,0);
  const budget=Math.max(0,usable-minimum*days.length);
  const heights=desired.map((_,i)=>minimum+(demand>budget?budget*extra[i]/demand:extra[i]+(budget-demand)/Math.max(1,days.length)));
  let cursor=bodyTop;
  const placed=rows.map((row,i)=>{
    const height=heights[i],y=cursor;cursor+=height+gap;
    const available=height-padding*2;
    const chunks:typeof row.entries[]=[[]];let used=0;
    for(const entry of row.entries){
      if(entry.height>available)warnings.push(`“${entry.event.title}” is too long for one day box. Shorten it, hide a field, or reduce the text size.`);
      if(used+entry.height>available&&chunks.at(-1)!.length){chunks.push([]);used=0;}
      chunks.at(-1)!.push(entry);used+=entry.height;
    }
    return {...row,y,height,available,chunks};
  });
  const total=Math.max(1,...placed.map(row=>row.chunks.length));
  if(total>10)warnings.push('This selection needs more than 10 slides. Choose fewer events for a readable set.');
  const capacity:DayCapacity[]=placed.map(row=>({day:row.day,events:row.entries.length,slides:row.chunks.length,used:row.chunks[0].reduce((sum,e)=>sum+e.height,0),available:row.available,typicalLimit:Math.max(1,Math.floor(row.available/(lineHeight+5*scale)))}));
  const range=rangeLabel(days.length?days:daysFor(project.week,project.layout));
  const backgroundLogo=textPath(fonts.display,'OVER THE EDGE',0,0,w*.14,palette.accent);
  let background=`<rect width="${w}" height="${h}" fill="${palette.paper}"/><defs><g id="list-watermark">${backgroundLogo}</g></defs><g data-layer="watermark" opacity="0.065" transform="rotate(-5 ${w/2} ${h/2})">`;
  for(let row=-1;row<=Math.ceil(h/(w*.25))+1;row++)for(let col=-1;col<=1;col++)background+=`<use href="#list-watermark" transform="translate(${col*w*.95+(row%2)*w*.4} ${row*w*.25})"/>`;
  background+='</g>';
  const subtitleSize=20*scale;
  const subtitleX=w-margin-fonts.sans.getAdvanceWidth(range,subtitleSize,FONT_OPTIONS);
  const header=`<g data-layer="heading">${textPath(fonts.display,title,margin,titleY,titleSize,palette.accent,w-margin*2)}</g><g data-layer="date-range" aria-label="${escape(range)}">${textPath(fonts.sans,range,subtitleX,bodyTop-17*scale,subtitleSize,ink,w-margin*2)}</g>`;
  const pages:RenderedPage[]=Array.from({length:total},(_,page)=>{
    let content='',eventCount=0;
    placed.forEach((row,i)=>{
      const stroke=2.5*scale,rx=6*scale;
      content+=`<rect data-date="${row.day}" x="${margin}" y="${row.y}" width="${dateWidth}" height="${row.height}" rx="${rx}" fill="${palette.paper}" fill-opacity="0.55" stroke="${palette.accent}" stroke-width="${stroke}"/><rect data-day="${row.day}" x="${contentX}" y="${row.y}" width="${contentWidth}" height="${row.height}" rx="${rx}" fill="${palette.paper}" fill-opacity="0.55" stroke="${palette.accent}" stroke-width="${stroke}"/>`;
      const middle=row.y+row.height/2;
      content+=textPath(fonts.bold,dayLabel(row.day,'long').toUpperCase(),margin+dateWidth/2,middle-20*scale,dateLabelSize,ink,dateWidth-12*scale,true);
      content+=textPath(fonts.sans,String(Number(row.day.slice(8))),margin+dateWidth/2,middle+54*scale,dateNumberSize,ink,dateWidth-12*scale,true);
      content+=`<defs><clipPath id="list-content-${i}"><rect x="${contentX+padding}" y="${row.y+padding/2}" width="${contentWidth-padding*2}" height="${row.height-padding}"/></clipPath></defs><g clip-path="url(#list-content-${i})">`;
      let baseline=row.y+padding+size*.75;
      for(const entry of row.chunks[page]||[]){
        eventCount++;content+=`<g data-event-id="${escape(entry.event.id)}"><title>${escape(entry.event.title)}</title><circle cx="${bulletX}" cy="${baseline-size*.28}" r="${3.5*scale}" fill="${ink}"/>`;
        for(const line of entry.lines){let x=textX;for(const run of line){content+=textPath(fonts[run.font],run.text,x,baseline,size,ink,textX+textWidth-x);x+=fonts[run.font].getAdvanceWidth(run.text,size,FONT_OPTIONS);}baseline+=lineHeight;}
        for(const line of [...entry.timeLines,...entry.descriptionLines]){content+=textPath(fonts.sans,line,textX,baseline,detailSize,ink,textWidth);baseline+=detailHeight;}
        baseline+=5*scale;content+='</g>';
      }
      content+='</g>';
    });
    if(total>1)content+=textPath(fonts.sans,`${page+1} / ${total}`,w-margin,h-22*scale,16*scale,ink,Infinity,true);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escape(`Weekly list · ${range} · slide ${page+1}`)}</title>${background}${header}${content}</svg>`;
    if(/\bd="[^"]*(?:NaN|Infinity)/.test(svg))throw new Error('Invalid lettering geometry. Reload the app before exporting.');
    return {svg,...dims,number:page+1,total,eventCount};
  });
  return {pages,warnings:[...new Set(warnings)],count:events.length,capacity,hiddenDays:daysFor(project.week,project.layout).length-days.length};
}
