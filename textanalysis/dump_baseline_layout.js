// Dumps the current PixelIndexer layout so the offline layout builder can
// reuse the exact macro structure (age bands, sex runs, instigator runs)
// instead of re-implementing JS sort semantics in Python.
//   node textanalysis/dump_baseline_layout.js > textanalysis/output/pixel_baseline.tsv
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR=path.join(__dirname,'..','p5Dumpster','port_03');
const ctx={console:{log(){},warn(){}},performance,Math,Float64Array,Float32Array,Int32Array,
  Int8Array,Uint8Array,DataView,ArrayBuffer,Array,parseInt,parseFloat,String,Object,Number};
ctx.globalThis=ctx; vm.createContext(ctx);
for(const f of ['dumpster_constants.js','breakup.js','similarity_providers.js',
                'breakup_manager.js','pixel_indexer.js'])
  vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f});
const K=e=>vm.runInContext(e,ctx);
const W=K('PIXELVIEW_W'), H=K('PIXELVIEW_H');
const ld=n=>fs.readFileSync(path.join(DIR,'data',n),'utf8').split('\n');
const BM=vm.runInContext('new BreakupManager()',ctx);
BM.loadFromAssets(ld('languageData.txt'),ld('languageTags.txt'),ld('kamalFlags.txt'),
  new Uint8Array(fs.readFileSync(path.join(DIR,'data','breakupSummaryLengths.dat'))),
  ld('accessThemes.tsv'));
const PIN=vm.runInContext('(function(BM){return new PixelIndexer(BM);})',ctx)(BM);
const out=['#pixelIndex\tx\ty\tbupId\tage\tsex\tinstigator'];
for(let i=0;i<W*H;i++){
  const id=PIN.PixelIndexToBupIndex[i], b=BM.bups[id];
  out.push(`${i}\t${i%W}\t${Math.floor(i/W)}\t${id}\t${b.age}\t${b.sex}\t${b.instigator}`);
}
process.stdout.write(out.join('\n')+'\n');
