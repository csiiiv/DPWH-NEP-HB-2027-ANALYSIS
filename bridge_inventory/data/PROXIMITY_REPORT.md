# Nearest barangay edges for no-hit bridge points

Distances use the point and actual polygon edge in EPSG:32651 (metres), not polygon centroids.
These are review candidates, not new polygon hits or assigned PSGC locations.
The bridge source has points only; center positions and bridge endpoints are not established.

| Bridge | Inventory locality | Rank | Nearby barangay | Municipality/city | Edge distance (m) |
|---|---|---:|---|---|---:|
| B00001BH · Jacinto Borja Br. 1 | POBLACION, DAUIS | 1 | Bool | City of Tagbilaran | 23.20 |
| B00001BH · Jacinto Borja Br. 1 | POBLACION, DAUIS | 2 | Poblacion | Dauis | 82.13 |
| B00001BH · Jacinto Borja Br. 1 | POBLACION, DAUIS | 3 | Mansasa | City of Tagbilaran | 194.66 |
| B00026BH · Vaño Br. | Poblacion, Dauis | 1 | Poblacion | Dauis | 7.68 |
| B00026BH · Vaño Br. | Poblacion, Dauis | 2 | Bool | City of Tagbilaran | 427.22 |
| B00026BH · Vaño Br. | Poblacion, Dauis | 3 | Mansasa | City of Tagbilaran | 542.08 |
| B00031TL · Sijeron Br. | Hinugasan, San Agustin | 1 | Hinugusan | San Agustin | 14.30 |
| B00031TL · Sijeron Br. | Hinugasan, San Agustin | 2 | Lusong | San Agustin | 513.15 |
| B00031TL · Sijeron Br. | Hinugasan, San Agustin | 3 | Buli | San Agustin | 1184.14 |
| B00048BH · Nausok Br. | Nausok, Jagna | 1 | Nausok | Jagna | 6.43 |
| B00048BH · Nausok Br. | Nausok, Jagna | 2 | Larapan | Jagna | 187.69 |
| B00048BH · Nausok Br. | Nausok, Jagna | 3 | Pangdan | Jagna | 598.44 |
| B00097BH · Ambassador Suarez Br. | Poblacion I(Sitio Ubos), Tagbilaran City | 1 | Poblacion I | City of Tagbilaran | 38.41 |
| B00097BH · Ambassador Suarez Br. | Poblacion I(Sitio Ubos), Tagbilaran City | 2 | Totolan | Dauis | 244.54 |
| B00097BH · Ambassador Suarez Br. | Poblacion I(Sitio Ubos), Tagbilaran City | 3 | Poblacion II | City of Tagbilaran | 265.97 |
| B00211BH · Jacinto Borja Br. 2 | Poblacion, Dauis | 1 | Bool | City of Tagbilaran | 21.81 |
| B00211BH · Jacinto Borja Br. 2 | Poblacion, Dauis | 2 | Poblacion | Dauis | 79.43 |
| B00211BH · Jacinto Borja Br. 2 | Poblacion, Dauis | 3 | Mansasa | City of Tagbilaran | 195.88 |
| B00223BH · Moalong Br. | Moalong, Loon | 1 | Canhangdon Occidental | Loon | 7.22 |
| B00223BH · Moalong Br. | Moalong, Loon | 2 | Basac | Loon | 15.65 |
| B00223BH · Moalong Br. | Moalong, Loon | 3 | Biasong | Loon | 97.81 |
| B00592SM · Buyayawon Br. | BUYAYAWON, MERCEDES | 1 | Buabua | Salcedo | 5.18 |
| B00592SM · Buyayawon Br. | BUYAYAWON, MERCEDES | 2 | Buyayawon | Mercedes | 8.56 |
| B00592SM · Buyayawon Br. | BUYAYAWON, MERCEDES | 3 | San Roque | Mercedes | 393.92 |
| B04691LZ · Bagacay Br. | Bulabog, Sorsogon City | 1 | Bulabog | City of Sorsogon | 3.54 |
| B04691LZ · Bagacay Br. | Bulabog, Sorsogon City | 2 | Bucalbucalan | City of Sorsogon | 4.19 |
| B04691LZ · Bagacay Br. | Bulabog, Sorsogon City | 3 | Capuy | City of Sorsogon | 1099.28 |

Closest-edge coordinates and name comparisons are retained in `bridge_proximity.jsonl.gz`.
A nearby edge is consistent with a small mapping gap or a crossing over water; it does
not establish that explanation. Rank three can be much farther away than the first two.
