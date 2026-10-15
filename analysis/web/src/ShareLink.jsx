import React, {useEffect,useState} from 'react';
import {currentShareUrl} from './shareUrls.js';

export default function ShareLink() {
  const [href,setHref]=useState(currentShareUrl), [message,setMessage]=useState('');
  useEffect(()=>{
    const update=()=>{setHref(currentShareUrl());setMessage('');};
    window.addEventListener('hashchange',update);
    window.addEventListener('findingstatechange',update);
    return ()=>{window.removeEventListener('hashchange',update);window.removeEventListener('findingstatechange',update);};
  },[]);
  return <div className="finding-share"><button onClick={async()=>{
    try {await navigator.clipboard.writeText(href);setMessage('Link copied');}
    catch {setMessage('Copy the link address below or use your browser’s address bar.');}
  }}>Copy link</button> <a href={href}>Link to this finding</a> <span role="status">{message}</span></div>;
}
