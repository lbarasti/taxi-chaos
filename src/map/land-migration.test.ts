import { describe, expect, it } from 'vitest';
import { copyDefaultMap } from './default';
import { compileMap, defaultCompiledMap } from './compile';
import { MapHistory } from './operations';
import { exportMap, importMap, revision } from './serialization';
import { assertMap } from './schema';
import { validateMap } from './validation';
import { World } from '../world/world';
import { boundaryHasSource, directedWaterGap } from '../world/land';
import { add, scale, vec } from '../physics/physics';

function physics(world: World) {
  return world.props.map(p=>[p.id,p.kind,p.body.position,p.body.w,p.body.h,p.body.angle,p.color,p.label,p.hp]);
}

describe('canonical land migration acceptance',()=>{
  it('generates identical geometry and residents from identical current documents',()=>{
    const a=new World(compileMap(copyDefaultMap())),b=new World(compileMap(copyDefaultMap()));
    expect(physics(a)).toEqual(physics(b));
    expect(a.people).toEqual(b.people);
  });
  it('renames every original land ID using data references alone',()=>{
    const doc=copyDefaultMap();
    const names=new Map(doc.landRegions.map((r,i)=>[r.id,`anonymous-${i}`]));
    const rename=(id: string)=>names.get(id)!;
    doc.landRegions.forEach(r=>r.id=rename(r.id));
    for(const e of [...doc.landPresentation,...doc.surf,...doc.boundaryPlacements])e.land=rename(e.land);
    doc.boundaryPlacements.forEach(r=>r.excludeLand=r.excludeLand.map(rename));
    for(const c of doc.constraints) {c.fromLand=rename(c.fromLand);c.toLand=rename(c.toLand);}
    for(const key of ['cityLand','countryLand','harbourLand'] as const)doc.generation[key]=rename(doc.generation[key]);
    doc.generation.bridgeLands=doc.generation.bridgeLands.map(rename);
    const map=compileMap(doc),original=defaultCompiledMap;
    expect(map.land.landRegions.map(r=>r.outline)).toEqual(original.land.landRegions.map(r=>r.outline));
    expect(map.land.landBoundaries.map(({sources,...e})=>({...e,sources:sources.map(s=>({...s,landId:[...names].find(([,name])=>name===s.landId)![0]}))}))).toEqual(original.land.landBoundaries);
    expect(physics(new World(map))).toEqual(physics(new World(original)));
    expect(map.harbour.inHarbour(vec(100,-40))).toBe(true);
    expect(map.country.inHighlands(vec(170,490))).toBe(true);
    expect(validateMap(doc,map).errors).toBe(0);
    expect(new World(map).navigation.roadPath(vec(204,44),vec(350,100))).toEqual(new World(original).navigation.roadPath(vec(204,44),vec(350,100)));
  });
  it('creates no implicit objects, effects, surface or vehicle access when land is added',()=>{
    const doc=copyDefaultMap();
    doc.landRegions.push({id:'unadorned',owner:'highlands',outline:[vec(-35,-90),vec(20,-90),vec(20,-45),vec(-35,-45)]});
    const map=compileMap(doc);
    expect(map.land.onLand(vec(-20,-60))).toBe(true);
    expect(map.boundaryPlacements).toEqual(defaultCompiledMap.boundaryPlacements);
    expect(map.presentation.shorelines).toEqual(defaultCompiledMap.presentation.shorelines);
    expect(map.presentation.ground.some(p=>p.land==='unadorned')).toBe(false);
    expect(map.terrain.sample(vec(-20,-60))).toBe('road');
    const world=new World(map);
    expect(world.navigation.access.areaAt(vec(-20,-60))).toBeUndefined();
    expect(world.props).toHaveLength(new World(defaultCompiledMap).props.length);
  });
  it('removes ground appearance and surf without changing coverage or collision bodies',()=>{
    const doc=copyDefaultMap();doc.landPresentation=[];doc.surf=[];
    const map=compileMap(doc);
    expect(map.presentation.ground).toEqual([]);expect(map.presentation.shorelines).toEqual([]);
    expect(map.land.landBoundaries).toEqual(defaultCompiledMap.land.landBoundaries);
    expect(physics(new World(map))).toEqual(physics(new World(defaultCompiledMap)));
    expect(validateMap(doc,map).errors).toBe(0);
  });
  it('shares weighted seams with land, attached panels and presentation, with pinned bridges and independent access endpoints',()=>{
    const doc=copyDefaultMap();
    doc.points.find(p=>p.id==='shore-17')!.weight=.5;
    doc.surf.push({id:'estate-surf',owner:'southern-estates',land:doc.generation.countryLand,edges:[16,17]});
    doc.accessNodes.push({id:'seam-walk-a',owner:'southern-estates',position:vec(140,430),road:false},{id:'seam-walk-b',owner:'highlands',position:vec(145,430),road:false});
    const edge={id:'seam-walk',owner:'southern-estates',fromNode:'seam-walk-a',toNode:'seam-walk-b',modes:['walk' as const]};doc.accessEdges.push(edge);
    const history=new MapHistory(doc),before=history.export();
    const result=history.apply({baseRevision:history.snapshot().revision,operations:[{type:'translate',targetId:'southern-estates',delta:vec(0,20)},{type:'envelope',min:vec(-50,-180),max:vec(540,600)}]});
    const moved=history.snapshot().document,map=compileMap(moved);
    const region=map.land.landRegions.find(r=>r.id===doc.generation.countryLand)!;
    expect(region.outline[17]).toEqual(add(doc.points.find(p=>p.id==='shore-17')!.position,vec(0,10)));
    expect(map.presentation.ground.find(p=>p.land===region.id)!.region).toBe(region);
    expect(map.country.HIGHLAND_OUTLINE).toBe(region.outline);
    expect(moved.points.filter(p=>!p.editable)).toEqual(doc.points.filter(p=>!p.editable));
    expect(moved.accessNodes.find(p=>p.id==='seam-walk-a')!.position).toEqual(vec(140,450));
    expect(moved.accessNodes.find(p=>p.id==='seam-walk-b')!.position).toEqual(vec(145,430));
    expect(moved.accessEdges.find(p=>p.id===edge.id)).toEqual(edge);
    expect(result.changedIds).toContain(region.id);expect(result.changedIds).toContain('estate-surf');
    const panel=map.boundaryPlacements.find(p=>p.id==='shore-panels-1-edge-17-slot-1')!;
    const boundary=map.land.landBoundaries.find(e=>boundaryHasSource(e,region.id,17))!;
    expect(panel.position.y).toBeCloseTo(add(add(region.outline[17],scale({x:region.outline[18].x-region.outline[17].x,y:region.outline[18].y-region.outline[17].y},1.5/Math.ceil(Math.hypot(region.outline[18].x-region.outline[17].x,region.outline[18].y-region.outline[17].y)/8))),scale(boundary.normal,-.9)).y);
    const after=history.export();expect(exportMap(importMap(after))).toBe(after);
    history.undo();expect(history.export()).toBe(before);history.redo();expect(history.export()).toBe(after);
    expect(()=>history.apply({baseRevision:revision(doc),operations:[{type:'delete',targetId:'estate-surf'}]})).toThrow(/Stale/);
  });
  it('uses every exposed region, including bridge decks, as a source and target without an ID whitelist',()=>{
    for(const r of defaultCompiledMap.land.landRegions) {
      const boundary=defaultCompiledMap.land.landBoundaries.find(e=>boundaryHasSource(e,r.id))!;
      expect(boundary).toBeDefined();
      const source=scale(add(boundary.a,boundary.b),.5), center=add(source,scale(boundary.normal,15));
      const doc=copyDefaultMap(),target='gap-observer';
      doc.landRegions.push({id:target,owner:'highlands',outline:[add(center,vec(-1,-1)),add(center,vec(1,-1)),add(center,vec(1,1)),add(center,vec(-1,1))]});
      doc.constraints=[{id:'generic-gap',type:'water-gap',fromLand:r.id,toLand:target,direction:boundary.normal,minimum:1,resolution:.5}];
      assertMap(doc);
      const map=compileMap(doc),gap=directedWaterGap(map.land,r.id,target,boundary.normal,.5);
      expect(gap).not.toBeNull();expect(Number.isFinite(gap)).toBe(true);
      doc.constraints[0]={...doc.constraints[0],fromLand:target,toLand:r.id,direction:scale(boundary.normal,-1)};
      assertMap(doc);
      expect(directedWaterGap(map.land,target,r.id,scale(boundary.normal,-1),.5)).not.toBeNull();
    }
  });
  it('rejects old schemas, missing references, oversized rules and duplicate boundary sources atomically',()=>{
    const doc=copyDefaultMap(),history=new MapHistory(doc),before=history.export();
    expect(()=>importMap(JSON.stringify({...doc,schemaVersion:4}))).toThrow(/unsupported schema/);
    expect(()=>history.apply({baseRevision:history.snapshot().revision,operations:[{type:'replace',targetId:doc.surf[0].id,descriptor:{...doc.surf[0],land:'missing'}}]})).toThrow(/unknown land/);
    expect(history.export()).toBe(before);
    const over=copyDefaultMap();over.boundaryPlacements=Array.from({length:20},(_,i)=>({...doc.boundaryPlacements[1],id:`too-many-${i}`}));
    expect(()=>assertMap(over)).toThrow(/workload/);
    const duplicate=copyDefaultMap();Object.assign(duplicate.landRegions[1],{outline:[vec(),vec(1,0),vec(1,1)]});
    expect(()=>assertMap(duplicate)).toThrow(/exactly one/);
  });
});

describe('shared land authoring',()=>{
  it('describes ownership and duplicates a shared ring without moving the original',()=>{
    const history=new MapHistory(),before=history.export(),doc=history.snapshot().document;
    const id=doc.generation.countryLand,description=history.describe(id);
    expect(description.kind).toBe('land');
    expect(description.seams.map(s=>s.id)).toContain('shore-17');
    expect(description.bounds).toEqual(defaultCompiledMap.land.landRegions.find(r=>r.id===id)!.outline.reduce((b,p)=>({min:vec(Math.min(b.min.x,p.x),Math.min(b.min.y,p.y)),max:vec(Math.max(b.max.x,p.x),Math.max(b.max.y,p.y))}),{min:vec(Infinity,Infinity),max:vec(-Infinity,-Infinity)}));
    history.apply({baseRevision:history.snapshot().revision,operations:[{type:'duplicate',targetId:id,newId:'duplicate-ring',delta:vec(1,0)}]});
    const next=history.snapshot().document,copy=next.landRegions.find(r=>r.id==='duplicate-ring')!;
    expect(next.points.filter(p=>doc.points.some(old=>old.id===p.id))).toEqual(doc.points);
    expect('pointRefs' in copy&&copy.pointRefs.every(id=>id.startsWith('duplicate-ring-point-'))).toBe(true);
    const after=history.export();history.undo();expect(history.export()).toBe(before);history.redo();expect(history.export()).toBe(after);
    expect(history.describe(doc.generation.cityLand).editable).toBe(false);
    expect(()=>history.apply({baseRevision:history.snapshot().revision,operations:[{type:'move',targetId:doc.generation.cityLand,position:vec(50,50)}]})).toThrow(/read-only/);
  });
});

describe('one current map contract',()=>{
  it('rejects removed prop collections and untyped placements instead of adapting them',()=>{
    const doc=copyDefaultMap();
    for(const field of ['countryProps','coastalPlacements'])expect(()=>assertMap({...doc,[field]:[]})).toThrow(/expected fields/);
    const {type,...untyped}=doc.objectPlacements[0];
    expect(()=>assertMap({...doc,objectPlacements:[untyped]})).toThrow(/expected fields/);
  });
  it('samples an explicitly selected current source region without consulting shipped land',()=>{
    const doc=copyDefaultMap();
    doc.landRegions.push({id:'new-forest',owner:'highlands',outline:[vec(-40,-90),vec(20,-90),vec(20,-45),vec(-40,-45)]});
    doc.generation.countryLand='new-forest';doc.generation.candidates=100;
    const map=compileMap(doc),a=new World(map),b=new World(compileMap(doc));
    const forest=a.props.filter(p=>!p.sourceId&&p.kind==='tree'&&map.country.inHighlands(p.body.position));
    expect(forest.length).toBeGreaterThan(0);
    expect(forest.every(p=>p.body.corners().every(map.land.onLand))).toBe(true);
    expect(physics(a)).toEqual(physics(b));
  });
});
