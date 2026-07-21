const fs=require('fs');const path=require('path');
const SRC='apps/api/src/zero-sales';
function walk(dir,base=dir){const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())out.push(...walk(p,base));else if(p.endsWith('.ts'))out.push(path.relative(base,p).replace(/\\/g,'/'));}return out;}
const files=walk(SRC);
for(const f of files){
  const t=fs.readFileSync(path.join(SRC,f),'utf8');
  const imports=[...t.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(m=>m[1]);
  const exports=[];
  for(const m of t.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g)) exports.push(m[1]);
  for(const m of t.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) exports.push(...m[1].split(',').map(s=>s.trim().split(/\s+as\s+/).pop()));
  console.log('FILE',f);
  console.log('  imports', imports.join(', '));
  console.log('  exports', exports.filter(Boolean).join(', '));
  console.log('  lines', t.split(/\n/).length, 'bytes', t.length);
}
console.log('==== EXTERNAL ====');
