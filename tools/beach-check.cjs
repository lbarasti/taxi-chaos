// Production QA: PLAYWRIGHT_PATH and CHROMIUM_PATH may override local browser dependencies.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs'), assert=require('node:assert/strict'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const screenshotRoot=process.env.SCREENSHOT_DIR || path.join(root,'scenario-runs/beach');
(async()=>{
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
await page.goto('file://'+root+'/dist/index.html?debug=1');await page.waitForFunction(()=>!!window.__taxi);
await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.__taxi);
fs.mkdirSync(screenshotRoot,{recursive:true});
const setup=async(name,hour=14)=>page.evaluate(({name,hour})=>{__taxi.scenario(name);__taxi.dayNight({hour,frozen:true});__taxi.close();document.querySelector('#debug-panel').hidden=true;__taxi.step(0);}, {name,hour});
const snap=async name=>page.screenshot({path:path.join(screenshotRoot,name+'.png')});
const step=async(seconds,keys=[])=>page.evaluate(({seconds,keys})=>__taxi.step(seconds,keys),{seconds,keys});
await setup('beach');await snap('beach');
const speeds={};
for(const name of ['beach','beach-pickup']){
await setup(name);await page.evaluate(()=>__taxi.teleport(64,249,0,0));
let state=await step(3,['KeyW']);assert.equal(state.surface,'sand');assert.equal(state.health,100);assert.equal(state.mode,'playing');speeds[name]=state.speed;
if(name==='beach-pickup')await snap('pickup-ruts');
}
assert(speeds['beach-pickup']>speeds.beach*2);console.log('Sand acceleration after 3s (m/s)',speeds);
await setup('beach');await page.evaluate(()=>__taxi.teleport(28,253,0,0));
assert(await page.evaluate(()=>__taxi.interact()));
// Walk around the abandoned cab, then enter the real parked pickup.
await step(0.6,['KeyD']);await step(1,['KeyW']);
assert(await page.evaluate(()=>__taxi.interact()));assert.equal(await page.evaluate(()=>__taxi.state().vehicleModel),'pickup');
await page.evaluate(()=>__taxi.teleport(90,240,0,16));assert(await page.evaluate(()=>__taxi.interact()));
const door=await step(0.14);assert(door.exitPending);await snap('pickup-exit');const landing=await step(0.45);assert(landing.onFoot);assert(landing.tumble);assert(landing.driverHealth<100);
await setup('beach');await page.evaluate(()=>__taxi.configure({invincible:true}));
for(const kind of ['lifeguard-tower','parasol','beach-chair','sandcastle']){
const target=await page.evaluate(kind=>__taxi.props().find(p=>p.kind===kind&&p.alive),kind);
await page.evaluate(({kind,target})=>{
const gap=kind==='lifeguard-tower'?5.3:kind==='parasol'?4.7:kind==='beach-chair'?3.5:3.8;
__taxi.teleport(target.position.x-gap,target.position.y,0,26);
},{kind,target});
await step(0.4);
assert.equal(await page.evaluate(id=>__taxi.props().find(p=>p.id===id).alive,target.id),false,kind+' must break from a physical ram');
}
await page.evaluate(()=>__taxi.teleport(35,260,0,0));await snap('destruction');
await setup('promenade');const before=await page.evaluate(()=>__taxi.state().position);const walked=await step(2,['KeyD']);
assert(walked.position.x>before.x+8);assert.equal(walked.surface,'paving');assert.equal(walked.driverHealth,100);await snap('promenade');
// Each run begins with one placement; all surface transitions use real throttle.
const driveAcrossHotelBeach=async(name,x,returning=false)=>{
await setup(name);await page.evaluate(({x,returning})=>__taxi.teleport(x,returning?265:243.5,returning?-Math.PI/2:Math.PI/2,0),{x,returning});
const surfaces=new Set();let state;
for(let i=0;i<120;i++){
state=await step(0.1,['KeyW']);surfaces.add(state.surface);
if(returning?state.position.y<243.5:state.position.y>263)break;
}
assert(returning?state.position.y<243.5:state.position.y>263,`${name}: hotel beach crossing blocked`);
assert.deepEqual([...surfaces].sort(),['paving','road','sand']);assert.equal(state.health,100);assert.equal(state.mode,'playing');
return state;
};
for(const name of ['beach','beach-pickup'])for(const x of [180.675,220.675])for(const returning of [false,true]){
await driveAcrossHotelBeach(name,x,returning);
if(name==='beach'&&x===180.675&&!returning)await snap('hotel-sand-desktop');
}
// The open promenade still stops the taxi at the real hotel wall.
await setup('beach');await page.evaluate(()=>__taxi.teleport(200.675,243.5,Math.PI/2,0));
const wall=await step(4,['KeyW']);assert(wall.position.y>251&&wall.position.y<258);
await snap('hotel-wall');
await setup('beach-pickup');await page.evaluate(()=>__taxi.teleport(64,270,Math.PI/2,25));const drowned=await step(3);assert.equal(drowned.mode,'wasted');assert.equal(drowned.wastedReason,'drowning');assert.equal(drowned.explosions,0);await snap('surf-sinking');
await setup('promenade',22);await snap('promenade-night');
for(const [name,width,height] of [['mobile',390,844],['small-mobile',320,568],['landscape',844,390]]){
await page.setViewportSize({width,height});await driveAcrossHotelBeach('beach',180.675);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap(name);
}
// Sustained mobile sand driving: queue size and canvas stroke count stay bounded.
await page.setViewportSize({width:390,height:844});await setup('beach-pickup');
await page.evaluate(()=>__taxi.configure({invincible:true}));
for(let lap=0;lap<12;lap++){
await page.evaluate(()=>__taxi.teleport(36,253,0,8));await step(5,['KeyW']);
}
const perf=await page.evaluate(()=>{
const proto=CanvasRenderingContext2D.prototype,original=proto.stroke;let sandStrokes=0;
proto.stroke=function(...args){if(this.strokeStyle==='#a88d5f')sandStrokes++;return original.apply(this,args);};
const started=performance.now();for(let i=0;i<120;i++)__taxi.step(0);
proto.stroke=original;return {averageFrameMs:(performance.now()-started)/120,sandStrokesPerFrame:sandStrokes/120};
});
assert(perf.sandStrokesPerFrame>0&&perf.sandStrokesPerFrame<=4);console.log('60s mobile sand run / 120 render samples',perf);
// Preserve both primary fare cues while on sand, for cab and pickup.
for(const name of ['beach','beach-pickup']){
await setup(name);await page.evaluate(()=>__taxi.teleport(64,253,0,0));await step(0);
assert.equal(await page.locator('.navigation-hud').getAttribute('data-target'),'pickup');
const pickup=await page.evaluate(()=>__taxi.state().job.pickup);
await page.evaluate(p=>__taxi.teleport(p.x,p.y,0,0),pickup);await step(1);
assert.equal(await page.evaluate(()=>__taxi.state().job.stage),'dropoff');
await page.evaluate(()=>__taxi.teleport(64,253,0,0));await step(0);
assert.equal(await page.locator('.navigation-hud').getAttribute('data-target'),'delivery');
}
assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')),'production must be self-contained');
console.log('PASS: sand/pickup acceleration, real pickup entry, pickup door/jump/landing, four destructible classes, promenade walking, eight physical street/paving/hotel-sand crossings, solid hotel wall, surf death, night, three mobile viewports, 60s mobile sand rendering and preserved fare cues; offline with no page errors');
await page.evaluate(()=>__taxi.realtime());await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
