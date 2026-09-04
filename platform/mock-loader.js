// mock-loader.js — shared render helpers for the SPA (data comes from /api/bootstrap, never mock.json)
var MOCK = null;
var cellsById = {};

function renderParticipantCards() {
  if (!MOCK) return '';
  if (!MOCK.participants || !MOCK.participants.length) {
    return '<div class="card" style="text-align:center;padding:24px"><div style="font-size:12px;color:var(--text-tertiary)">No participants registered yet.</div></div>';
  }
  return MOCK.participants.map(function(p) {
    var avatarStyle = 'display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0';
    if (p.avatar.gradient) avatarStyle += ';background:' + p.avatar.gradient + ';color:#fff';
    if (p.avatar.gold) avatarStyle += ';background:var(--gold)';
    var domains = p.domains.map(function(d) {
      return '<span class="tag tag-xs ' + d.color + '">' + d.name + ' ' + d.ws + '</span>';
    }).join('');
    var bottom = [];
    p.circles.forEach(function(c) { bottom.push('<span class="tag tag-xs tag-green">' + c + '</span>'); });
    p.orgs.forEach(function(o) { bottom.push('<span class="tag tag-xs tag-default">' + o + '</span>'); });
    return '<div class="card participant-card" style="cursor:pointer;padding:0;overflow:hidden" onclick="openParticipantModal(\'' + p.name + '\',\'' + p.bio + '\',\'' + p.location + '\',\'' + p.joined + '\',\'' + p.initials + '\')">'
      + '<div class="avatar avatar-square" style="' + avatarStyle + '">' + p.initials + '</div>'
      + '<div class="pc-body">'
      + '<div class="pc-top"><div class="pc-name">' + p.name + '</div><div class="pc-sub">' + p.location + ' · ' + p.joined + '</div></div>'
      + '<div class="pc-domains">' + domains + '</div>'
      + '<div class="pc-bottom">' + bottom.join('') + '<span class="tag tag-xs tag-red" style="cursor:pointer" onclick="event.stopPropagation();openReportModal(\'' + p.id + '\',\'' + p.name.replace(/'/g, '\\\'') + '\')">Report</span></div>'
      + '</div></div>';
  }).join('');
}

function renderCircleCards(filter) {
  if (!MOCK) return '';
  filter = filter || 'all';
  var circles = (MOCK.circles || []).filter(function(c) { return filter === 'all' || c.status === filter; });
  if (circles.length === 0) {
    return '<div class="card" style="text-align:center;padding:24px"><div style="font-size:12px;color:var(--text-tertiary)">No circles match this filter.</div></div>';
  }
  return circles.map(function(c) {
    var isArchived = c.status === 'Archived';
    var badgeClass = c.status === 'Active' ? 'b-active' : c.status === 'Archived' ? 'b-judicial' : 'b-pending';
    var cardStyle = isArchived ? 'opacity:0.65' : '';
    return '<div class="card click" style="' + cardStyle + '" onclick="openCircleDetail(\'' + c.id + '\')">'
      + '<div class="flex justify-between mb-2"><span class="badge ' + badgeClass + '">' + c.status + '</span>'
      + '<span style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + c.members + ' members' + (isArchived && c.archivedDate ? ' &middot; Archived ' + c.archivedDate : '') + '</span></div>'
      + '<div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px">' + c.name + '</div>'
      + '<div style="font-size:12px;color:var(--text-tertiary);line-height:1.4;margin-bottom:10px">' + c.description + '</div>'
      + '<div style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + c.domains.join(' · ') + '</div>'
      + (isArchived && c.archiveReason ? '<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;font-style:italic">Reason: ' + c.archiveReason + '</div>' : '')
      + '</div>';
  }).join('');
}

function filterCircles(filter, btn) {
  document.querySelectorAll('#circles-filters .feed-filter').forEach(function(f) { f.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var grid = document.getElementById('circles-grid');
  if (grid) grid.innerHTML = renderCircleCards(filter);
}

function renderSTFRows() {
  if (!MOCK) return '';
  var s = MOCK.stfs;
  // normalise: may be {pending,active,completed} or array or missing (anon)
  if (Array.isArray(s)) s = { pending: [], active: s, completed: [] };
  s = s || { pending: [], active: [], completed: [] };
  s.pending = s.pending || []; s.active = s.active || []; s.completed = s.completed || [];
  var all = s.pending.concat(s.active, s.completed);
  if (!all.length) return '<tr><td colspan="5" style="text-align:center;padding:20px;font-size:12px;color:var(--text-tertiary)">No STFs currently active.</td></tr>';
  return all.map(function(s) {
    var tagClass = s.type === 'vSTF' ? 'tag-purple' : s.type === 'aSTF' ? 'tag-blue' : s.type === 'jSTF' ? 'tag-red' : s.type === 'xSTF' ? 'tag-amber' : 'tag-blue';
    var badgeClass = s.status === 'Invitation' ? 'b-pending' : s.status === 'Active' ? 'b-active' : s.status === 'Closed' ? 'b-judicial' : 'b-pending';
    var purpose = s.purpose + (s.candidate ? ': ' + s.candidate : s.title ? ': ' + s.title : '');
    return '<tr class="click" onclick="nav(\'' + (typeof stfNavKey === 'function' ? stfNavKey(s.id) : 'stf-' + s.id) + '\')">'
      + '<td><span class="tag ' + tagClass + '" style="font-size:8px">' + s.type + '</span></td>'
      + '<td class="s">' + purpose + '</td>'
      + '<td>' + s.circle + '</td>'
      + '<td class="m">' + s.deadline + '</td>'
      + '<td><span class="badge ' + badgeClass + '">' + s.status + '</span></td></tr>';
  }).join('');
}

function renderInboxItems() {
  if (!MOCK) return '';
  var items = MOCK.inbox || [];
  return items.map(function(item) {
    return '<div class="inbox-item">'
      + '<div class="inbox-icon">' + (item.type === 'vSTF' ? '◆' : item.type === 'aSTF' ? '◆' : item.type === 'Deliberation' ? '◎' : item.type === 'xSTF' ? '◆' : item.type === 'Cell' ? '⬡' : '✓') + '</div>'
      + '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;color:var(--text)">' + item.title + '</div>'
      + '<div style="font-size:10px;color:var(--text-tertiary)">' + item.desc + '</div></div>'
      + '<div style="text-align:right;flex-shrink:0"><div class="badge ' + (item.badge === 'Invitation' ? 'b-pending' : item.badge === 'Active' ? 'b-active' : 'b-review') + '" style="font-size:7px">' + item.badge + '</div>'
      + '<div style="font-size:9px;color:var(--text-tertiary);margin-top:2px">' + item.time + '</div></div></div>';
  }).join('');
}

function renderDiscussionThreads(list, emptyMsg) {
  if (!MOCK) return '';
  var items = list || MOCK.threads || [];
  if (!items.length) {
    var msg = emptyMsg || 'No discussions yet. Start a thread above.';
    return '<div class="card" style="text-align:center;padding:24px"><div style="font-size:12px;color:var(--text-tertiary)">' + msg + '</div></div>';
  }
  var canPin = typeof window.isStewardOfAnyCircle === 'function' && window.isStewardOfAnyCircle();
  var sorted = items.slice().sort(function(a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
  return sorted.map(function(t) {
    var avatarBg = 'background:var(--navy-light)';
    if (t.avatar && t.avatar.gradient) avatarBg = 'background:' + t.avatar.gradient;
    var badgeHtml = t.badge ? '<span class="badge ' + t.badgeClass + '" style="font-size:8px">' + t.badge + '</span>' : '';
    var pinnedClass = t.pinned ? ' pinned' : '';
    var pinnedIcon = t.pinned ? '<span class="post-pin-icon" title="Pinned">&#9733;</span>' : '';
    var pinBtn = canPin ? '<button class="post-action' + (t.pinned ? ' pin-on' : '') + '" onclick="event.stopPropagation();toggleThreadPinned(\'' + t.id + '\')" title="' + (t.pinned ? 'Unpin' : 'Pin') + '"><span>&#9873;</span></button>' : '';
    var domainTagBg = 'background:var(--surface-raised);color:var(--text-secondary);border:1px solid var(--border)';
    if (t.domainColor === 'tag-purple') domainTagBg = 'background:var(--purple-soft);color:var(--purple);border:1px solid var(--purple-border)';
    else if (t.domainColor === 'tag-green') domainTagBg = 'background:var(--green-soft);color:var(--green);border:1px solid var(--green-border)';
    else if (t.domainColor === 'tag-amber') domainTagBg = 'background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-border)';
    else if (t.domainColor === 'tag-blue') domainTagBg = 'background:var(--blue-soft);color:var(--blue);border:1px solid var(--blue-border)';
    else if (t.domainColor === 'tag-red') domainTagBg = 'background:var(--red-soft);color:var(--red);border:1px solid var(--red-border)';

    return '<div class="post-card' + pinnedClass + '" onclick="openThreadDetail(\'' + t.id + '\')">'
      + '<div class="post-header">'
      + '<div class="post-avatar" style="' + avatarBg + '">' + t.initials + '</div>'
      + '<div class="post-meta">'
      + '<div class="post-author">' + t.author + '</div>'
      + '<div class="post-author-line">'
      + '<span class="post-domain-tag" style="' + domainTagBg + '">' + t.domain + '</span>'
      + '<span>' + t.time + '</span>'
      + pinnedIcon
      + '</div></div>'
      + '<div class="post-footer">' + badgeHtml + '</div>'
      + '</div>'
      + '<div class="post-title">' + t.title + '</div>'
      + '<div class="post-body">' + t.body + '</div>'
      + '<div class="post-actions">'
      + '<button class="post-action' + ((window._likedThreads && window._likedThreads[t.id]) ? ' liked' : '') + '" onclick="event.stopPropagation();toggleThreadLike(\'' + t.id + '\')"><span>' + ((window._likedThreads && window._likedThreads[t.id]) ? '&#9829;' : '&#9825;') + '</span><span class="count">' + t.likes + '</span></button>'
      + pinBtn
      + '<button class="post-action' + ((window._endorsedThreads && window._endorsedThreads[t.id]) ? ' endorsed' : '') + '" onclick="event.stopPropagation();toggleThreadEndorse(\'' + t.id + '\')"><span>&#10003;</span><span class="count">' + (t.endorsements || 0) + '</span></button>'
      + '<button class="post-action' + ((window._bookmarkedThreads && window._bookmarkedThreads[t.id]) ? ' bookmarked' : '') + '" onclick="event.stopPropagation();toggleThreadBookmark(\'' + t.id + '\')"><span>&#' + ((window._bookmarkedThreads && window._bookmarkedThreads[t.id]) ? '11035' : '11036') + ';</span></button>'
      + '<button class="post-action" onclick="event.stopPropagation();openThreadDetail(\'' + t.id + '\')"><span>&#9114;</span><span class="count">' + t.replies + '</span></button>'
      + '<button class="post-action" onclick="event.stopPropagation();shareThread(\'' + t.id + '\')"><span>&#8681;</span><span class="count">' + t.shares + '</span></button>'
      + '</div></div>';
  }).join('');
}

function renderProjectRows() {
  if (!MOCK) return '';
  if (!MOCK.projects || !MOCK.projects.length) {
    return '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:12px">No projects yet. Propose one from Discussions.</td></tr>';
  }
  return MOCK.projects.map(function(p) {
    var cell = ((MOCK.cells || []).filter(function(c) { return c.type === 'Project Cell' && (p.title && (c.title || '').indexOf(p.title.split(' ').slice(0, 2).join(' ')) !== -1 || c.title && (p.title || '').indexOf(c.title.split(' ').slice(0, 2).join(' ')) !== -1); })[0]) || null;
    var onclick = cell ? "openProjectCell('" + cell.id + "')" : "nav('undertakings')";
    return '<tr class="click" onclick="' + onclick + '">'
      + '<td class="s">' + p.title + '</td>'
      + '<td>' + p.domains.join(' + ') + '</td>'
      + '<td>' + p.lead + '</td>'
      + '<td class="m">' + p.progress + '%</td>'
      + '<td><span class="badge b-' + (p.role === 'Lead' ? 'active' : p.role === 'Contributor' ? 'review' : 'pending') + '">' + p.role + '</span></td></tr>';
  }).join('');
}

function renderCellCards(filter) {
  if (!MOCK) return '';
  filter = filter || 'all';
  var cells = (MOCK.cells || []).filter(function(c) { return filter === 'all' || c.status === filter; });
  if (cells.length === 0) {
    return '<div class="card" style="text-align:center;padding:24px"><div style="font-size:12px;color:var(--text-tertiary)">No cells match this filter.</div></div>';
  }
  return cells.map(function(c) {
    var isArchived = c.status === 'Archived';
    var icon = c.type === 'Deliberation Cell' ? 'delib' : c.type === 'Circle Cell' ? 'circle' : c.type === 'Founding Cell' ? 'organisations' : '';
    var badgeClass = c.status === 'Active' ? 'b-active' : c.status === 'Archived' ? 'b-judicial' : 'b-pending';
    var cardStyle = isArchived ? 'opacity:0.65' : '';
    var onclick = c.type === 'Project Cell' ? "openProjectCell('" + c.id + "')" : c.type === 'Deliberation Cell' ? "openDelibCell('" + c.id + "')" : c.type === 'Circle Cell' ? "openCircleCell('" + c.id + "')" : "nav('" + (c.type === 'Founding Cell' ? 'organisations' : c.type === 'aSTF Cell' ? 'stf-astf' : c.type === 'xSTF Cell' ? 'stf-xstf' : 'cells') + "')";
    return '<div class="card click" style="' + cardStyle + '" onclick="' + onclick + '">'
      + '<div class="flex justify-between mb-2"><span class="badge ' + badgeClass + '">' + c.type + '</span>'
      + '<span style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + c.id.toUpperCase() + (isArchived && c.archivedDate ? ' &middot; Archived ' + c.archivedDate : '') + '</span></div>'
      + '<div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px">' + c.title + '</div>'
      + '<div style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + (c.participants ? c.participants + ' participants' : c.members ? c.members + ' members' : '') + (c.progress ? ' · ' + c.progress + '% complete' : '') + '</div>'
      + '</div>';
  }).join('');
}

function filterCells(filter, btn) {
  document.querySelectorAll('#cells-filters .feed-filter').forEach(function(f) { f.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var grid = document.getElementById('cells-grid');
  if (grid) grid.innerHTML = renderCellCards(filter);
}

function renderNewsCards() {
  if (!MOCK) return '';
  return (MOCK.news || []).map(function(n) {
    return '<div class="card"><div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px">' + n.title + '</div>'
      + '<div style="font-size:10px;color:var(--text-tertiary)">' + n.source + ' · ' + n.time + '</div></div>';
  }).join('');
}

function renderEventCards() {
  if (!MOCK) return '';
  return (MOCK.events || []).map(function(e) {
    return '<div class="card"><div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px">' + e.title + '</div>'
      + '<div style="font-size:10px;color:var(--text-tertiary)">' + e.date + ' · ' + e.location + '</div></div>';
  }).join('');
}

function renderOpportunityCards() {
  if (!MOCK) return '';
  return (MOCK.opportunities || []).map(function(o) {
    return '<div class="card"><div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px">' + o.title + '</div>'
      + '<div style="font-size:10px;color:var(--text-tertiary)">' + o.type + ' · Deadline ' + o.deadline + '</div></div>';
  }).join('');
}
