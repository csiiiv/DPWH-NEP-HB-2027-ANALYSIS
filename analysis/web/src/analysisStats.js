// Descriptive digit/rounding statistics for appropriation amounts. These are
// lenses for review targeting, not fraud tests: appropriations are policy
// numbers, so round values are expected, not anomalous by themselves.

export const BANDS=[
  ['Below ₱1M',0,1e6],['₱1M–5M',1e6,5e6],['₱5M–20M',5e6,2e7],['₱20M–50M',2e7,5e7],
  ['₱50M–100M',5e7,1e8],['₱100M–500M',1e8,5e8],['₱500M–1B',5e8,1e9],['₱1B and above',1e9,Infinity],
];
const BENFORD=Array.from({length:9},(_,i)=>Math.log10(1+1/(i+1)));

export function benford(amounts){
  const first=Array(9).fill(0);
  for(const value of amounts){
    const digit=leadingDigit(value);
    if(digit)first[digit-1]++;
  }
  const total=first.reduce((sum,n)=>sum+n,0);
  const digits=first.map((count,i)=>({digit:i+1,observed:total?count/total:0,expected:BENFORD[i]}));
  const mad=total?digits.reduce((sum,d)=>sum+Math.abs(d.observed-d.expected),0)/9:0;
  return {digits,mad,total};
}
function leadingDigit(value){
  if(!Number.isFinite(value)||value<=0)return null;
  const text=String(Math.trunc(value));
  for(const char of text){const digit=Number(char);if(digit>=1&&digit<=9)return digit;}
  return null;
}

export function trailingZeros(amounts){
  const counts=Array(10).fill(0);let total=0;
  for(const value of amounts){
    if(!Number.isFinite(value)||value<=0)continue;
    let zeros=0,v=value;
    while(v%10===0&&zeros<9){v/=10;zeros++;}
    counts[zeros]++;total++;
  }
  return {counts,total};
}

export function lastDigits(amounts){
  const counts=Array(10).fill(0);let total=0;
  for(const value of amounts){
    if(!Number.isFinite(value)||value<=0)continue;
    counts[Math.trunc(value)%10]++;total++;
  }
  return {counts,total};
}

export function roundingLadder(amounts){
  const steps=[1e5,5e5,1e6,5e6,1e7,1e8];
  const total=amounts.length;
  return steps.map(step=>({step,records:amounts.filter(v=>v%step===0).length,
    share:total?amounts.filter(v=>v%step===0).length/total:0}));
}

export function valueBands(amounts){
  return BANDS.map(([label,low,high])=>{
    const records=amounts.filter(v=>v>=low&&v<high).length;
    const amount=amounts.filter(v=>v>=low&&v<high).reduce((sum,v)=>sum+v,0);
    return {label,records,amount_php:amount,share:amounts.length?records/amounts.length:0};
  });
}

// Deterministic k-means on log10 amounts. Seeds at quantiles so results are
// stable across runs and renderers; centers map back to peso midpoints.
export function kmeansClusters(amounts,k=5,iterations=60){
  const logs=amounts.filter(v=>v>0).map(v=>Math.log10(v)).sort((a,b)=>a-b);
  if(logs.length<k)return [];
  let centers=Array.from({length:k},(_,i)=>logs[Math.min(logs.length-1,Math.round(i*(logs.length-1)/(k-1)))]);
  let assignment=Array(logs.length).fill(0);
  for(let iteration=0;iteration<iterations;iteration++){
    let moved=false;
    logs.forEach((value,index)=>{
      let best=0,bestDistance=Infinity;
      centers.forEach((center,i)=>{const d=Math.abs(value-center);if(d<bestDistance-1e-12){bestDistance=d;best=i;}});
      if(assignment[index]!==best){assignment[index]=best;moved=true;}
    });
    const sums=Array(k).fill(0),counts=Array(k).fill(0);
    logs.forEach((value,index)=>{sums[assignment[index]]+=value;counts[assignment[index]]++;});
    centers=centers.map((center,i)=>counts[i]?sums[i]/counts[i]:center);
    if(!moved)break;
  }
  const clusters=centers.map((center,i)=>({center,records:counts_for(assignment,i)}));
  function counts_for(list,i){return list.reduce((n,v)=>n+(v===i?1:0),0);}
  return clusters
    .filter(c=>c.records>0)
    .sort((a,b)=>b.records-a.records)
    .map(c=>({center_php:Math.round(10**c.center),share:c.records/logs.length}));
}

// Exact repeated amounts are the direct "blanket fixed allocation" signal:
// many line items in one program sharing a single peso value.
export function exactConcentrations(rows,minRepeat=5){
  const byProgram=new Map();
  for(const row of rows){
    const value=row.amount_php;
    if(!Number.isFinite(value)||value<=0)continue;
    const key=JSON.stringify([row.program,value]);
    const entry=byProgram.get(key)||{program:row.program,amount_php:value,records:0,titles:new Set()};
    entry.records++;if(entry.titles.size<3)entry.titles.add(row.title);
    byProgram.set(key,entry);
  }
  const total=rows.length;
  return [...byProgram.values()]
    .filter(e=>e.records>=minRepeat)
    .sort((a,b)=>b.records-a.records||b.amount_php-a.amount_php)
    .slice(0,15)
    .map(({program,amount_php,records,titles})=>({program,amount_php,records,
      share:total?records/total:0,examples:[...titles]}));
}

export function groupTotals(rows,dim){
  const groups=new Map();
  for(const row of rows){
    const label=row[dim]||'No recorded '+(dim==='office'?'office':dim);
    const entry=groups.get(label)||{label,rows:0,amount_php:0};
    entry.rows++;entry.amount_php+=row.amount_php;
    groups.set(label,entry);
  }
  return [...groups.values()].sort((a,b)=>b.amount_php-a.amount_php||a.label.localeCompare(b.label));
}
