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
    var domains = (p.domains || []).map(function(d) {
      return '<span class="tag tag-xs ' + d.color + '">' + d.name + ' ' + d.ws + (d.verified ? ' ✓' : '') + '</span>';
    }).join('');
    var badges = [];
    if (p.steward) badges.push('<span class="tag tag-xs tag-amber">Steward</span>');
    if (p.status && p.status !== 'Active') badges.push('<span class="tag tag-xs tag-red">' + p.status + '</span>');
    if (p.standing != null) badges.push('<span class="tag tag-xs tag-default">Ws ' + p.standing + '</span>');
    var bottom = [];
    (p.circles || []).forEach(function(c) { bottom.push('<span class="tag tag-xs tag-green">' + c + '</span>'); });
    (p.orgs || []).forEach(function(o) { bottom.push('<span class="tag tag-xs tag-default">' + o + '</span>'); });
    return '<div class="card participant-card" style="cursor:pointer;padding:0;overflow:hidden" onclick="openParticipantModal(\'' + p.name + '\',\'' + p.bio + '\',\'' + p.location + '\',\'' + p.joined + '\',\'' + p.initials + '\')">'
      + '<div class="avatar avatar-square" style="' + avatarStyle + '">' + p.initials + '</div>'
      + '<div class="pc-body">'
      + '<div class="pc-top"><div class="pc-name">' + p.name + '</div><div class="pc-sub">' + p.location + ' · ' + p.joined + '</div></div>'
      + (badges.length ? '<div class="pc-badges" style="margin:4px 0">' + badges.join(' ') + '</div>' : '')
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
    var navJs = typeof navStf === 'function'
      ? "navStf('" + String(s.id || '').replace(/'/g, '\\\'') + "')"
      : "nav('" + (typeof stfNavKey === 'function' ? stfNavKey(s.id) : 'stf-' + s.id) + "')";
    return '<tr class="click" onclick="' + navJs + '">'
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
    var phaseHtml = '';
    if ((t.badge || '') === 'b-judicial' && typeof jstfThreadPhase === 'function') {
      try {
        var ph = jstfThreadPhase(t);
        var phColor = ph.key === 'resolved' ? 'var(--green)' : ph.key === 'open' ? 'var(--text-tertiary)' : 'var(--gold)';
        phaseHtml = '<span class="tag" style="font-size:8px;color:' + phColor + '">' + ph.label + '</span>';
        if (ph.key === 'resolved' && (ph.caseId || ph.cellId) && typeof xrefChip === 'function') {
          phaseHtml += ' ' + xrefChip('cell', ph.caseId || ph.cellId, 'resolution trail', { color: 'var(--green)' });
        }
      } catch (e) {}
    }
    var pinnedClass = t.pinned ? ' pinned' : '';
    var pinnedIcon = t.pinned ? '<span class="post-pin-icon" title="Pinned">&#9733;</span>' : '';
    var pinBtn = canPin ? '<button class="post-action' + (t.pinned ? ' pin-on' : '') + '" onclick="event.stopPropagation();toggleThreadPinned(\'' + t.id + '\')" title="' + (t.pinned ? 'Unpin' : 'Pin') + '"><span>&#9873;</span></button>' : '';
    var isJud = (t.badge || '') === 'b-judicial';
    var domainTagBg = 'background:var(--surface-raised);color:var(--text-secondary);border:1px solid var(--border)';
    if (t.domainColor === 'tag-purple') domainTagBg = 'background:var(--purple-soft);color:var(--purple);border:1px solid var(--purple-border)';
    else if (t.domainColor === 'tag-green') domainTagBg = 'background:var(--green-soft);color:var(--green);border:1px solid var(--green-border)';
    else if (t.domainColor === 'tag-amber') domainTagBg = 'background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-border)';
    else if (t.domainColor === 'tag-blue') domainTagBg = 'background:var(--blue-soft);color:var(--blue);border:1px solid var(--blue-border)';
    else if (t.domainColor === 'tag-red') domainTagBg = 'background:var(--red-soft);color:var(--red);border:1px solid var(--red-border)';
    var domainTag = t.domain ? '<span class="post-domain-tag" style="' + domainTagBg + '">' + t.domain + '</span>' : '';

    return '<div class="post-card' + pinnedClass + '" onclick="openThreadDetail(\'' + t.id + '\')">'
      + '<div class="post-header">'
      + '<div class="post-avatar" style="' + avatarBg + '">' + t.initials + '</div>'
      + '<div class="post-meta">'
      + '<div class="post-author">' + t.author + '</div>'
      + '<div class="post-author-line">'
      + domainTag
      + '<span>' + t.time + '</span>'
      + pinnedIcon
      + '</div></div>'
      + '<div class="post-footer">' + badgeHtml + phaseHtml + '</div>'
      + '</div>'
      + '<div class="post-title">' + t.title + '</div>'
      + '<div class="post-body">' + t.body + '</div>'
      + '<div class="post-actions">'
      + (isJud
        ? '<button class="post-action" onclick="event.stopPropagation();openThreadDetail(\'' + t.id + '\')"><span>&#9114;</span><span class="count">' + t.replies + '</span></button>'
        : '<button class="post-action' + ((window._likedThreads && window._likedThreads[t.id]) ? ' liked' : '') + '" onclick="event.stopPropagation();toggleThreadLike(\'' + t.id + '\')"><span>' + ((window._likedThreads && window._likedThreads[t.id]) ? '&#9829;' : '&#9825;') + '</span><span class="count">' + t.likes + '</span></button>'
        + pinBtn
        + '<button class="post-action' + ((window._endorsedThreads && window._endorsedThreads[t.id]) ? ' endorsed' : '') + '" onclick="event.stopPropagation();toggleThreadEndorse(\'' + t.id + '\')"><span>&#10003;</span><span class="count">' + (t.endorsements || 0) + '</span></button>'
        + '<button class="post-action' + ((window._bookmarkedThreads && window._bookmarkedThreads[t.id]) ? ' bookmarked' : '') + '" onclick="event.stopPropagation();toggleThreadBookmark(\'' + t.id + '\')"><span>&#' + ((window._bookmarkedThreads && window._bookmarkedThreads[t.id]) ? '11035' : '11036') + ';</span></button>'
        + '<button class="post-action" onclick="event.stopPropagation();openThreadDetail(\'' + t.id + '\')"><span>&#9114;</span><span class="count">' + t.replies + '</span></button>'
        + '<button class="post-action" onclick="event.stopPropagation();shareThread(\'' + t.id + '\')"><span>&#8681;</span><span class="count">' + t.shares + '</span></button>')
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

// Cell type registry: glyph + room theme (badge + left-border accent) used by
// the cells grid and kept in sync with the Cell Types legend.
var CELL_TYPE_STYLES = {
  'Deliberation Cell': { glyph: '◎', color: 'var(--gold)', soft: 'var(--gold-soft)', label: 'Deliberation' },
  'Circle Cell': { glyph: '⬡', color: 'var(--purple)', soft: 'var(--purple-soft)', label: 'Circle' },
  'Project Cell': { glyph: '▣', color: 'var(--green)', soft: 'var(--green-soft)', label: 'Project' },
  'Founding Cell': { glyph: '✦', color: 'var(--teal)', soft: 'var(--teal-soft)', label: 'Founding' },
  'vSTF Cell': { glyph: '✔', color: 'var(--purple)', soft: 'var(--purple-soft)', label: 'vSTF' },
  'aSTF Cell': { glyph: '◈', color: 'var(--red)', soft: 'var(--red-soft)', label: 'aSTF' },
  'xSTF Cell': { glyph: '⬢', color: 'var(--blue)', soft: 'var(--blue-soft)', label: 'xSTF' },
  'jSTF Cell': { glyph: '⚖', color: 'var(--red)', soft: 'var(--red-soft)', label: 'jSTF' },
  'p-aSTF Cell': { glyph: '↻', color: 'var(--teal)', soft: 'var(--teal-soft)', label: 'p-aSTF' }
};
function cellTypeStyle(type) {
  return CELL_TYPE_STYLES[type] || { glyph: '⬡', color: 'var(--text-tertiary)', soft: 'var(--surface-raised)', label: type || 'Cell' };
}
// Runtime-state tags derived from process data (restriction, verdict, blind).
function cellStateTags(c) {
  var tags = [];
  var restriction = c.restriction || {};
  var resolution = c.resolution || {};
  if (c.status === 'Under Investigation') tags.push({ label: 'investigating', color: 'var(--amber)' });
  if (restriction.state === 'restricted') tags.push({ label: 'restricted' + (restriction.severity ? ' · ' + restriction.severity : ''), color: 'var(--red)' });
  if (c.verdict && !resolution.audit) tags.push({ label: 'awaiting audit', color: 'var(--amber)' });
  if (c.status === 'Resolution Applied' || resolution.status === 'Applied') tags.push({ label: 'applied', color: 'var(--green)' });
  if (c.status === 'Blind Review') tags.push({ label: 'blind review', color: 'var(--purple)' });
  if (c.blind && c.status !== 'Blind Review') tags.push({ label: 'blind', color: 'var(--purple)' });
  if (c.status === 'Archived') tags.push({ label: 'archived', color: 'var(--text-tertiary)' });
  return tags;
}
// Per-type dispatcher: routes to the view that actually owns the cell.
function cellOnclick(c) {
  var id = String(c.id).replace(/'/g, '\\\'');
  switch (c.type) {
    case 'Project Cell': return "openProjectCell('" + id + "')";
    case 'Deliberation Cell': return "openDelibCell('" + id + "')";
    case 'Circle Cell': return "openCircleCell('" + id + "')";
    case 'Founding Cell': return "nav('organisations')";
    case 'jSTF Cell': return "openJstfCase('" + id + "')";
    case 'aSTF Cell': return "openAstfCell('" + id + "')";
    case 'xSTF Cell': return "openXstfCase('" + id + "')";
    case 'vSTF Cell': return "nav('" + ((c.title && /competence|credential/i.test(c.title)) ? 'stf-vstf-competence' : 'stf-vstf-steward') + "')";
    case 'p-aSTF Cell': return "nav('stf-pastf')";
    default: return "nav('cells')";
  }
}
var CELL_FILTER_PREDICATES = {
  all: function() { return true; },
  Active: function(c) { return c.status === 'Active'; },
  Archived: function(c) { return c.status === 'Archived'; },
  Investigation: function(c) { return c.status === 'Under Investigation'; },
  Restricted: function(c) { return (c.restriction || {}).state === 'restricted'; },
  Blind: function(c) { return !!c.blind; },
  Verdict: function(c) { return c.status === 'Finalised' || c.status === 'Blind Review' || !!(c.verdict && !(c.resolution || {}).audit); }
};

function renderCellCards(filter) {
  if (!MOCK) return '';
  filter = filter || 'all';
  var predicate = CELL_FILTER_PREDICATES[filter];
  var cells = (MOCK.cells || []).filter(function(c) {
    if (predicate) return predicate(c);
    return c.status === filter;
  });
  if (cells.length === 0) {
    return '<div class="card" style="text-align:center;padding:24px"><div style="font-size:12px;color:var(--text-tertiary)">No cells match this filter.</div></div>';
  }
  return cells.map(function(c) {
    var st = cellTypeStyle(c.type);
    var isArchived = c.status === 'Archived';
    var statusBadge = c.status === 'Active' ? 'b-active' : c.status === 'Archived' ? 'b-judicial' : c.status === 'Under Investigation' || c.status === 'Finalised' || c.status === 'Resolution Applied' ? 'b-review' : 'b-pending';
    var cardStyle = 'border-left:3px solid ' + st.color + ';' + (isArchived ? 'opacity:0.65' : '');
    var tags = cellStateTags(c);
    var tagHtml = tags.length ? '<div class="flex gap-2" style="flex-wrap:wrap;margin-top:6px">' + tags.map(function(t) {
      return '<span style="font-family:var(--mono);font-size:8px;letter-spacing:.05em;padding:2px 6px;border:1px solid ' + t.color + ';color:' + t.color + ';border-radius:99px">' + t.label + '</span>';
    }).join('') + '</div>' : '';
    var xr = [];
    if (typeof xrefChip === 'function') {
      var pName = function(pid) {
        var ps = MOCK.participants || [];
        for (var pi = 0; pi < ps.length; pi++) if (ps[pi].id === pid) return ps[pi].name;
        return pid;
      };
      var src = c.source || {};
      if (src.type === 'judicial-audit') {
        if (src.targetId) xr.push(xrefChip('user', src.targetId, src.targetName || pName(src.targetId), { color: 'var(--red)' }));
        if (src.sourceCellId) xr.push(xrefChip('cell', src.sourceCellId, 'jSTF case', { color: 'var(--red)' }));
      } else {
        if (c.targetId) xr.push(xrefChip('user', c.targetId, pName(c.targetId), { color: 'var(--red)' }));
        if (c.commissionedBy) xr.push(xrefChip('user', c.commissionedBy, pName(c.commissionedBy), { color: 'var(--purple)' }));
        if (src.originCellId) xr.push(xrefChip('motion', src.originCellId, 'motion', { color: 'var(--gold)' }));
        if (c.resolutionRef) xr.push(xrefChip('cell', c.resolutionRef, 'aSTF audit', { color: 'var(--blue)' }));
        if (c.type && c.type.indexOf('jSTF') !== -1) xr.push(xrefChip('stf', 'stf-' + c.id, 'STF', { color: 'var(--teal)' }));
      }
    }
    var xrHtml = xr.length ? '<div style="margin-top:6px">' + xr.join('') + '</div>' : '';
    return '<div class="card click" style="' + cardStyle + '" onclick="' + cellOnclick(c) + '">'
      + '<div class="flex justify-between mb-2"><span class="badge ' + statusBadge + '" style="background:' + st.soft + ';color:' + st.color + '"><span style="margin-right:4px">' + st.glyph + '</span>' + st.label + '</span>'
      + '<span style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + c.id.toUpperCase() + (isArchived && c.archivedDate ? ' &middot; Archived ' + c.archivedDate : '') + '</span></div>'
      + '<div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px">' + c.title + '</div>'
      + '<div style="font-family:var(--mono);font-size:10px;color:var(--text-tertiary)">' + (c.participants ? c.participants + ' participants' : c.members ? c.members + ' members' : '') + (c.progress ? ' · ' + c.progress + '% complete' : '') + '</div>'
      + tagHtml
      + xrHtml
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
