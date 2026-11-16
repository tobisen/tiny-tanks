import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expectedCommit=process.argv[2];
assert.match(expectedCommit??'',/^[a-f0-9]{40}$/,'Provide the expected full release commit');
const base=new URL('https://tobisen.github.io/tiny-tanks/');
const local=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
const response=await fetch(new URL(`release.json?verify=${expectedCommit}`,base),{signal:AbortSignal.timeout(15000)});
assert(response.ok,`Release identity HTTP ${response.status}`);
const live=await response.json();
assert.equal(live.version,local.version); assert.equal(live.commit,expectedCommit);
assert.deepEqual(live.assets,local.assets);
const files=[];
for(const path of live.assets){
  assert.match(path,/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/);
  const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)}); assert(r.ok);
  const remote=Buffer.from(await r.arrayBuffer());
  const built=await readFile(new URL(`../dist/${path}`,import.meta.url));
  assert.deepEqual(remote,built,`Live bytes differ: ${path}`);
  files.push({path,bytes:remote.length,sha256:createHash('sha256').update(remote).digest('hex')});
}
const html=await (await fetch(base,{signal:AbortSignal.timeout(15000)})).text();
for(const asset of live.assets.filter(p=>p.endsWith('.css') || (p.startsWith('assets/index-') && p.endsWith('.js'))))
  assert(html.includes(asset),`Live HTML does not reference ${asset}`);
console.log(JSON.stringify({url:base.href,version:live.version,commit:live.commit,verifiedAt:new Date().toISOString(),files},null,2));
