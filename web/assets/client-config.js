// These URLs are public browser configuration, not credentials.
const response=await fetch('/client-config.json',{cache:'no-store'});
export const config=response.ok?await response.json():{};
export function serviceURL(path){
 if(!config.apiBaseURL)throw new Error('Set a match service URL to connect.');
 return new URL(config.apiBaseURL.replace(/\/$/,'')+'/'+path.replace(/^\//,''));
}
export function serviceFetch(path,options={}){return fetch(serviceURL(path),{credentials:'include',...options})}
export async function loadLineups(){
 if(!config.lineupsURL)throw new Error('Lineups are not connected.');
 const r=await fetch(config.lineupsURL,{credentials:'include'});
 if(!r.ok)throw new Error('Lineups could not load.');
 return r.json();
}
export function mediaURL(session){
 const url=config.mediaURL||session?.media_url;
 if(!url)throw new Error('A media URL is required for playback.');
 const resolved=new URL(url,config.apiBaseURL||location.origin);
 if(!['http:','https:'].includes(resolved.protocol))throw new Error('Unsupported media URL.');
 return resolved.href;
}
