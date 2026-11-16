import assert from "node:assert/strict";
import { ChallengeSession, CHALLENGES } from "../src/game/challenges";
import { chooseShot, fireAIShot } from "../src/game/ai";
const solutions = { precision: [2,62], ricochet: [2,58], demolition: [10,92], laststand: [2,80], chain: [2,52] } as const;
for (const definition of CHALLENGES) {
  const session = new ChallengeSession(definition.id), m = session.match;
  const [angle,power] = solutions[session.id];
  for(let action=0; action<4 && session.result==="playing"; action++) {
    if(m.active===0) { m.current.angle=angle; m.current.power=power; assert(m.fire()); }
    else assert(fireAIShot(m,chooseShot(m)));
    let ticks=0; while(m.phase!=="aim" && m.phase!=="over" && ticks++<2600) m.tick();
    assert(ticks<2600);
  }
  assert.equal(session.result,"success");
  console.log(JSON.stringify({challenge:session.id,angle,power,shots:m.tanks[0].shots,health:m.tanks[0].health,bounces:m.shotHistory[0].bounces??0,result:session.result}));
}
