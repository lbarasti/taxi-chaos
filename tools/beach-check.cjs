// Production QA: PLAYWRIGHT_PATH and CHROMIUM_PATH may override local browser dependencies.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs'), assert=require('node:assert/strict'), path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
await page.goto('file://'+root+'/dist/index.html?debug=1');await page.waitForFunction(()=>!!window.__taxi);
await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.__taxi);
fs.mkdirSync(root+'/docs/screenshots/beach',{recursive:true});
const setup=async(name,hour=14)=>page.evaluate(({name,hour})=>{__taxi.scenario(name);__taxi.dayNight({hour,frozen:true});__taxi.close();document.querySelector('#debug-panel').hidden=true;__taxi.step(0);}, {name,hour});
const snap=async name=>page.screenshot({path:root+'/docs/screenshots/beach/'+name+'.png'});
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
assert(walked.position.x>before.x+8);assert.equal(walked.surface,'promenade');assert.equal(walked.driverHealth,100);await snap('promenade');
await setup('beach');await page.evaluate(()=>__taxi.teleport(200.675,243.5,Math.PI/2,0));const stopped=await step(3,['KeyW','ShiftLeft']);assert(stopped.position.y<247);assert.equal(stopped.surface,'road');
await setup('beach-pickup');await page.evaluate(()=>__taxi.teleport(64,270,Math.PI/2,25));const drowned=await step(3);assert.equal(drowned.mode,'wasted');assert.equal(drowned.wastedReason,'drowning');assert.equal(drowned.explosions,0);await snap('surf-sinking');
await setup('promenade',22);await snap('promenade-night');
for(const [name,width,height] of [['mobile',390,844],['small-mobile',320,568],['landscape',844,390]]){
await page.setViewportSize({width,height});await setup('promenade');await step(0.5,['KeyD']);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap(name);
}
assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')),'production must be self-contained');
console.log('PASS: sand/pickup acceleration, real pickup entry, pickup door/jump/landing, four destructible classes, promenade walking/vehicle exclusion, surf death, night and three mobile viewports; offline with no page errors');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
