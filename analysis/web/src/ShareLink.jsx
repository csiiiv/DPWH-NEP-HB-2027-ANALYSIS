import React, {useEffect,useState} from 'react';

const shareUrl = () => {
  const current = new URL(window.location.href);
  const hash = current.hash.replace(/^#\/?/, '');
  const [route, query = ''] = hash.split('?');
  const story = new URLSearchParams(query).get('story');
  if (route === 'highlights' && story && /^[a-z0-9-]+$/.test(story)) {
    return new URL('share/' + story + '/', current.origin + current.pathname).href;
  }
  return current.href;
};

export default function ShareLink() {
  const [href,setHref]=useState(shareUrl), [message,setMessage]=useState('');
  useEffect(()=>{
    const update=()=>{setHref(shareUrl());setMessage('');};
    window.addEventListener('hashchange',update);
    window.addEventListener('findingstatechange',update);
    return ()=>{window.removeEventListener('hashchange',update);window.removeEventListener('findingstatechange',update);};
  },[]);
  return <div className="finding-share"><button onClick={async()=>{
    try {await navigator.clipboard.writeText(href);setMessage('Link copied');}
    catch {setMessage('Copy the link address below or use your browser’s address bar.');}
  }}>Copy link</button> <a href={href}>Link to this finding</a> <span role="status">{message}</span></div>;
}
