import dragonUrl from './assets/poble-dragon.svg';
import type { Renderer } from './renderer';
import { vec, type Vec } from './physics';
import type { Prop } from './world';

const dragon = new Image(); dragon.src = dragonUrl;
function line(r: Renderer, points: readonly Vec[], color: string, width: number, closed = false) {
  const c = r.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  if (closed) c.closePath(); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function fill(r: Renderer, points: Vec[], color: string) {
  const c = r.ctx; c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y));
  c.closePath(); c.fillStyle = color; c.fill();
}

export function drawPobleGround(r: Renderer) {
  const district = r.game.map.pobleSec; if (!district) return;
  const c = r.ctx;
  fill(r, district.park, '#6d8051');
  // Long planted terraces give the hill a readable slope without changing physics.
  for (let v = 169; v < 230; v += 12) {
    line(r, [district.point(48,v),district.point(134,v-4)], '#4d633f', 2.5);
    line(r, [district.point(48,v-1.5),district.point(134,v-5.5)], '#a4a078', .5);
  }
  for (const path of district.paths) { line(r,path,'#536642',4.3); line(r,path,'#c2b08a',2.6); line(r,path,'#ddcba3',.4); }
  for (const cell of district.cells) {
    if (!r.visible(cell.center, 32)) continue;
    fill(r,cell.pavement,'#c5b9a0');
    fill(r,cell.courtyard,'#a3987b');
    if (!cell.plaza) continue;
    c.save(); c.translate(cell.center.x,cell.center.y); c.rotate(district.angle);
    r.rect(-10,-11,20,22,'#cebea0');
    for (let y = -10; y < 11; y += 2) for (let x = -9; x < 10; x += 2) {
      c.strokeStyle = '#ab9e86'; c.lineWidth = .06; c.strokeRect(x,y,1.9,1.9);
      r.circle(vec(x+.95,y+.95),.13,'#978e7a');
    }
    r.circle(vec(),2.6,'#a69b81'); r.circle(vec(),2.1,'#e2d1ae'); r.circle(vec(),1.65,'#5f9290');
    r.circle(vec(-.4,-.3),.9,'#9bbdb0'); r.circle(vec(),.45,'#ddd1ad');
    for (const [x,y] of [[-5,-4],[5,-4],[-5,5],[5,5]]) {
      r.circle(vec(x,y),1.3,'#b99160');r.circle(vec(x-.15,y-.15),1.15,'#ede0b8');
      for (const dx of [-1.8,1.8])r.rect(x+dx-.3,y-.4,.6,.8,'#526e67');
    }
    r.label('PLAÇA DEL SOL',0,9.2,.75,'#76644d','700'); c.restore();
  }
}

export function drawPobleStreets(r: Renderer) {
  const district = r.game.map.pobleSec; if (!district) return;
  const c=r.ctx; c.save(); c.lineCap='butt';
  for (const road of r.game.map.country.COUNTRY_ROADS.filter(road=>road.id.startsWith('poble-'))) {
    // Warm stone curbs and unmarked local carriageways, still using shared road geometry.
    line(r,road.points,'#d0c4ab',10.5); line(r,road.points,'#515859',8);
    const a=road.points[0],b=road.points.at(-1)!;
    if (!r.visible(a,40))continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    c.save();c.translate(a.x,a.y);c.rotate(angle);
    for(let y=-3.2;y<3.5;y+=1.2)r.rect(5.4,y,2.3,.65,'#e0d9bd');
    c.restore();
    if(road.id.startsWith('poble-east-') && road.id.endsWith('-1')) {
      const p=road.points[Math.floor(road.points.length/2)];
      c.save();c.translate(p.x,p.y);c.rotate(angle);r.label(road.name.toUpperCase(),0,-.2,.63,'#bcc0b2','500');c.restore();
    }
  }
  c.restore();
}

export function drawPobleProp(r: Renderer, prop: Prop): boolean {
  if (!prop.sourceId?.startsWith('poble-')) return false;
  if (prop.kind === 'tree' && prop.alive) {
    const p=prop.body.position;
    r.circle(vec(p.x+1,p.y+1.3),2.6,'#23392b4d');
    r.circle(p,2.45,'#3e6042');
    for(let k=0;k<6;k++) { const a=k*Math.PI/3; r.circle(vec(p.x+Math.cos(a)*1.1,p.y+Math.sin(a)*1.1),1.25,k%2?'#789258':prop.color); }
    r.circle(vec(p.x-.4,p.y-.5),1.3,'#8ca46a');
    return true;
  }
  if (prop.kind!=='building')return false;
  const c=r.ctx,b=prop.body,w=b.w,h=b.h,seed=prop.id;
  c.save();c.translate(b.position.x,b.position.y);c.rotate(b.angle);
  if(prop.sourceId.startsWith('poble-chimney-')) {
    r.rect(-.4,.4,3.4,7.5,'#23372c60');r.rect(-w/2,-h/2,w,h,'#804b3a','#d7a47a');
    for(let k=0;k<4;k++)r.rect(-w/2-.15,-h/2+k*.55,w+.3,.12,'#c09268');
    r.circle(vec(),.72,'#e0b58b');r.circle(vec(),.43,'#403c35');c.restore();return true;
  }
  r.rect(-w/2+1.4,-h/2+2,w,h,'#28382d70');
  // A shallow visible façade, parapet and tile courses fit the exact physical footprint.
  r.rect(-w/2,-h/2,w,h,'#dbc6a0','#eedbbb');
  r.rect(-w/2+.18,-h/2+.18,w-.36,h-1.1,prop.color,'#eed3ad');
  c.save();c.beginPath();c.rect(-w/2+.28,-h/2+.28,w-.56,h-1.35);c.clip();
  if(seed%4!==0) {
    for(let y=-h/2+.5;y<h/2-.7;y+=.46) {
      r.rect(-w/2+.25,y,w-.5,.075,'#633f303b');
      for(let x=-w/2+.3+(Math.round(y*10)%2)*.2;x<w/2;x+=.72)r.rect(x,y,.06,.4,'#efd2a836');
    }
    r.rect(-w/2+.3,-.65,w-.6,.25,'#edbd92');r.rect(-w/2+.3,-.39,w-.6,.1,'#754836');
  } else {
    r.rect(-w/2+.45,-h/2+.5,w-.9,h-1.9,'#d5b79a');
    for(let x=-w/2+.8;x<w/2;x+=1.2)r.rect(x,-h/2+.5,.06,h-2,'#ac9275');
    r.rect(-w/2+.7,-h/2+.7,1.7,1.2,'#e4d5b8','#a68b6a');
    r.circle(vec(-w/2+1.55,-h/2+1.3),.37,'#777d70');
    // Washing line, linens and a tiny roof garden.
    line(r,[vec(-w/2+.7,.1),vec(w/2-.7,.1)],'#6f6a59',.05);
    for(let k=0;k<3;k++)r.rect(-w/2+1+k*.9,.1,.65,.8,['#f0e0b9','#8daba6','#d6947a'][k]);
    r.rect(w/2-1.3,-h/2+.7,.6,1.8,'#9b6c4e');
    for(let k=0;k<3;k++)r.circle(vec(w/2-1,-h/2+1+k*.55),.32,'#57734f');
  }
  if(prop.label==='MURAL DEL DRAC' && dragon.complete && dragon.naturalWidth)c.drawImage(dragon,-w/2+.5,-h/2+.5,w-1,h-1.8);
  if(prop.label.startsWith('MERCAT')) {
    for(let x=-w/2+2;x<w/2-1;x+=4) {r.rect(x,-h/2+1,2,h-3,'#7a9995','#ead4b2');r.rect(x+.2,-h/2+1.2,.3,h-3.4,'#c9d9be');}
  } else if(seed%3===0) {
    r.rect(w/2-1.5,-h/2+.6,.75,1.1,'#e5cfad','#a07959');r.rect(w/2-1.65,-h/2+.5,1.05,.24,'#f2d9b2');
  }
  c.restore();
  const fascia=h/2-.65;
  for(let x=-w/2+.65;x<w/2-.4;x+=1.7) {
    r.rect(x,fascia-.3,.65,.65,'#4b655d');r.rect(x-.1,fascia+.3,.85,.2,'#303e39');
    for(let rail=x-.05;rail<x+.7;rail+=.2)r.rect(rail,fascia+.15,.05,.35,'#415049');
  }
  if(prop.label && prop.label!=='PATI INTERIOR') {
    const awning=['#7e9480','#b56b56','#d4bc87'][seed%3];
    r.rect(-w/2+.35,h/2-.2,w-.7,.65,awning,'#e3cdab');
    for(let x=-w/2+.4;x<w/2-.4;x+=.7)r.rect(x,h/2-.2,.22,.65,'#f0dec15c');
    r.label(prop.label,0,h/2-.48,Math.min(.52,(w-.7)/(prop.label.length*.65)),'#f3dfb9','700');
  }
  c.restore();return true;
}
