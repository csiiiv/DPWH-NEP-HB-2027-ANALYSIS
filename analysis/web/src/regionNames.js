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
