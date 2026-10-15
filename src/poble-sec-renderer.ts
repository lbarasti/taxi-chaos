import dragonUrl from './assets/poble-dragon.svg';
import type { Renderer } from './renderer';
import { vec, type Vec } from './physics';
import type { PobleRoof } from './map/poble-sec';
import type { Prop } from './world';

const dragon = new Image(); dragon.src = dragonUrl;
function line(r: Renderer, points: readonly Vec[], color: string, width: number, closed = false) {
  const c = r.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  if (closed) c.closePath(); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function fill(r: Renderer, points: Vec[], color: string) {
  if (!points.length) return;
  const c = r.ctx; c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y));
  c.closePath(); c.fillStyle = color; c.fill();
}

export function drawPobleGround(r: Renderer) {
  const district = r.game.map.pobleSec; if (!district) return;
  const c = r.ctx;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  // Translucent outer bands merge the maintained park into the existing hillside.
  for (let width = 16; width > 0; width -= 2) line(r, district.park, '#82956808', width, true);
  fill(r, district.park, '#74885b80');
  // Long planted terraces give the hill a readable slope without changing physics.
  for (let v = 169; v < 230; v += 12) {
    line(r, [district.point(48,v),district.point(134,v-4)], '#4d633f', 2.5);
    line(r, [district.point(48,v-1.5),district.point(134,v-5.5)], '#a4a078', .5);
  }
  for (const garden of district.gardens) {
    line(r, garden, '#a7a17a', .6, true); fill(r, garden, '#596e48');
    // Low planting has no collision body; physical trees remain map-authored props.
    const center = garden.reduce((sum, p) => vec(sum.x + p.x / garden.length, sum.y + p.y / garden.length), vec());
    for (let i = 0; i < garden.length; i += 4) {
      const p = vec(garden[i].x * .8 + center.x * .2, garden[i].y * .8 + center.y * .2);
      r.circle(p, .85, i % 3 ? '#6e8657' : '#8a9461');
      r.circle(vec(p.x - .2, p.y - .2), .35, '#9c9e6d');
    }
  }
  line(r, district.promenade, '#aaa184', 4.8);
  line(r, district.promenade, '#c5b99a', 3.8);
  line(r, district.promenade, '#e1d1ae', .25);
  for (const path of district.paths) { line(r,path,'#536642',4.3); line(r,path,'#c2b08a',2.6); line(r,path,'#ddcba3',.4); }
  c.restore();
}

function drawPobleParcels(r: Renderer) {
  const district = r.game.map.pobleSec; if (!district) return;
  const c = r.ctx;
  // Fill each road-bounded parcel first, then cut rounded pavement islands out
  // of it. This keeps the acute and offset junctions continuously surfaced.
  for (const cell of district.cells) fill(r, cell.boundary, '#515859');
  for (const cell of district.cells) {
    if (!r.visible(cell.center, cell.radius)) continue;
    fill(r,cell.pavement,'#c5b9a0');
    fill(r,cell.courtyard,cell.plaza ? '#c2b69c' : '#746d60');
    if (!cell.plaza) continue;
    c.save();
    c.beginPath(); cell.pavement.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y)); c.closePath(); c.clip();
    c.translate(cell.center.x,cell.center.y); c.rotate(cell.angle);
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

function drawPobleApproaches(r: Renderer, layer: 'pavement' | 'asphalt') {
  const approaches = r.game.map.pobleSec?.approaches ?? [];
  for (const road of approaches) fill(r, road[layer], layer === 'pavement' ? '#b0ac90' : '#515859');
  if (layer === 'pavement') return;
  r.ctx.setLineDash([2.4, 3]);
  for (const road of approaches) line(r, road.centerline, '#ddcb8880', .16);
  r.ctx.setLineDash([]);
}

export function drawPobleStreets(r: Renderer) {
  const district = r.game.map.pobleSec; if (!district) return;
  const c=r.ctx; c.save(); c.lineCap='round'; c.lineJoin='round';
  const roads = district.streets;
  // Every connected curb must be painted before any carriageway. Otherwise
  // an urban end cap closes across the country-road mouth at the SE corner.
  drawPobleApproaches(r, 'pavement');
  for (const road of roads) line(r,road.points,'#d0c4ab',10.5);
  for (const road of roads) line(r,road.points,'#515859',8);
  drawPobleApproaches(r, 'asphalt');
  for (const junction of district.junctions) {
    fill(r, junction.pavement, '#515859');
    fill(r, junction.asphalt, '#515859');
    line(r, junction.curb, '#d0c4ab', 1.25);
  }
  // Draw the rounded inner curbs after the road strokes so no straight stroke
  // can close a corner cut or leave an isolated asphalt sliver behind it.
  drawPobleParcels(r);
  c.lineCap='butt';
  for (const crossing of district.crossings) {
    if (!r.visible(crossing.position, 20)) continue;
    c.save(); c.translate(crossing.position.x, crossing.position.y); c.rotate(crossing.angle);
    for (let y = -3.2; y < 3.5; y += 1.2) r.rect(7.2, y, 2.1, .65, '#e0d9bd');
    c.restore();
  }
  for (const road of roads) {
    const a=road.points[0],b=road.points.at(-1)!;
    if (!r.visible(a,40))continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    if(road.id.startsWith('poble-east-') && road.id.endsWith('-1')) {
      const p=road.points[Math.floor(road.points.length/2)];
      c.save();c.translate(p.x,p.y);c.rotate(angle);r.label(road.name.toUpperCase(),0,-.2,.63,'#bcc0b2','500');c.restore();
    }
  }
  c.restore();
}

export function drawPobleProp(r: Renderer, prop: Prop): boolean {
  if (!prop.sourceId?.startsWith('poble-')) return false;
  if (prop.sourceId.startsWith('poble-lot-')) return true;
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
  c.restore(); return false;
}

function roofPath(c: CanvasRenderingContext2D, roof: PobleRoof) {
  c.beginPath();roof.outline.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
}

export function drawPobleBuildings(r: Renderer) {
  for (const roof of r.game.map.pobleSec?.roofs ?? []) {
    if (!r.visible(roof.position, Math.hypot(roof.w,roof.h))) continue;
    drawTenement(r,roof);
  }
}

function drawTenement(r: Renderer, roof: PobleRoof) {
  const c=r.ctx,w=roof.w,h=roof.h;
  let seed=2166136261;
  for(const letter of roof.id) seed=Math.imul(seed^letter.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  c.save();c.translate(roof.position.x,roof.position.y);c.rotate(roof.angle);
  // One shadow per assembled volume; adjoining plots share their party walls.
  c.save();c.translate(1.1+random()*.6,1.8+random()*1.6);roofPath(c,roof);c.fillStyle='#242c2c80';c.fill();c.restore();
  roofPath(c,roof);c.fillStyle=roof.style==='terrace'?'#9e8974':roof.color;c.fill();
  c.strokeStyle='#655c504f';c.lineWidth=.13;c.stroke();
  c.save();roofPath(c,roof);c.clip();
  if(roof.style==='tile') {
    // Unequal roof pitches, subdued tile courses and occasional repaired patches.
    const ridge=(random()-.5)*Math.min(w,h)*.4;
    if(w>h) {
      r.rect(-w/2,-h/2,w,h/2+ridge,'#e1b39220');
      r.rect(-w/2,ridge,w,h/2-ridge,'#4d342526');
      for(let y=-h/2;y<h/2;y+=.22) {
        r.rect(-w/2,y,w,.025,'#503b302c');
        for(let x=-w/2+(Math.round(y*20)%2)*.17;x<w/2;x+=.48)r.rect(x,y,.025,.17,'#e7bd9b1c');
      }
      r.rect(-w/2,ridge-.07,w,.14,'#c29b79');
    } else {
      r.rect(-w/2,-h/2,w/2+ridge,h,'#e1b39220');r.rect(ridge,-h/2,w/2-ridge,h,'#4d342526');
      for(let x=-w/2;x<w/2;x+=.23)r.rect(x,-h/2,.03,h,'#503b302a');
      r.rect(ridge-.07,-h/2,.14,h,'#c29b79');
    }
    if(random()<.3)r.rect(-w*.25,-h*.25,w*.35,h*.25,'#8c79684d');
  } else if(roof.style==='industrial'||roof.style==='workshop') {
    r.rect(-w/2,-h/2,w,h,roof.style==='industrial'?'#a39d8b':'#b1aaa0');
    for(let x=-w/2;x<w/2;x+=.5)r.rect(x,-h/2,.045,h,'#6d71664d');
  } else {
    r.rect(-w/2+.3,-h/2+.3,w-.6,h-.6,'#b5a087');
    for(let y=-h/2;y<h/2;y+=1.15)r.rect(-w/2,y,w,.03,'#6c5d4c36');
    for(let x=-w/2;x<w/2;x+=1.2)r.rect(x,-h/2,.03,h,'#6c5d4c26');
    // Enclosed stair head and the occasional green waterproofed rear terrace.
    r.rect(-w/2+.4,-h/2+.4,Math.min(2.2,w*.4),Math.min(2,h*.4),'#c1b099','#6f6656');
    if(random()<.25)r.rect(w*.05,-h*.3,w*.38,h*.6,'#647969');
  }
  // Rooflights follow long structural bays rather than repeating one HVAC icon.
  if((random()<.42||roof.style==='industrial')&&w>3&&h>3) {
    const horizontal=w>h,sw=horizontal?Math.min(w*.65,6):1.1,sh=horizontal?1.1:Math.min(h*.6,5);
    r.rect(-sw/2+.15,-sh/2+.2,sw,sh,'#4d5352');
    r.rect(-sw/2,-sh/2,sw,sh,'#a1aaa3','#c2c4b5');
    r.rect(-sw/2+.1,-sh/2+.1,sw-.2,sh-.2,'#687f7e');
    for(let t=.6;t<(horizontal?sw:sh);t+=.8)r.rect(horizontal?-sw/2+t:-sw/2,horizontal?-sh/2:-sh/2+t,horizontal?.06:sw,horizontal?sh:.06,'#c3c9bd');
  }
  if(w>3&&h>3&&random()<.55) {
    const x=(random()-.5)*(w-2),y=(random()-.5)*(h-2);
    r.rect(x-.4,y-.5,.95,1.05,'#51483f4d');r.rect(x-.5,y-.8,.8,1,'#b6a08a');
    r.rect(x-.6,y-.87,1,.18,'#d0b89b');r.rect(x-.32,y-.7,.4,.25,'#585247');
  }
  if(roof.mural&&dragon.complete&&dragon.naturalWidth)c.drawImage(dragon,-w*.35,-h*.35,w*.7,h*.7);
  // Sparse stains and wear are seeded by stable parcel identity.
  for(let i=0;i<22;i++) {
    c.globalAlpha=.025+random()*.045;
    r.rect((random()-.5)*w,(random()-.5)*h,.1+random()*.5,.1+random()*.35,i%2?'#eee0c9':'#473f35');
  }
  c.globalAlpha=1;
  c.restore();c.restore();
}
