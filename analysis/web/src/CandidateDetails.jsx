import React from 'react';
import {routeHref} from './routes.js';
import {diffTagLabel} from './diffTags.js';
const money=value=>value==null?'Unavailable':`₱${value.toLocaleString('en-PH')}`;
export default function CandidateDetails({row,onPreview}){
 const ambiguous=row.trace==='ambiguous';
 const sources=[...['second','third'].filter(side=>row[side]).map(side=>({key:side,label:side==='second'?'HGAB2 · 2nd reading':'HGAB3 · 3rd reading',record:row[side]})),...row.suggestions.map((suggestion,index)=>({key:`nep-${index}`,label:`NEP suggestion ${index+1}`,record:suggestion.nep,score:suggestion.confidence,identity:suggestion.identity_score,tags:suggestion.diff_tags,suggested:true}))];
 return <section className="candidate-details" aria-label="Suggested NEP matches">
  <h3>{ambiguous?'Ambiguous NEP candidates':'Fuzzy title candidates'}</h3>
  <p>Suggestions remain unlinked and are excluded from this row’s NEP totals. Scores measure text similarity, not the probability of project identity.</p>
  <details className="candidate-method"><summary>How suggestions and scores work</summary><p>{ambiguous?'Multiple records share an exact matching key; no unique pairing was established.':'Suggestions use the same region, PAP and funding scope. Up to 20 records are shortlisted by shared title tokens; the top three with normalized-title similarity ≥0.85 are retained, then ranked by an identity score.'} Normalized titles ignore case, punctuation and spaces; abbreviation variants (Brgy./Barangay) expand before matching. Same-road chainage amendments attach as “matched after chainage check” instead of suggestions. Amounts and offices do not determine identity on their own.</p><p><strong>Identity score</strong> starts from text similarity and subtracts penalties for place mismatches (different barangay / municipality dominate; street, work-scope and phrasing diffs are softer). Same GPS coordinates give a small bonus; amount agreement is a weak supporting signal only. A high text-similarity pair in different barangays therefore ranks below a lower-similarity pair that shares the address.</p><p><strong>Difference tags</strong> classify the residual title-token difference between the House row and each suggestion — e.g. <em>Spelling/OCR</em>, <em>Stage qualifier</em>, <em>at/in phrasing</em>, <em>City suffix</em>, <em>Work type</em>, <em>Chainage digits</em>. Place tags use parse-then-compare on address slots (barangay / municipality / street / work scope), not token-opcode alignment. Multiple tags can apply. They describe the text difference only; they do not assert identity or a budget change.</p></details>
  <div className="candidate-table-scroll" role="region" aria-label="House and suggested NEP comparison" tabIndex={0}>
   <table className="candidate-table"><caption>Recorded House sources and suggested NEP counterparts</caption><thead><tr><th scope="col">Source / similarity</th><th scope="col">Full project title / assignment</th><th scope="col">Amount (PHP)</th><th scope="col">Suggested NEP − House</th><th scope="col">Source evidence</th></tr></thead>
    <tbody>{sources.map(source=>{
     const record=source.record;
     return <tr key={source.key} className={source.suggested?'suggested-source-row':'house-source-row'}>
      <th scope="row">{source.label}{source.suggested && <small>{source.score==null?'Score unavailable':`identity ${((source.identity??source.score)*100).toFixed(0)}% · ${(source.score*100).toFixed(0)}% text`}</small>}{source.tags?.length>0 && <span className="diff-tag-row" role="group" aria-label="Title difference tags">{source.tags.map(tag=><span key={tag} className="diff-tag" data-tag={tag}>{diffTagLabel(tag)}</span>)}</span>}</th>
      <td className="candidate-project"><div className="candidate-project-title">{record.title}</div><div className="candidate-assignment"><small>{record.region||'No recorded region'} · {record.office||'No recorded office'}</small><small>{[record.program,record.pap].filter(Boolean).join(' · ')||'No recorded PAP'}</small></div></td><td className="candidate-amount">{money(record.amount_php)}</td>
      <td>{source.suggested ? <><small>vs HGAB2: {row.second?money(record.amount_php-row.second.amount_php):'Unavailable'}</small><small>vs HGAB3: {row.third?money(record.amount_php-row.third.amount_php):'Unavailable'}</small></>:'—'}</td>
      <td><small>ID: {record.native_node_id||record.id}</small><small>PDF page: {(record.pdf_pages||[record.pdf_page]).filter(Number.isInteger).join(', ')||'Unavailable'}</small><small>Amount evidence: {record.evidence||'Unavailable'}</small>
       {source.suggested && <><a href={routeHref('nep',{node:record.native_node_id||record.id})}>Open suggested NEP entry in source tree →</a>{Number.isInteger(record.pdf_page) && <button className="source-link" onClick={()=>onPreview?.(record)}>Preview suggested NEP PDF p.{record.pdf_page}</button>}</>}
      </td>
     </tr>;
    })}</tbody>
   </table>
  </div>
 </section>;
}
