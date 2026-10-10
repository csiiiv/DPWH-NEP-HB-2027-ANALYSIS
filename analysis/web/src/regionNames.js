import {canonicalOffice} from '../../viewers/project_offices.mjs';
export {canonicalOffice};

// Canonical display names for DPWH region codes. Keys are the exact codes
// found in the source ledgers; sorting and grouping still use the codes.
const REGION_NAMES={
 'NCR':'NCR · National Capital Region',
 'CAR':'CAR · Cordillera Administrative Region',
 'NIR':'NIR · Negros Island Region',
 'Region I':'Region I · Ilocos',
 'Region II':'Region II · Cagayan Valley',
 'Region III':'Region III · Central Luzon',
 'Region IV-A':'Region IV-A · CALABARZON',
 'MIMAROPA':'MIMAROPA · Southwestern Tagalog',
 'Region V':'Region V · Bicol',
 'Region VI':'Region VI · Western Visayas',
 'Region VII':'Region VII · Central Visayas',
 'Region VIII':'Region VIII · Eastern Visayas',
 'Region IX':'Region IX · Zamboanga Peninsula',
 'Region X':'Region X · Northern Mindanao',
 'Region XI':'Region XI · Davao',
 'Region XII':'Region XII · SOCCSKSARGEN',
 'Region XIII':'Region XIII · Caraga',
 'Nationwide':'Nationwide',
};
export function regionName(code){return REGION_NAMES[code]??code;}

// Printed regional-office labels → same place-name suffix as regionName.
// DEOs, Central Office, and unknown labels pass through unchanged.
function regionCodeForOffice(office){
 if(office==='NCR Regional Office')return 'NCR';
 if(office==='CAR Regional Office')return 'CAR';
 if(office==='NIR Regional Office')return 'NIR';
 if(office==='Regional Office MIMAROPA Region')return 'MIMAROPA';
 const match=/^Regional Office ([IVX]+(?:-[AB])?)$/.exec(office||'');
 return match?`Region ${match[1]}`:'';
}
export function officeName(office){
 if(!office)return office??'';
 const canonical=canonicalOffice(office);
 const named=REGION_NAMES[regionCodeForOffice(canonical)];
 if(!named||!named.includes(' · '))return canonical;
 return `${canonical} · ${named.split(' · ')[1]}`;
}
