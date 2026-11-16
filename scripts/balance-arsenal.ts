import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { version } from "../package.json";
import { chooseShot, fireAIShot } from "../src/game/ai";
import { chooseSupplyMove } from "../src/game/ai-movement";
import { DEFAULT_SETTINGS, PROFILE_IDS, WORLD } from "../src/game/config";
import { Match } from "../src/game/match";
import { ARSENAL, WEAPONS } from "../src/game/weapons";
function sample(arsenal: boolean) {
  let turns=0, games=0, unresolved=0, oneShots=0, shields=0, bounces=0, fireIntervals=0, maxResolutionSeconds=0;
  const decisions: number[]=[];
  const weapons=Object.fromEntries(WEAPONS.map(w=>[w.id,0]));
  for(const profile of PROFILE_IDS) for(const theme of ["green","desert","moon"] as const) for(const seed of [284,912]) {
    const m=new Match({...DEFAULT_SETTINGS,players:3,profile,theme,supplies:true,environmentalEvents:true},seed);
    if(!arsenal) m.tanks.forEach(t=>t.shieldCharges=0);
    for(let turn=0;turn<120 && m.phase!=="over";turn++) {
      for(let i=0;i<96;i++) m.tick();
      const route=chooseSupplyMove(m);
      if(route) for(let i=0;i<90;i++) {
        if(route.supplyId==="hazard" ? Math.abs(m.current.x-route.targetX)<5 : m.supplies.find(s=>s.id===route.supplyId)?.state!=="landed") break;
        if(!m.move(route.direction,1/60)) break;
        m.tick(1/60);
      }
      if(!arsenal) for(const t of m.tanks) for(const w of WEAPONS.slice(6)) t.ammo[w.id]=0;
      const health=m.tanks.map(t=>t.health);
      m.events.length=0;
      const started=performance.now(), shot=chooseShot(m);
      decisions.push(performance.now()-started);
      assert(fireAIShot(m,shot));
      if(shot.shield) shields++; else weapons[shot.weapon]++;
      let ticks=0;
      while((["flight","settle","warning"] as string[]).includes(m.phase) && ticks++<2600) m.tick();
      assert(ticks<2600,"Action must resolve in bounded simulation time");
      maxResolutionSeconds=Math.max(maxResolutionSeconds,ticks*WORLD.step);
      bounces+=m.events.filter(e=>e.type==="bounce").length;
      for(const tank of m.tanks) {
        const damage=m.events.filter(e=>e.type==="damage" && e.id===tank.id).reduce((sum,e)=>sum+(e.type==="damage"?e.amount:0),0);
        const absorbed=m.events.filter(e=>e.type==="shield" && e.action==="absorb" && e.id===tank.id).reduce((sum,e)=>sum+(e.type==="shield"?e.amount:0),0);
        assert(damage+absorbed<=Math.max(12,health[tank.id]*WORLD.maxAttackDamageRatio)+ARSENAL.fireDamage+0.001);
        oneShots+=Number(health[tank.id]===100 && tank.health<=0);
      }
      fireIntervals+=m.events.filter(e=>e.type==="damage" && e.burn).length;
    }
    games++; turns+=m.turn; unresolved+=Number(m.phase!=="over");
  }
  decisions.sort((a,b)=>a-b);
  return {games,meanTurns:turns/games,unresolved,oneShots,shields,bounces,fireDamageEvents:fireIntervals,maxResolutionSeconds,
    decisions:decisions.length,meanDecisionMs:decisions.reduce((a,b)=>a+b,0)/decisions.length,p95DecisionMs:decisions[Math.floor(decisions.length*.95)],weapons};
}
const report={version,methodology:"24 paired three-tank Normal-AI matches per ruleset: four profiles, three themes, two seeds; shared physics, legal movement, supplies and events. Legacy arsenal disables the four new rounds and shields. All incoming damage including shield absorption plus a separate maximum-five persistent interval is audited per action. Desktop CPU timings; no physical-device or human-play claims.",legacy:sample(false),arsenal:sample(true)};
assert.equal(report.arsenal.unresolved,0); assert.equal(report.arsenal.oneShots,0);
assert(report.arsenal.meanTurns<=report.legacy.meanTurns*1.35);
writeFileSync(process.env.ARSENAL_REPORT??"/tmp/tiny-tanks-arsenal-balance.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
