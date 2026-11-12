import React from 'react';
import {signedPct} from './pctChange.js';

// Exact numeric cells for the shared Records/Allocations skeleton. Units live
// in the column label; signed values carry both a sign and the shared palette.
export default function AnalysisValue({value, signed = false, percent = false}) {
  const present = value != null && Number.isFinite(value);
  const text = !present ? '—' : percent ? signedPct(value)
    : `${signed && value > 0 ? '+' : ''}${value.toLocaleString('en-PH')}`;
  return <span className={(signed || percent) && present ? value > 0 ? 'up' : value < 0 ? 'down' : '' : ''}
    title={text}>{text}</span>;
}
