// api-client.js — granular REST client for the Solis database prototype.
// Mirrors server.mjs routes. All functions return Promises; responses carry
// __status so callers can branch on HTTP codes.
var SolisApi = (function() {
  var BASE = '/api/';

  function getToken() {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('solisToken')) || null;
  }

  function req(method, path, body) {
    var opts = { method: method, headers: {} };
    var t = getToken();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(BASE + path, opts).then(function(r) {
      return r.json().then(function(d) { d.__status = r.status; return d; })
        .catch(function() { return { __status: r.status }; });
    });
  }

  // ─── auth ───
  function authLogin(email, password) {
    return req('POST', 'auth/login', { email: email, password: password });
  }
  function authRegister(payload) {
    return req('POST', 'auth/register', payload);
  }
  function authLogout() {
    return req('POST', 'auth/logout');
  }
  function bootstrap(empty) {
    return req('GET', 'bootstrap' + (empty ? '?empty=1' : ''));
  }

  // ─── cells ───
  var CELL_COLUMNS = ['id', 'type', 'title', 'status', 'delib_type', 'participants', 'members',
    'progress', 'days_active', 'lead', 'circle', 'created', 'deadline', 'blind', 'assessors',
    'commissioned_by', 'resolution_ref', 'entity_type', 'source', 'resolution',
    'deliverable_specs', 'meta'];
  var CELL_CHILDREN = ['domains', 'circles', 'participatingCircles', 'messages', 'tasks',
    'objectives', 'team', 'draftResolutions', 'votes'];

  function saveCell(cell) {
    if (!cell || !cell.id) return Promise.resolve(null);
    var meta = {};
    var body = {};
    Object.keys(cell).forEach(function(k) {
      if (k === 'meta') { Object.keys(cell[k] || {}).forEach(function(mk) { meta[mk] = cell[k][mk]; }); return; }
      var col = k.replace(/([A-Z])/g, function(_, c) { return '_' + c.toLowerCase(); });
      if (CELL_COLUMNS.indexOf(col) !== -1) body[col] = cell[k];
      else if (CELL_CHILDREN.indexOf(k) === -1) meta[k] = cell[k];
    });
    body.meta = meta;
    var cellId = cell.id;
    var sync = function(path, list, map) {
      return Promise.all((list || []).map(function(x) {
        return req('POST', path, map(x)).catch(function() {});
      }));
    };
    return req('POST', 'cells', body).then(function() {
      var pcs = cell.participatingCircles || [];
      var ccs = cell.circles || [];
      return Promise.all([
        sync('cells/' + cellId + '/domains', cell.domains || [], function(d) { return { domain: d }; }),
        sync('cells/' + cellId + '/circles', ccs, function(cc) {
          return { name: cc.name, initials: cc.initials, gradient: cc.gradient, status: cc.status, role: cc.role };
        }),
        sync('cells/' + cellId + '/circles', pcs, function(pc) {
          return { circle_id: pc.id, name: pc.name, role: pc.role, votes: pc.votes };
        }),
        sync('cells/' + cellId + '/messages', cell.messages || [], function(m) {
          return { author: m.author, initials: m.initials, text: m.text, time: m.time, color: m.color };
        }),
        sync('cells/' + cellId + '/tasks', cell.tasks || [], function(t) {
          return { task_id: t.id, label: t.label, status: t.status, locked: t.locked ? 1 : 0, assignee: t.assignee };
        }),
        sync('cells/' + cellId + '/objectives', cell.objectives || [], function(o) {
          return { obj_id: o.id, label: o.label, status: o.status };
        }),
        sync('cells/' + cellId + '/team', cell.team || [], function(tm) {
          return { name: tm.name, initials: tm.initials, role: tm.role, focus: tm.focus };
        }),
        syncDrafts(cellId, cell.draftResolutions || [])
      ]);
    });
  }

  function syncDrafts(cellId, drafts) {
    return Promise.all(drafts.map(function(d) {
      return req('POST', 'cells/' + cellId + '/draft-resolutions', {
        res_id: d.id, title: d.title, text: d.text, action: d.action, votes_nullified: !!d.votesNullified
      }).then(function(created) {
        var rowId = created && created.id != null ? created.id : null;
        if (rowId == null) return;
        return Promise.all([
          Promise.all((d.versions || []).map(function(v) {
            return req('POST', 'cells/' + cellId + '/draft-resolutions/' + rowId + '/versions', {
              title: v.title, text: v.text, action: v.action, author: v.author, ts: v.ts
            }).catch(function() {});
          })),
          Promise.all((d.implementingCircles || []).map(function(ic) {
            return req('POST', 'cells/' + cellId + '/draft-resolutions/' + rowId + '/implementing-circles', {
              circle_name: ic
            }).catch(function() {});
          }))
        ]);
      }).catch(function() {});
    }));
  }

  function addTask(cellId, task) {
    return req('POST', 'cells/' + cellId + '/tasks', {
      task_id: task.id, label: task.label, status: task.status, locked: task.locked ? 1 : 0, assignee: task.assignee
    });
  }

  function findTaskRow(cellId, taskId) {
    return req('GET', 'cells/' + cellId + '/tasks').then(function(rows) {
      if (!Array.isArray(rows)) return null;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].task_id) === String(taskId) || String(rows[i].id) === String(taskId)) return rows[i];
      }
      return null;
    });
  }

  function updateTask(cellId, taskId, patch) {
    return findTaskRow(cellId, taskId).then(function(row) {
      if (!row) return null;
      return req('PATCH', 'cells/' + cellId + '/tasks/' + row.id, patch);
    });
  }

  function deleteTask(cellId, taskId) {
    return findTaskRow(cellId, taskId).then(function(row) {
      if (!row) return null;
      return req('DELETE', 'cells/' + cellId + '/tasks/' + row.id);
    });
  }

  // Persist a resolution draft: find-or-create the row, PATCH its fields,
  // then append the newest version (and implementing circles).
  function saveDraftVersion(cellId, draft) {
    if (!draft) return Promise.resolve(null);
    return req('GET', 'cells/' + cellId + '/draft-resolutions').then(function(rows) {
      var row = null;
      if (Array.isArray(rows)) {
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].res_id != null && String(rows[i].res_id) === String(draft.id)) { row = rows[i]; break; }
        }
      }
      var patch = {
        title: draft.title, text: draft.text, action: draft.action, votes_nullified: draft.votesNullified ? 1 : 0
      };
      var save = row
        ? req('PATCH', 'cells/' + cellId + '/draft-resolutions/' + row.id, patch)
        : req('POST', 'cells/' + cellId + '/draft-resolutions', { res_id: draft.id, title: draft.title, text: draft.text, action: draft.action, votes_nullified: draft.votesNullified ? 1 : 0 });
      return save.then(function(res) {
        var rowId = row ? row.id : (res && res.id != null ? res.id : null);
        if (rowId == null) return res;
        var versions = draft.versions || [];
        var latest = versions[versions.length - 1];
        if (!latest) return res;
        return req('POST', 'cells/' + cellId + '/draft-resolutions/' + rowId + '/versions', {
          title: latest.title, text: latest.text, action: latest.action, author: latest.author, ts: latest.ts
        }).then(function() { return res; });
      });
    });
  }

  // ─── circles ───
  var CIRCLE_COLUMNS = ['id', 'name', 'status', 'members', 'motions', 'description', 'founded',
    'term_override', 'expiry_override', 'meta'];

  function saveCircle(circle) {
    if (!circle || !circle.id) return Promise.resolve(null);
    var meta = {};
    ['maxMembers', 'archivedDate', 'archiveReason'].forEach(function(k) {
      if (circle[k] != null) meta[k] = circle[k];
    });
    var body = { id: circle.id, meta: meta };
    Object.keys(circle).forEach(function(k) {
      var col = k.replace(/([A-Z])/g, function(_, c) { return '_' + c.toLowerCase(); });
      if (CIRCLE_COLUMNS.indexOf(col) !== -1 && k !== 'meta' && k !== 'id') body[col] = circle[k];
    });
    var domains = circle.domains || [];
    var primary = (circle.mandate && circle.mandate.primary) || [];
    var secondary = (circle.mandate && circle.mandate.secondary) || [];
    var desired = circle.desiredWs || {};
    var domainPosts = domains.map(function(d) {
      var post = { domain: d };
      if (primary.indexOf(d) !== -1) post.mandate = 'primary';
      else if (secondary.indexOf(d) !== -1) post.mandate = 'secondary';
      if (desired[d] != null) post.desired_ws = desired[d];
      return post;
    });
    return req('POST', 'circles', body).then(function() {
      return Promise.all(domainPosts.map(function(post) {
        return req('POST', 'circles/' + circle.id + '/domains', post).catch(function() {});
      }));
    });
  }

  // ─── threads / inbox / applications / governance ───
  function addThread(thread) {
    if (!thread || !thread.id) return Promise.resolve(null);
    return req('POST', 'threads', {
      id: thread.id, title: thread.title, body: thread.body, author: thread.author,
      initials: thread.initials, avatar: thread.avatar, domain: thread.domain,
      domain_color: thread.domainColor, badge: thread.badge, badge_class: thread.badgeClass,
      replies: thread.replies, likes: thread.likes, shares: thread.shares,
      time: thread.time, pinned: thread.pinned ? 1 : 0
    });
  }

  function addThreadReply(threadId, reply) {
    return req('POST', 'threads/' + threadId + '/replies', {
      author: reply.author, initials: reply.initials, avatar: reply.avatar || null,
      time: reply.time, body: reply.body, likes: reply.likes || 0
    });
  }

  function castVote(cellId, domain, vote) {
    return req('POST', 'cells/' + cellId + '/vote-records', {
      domain: domain, name: vote.name || null, initials: vote.initials,
      ws: vote.ws || 0, vote: vote.vote
    });
  }

  function submitDraftResolution(cellId, draftId) {
    return req('POST', 'cells/' + cellId + '/draft-resolutions/' + draftId + '/submit');
  }

  function closeDebate(cellId, participant) {
    return req('POST', 'cells/' + cellId + '/debate/close', { participant: participant });
  }

  function fileAstfVerdict(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/astf-verdict', payload);
  }

  function spawnXstf(astfCellId, payload) {
    return req('POST', 'cells/' + astfCellId + '/spawn-xstf', payload);
  }

  function submitDeliverable(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/submit-deliverable', payload);
  }

  function reviewDeliverable(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/review-deliverable', payload);
  }

  function spawnVstf(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/spawn-vstf', payload);
  }

  function fileVstfAssessment(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/vstf-assessment', payload);
  }

  function spawnPastf(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/spawn-pastf', payload);
  }

  function filePastfReview(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/pastf-review', payload);
  }

  function reportJstf(payload) {
    return req('POST', 'jstf/report', payload);
  }

  function appealJstf(payload) {
    return req('POST', 'jstf/appeal', payload);
  }

  function escalateJstf(payload) {
    return req('POST', 'jstf/escalate', payload);
  }

  function voteJstf(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/jstf-vote', payload);
  }

  function fileJstfVerdict(cellId, payload) {
    return req('POST', 'cells/' + cellId + '/jstf-verdict', payload);
  }

  function resignCircle(circleId) {
    return req('POST', 'circles/' + circleId + '/resign');
  }

  function removeMember(circleId, payload) {
    return req('POST', 'circles/' + circleId + '/remove-member', payload);
  }

  function flushCircle(circleId, payload) {
    return req('POST', 'circles/' + circleId + '/flush', payload);
  }

  function disbandCircle(circleId) {
    return req('POST', 'circles/' + circleId + '/disband');
  }

  function driftCheck(circleId, payload) {
    return req('POST', 'circles/' + circleId + '/drift-check', payload);
  }

  function checkExpiry(circleId) {
    return req('POST', 'circles/' + circleId + '/check-expiry');
  }

  function runWsDrift() {
    return req('POST', 'competence/ws-drift');
  }

  function endorseCompetence(payload) {
    return req('POST', 'competence/endorse', payload);
  }

  function declareWh(payload) {
    return req('POST', 'competence/declare-wh', payload);
  }

  function verifyWh(payload) {
    return req('POST', 'competence/verify-wh', payload);
  }

  function rankInterests(payload) {
    return req('POST', 'competence/interest', payload);
  }

  function fetchStanding() {
    return req('GET', 'competence/standing');
  }

  function obsNewsList() { return req('GET', 'observatory/news'); }
  function obsNewsCreate(payload) { return req('POST', 'observatory/news', payload); }
  function obsEventsList() { return req('GET', 'observatory/events'); }
  function obsEventsCreate(payload) { return req('POST', 'observatory/events', payload); }
  function obsEventsImport(payload) { return req('POST', 'observatory/events/import', payload); }
  function obsLibraryList() { return req('GET', 'observatory/library'); }
  function obsLibraryCreate(payload) { return req('POST', 'observatory/library', payload); }
  function obsPublicationsList() { return req('GET', 'observatory/publications'); }
  function obsPublicationsPending() { return req('GET', 'observatory/publications/pending'); }
  function obsPublicationsSubmit(payload) { return req('POST', 'observatory/publications', payload); }
  function obsPublicationDecide(id, action) { return req('POST', 'observatory/publications/' + id + '/' + action); }
  function obsOrganisationsList() { return req('GET', 'observatory/organisations'); }
  function obsOrganisationsCreate(payload) { return req('POST', 'observatory/organisations', payload); }

  function saveInboxItem(item) {
    if (!item || !item.id) return Promise.resolve(null);
    return req('PATCH', 'inbox/' + item.id, {
      badge: item.badge, detail: item.detail, unread: item.unread ? 1 : 0
    }).then(function() {
      var sync = function(childPath, list, map) {
        return req('GET', childPath).then(function(rows) {
          if (!Array.isArray(rows)) return;
          var dels = Promise.all(rows.map(function(r) { return req('DELETE', childPath + '/' + r.id).catch(function() {}); }));
          return dels.then(function() {
            return Promise.all((list || []).map(function(x) { return req('POST', childPath, map(x)).catch(function() {}); }));
          });
        });
      };
      return Promise.all([
        sync('inbox/' + item.id + '/actions', item.actions || [], function(a) {
          return { label: a.label, style: a.style, action: a.action };
        }),
        sync('inbox/' + item.id + '/meta', item.meta || [], function(md) {
          return { label: md.label, value: md.value };
        })
      ]);
    });
  }

  function saveCircleApplication(app) {
    if (!app || !app.id) return Promise.resolve(null);
    return req('POST', 'circle-applications', {
      id: app.id, circle_id: app.circleId, circle_name: app.circleName, applicant: app.applicant,
      initials: app.initials, motivation: app.motivation, status: app.status,
      applied_date: app.appliedDate, queue_position: app.queuePosition
    }).then(function() {
      return Promise.all((app.relevantDomains || []).map(function(d) {
        return req('POST', 'circle-applications/' + app.id + '/domains', { domain: d }).catch(function() {});
      }));
    });
  }

  function saveProjectApplication(app) {
    if (!app || !app.id) return Promise.resolve(null);
    return req('POST', 'project-applications', {
      id: app.id, cell_id: app.cellId, project_name: app.projectName, applicant: app.applicant,
      initials: app.initials, motivation: app.motivation, status: app.status,
      applied_date: app.appliedDate, proposed_role: app.proposedRole
    });
  }

  function saveGovernanceEntry(entry) {
    if (!entry || !entry.id) return Promise.resolve(null);
    return req('POST', 'governance-ledger', {
      id: entry.id, type: entry.type, target: entry.target, settings: entry.settings,
      applied_by: entry.appliedBy, applied_at: entry.appliedAt, status: entry.status
    });
  }

  function updateStfCandidate(stfId, candId, patch) {
    return req('PATCH', 'stfs/' + stfId + '/candidates/' + candId, patch);
  }

  function updateThread(threadId, patch) {
    return req('PATCH', 'threads/' + threadId, patch);
  }

  function setThreadEndorse(threadId, on) {
    return req(on ? 'POST' : 'DELETE', 'threads/' + threadId + '/endorsement');
  }

  function setThreadBookmark(threadId, on) {
    return req(on ? 'POST' : 'DELETE', 'threads/' + threadId + '/bookmark');
  }

  function setThreadPinned(threadId, on) {
    return req(on ? 'POST' : 'DELETE', 'threads/' + threadId + '/pin');
  }

  function raiseThreadProposal(threadId) {
    return req('POST', 'threads/' + threadId + '/raise-proposal');
  }

  function createDirectProposal(payload) {
    return req('POST', 'proposals/direct', payload);
  }

  function createSettingsProposal(payload) {
    return req('POST', 'proposals/system', payload);
  }

  function createCircleProposal(payload) {
    return req('POST', 'proposals/system', payload);
  }

  return {
    authLogin: authLogin,
    authRegister: authRegister,
    authLogout: authLogout,
    bootstrap: bootstrap,
    saveCell: saveCell,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    saveDraftVersion: saveDraftVersion,
    saveCircle: saveCircle,
    addThread: addThread,
    saveInboxItem: saveInboxItem,
    saveCircleApplication: saveCircleApplication,
    saveProjectApplication: saveProjectApplication,
    saveGovernanceEntry: saveGovernanceEntry,
    updateStfCandidate: updateStfCandidate,
    updateThread: updateThread,
    addThreadReply: addThreadReply,
    setThreadEndorse: setThreadEndorse,
    setThreadBookmark: setThreadBookmark,
    setThreadPinned: setThreadPinned,
    raiseThreadProposal: raiseThreadProposal,
    createDirectProposal: createDirectProposal,
    createSettingsProposal: createSettingsProposal,
    createCircleProposal: createCircleProposal,
    castVote: castVote,
    submitDraftResolution: submitDraftResolution,
    closeDebate: closeDebate,
    fileAstfVerdict: fileAstfVerdict,
    spawnXstf: spawnXstf,
    submitDeliverable: submitDeliverable,
    reviewDeliverable: reviewDeliverable,
    spawnVstf: spawnVstf,
    fileVstfAssessment: fileVstfAssessment,
    spawnPastf: spawnPastf,
    filePastfReview: filePastfReview,
    reportJstf: reportJstf,
    appealJstf: appealJstf,
    escalateJstf: escalateJstf,
    voteJstf: voteJstf,
    fileJstfVerdict: fileJstfVerdict,
    resignCircle: resignCircle,
    removeMember: removeMember,
    flushCircle: flushCircle,
    disbandCircle: disbandCircle,
    driftCheck: driftCheck,
    checkExpiry: checkExpiry,
    runWsDrift: runWsDrift,
    endorseCompetence: endorseCompetence,
    declareWh: declareWh,
    verifyWh: verifyWh,
    rankInterests: rankInterests,
    fetchStanding: fetchStanding,
    obsNewsList: obsNewsList,
    obsNewsCreate: obsNewsCreate,
    obsEventsList: obsEventsList,
    obsEventsCreate: obsEventsCreate,
    obsEventsImport: obsEventsImport,
    obsLibraryList: obsLibraryList,
    obsLibraryCreate: obsLibraryCreate,
    obsPublicationsList: obsPublicationsList,
    obsPublicationsPending: obsPublicationsPending,
    obsPublicationsSubmit: obsPublicationsSubmit,
    obsPublicationDecide: obsPublicationDecide,
    obsOrganisationsList: obsOrganisationsList,
    obsOrganisationsCreate: obsOrganisationsCreate
  };
})();
