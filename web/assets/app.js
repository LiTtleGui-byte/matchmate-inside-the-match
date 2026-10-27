import {config, serviceFetch, loadLineups, mediaURL} from "/assets/client-config.js";
import {dataDesk} from "/assets/data-desk.js";
import {renderLineups} from "/assets/match-lineups.js";
const $=id=>document.getElementById(id);
const video=$('video'),conversation=$('conversation');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clockSample(seconds){
 const stamp=state?.view_clock||session?.live_clock;
 const at=state?.view_seconds??session?.live_seconds??seconds;
 const match=String(stamp||'').match(/^(\d+):(\d{2})$/);
 if(!match)return {text:stamp||'00:00',minutes:0};
 const elapsed=Math.max(0,Number(match[1])*60+Number(match[2])+seconds-at);
 return {text:`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`,minutes:elapsed/60};
}
export function cutoff(seconds){return clockSample(seconds).minutes}
export function clock(seconds){return clockSample(seconds).text}
export function safeView(position,edge){return Math.max(session?.kickoff_seconds||0,Math.min(Number.isFinite(position)?position:edge,edge))}
const STAT_OPTIONS=[['BALL_POSSESSION','Possession'],['SHOTS_TOTAL','Shots'],['SHOTS_ON_TARGET','On target'],['CORNERS','Corners'],['PASSES','Passes'],['SUCCESSFUL_PASSES_PERCENTAGE','Pass accuracy']];
const DATA_SELECTION_KEY='inside-data-selection-v1';
let selectedStats=new Set(STAT_OPTIONS.map(([id])=>id)),dataOptionOrder=STAT_OPTIONS.map(([id])=>id),dataDialogFocus=null;
try{const saved=JSON.parse(localStorage.getItem(DATA_SELECTION_KEY));if(saved?.fixture_id===config.fixtureId&&Array.isArray(saved.metric_ids))selectedStats=new Set(saved.metric_ids.filter(id=>STAT_OPTIONS.some(([known])=>known===id)))}catch{}
let webSearchEnabled=false,webSearchAvailable=false;
let session=null,state=null,hls=null,liveAnchor=0,receivedAt=0,bookmark=null,clip=null,context=null,pending=false,requestId=0,stateId=0,lastRefresh=0,seen=new Set(),momentInvitations=new Map(),level='regular',generation=0,playerGeneration=0,seekIntent=null,started=false,hlsModule=null,hlsAttempt=0,delayIntent=null;
try{level=localStorage.getItem('inside-level')||'regular'}catch{}
function edge(){return Math.min(session?.duration||0,liveAnchor+Math.max(0,performance.now()-receivedAt)/1000)}
function pos(){return safeView(seekIntent??(Number.isFinite(video.currentTime)&&video.currentTime>0?video.currentTime:edge()),edge())}
async function api(path,body){const r=await serviceFetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'include'});let d;try{d=await r.json()}catch{d={detail:'The connection could not be completed.'}}if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Please check the connection and try again.');return d}
function notice(text=''){$('connectionNotice').hidden=!text;$('connectionNotice').textContent=text}
function syncClock(data){webSearchAvailable=data.web_search_available===true;if(!webSearchAvailable)webSearchEnabled=false;paintWebToggle();session=data;liveAnchor=data.live_seconds;receivedAt=performance.now()}
function renderClocks(){
 if(!session)return;const p=pos(),lag=Math.max(0,edge()-p);
 if(!clip&&!video.paused&&lag<=6)delayIntent=null;
 $('viewClock').textContent=clock(p);$('seek').max=String(edge());$('seek').value=String(p);
 $('goLiveButton').textContent='Back to live';
 $('goLiveButton').hidden=!!clip||session.ended||!delayIntent||lag<=(delayIntent==='rewound'?6:15);
 $('statusBadge').hidden=!clip;$('statusBadge').textContent=clip?'REPLAY':'';
 const headerClock=clock(clip&&bookmark?bookmark.seconds:p);$('matchClock').textContent=headerClock.startsWith('Penalties')?'Penalties':headerClock;
 updateMomentInvitations();$('playButton').textContent=video.paused?'▶':'Ⅱ';$('playButton').ariaLabel=video.paused?'Play':'Pause';
 $('liveContinues').hidden=true;$('liveContinues').textContent='';$('returnButton').textContent='Return to match';
}
function value(v,unit=''){return v==null?'—':`${Number.isInteger(v)?v:Number(v).toFixed(1)}${unit}`}
function renderStats(data){$('startFirstMoment').setAttribute('aria-pressed',String(session?.entry_mode==='first_moment'));$('score').textContent=`${data.score.home} : ${data.score.away}`;const shootout=data.score.shootout;$('shootoutScore').hidden=!shootout;$('shootoutScore').textContent=shootout?`Pens ${shootout.home}–${shootout.away}`:'';dataDesk.setState(data)}
async function refresh(force=false){if(!session)return;const now=performance.now();if(!force&&now-lastRefresh<4500)return;lastRefresh=now;const id=++stateId,view=clip&&bookmark?bookmark.seconds:pos();try{const d=await api(`/api/state?view_seconds=${encodeURIComponent(view)}`);if(id!==stateId)return;state=d;renderStats(d);syncStarterQuestions();notice('');if(!clip)checkPrompt(d)}catch(e){notice(e.message)}}
function checkPrompt(d){
 if(clip||video.readyState<2||!Number.isFinite(video.currentTime)||video.currentTime<(session?.kickoff_seconds||0)-1)return;
 const view=pos();
 for(const moment of d.moments){
  const id=String(moment.id);
  if(seen.has(id)||moment.video_seconds>view+.05||view-moment.video_seconds>300)continue;
  seen.add(id);addMomentInvitation({...moment,id});
 }
 updateMomentInvitations();
}
function addMomentInvitation(moment){
 const followBottom=conversation.scrollHeight-conversation.clientHeight-conversation.scrollTop<80;
 const el=document.createElement('article');el.className='moment-invitation';el.dataset.momentId=moment.id;
 el.innerHTML=`<p class="moment-invitation-event">${esc(moment.time)} · ${esc(moment.title)}</p><p class="moment-invitation-question">Want me to explain this moment?</p><div class="moment-invitation-actions"><button class="moment-invitation-explain" type="button">Explain</button><button class="moment-invitation-dismiss" type="button">Not now</button></div>`;
 const invitation={el,moment,accepted:false};momentInvitations.set(moment.id,invitation);
 el.querySelector('.moment-invitation-dismiss').addEventListener('click',()=>{momentInvitations.delete(moment.id);el.remove();syncWelcome();updateComposerState()});
 el.querySelector('.moment-invitation-explain').addEventListener('click',async()=>{
  if(pending||invitation.accepted||clip||pos()+.05<moment.video_seconds)return;
  invitation.accepted=true;updateMomentInvitations();setContext(null);
  const result=await ask('explain','',moment.id);
  if(result==='complete'||result==='error'){momentInvitations.delete(moment.id);el.remove();syncWelcome();updateComposerState()}
  else{invitation.accepted=false;updateMomentInvitations()}
 });
 conversation.append(el);syncWelcome();updateComposerState();
 // Only follow the desktop conversation if the viewer was already at its end.
 // A new event must not scroll a mobile viewer away from the video or steal focus.
 if(followBottom&&!matchMedia('(max-width:800px)').matches)conversation.scrollTop=conversation.scrollHeight;
}
function updateMomentInvitations(){
 const view=session?pos():0;
 for(const [id,invitation] of momentInvitations){
  if(!invitation.el.isConnected){momentInvitations.delete(id);continue}
  const button=invitation.el.querySelector('.moment-invitation-explain');
  button.disabled=pending||invitation.accepted||!!clip||view+.05<invitation.moment.video_seconds;
  button.title=view+.05<invitation.moment.video_seconds?'Available when you reach this moment':'';
 }
}

function scrollChat(){if(matchMedia('(max-width:800px)').matches){conversation.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'})}else conversation.scrollTop=conversation.scrollHeight}
export function momentContextLabel(card){
 if(card.web_search)return 'Web conversation';
 const stamp=String(card.moment?.time||card.as_of||'');
 const minute=stamp.match(/^(\d+(?:\+\d+)?)[′']/);
 if(minute)return `About ${minute[1]}′`;
 const clockMinute=stamp.match(/^(\d+):\d{2}$/);
 if(clockMinute)return `About ${Number(clockMinute[1])}′`;
 return stamp?'About '+stamp.toLowerCase():'About this moment';
}
function setContext(card){context=card;$('contextTag').hidden=!card;$('inputBasis').hidden=!!card;$('contextText').textContent=card?momentContextLabel(card):'';$('chatInput').placeholder=card?(card.web_search?'Ask a follow-up…':'Ask a follow-up about this moment…'):'Ask about tactics, players or momentum…'}
const starterQuestions={
 kickoff:['How are the two teams set up?','What should I watch for in the opening minutes?','Which players should I keep an eye on?'],
 live:['What has happened so far?','Which team has had more chances so far?','What do the match stats tell us?'],
 ended:['What were the key turning points?','Who was involved in the key moments?','How do the teams compare?']
};
function syncStarterQuestions(){const box=$('starterQuestions');if(!box)return;const phase=session?.ended&&pos()>=session.duration-2?'ended':cutoff(pos())>=1?'live':'kickoff';if(box.dataset.phase!==phase){box.dataset.phase=phase;box.replaceChildren(...starterQuestions[phase].map(question=>{const b=document.createElement('button');b.type='button';b.className='starter-question';const label=document.createElement('span');label.textContent=question;const arrow=document.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');b.append(label,arrow);b.addEventListener('click',()=>{if(pending)return;setContext(null);ask('chat',question)});return b}))}for(const b of box.querySelectorAll('button'))b.disabled=pending||!state}
let conversationStarted=false;
function syncWelcome(){const welcome=conversation.querySelector('.welcome');if(welcome)welcome.hidden=false;syncStarterQuestions()}

function appendUser(text){const el=document.createElement('div');el.className='user-message';el.textContent=text;conversation.append(el);window.insidePreferences?.decorateUser(el);scrollChat()}
function showLoading(search=false){const el=document.createElement('article');el.className='explanation-card loading-card';el.setAttribute('aria-label',search?'Searching the web':'Preparing a reply');el.innerHTML=`<span class="spinner" aria-hidden="true"></span><span>${search?'Searching the web…':'Thinking…'}</span>`;conversation.append(el);syncWelcome();scrollChat();return el}

function renderEvidence(card){const groups=[['Match events',card.evidence.filter(e=>e.id.startsWith('e:'))],['Match statistics',card.evidence.filter(e=>e.id.startsWith('s:'))]];return `<p>Records available through ${esc(card.as_of)}.</p>`+groups.filter(([,rows])=>rows.length).map(([title,rows])=>`<h3>${title}</h3>`+rows.map(e=>`<blockquote>${esc(e.text)}<cite>${esc(e.time)}</cite></blockquote>`).join('')).join('')}

let evidenceSequence=0;
function renderCard(card,el){
 if(card.web_search){renderWebCard(card,el);return}
 const a=card.answer,id='match-evidence-'+(++evidenceSequence),followups=Array.isArray(a.follow_ups)?a.follow_ups.slice(0,2):[];
 el.className='explanation-card quiet-answer';el.setAttribute('aria-label',a.title||'MatchMate reply');
 el.innerHTML=`<div class="answer-body"><p>${esc(a.what_happened)}</p>${a.why_it_matters&&a.why_it_matters!==a.what_happened?`<p>${esc(a.why_it_matters)}</p>`:''}</div><div class="card-actions">${card.clip?'<button type="button" class="replay-action">Replay moment</button>':''}<button type="button" class="evidence-action" aria-expanded="false" aria-controls="${id}">View evidence</button></div><section class="evidence" id="${id}" hidden>${renderEvidence(card)}${a.key_actions.length?`<h3>Sequence</h3><ol class="action-list">${a.key_actions.map(x=>`<li><time>${esc(x.time)}</time><i></i><span>${esc(x.text)}</span></li>`).join('')}</ol>`:''}</section>${followups.length?`<div class="followups">${followups.map((q,i)=>`<button type="button" data-followup="${i}">${esc(q)}</button>`).join('')}</div>`:''}`;
 el.querySelector('.replay-action')?.addEventListener('click',()=>replay(card));
 el.querySelector('.evidence-action').addEventListener('click',e=>{const panel=el.querySelector('.evidence');panel.hidden=!panel.hidden;e.currentTarget.textContent=panel.hidden?'View evidence':'Hide evidence';e.currentTarget.setAttribute('aria-expanded',String(!panel.hidden))});
 el.querySelectorAll('[data-followup]').forEach(b=>b.addEventListener('click',()=>{setContext(card);ask('chat',followups[Number(b.dataset.followup)])}));
 setContext(card);syncWelcome();scrollChat();window.insidePreferences?.onCard(card,el)
}

function emptyCard(data,el){el.removeAttribute('aria-label');el.className='empty-card';el.innerHTML=`<span class="eyebrow">${esc(data.as_of)} · THIS MOMENT</span><h3>No recent key moment is recorded</h3><p>We haven’t found a recorded goal, decision or other key event in the last five minutes. You can revisit an earlier moment or ask about the match.</p>${data.last_moment?`<button class="revisit">${esc(data.last_moment.time)} Revisit: ${esc(data.last_moment.title)}</button>`:''}<button class="catchup">Catch up on what I’ve watched</button><button class="specific">Ask about something specific</button>`;el.querySelector('.revisit')?.addEventListener('click',()=>ask('explain','',data.last_moment.id));el.querySelector('.catchup').addEventListener('click',()=>ask('catchup','Summarize the key events so far.'));el.querySelector('.specific').addEventListener('click',()=>$('chatInput').focus());scrollChat()}
async function ask(mode='explain',question='',momentId=null,playerId=null,searchChoice=null){if(pending)return 'busy';if(!session||!state){notice('The match is still connecting. Please try again in a moment.');return 'unavailable'}pending=true;updateComposerState();const id=++requestId,epoch=generation;const pinned=mode==='chat'?context:null;const view=pinned?pinned.as_of_seconds:pos();const useWeb=mode==='chat'&&(searchChoice??webSearchEnabled);const payload={web_search:useWeb,...(useWeb&&pinned?.web_search?{web_context:{question:pinned.web_question,answer:pinned.answer.what_happened}}:{}),view_seconds:view,mode,question,moment_id:momentId||(pinned?.moment?.id)||null,player_id:playerId,level,...(window.insidePreferences?.payload()||{})};if(question)appendUser(question);const el=showLoading(useWeb);$('sendButton').disabled=true;try{const d=await api('/api/explain',payload);if(epoch!==generation||id!==requestId){el.remove();return 'cancelled'}if(d.empty)emptyCard(d,el);else renderCard(d,el);return 'complete'}catch(e){if(epoch!==generation){el.remove();return 'cancelled'}el.removeAttribute('aria-label');el.className='error-card';el.innerHTML=`<strong>The explanation isn’t ready.</strong><p>${esc(e.message)}</p><button>Try again</button>`;el.querySelector('button').addEventListener('click',()=>{el.remove();ask(mode,question,momentId,playerId,useWeb)});return 'error'}finally{if(id===requestId){pending=false;updateComposerState()}}}
async function seek(seconds,{preserveReplay=false,autoplay=true,userInitiated=false}={}){dataDesk.invalidate();if(userInitiated)delayIntent='rewound';if(!preserveReplay&&clip){clip=null;bookmark=null;updateReplayUI()}window.insidePreferences?.cancelSpeech();generation++;stateId++;seekIntent=safeView(seconds,edge());try{video.currentTime=seekIntent;if(autoplay)await video.play()}catch{}renderClocks();refresh(true)}
function updateReplayUI(){$('replayLabel').hidden=!clip;$('liveContinues').hidden=true;$('replayBar').hidden=!clip;$('playerShell').classList.toggle('is-replay',!!clip);if(clip){$('replayLabel').textContent=`Replay · ${clip.label}`;$('replayBarText').textContent='Replaying this moment.'}}
function replay(card){if(!card.clip)return;delayIntent='rewound';if(!bookmark)bookmark={seconds:pos(),paused:video.paused};clip={...card.clip,label:card.moment?.time||card.as_of};updateReplayUI();seek(clip.start,{preserveReplay:true});renderClocks()}
async function returnBookmark(){if(!bookmark)return;const saved=bookmark;clip=null;bookmark=null;updateReplayUI();await seek(saved.seconds,{autoplay:!saved.paused});if(saved.paused)video.pause();refresh(true)}
async function goLive(){delayIntent=null;clip=null;bookmark=null;updateReplayUI();setContext(null);await seek(edge()-2);refresh(true)}
async function loadVideo(){
 generation++;const mine=++playerGeneration;const target=seekIntent??(started?pos():Math.max(session?.kickoff_seconds||0,edge()-2));const wasPaused=started&&video.paused;const resume=()=>{if(wasPaused)video.pause();else tryPlayback()};$('videoError').hidden=true;$('videoLoading').hidden=false;hls?.destroy();hls=null;
 try{
  if(!hlsModule)hlsModule=await import('/assets/hls.js');const {default:Hls}=hlsModule;if(mine!==playerGeneration)return;
  if(Hls.isSupported()){
   hls=new Hls({startPosition:target,startLevel:0,capLevelToPlayerSize:true,liveSyncDuration:2,maxBufferLength:16,maxMaxBufferLength:24,backBufferLength:90,liveDurationInfinity:true});
   hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(mine===playerGeneration)resume()});
   hls.on(Hls.Events.ERROR,(_,data)=>{if(mine===playerGeneration&&data.fatal){$('videoLoading').hidden=true;$('videoError').hidden=false}});
   hls.attachMedia(video);hls.loadSource(mediaURL(session));
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
   video.src=mediaURL(session);video.addEventListener('loadedmetadata',()=>{if(mine===playerGeneration){video.currentTime=target;resume()}},{once:true});
  }else throw Error();started=true;
 }catch{$('videoLoading').hidden=true;$('videoError').hidden=false}
}
function dialog(title,body){$('toolsDialog').classList.remove('lineup-dialog');$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;$('toolsDialog').showModal()}
function eventsDialog(){if(!state)return;dialog('Match events',`<p>Events released up to your viewing context, ${esc(state.view_clock)}.</p>`+state.events.map(e=>`<div class="dialog-row"><button class="event-button" data-event="${esc(e.id)}"><span>${esc(e.time)}</span><span>${esc(e.title)}</span></button></div>`).join(''));$('dialogBody').querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{const e=state.events.find(x=>x.id===b.dataset.event);$('toolsDialog').close();ask('explain','',e.id)}))}
async function startAt(mode){if(!['kickoff','first_moment'].includes(mode))return;$('startFirstMoment').disabled=true;const url=new URL(location.href);url.searchParams.set('entry',mode);location.assign(url.pathname+url.search+url.hash)}
function preferences(){window.insidePreferences?.open()}

function toggleTheme(){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;$('themeButton').ariaLabel=`Switch to ${next==='dark'?'light':'dark'} mode`;try{localStorage.setItem('inside-theme',next)}catch{}}
$('startFirstMoment').addEventListener('click',()=>startAt('first_moment'));
$('lineupsButton').addEventListener('click',lineupsDialog);$('eventsButton').addEventListener('click',eventsDialog);$('preferencesButton').addEventListener('click',preferences);$('themeButton').addEventListener('click',toggleTheme);$('returnButton').addEventListener('click',returnBookmark);$('goLiveButton').addEventListener('click',goLive);$('retryVideo').addEventListener('click',loadVideo);$('contextTag').addEventListener('click',()=>setContext(null));$('playButton').addEventListener('click',()=>{if(video.paused)tryPlayback();else{delayIntent=delayIntent||'paused';video.pause()}});$('muteButton').addEventListener('click',()=>{video.muted=!video.muted;renderSoundControl()});$('fullscreenButton').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else $('playerShell').requestFullscreen?.()});$('seek').addEventListener('change',e=>seek(Number(e.target.value),{userInitiated:true}));$('chatForm').addEventListener('submit',e=>{e.preventDefault();const q=$('chatInput').value.trim();if(!q||pending)return;$('chatInput').value='';$('chatInput').style.height='auto';ask('chat',q)});$('chatInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'});$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit()}});$('demoInfoButton').addEventListener('click',()=>dialog('About this demo','<p>This is a simulated live broadcast powered by an existing recorded match and recorded event data. Your broadcast starts at kick-off. You can also choose the build-up to the first key moment. It keeps moving while you pause or replay.</p><p>Each visitor has an independent session. Back to live catches up with the match; Return to match restores your saved position.</p><p>Moment replay timings are approximate because much of the source event data has minute-level precision.</p>'));
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let activeRecognition=null;
if(Recognition){$('micButton').addEventListener('click',()=>{
 if(activeRecognition){activeRecognition.stop();return}
 const recognition=new Recognition();activeRecognition=recognition;recognition.lang='en-US';
 recognition.onstart=()=>{$('micButton').setAttribute('aria-pressed','true');$('micButton').title='Stop voice input'};
 recognition.onresult=e=>{$('chatInput').value=e.results[0][0].transcript;$('chatInput').dispatchEvent(new Event('input',{bubbles:true}));$('chatInput').focus()};
 recognition.onerror=()=>notice('Voice input was not available. You can still type your question.');
 recognition.onend=()=>{activeRecognition=null;$('micButton').setAttribute('aria-pressed','false');$('micButton').title='Voice input'};
 try{recognition.start()}catch{activeRecognition=null;notice('Voice input was not available. You can still type your question.')}
})}else{$('micButton').disabled=true;$('micButton').title='Voice input is not supported in this browser'}

video.muted=false;video.defaultMuted=false;video.addEventListener('loadeddata',()=>{$('videoLoading').hidden=true;$('videoError').hidden=true});video.addEventListener('playing',()=>{$('videoLoading').hidden=true;renderClocks()});video.addEventListener('pause',()=>{if(video.readyState>=2)$('videoLoading').hidden=true;renderClocks()});video.addEventListener('waiting',()=>{if(!video.paused)$('videoLoading').hidden=false});video.addEventListener('seeked',()=>{seekIntent=null;if(video.readyState>=2)$('videoLoading').hidden=true;refresh(true)});video.addEventListener('canplay',()=>{$('videoLoading').hidden=true});video.addEventListener('seeking',()=>{dataDesk.invalidate();if(video.currentTime>edge()+.5)video.currentTime=Math.max(session?.kickoff_seconds||0,edge()-2)});video.addEventListener('timeupdate',()=>{renderClocks();if(clip&&video.currentTime>=clip.end){returnBookmark();return}refresh()});
async function start(){if(!config.apiBaseURL){$('videoLoading').hidden=true;notice('Set a match service URL to connect playback, conversation and data.');$('startFirstMoment').disabled=true;return}try{const url=new URL(location.href),entry=url.searchParams.get('entry'),mode=entry==='first_moment'?'first_moment':'kickoff';if(url.searchParams.has('entry')){url.searchParams.delete('entry');history.replaceState(history.state,'',url.pathname+url.search+url.hash)}syncClock(await api('/api/session/start',{mode}));await refresh(true);await loadVideo();notice('')}catch(e){notice(e.message);$('videoLoading').hidden=true;$('videoError').hidden=false}}
setInterval(async()=>{if(!session)return;renderClocks();try{syncClock(await api('/api/session'));refresh()}catch(e){notice(e.message)}},5000);setInterval(renderClocks,500);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)api('/api/session').then(syncClock).then(()=>refresh(true)).catch(e=>notice(e.message))});start();


function paintHeaderPreferences(){if(window.insidePreferences)window.insidePreferences.paintHeader();else $('preferencesSummary').textContent='Tactical analyst · Neutral'}

function closeHeaderMenus(focus=false){for(const [buttonId,panelId] of [['fixtureChevron','fixturePanel']]){const button=$(buttonId),panel=$(panelId);if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus()}}}
function toggleHeaderMenu(buttonId,panelId,focusFirst=false){const open=$(panelId).hidden;closeHeaderMenus();if(open){$(panelId).hidden=false;$(buttonId).setAttribute('aria-expanded','true');;if(focusFirst)$(panelId).querySelector('button').focus()}}

$('fixtureChevron').addEventListener('click',()=>toggleHeaderMenu('fixtureChevron','fixturePanel'));
$('fixtureTrigger').addEventListener('click',()=>{closeHeaderMenus();lineupsDialog()});
$('currentFixture').addEventListener('click',()=>closeHeaderMenus(true));

for(const id of ['preferencesButton','lineupsButton','eventsButton'])$(id).addEventListener('click',()=>closeHeaderMenus());
for(const [buttonId,panelId] of [['fixtureChevron','fixturePanel']]){
 $(buttonId).addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();if($(panelId).hidden)toggleHeaderMenu(buttonId,panelId,true);else $(panelId).querySelector('button').focus()}});
 $(panelId).addEventListener('keydown',e=>{const buttons=[...$(panelId).querySelectorAll('button')],at=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus()}else if(e.key==='Home'||e.key==='End'){e.preventDefault();buttons[e.key==='Home'?0:buttons.length-1].focus()}});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHeaderMenus(true)});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.match-select-card'))closeHeaderMenus()});
for(const img of document.querySelectorAll('img[data-crest]'))img.addEventListener('error',()=>{img.hidden=true;img.nextElementSibling.hidden=false});
paintHeaderPreferences();
new ResizeObserver(()=>document.documentElement.style.setProperty('--inside-header-height',document.querySelector('.demo-header').getBoundingClientRect().height+'px')).observe(document.querySelector('.demo-header'));

function updateComposerState(){syncWelcome();paintWebToggle();updateMomentInvitations();
 $('sendButton').disabled=pending||!$('chatInput').value.trim();
 $('clearChat').disabled=pending||!conversation.querySelector('.user-message,.explanation-card,.empty-card,.error-card,.moment-invitation');
}
function closeComposerMore(focus=false){const wasOpen=$('composerMore').open;$('composerMore').open=false;$('clearChatConfirm').hidden=true;$('clearChat').hidden=false;if(focus&&wasOpen)$('composerMore').querySelector('summary').focus()}
$('chatInput').addEventListener('input',updateComposerState);
$('composerPreferences').addEventListener('click',()=>{closeComposerMore();preferences()});
$('clearChat').addEventListener('click',()=>{if(pending)return;$('clearChat').hidden=true;$('clearChatConfirm').hidden=false;$('clearChatCancel').focus()});
$('clearChatCancel').addEventListener('click',()=>{$('clearChatConfirm').hidden=true;$('clearChat').hidden=false;$('clearChat').focus()});
$('clearChatConfirmButton').addEventListener('click',()=>{
 if(pending)return;for(const child of [...conversation.children])if(!child.classList.contains('welcome'))child.remove();
 momentInvitations.clear();conversationStarted=false;setContext(null);$('chatInput').value='';$('chatInput').style.height='auto';updateComposerState();closeComposerMore();$('chatInput').focus();
});
$('composerMore').addEventListener('toggle',()=>{if(!$('composerMore').open){$('clearChatConfirm').hidden=true;$('clearChat').hidden=false}else updateComposerState()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeComposerMore(true)});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#composerMore'))closeComposerMore()});
updateComposerState();

let lineupDataPromise;
async function lineupsDialog(){
 try{
  const data=await (lineupDataPromise??=loadLineups().catch(e=>{lineupDataPromise=null;throw e}));
  dialog('Lineups',renderLineups(data));$('toolsDialog').classList.add('lineup-dialog');
  $('dialogBody').querySelectorAll('[data-player-id]').forEach(b=>b.addEventListener('click',()=>{
   const person=[...data.home,...data.away,...data.homeSubs,...data.awaySubs].find(p=>String(p.id)===b.dataset.playerId);
   if(!person)return;
   $('toolsDialog').close();dataDesk.openPlayer(person.id);
  }));
 }catch{dialog('Lineups','<p>The lineup could not load.</p><button id="retryLineups" class="quiet-action">Try again</button>');$('retryLineups').addEventListener('click',()=>{$('toolsDialog').close();lineupsDialog()})}
}
window.insidePresentation={position:pos,setLevel(v){level=v},currentLevel:()=>level};

function paintWebToggle(){const button=$('webSearchToggle');button.disabled=!webSearchAvailable||pending;button.setAttribute('aria-pressed',String(webSearchEnabled));button.title=webSearchAvailable?'Search latest public information; may include spoilers':'Web search is temporarily unavailable';$('webSearchState').textContent=webSearchAvailable?(webSearchEnabled?'On':'Off'):'Unavailable'}
$('webSearchToggle').addEventListener('click',()=>{if(!webSearchAvailable||pending)return;webSearchEnabled=!webSearchEnabled;paintWebToggle()});
function renderWebCard(card,el){
 el.setAttribute('aria-label','Web search answer');el.className='explanation-card web-answer';el.innerHTML='<div class="web-answer-label">Web search <span>Latest sources</span></div><div class="web-answer-text"></div><div class="web-answer-sources"></div>';
 const body=el.querySelector('.web-answer-text');for(const text of card.answer.what_happened.split(/\n\s*\n/)){const p=document.createElement('p');p.textContent=text;body.append(p)}
 const sources=el.querySelector('.web-answer-sources');const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Sources (${card.web_sources.length})`;details.append(summary);
 for(const source of card.web_sources){let url;try{url=new URL(source.url)}catch{continue}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)continue;const row=document.createElement('div'),a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';a.textContent=`[${source.id}] ${source.title}`;row.append(a);const date=document.createElement('small');date.textContent=[source.published_at?`Published ${source.published_at.slice(0,10)}`:null,source.retrieved_at?`Retrieved ${source.retrieved_at.slice(0,10)}`:null].filter(Boolean).join(' · ');row.append(date);details.append(row)}sources.append(details);setContext(card);scrollChat();window.insidePreferences?.onCard(card,el)
}

function renderSoundControl(){
 const button=$('muteButton');button.ariaLabel=video.muted?'Unmute':'Mute';button.title=video.muted?'Turn sound on':'Mute';
 button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>${video.muted?'<path d="m17 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
}
video.addEventListener('volumechange',renderSoundControl);renderSoundControl();
video.addEventListener('playing',()=>{if(['Your browser requires a tap on the play control to start.','Playback could not start. Please try Play again.'].includes($('connectionNotice').textContent))notice('')});
async function tryPlayback(){
 const mine=playerGeneration;
 try{await video.play()}
 catch(error){
  if(mine!==playerGeneration||error.name==='AbortError')return;
  if(error.name==='NotAllowedError'&&!video.muted){
   video.muted=true;renderSoundControl();
   try{await video.play();return}catch(fallback){error=fallback}
  }
  if(mine!==playerGeneration||error.name==='AbortError')return;
  $('videoLoading').hidden=true;
  notice(error.name==='NotAllowedError'?'Your browser requires a tap on the play control to start.':'Playback could not start. Please try Play again.');
 }
}
dataDesk.init({seek});
