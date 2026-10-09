import { searchTokens } from "./search.js";
import { matchesOffice, officeAssignments } from "../../viewers/project_offices.mjs";
export { officeOptions, officeLabels, NO_OFFICE } from "../../viewers/project_offices.mjs";

const textOrder=new Intl.Collator(undefined,{numeric:true});
const searches=new WeakMap(),sorts=new WeakMap();
function searchText(row) {
  if(!searches.has(row)) {
    const fields=value=>Object.values(value || {}).filter(v=>typeof v==='string' || typeof v==='number');
    const sources=[row.house,row.second,row.third,row.nep,row.api,
      ...(row.second?.records || []),...(row.third?.records || []),
      ...(row.suggestions || []).map(s=>s.nep)];
    searches.set(row,searchTokens([...new Set([...fields(row),...sources.flatMap(fields)])].join(' ')).join(' '));
  }
  return searches.get(row);
}
// Inputs are immutable retained rows. Reuse ordering across tab/filter changes.
function sortedRows(rows,tab,column,mode,direction) {
  if(!sorts.has(rows))sorts.set(rows,new Map());
  const cache=sorts.get(rows),id=JSON.stringify([tab,column,mode,direction]);
  if(!cache.has(id)) {
    const key=r=>{
      if(column==='reading_delta')return r.reading_delta_php ?? r.delta_php;
      if(column==='title')return r.title ?? r.label;
      if(['region','pdf_page','trace'].includes(column))return r[column] ?? null;
      if(tab==='gaps')return r.amount_php ?? null;
      const amounts=values(r,tab),index=Number(column);
      return metric(amounts[index],amounts[index-1],mode);
    };
    cache.set(id,rows.map(row=>({row,key:key(row)})).sort((a,b)=>compare(a.key,b.key,direction)).map(item=>item.row));
  }
  return cache.get(id);
}

export function amount(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if(value===0)return "₱0";
  const magnitude = Math.abs(value),
    [scale, suffix] =
      magnitude >= 1e9
        ? [1e9, "B"]
        : magnitude >= 1e6
          ? [1e6, "M"]
          : [1e3, "K"];
  return `${value < 0 ? "−" : ""}₱${(magnitude / scale).toFixed(3)}${suffix}`;
}
export function metric(current, prior, mode) {
  if (current == null || !Number.isFinite(current)) return null;
  if (mode === "total") return current;
  if (prior == null || !Number.isFinite(prior)) return null;
  if (mode === "delta") return current - prior;
  return prior === 0 ? null : ((current - prior) / Math.abs(prior)) * 100;
}
export function compare(a, b, direction = 1) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return (
    direction *
    (typeof a === "number" && typeof b === "number"
      ? a - b
      : textOrder.compare(String(a),String(b)))
  );
}
export function values(row, tab) {
  if (tab === "readings") return [row.second?.amount_php ?? null, row.third?.amount_php ?? null];
  return tab === "paps"
    ? [row.api_php, row.nep_php, Object.hasOwn(row,'second_php') ? row.second_php : row.house_control_php ?? row.house_extract_php, row.third_php ?? null]
    : [
        row.api?.amount_php ?? null,
        row.nep?.amount_php ?? null,
        row.second?.amount_php ?? row.house?.amount_php ?? null,
        row.third?.amount_php ?? null,
      ];
}
export function selectRows(
  rows,
  {
    query = "",
    program = "",
    region = "",
    office = "",
    trace = "",
    readingStatus = "",
    column = "title",
    mode = "total",
    direction = 1,
    tab = "projects",
  },
) {
  const tokens=searchTokens(query);
  return sortedRows(rows,tab,column,mode,direction)
    .filter(
      (r) =>
        (!tokens.length || tokens.every(token=>searchText(r).includes(token))) &&
        (!program || r.program === program) &&
        (!region || officeAssignments(r).some(a=>a.region===region)) &&
        matchesOffice(r, office, region) &&
        (!readingStatus || (readingStatus === 'house_records_only' ? (tab==='paps' ? (r.second_php != null || r.third_php != null) && r.nep_php == null && r.api_php == null : Boolean(r.second || r.third) && !r.nep && !r.api) : readingStatus === 'reading_changed' ? r.reading_delta_php != null && r.reading_delta_php !== 0 || ['second_only','third_only'].includes(r.reading_status) : r.reading_status === readingStatus)) &&
        (!trace || (trace === "reading_changed" && tab === "readings"
          ? r.delta_php !== 0 || ["second_only", "third_only"].includes(r.trace)
          : r.trace === trace)),
    );
}

// Prepare in small cancellable batches so initial indexing does not block typing.
export function warmSearchIndex(rows) {
  let index=0,timer=null,cancelled=false;
  const batch=()=>{
    if(cancelled)return;
    const end=Math.min(index+128,rows.length);
    while(index<end)searchText(rows[index++]);
    if(index<rows.length)timer=setTimeout(batch,0);
  };
  timer=setTimeout(batch,0);
  return ()=>{cancelled=true;clearTimeout(timer);};
}
