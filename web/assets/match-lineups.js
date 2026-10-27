const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl = (url) => /^(https?:\/\/|\/(?!\/))/.test(url || '') ? url : '';

// Order formation rows for the two sides of the pitch.
export function formationRows(players = [], side = 'home') {
  const rows = new Map();
  const unplaced = [];
  for (const player of players) {
    const coordinate = String(player.field || '');
    const [line, slot] = coordinate.split(':').map(Number);
    if (!/^\d+:\d+$/.test(coordinate) || !Number.isInteger(line) || line < 1 || line > 6 || !Number.isInteger(slot) || slot < 1) {
      unplaced.push(player); continue;
    }
    if (!rows.has(line)) rows.set(line, []);
    rows.get(line).push({ ...player, fieldSlot: slot });
  }
  const direction = side === 'away' ? 1 : -1;
  return { rows: [...rows].sort((a,b) => b[0]-a[0]).map(([line, people]) => ({line, players:people.sort((a,b) => direction * (a.fieldSlot-b.fieldSlot))})), unplaced };
}

function playerCard(p, side, { bench = false, rating = false } = {}) {
  const name = String(p.name || 'Unknown player');
  const photo = imageUrl(p.photo);
  const jersey = p.jersey != null && /^\d+$/.test(String(p.jersey)) && Number(p.jersey)>0 && Number(p.jersey)<=99 ? String(p.jersey) : '';
  const score = p.rating != null && Number.isFinite(Number(p.rating)) ? Number(p.rating).toFixed(1) : '—';
  const label = [name, jersey ? `${jersey}` : 'Shirt number unavailable', rating && `Rating ${score}`].filter(Boolean).join(', ');

  const tag = p.id ? 'button' : 'div';
  return `<${tag} ${p.id ? 'type="button"' : ''} class="${bench ? 'sub-tile' : 'player-marker'}" data-player-id="${esc(p.id || '')}" data-team="${side}" aria-label="${esc(label)}" title="${esc(label)}">
    ${rating && !bench ? `<span class="lineup-rating${Number(p.rating) >= 8 ? ' is-high' : ''}">${score}</span>` : ''}
    <span class="lineup-portrait${String(p.field || '').startsWith('1:') ? ' is-goalkeeper' : ''}">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" onerror="this.hidden=true"/>` : ''}<span class="lineup-initials" aria-hidden="true"><svg viewBox="0 0 48 48" class="lineup-default-avatar" aria-hidden="true"><circle cx="24" cy="17" r="8" fill="currentColor"/><path d="M9 43v-5a15 15 0 0 1 30 0v5Z" fill="currentColor"/></svg></span>${jersey ? `<span class="lineup-number">${esc(jersey)}</span>` : ''}</span>
    <span class="lineup-player-name">${esc(p.shortName || name)}</span>
  </${tag}>`;
}

function teamBoard(data, side) {
  const people = Array.isArray(data[side]) ? data[side] : [];
  const subs = Array.isArray(data[side + 'Subs']) ? data[side + 'Subs'] : [];
  const name = data[side + 'Code'] || (side === 'home' ? 'Home team' : 'Away team');
  const logo = imageUrl(data[side + 'Logo']);
  const {rows, unplaced} = formationRows(people, side);
  const formation = rows.filter(r=>r.line!==1).slice().reverse().map(r=>r.players.length).join('-');
  const rating = people.some(p=>p.rating != null);
  const status = data[side+'Status'];
  const stateLabel = status==='predicted'?'Predicted lineup':status==='confirmed'?'Confirmed lineup':people.length?'Starting lineup':'Lineup to be announced';
  const field = rows.length ? `<div class="lineup-half-pitch" style="--formation-rows:${rows.length}">
    <svg class="lineup-field-lines" viewBox="0 0 500 500" preserveAspectRatio="none" aria-hidden="true"><path d="M12 6H488V488H12ZM12 6H488M200 6a50 50 0 0 0 100 0M135 488V418H365V488M205 488V462H295V488"/><circle cx="250" cy="450" r="2"/></svg>
    ${rows.map(row=>`<div class="lineup-formation-row" data-line="${row.line}" style="--row-players:${row.players.length}">${row.players.map(p=>playerCard(p,side,{rating})).join('')}</div>`).join('')}
  </div>` : '';
  const unknownPositions = unplaced.length ? `<div class="lineup-unplaced">${unplaced.map(p=>playerCard(p,side,{rating})).join('')}</div>` : '';
  const bench = subs.length ? `<details class="lineup-bench"><summary>Substitutes <span>${subs.length}</span></summary><div class="lineup-bench-list">${subs.map(p=>playerCard(p,side,{bench:true})).join('')}</div></details>` : '<p class="lineup-bench-empty">No substitute data</p>';
  return `<section class="lineup-team-board" data-team="${side}" data-lineup-status="${esc(status || 'unknown')}"><header class="lineup-team-heading"><span>${logo ? `<img src="${esc(logo)}" alt="" onerror="this.hidden=true"/>` : ''}<strong>${esc(name)}</strong></span>${formation ? `<span class="lineup-formation">${formation}</span>` : ''}</header><p class="lineup-state${status==='predicted'?' is-predicted':''}">${stateLabel}</p>${field}${unknownPositions}${!people.length ? '<p class="lineup-bench-empty">No starting lineup data</p>' : ''}${bench}</section>`;
}

export function renderLineups(data) {
  return `<div class="lineup-boards">${teamBoard(data, 'home')}${teamBoard(data, 'away')}</div>`;
}
