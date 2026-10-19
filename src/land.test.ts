import { describe, expect, it } from 'vitest';
import { compileLand, directedWaterGap } from './land';
import { add, scale, vec, type Vec } from './physics';
const region=(id: string,outline: Vec[])=>({id,owner:'any-owner',outline});
const box=(x: number,y: number,w=10,h=10)=>[vec(x,y),vec(x+w,y),vec(x+w,y+h),vec(x,y+h)];

describe('generic land union',()=>{
  it('handles concavity, opposite winding, crossing and collinear overlaps',()=>{
    const land=compileLand([
      region('arbitrary',box(0,0)),
      region('other',box(5,0).reverse()),
      region('concave',[vec(20,0),vec(30,0),vec(30,10),vec(25,10),vec(25,5),vec(20,5)]),
    ]);
    expect(land.bounds).toEqual({min:vec(0,0),max:vec(30,10)});
    expect(land.onLand(vec(12,5))).toBe(true);
    expect(land.inOcean(vec(22,8))).toBe(true);
    expect(land.onLand(vec(25,8))).toBe(true);
    // The internal x=5 and x=10 overlap seams never appear as coast.
    expect(land.landBoundaries.filter(e=>e.a.x===e.b.x&&[5,10].includes(e.a.x))).toEqual([]);
    for(const edge of land.landBoundaries) {
      const mid=scale(add(edge.a,edge.b),.5);
      expect(land.inOcean(add(mid,scale(edge.normal,.05)))).toBe(true);
      expect(land.onLand(add(mid,scale(edge.normal,-.05)))).toBe(true);
    }
  });
  it('keeps valid thin polygons and narrow water channels observable',()=>{
    const land=compileLand([region('thin',[vec(0,0),vec(100,0),vec(100.2,.01),vec(.2,.01)]),region('nearby',box(0,.02,100,10))]);
    expect(land.regionContains('thin',vec(50,.005))).toBe(true);
    expect(land.inOcean(vec(50,.015))).toBe(true);
    expect(directedWaterGap(land,'thin','nearby',vec(0,1),1)).toBeCloseTo(.01);
    expect(land.landBoundaries.filter(e=>e.sources.some(s=>s.landId==='thin'))).toHaveLength(4);
  });
  it('retains multiple source identities on one coincident union boundary',()=>{
    const land=compileLand([region('one',box(0,0)),region('two',box(0,0).reverse())]);
    expect(land.landBoundaries).toHaveLength(4);
    expect(land.landBoundaries.every(e=>e.sources.length===2)).toBe(true);
  });
  it('measures arbitrary source/target IDs and rejects occluded or unobservable gaps',()=>{
    const from=region('source',box(0,0)),to=region('target',box(0,30));
    const land=compileLand([from,to]);
    expect(directedWaterGap(land,'source','target',vec(0,1),1)).toBe(20);
    expect(directedWaterGap(land,'target','source',vec(0,-1),1)).toBe(20);
    expect(directedWaterGap(land,'source','target',vec(0,-1),1)).toBeNull();
    const occluded=compileLand([from,to,region('occluder',box(-5,15,20,5))]);
    expect(directedWaterGap(occluded,'source','target',vec(0,1),1)).toBeNull();
    const covered=compileLand([from,to,region('cover',box(-5,-5,20,20))]);
    expect(directedWaterGap(covered,'source','target',vec(0,1),1)).toBeNull();
  });
});
