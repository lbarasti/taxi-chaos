import { describe, expect, it } from 'vitest';
import { clipLand, drawLandGround, drawTerrainMiniMap } from './terrain-renderer';
import { compileMap } from '../map/compile';
import { copyDefaultMap } from '../map/default';
import { contains } from '../world/regions';
import { vec, type Vec } from '../physics';

/** Records real Canvas paths; polygon/overlap semantics can be checked in Node
 * even when a provisioned browser is unavailable. */
function context() {
  let path: Vec[][]=[];
  const clips: Vec[][][]=[],fills: Vec[][][]=[];
  const c={beginPath(){path=[];},moveTo(x:number,y:number){path.push([vec(x,y)]);},lineTo(x:number,y:number){path.at(-1)!.push(vec(x,y));},closePath(){},clip(){clips.push(structuredClone(path));},fill(){fills.push(structuredClone(path));},save(){},restore(){},fillRect(){},fillStyle:''};
  return {c:c as unknown as CanvasRenderingContext2D,clips,fills};
}
function composed() {
  const document=copyDefaultMap();
  // Concave land and an opposite-wound overlap, with arbitrary IDs.
  document.landRegions.push({id:'bend',owner:'highlands',outline:[vec(-40,-90),vec(10,-90),vec(10,-70),vec(-20,-70),vec(-20,-40),vec(-40,-40)]},{id:'overlap',owner:'highlands',outline:[vec(-30,-85),vec(-30,-55),vec(0,-55),vec(0,-85)]});
  return compileMap(document);
}
describe('canonical land drawing',()=>{
  it('clips world and minimap terrain with the complete polygon union and normalized winding',()=>{
    const map=composed(),a=context(),b=context();
    clipLand(a.c,map);drawTerrainMiniMap(b.c,map);
    expect(b.clips[0]).toEqual(a.clips[0]);
    const rings=a.clips[0];expect(rings).toHaveLength(map.land.landRegions.length);
    for(const ring of rings)expect(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-p.y*q.x;},0)).toBeGreaterThan(0);
    for(const p of [vec(-25,-75),vec(-10,-60),vec(5,-60),vec(5,-80),vec(20,-40),vec(276,80),vec(276,120)]) {
      expect(rings.some(r=>contains(r,p))).toBe(map.land.onLand(p));
    }
  });
  it('paints each canonical ring and clips every optional ground appearance to its own polygon',()=>{
    const map=composed(),{c,fills,clips}=context();drawLandGround(c,map);
    expect(fills.map(rings=>rings[0])).toEqual(map.land.landRegions.map(r=>r.outline));
    expect(clips.map(rings=>rings[0])).toEqual(map.presentation.ground.map(p=>p.region.outline));
    expect(map.land.inOcean(vec(5,-60))).toBe(true);
  });
});
