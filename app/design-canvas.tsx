'use client';
import {useEffect,useRef} from 'react';
import {templates,type Draft,type Brand} from '../lib/designs';
export default function DesignCanvas({draft,brand,onError}:{draft:Draft;brand:Brand;onError?:(s:string)=>void}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{let cancelled=false;const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
 const t=templates[draft.template];const editorial=t.style==='editorial',dark=t.style==='dark';
 function draw(image?:HTMLImageElement){if(cancelled||!ctx)return;ctx.clearRect(0,0,1080,1080);ctx.fillStyle=editorial?'#f2e8da':brand.color;ctx.fillRect(0,0,1080,1080);
 const box=editorial?[0,450,1080,630]:dark?[100,420,880,530]:[0,0,1080,1080];
 if(image){ctx.save();ctx.beginPath();ctx.rect(...box as [number,number,number,number]);ctx.clip();const scale=Math.max(box[2]/image.width,box[3]/image.height);ctx.drawImage(image,box[0]+(box[2]-image.width*scale)/2,box[1]+(box[3]-image.height*scale)/2,image.width*scale,image.height*scale);ctx.restore();}
 if(!editorial&&!dark){const g=ctx.createLinearGradient(0,250,0,1080);g.addColorStop(0,'#00000000');g.addColorStop(1,'#102f29ee');ctx.fillStyle=g;ctx.fillRect(0,0,1080,1080);}
 ctx.fillStyle=editorial?'#33452f':'#ffffff';ctx.font='24px Arial';ctx.fillText(t.category.toUpperCase(),65,85);ctx.font='64px Georgia';let line='',lines:string[]=[];for(const word of draft.title.split(/\s+/)){if(ctx.measureText(line+word).width>950&&line){lines.push(line.trim());line='';}line+=word+' ';}if(line)lines.push(line.trim());const selected=lines.slice(0,4);const y=editorial||dark?180:850-(selected.length-1)*75;selected.forEach((l,i)=>ctx.fillText(l,65,y+i*75));ctx.font='23px Arial';if(editorial){ctx.fillStyle='#18342e';ctx.fillRect(0,985,1080,95);ctx.fillStyle='white';}ctx.fillText(brand.name+'  ·  '+brand.website,65,1040,950);canvas!.dataset.ready=image?'true':'false';}
 draw();const image=new Image();image.crossOrigin='anonymous';image.onload=()=>draw(image);image.onerror=()=>onError?.('Photo could not load. Upload your own photo to export.');image.src=draft.photo;return()=>{cancelled=true};
 },[draft,brand,onError]);
 return <canvas ref={ref} width={1080} height={1080} style={{display:'block',width:'100%',height:'auto'}} aria-label={`${templates[draft.template].name}: ${draft.title}`} role="img"/>;
}
