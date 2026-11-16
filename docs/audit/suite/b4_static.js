const fs = require('fs');
const html = fs.readFileSync(process.env.SOLIS_REPO || 'M:/Dev/projects/New folder/solis/solis' + '/platform/index.html', 'utf8').replace(/\r\n/g, '\n');
const results = [];
function check(name, cond, detail) { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  => ' + JSON.stringify(detail)}`); }

// must exist (Batch 4 additions)
check('containers: circles-my-circles', html.includes('id="circles-my-circles"'));
check('containers: circles-active-motions', html.includes('id="circles-active-motions"'));
check('renderCirclesAside defined', html.includes('function renderCirclesAside()'));
check('deriveDomainShares defined', html.includes('function deriveDomainShares(r)'));
check('openXstfCreateModalFromCell defined', html.includes('function openXstfCreateModalFromCell()'));
check('circleMandateTagHtml defined', html.includes('function circleMandateTagHtml('));
check('nav hooks circles aside', html.includes("if (key === 'circles' && typeof renderCirclesAside === 'function') renderCirclesAside();"));
check('breadcrumb dynamic override', html.includes("if (key === 'circle-detail' && typeof currentCircleDetailId"));
check('settings modal renders mandate tags', html.includes('primEl.innerHTML = (mand.primary || [])'));
check('res modal renders impl chips', html.includes('implChipEl.innerHTML = allCircles.length'));

// must NOT exist (hardcodes removed)
check("no openXstfCreateModal('space-law')", !html.includes("openXstfCreateModal('space-law')"));
check("no || 'space-law' fallback", !html.includes("|| 'space-law'"));
check('no static Your-Circles SL row', !html.includes('8 members · 2 motions'));
check('no static aside Artemis row', !html.includes('Artemis Accords Ratification'));
check('no static breadcrumb Space Law', !html.includes("'circle-detail':  ['Circles', 'Space Law Circle']"));
check('no settings name hardcode', !html.includes('value="Space Law Circle"'));
check('no settings desc hardcode', !html.includes('across African space agencies'));
check('no static mandate Space Law tag', !html.includes('>Space Law <input type="number" value="2500"'));
check('no static impl chips', !html.includes('Education Circle</span>'));
check("no drift threshold hardcode", !html.includes('driftCheck(circleId, { threshold: 50 })'));
check('no domainShares 0.33 hardcode', !html.includes("'Space Law': 0.33"));
check('no spaceLawCircle initApp preload', !html.includes('spaceLawCircle'));
check('no participatingCircles Space Law injection', !html.includes("participatingCircles: [{ name: 'Space Law Circle'"));
check("no stf.circle fallback 'Space Law Circle'", !html.includes("stf.circle || 'Space Law Circle'"));
check('no AI-draft impl circles hardcode', !html.includes("implementingCircles: ['Space Law Circle'"));

// follow-ups B/C: circle-cell xSTF list filtered to the cell's circle,
// renderCircleCell resolves by exact id only (no first-cell fallback)
check('xSTF list filtered by circle (stfs)', html.includes('s.type === \'xSTF\' && belongsToCircle(s.circle)'));
check('xSTF list filtered by circle (cells)', html.includes('belongsToCircle(c.circle) || belongsToCircle(c.commissionedBy)'));
check('no unfiltered xSTF list', !html.includes("s.type === 'xSTF'; }"));
check('renderCircleCell exact-id lookup', html.includes('function renderCircleCell(cellId) {\n  var cell = cellsById[cellId];\n  if (!cell) return;'));
check('no first-Circle-Cell fallback', !html.includes("cellsById[cellId] || ((MOCK && MOCK.cells) || []).filter(function(c) { return c.type === 'Circle Cell'; })[0]"));

// follow-up D: participant profile modal derives from bootstrap data
check('pd modal containers exist', html.includes('id="pd-competences"') && html.includes('id="pd-roles"') && html.includes('id="pd-activity"') && html.includes('id="pd-status"'));
check('pd modal fills competences', html.includes("getElementById('pd-competences')"));
check('pd modal fills roles', html.includes("getElementById('pd-roles')"));
check('pd modal fills activity from governanceEvents', html.includes("getElementById('pd-activity')") && html.includes('e.participant === p.name'));
check('pd modal fills status badge', html.includes("getElementById('pd-status')"));
check("no pd fallback 'Okello Robert'", !html.includes("'Okello Robert'"));
check("no pd fallback 'Kampala, Uganda'", !html.includes("'Kampala, Uganda'"));
check("no pd bio fallback mock", !html.includes('Space law researcher focused on African space policy'));
check('no static competences 2,400', !html.includes('>2,400</span>'));
check('no static Interests bars', !html.includes('Philosophy & Ethics</span><span style="font-family:var(--mono);color:var(--teal)">1,800'));
check('no static roles badges', !html.includes('>vSTF Assessor<') && !html.includes('Contributor · East Africa Mapping'));
check('no static activity rows', !html.includes('Submitted assessment for Space Law motion'));
check('no Competences (Wh) header', !html.includes('Competences (Wh)'));

// undertakings aside: stats + recent activity derive from MOCK.projects
check('ut aside containers exist', html.includes('id="undertakings-stats"') && html.includes('id="undertakings-activity"'));
check('renderUndertakingsAside defined', html.includes('function renderUndertakingsAside()'));
check('nav hooks undertakings aside', html.includes("if (key === 'undertakings' && typeof renderUndertakingsAside === 'function') renderUndertakingsAside();"));
check('initApp hooks undertakings aside', html.includes('projectsBody.innerHTML = renderProjectRows();\n  renderUndertakingsAside();'));
check('ut stats derive from MOCK.projects', html.includes('var projects = (MOCK && MOCK.projects) || [];') && html.includes("item(projects.length, 'Active')"));
check('ut activity derives from projects progress', html.includes("pr + '% done</span></div>'"));
check('no static ut stats 3/1/2', !html.includes('<div class="aside-stat-val">3</div><div class="aside-stat-lbl">Active</div>') && !html.includes('<div class="aside-stat-val">2</div><div class="aside-stat-lbl">Contributor</div>'));
check("no static activity '80% Kenya'", !html.includes('80% Kenya'));
check("no static activity 'Draft v2'", !html.includes('Draft v2'));
check("no static activity '75% done'", !html.includes('75% done'));
check('no static activity short titles', !html.includes('>East Africa Mapping</span>') && !html.includes('>Debris Liability</span>') && !html.includes('>Swahili Terms</span>'));

// aside sweep 2: observatory / orgs / resolutions stats + trending derive from data
check('obs resources stat id', html.includes('id="obs-stats-resources"'));
check('obs resources filled from library', html.includes("set('obs-stats-resources', ((MOCK && MOCK.library) || []).length);"));
check('obs resources refresh on library paint', html.includes('if (resStat) resStat.textContent = items.length;'));
check('no static 200+ Resources', !html.includes('>200+</div><div class="aside-stat-lbl">Resources'));
check('obs trending container', html.includes('id="obs-trending"'));
check('obs trending filled', html.includes('trendEl.innerHTML = trendingTagsHtml(4)'));
check('no static obs trending tags', !html.includes('aside-tags">\n            <span class="tag tag-purple" style="font-size:9px">Space Law'));
check('trendingTagsHtml shared helper', html.includes('function trendingTagsHtml(max)'));
check('commons trending uses helper', html.includes('trendingEl.innerHTML = trendingTagsHtml(4)'));
check('orgs knowledge areas id', html.includes('id="orgs-stat-areas"'));
check('orgs knowledge areas derived from taxonomy', html.includes("set('orgs-stat-areas', Object.keys(areaSet).length);"));
check('no static Knowledge Areas 3', !html.includes('>3</div><div class="aside-stat-lbl">Knowledge Areas'));
check('gov-by-circle empty placeholder', html.includes('<div id="gov-by-circle"></div>'));
check('no static gov-by-circle rows', !html.includes('>Remote Sensing</span><span class="aside-value">1<'));

// STF assessment views: static mock placeholders removed, else-branches close leaks
check('no static stew candidate name', !html.includes('>Ssempa D.</div>'));
check('no static stew match rows', !html.includes('Telecommunications</td><td class="m">≥ 800'));
check('no static stew affil tags', !html.includes('Uganda Astronomical Society — Member'));
check('no static stew evidence', !html.includes('<div class="ev-name">Ssempa D.'));
check('no static stew summary', !html.includes('3 of 4 domains pass'));
check('no static comp evidence', !html.includes('ITU Workshop Attendance'));
check('no static comp rows', !html.includes('Insufficient evidence') && !html.includes('Unable to evaluate — outside expertise'));
check('no static comp profile', !html.includes('Nairobi · Joined Jan 2026'));
check('no static comp sum', !html.includes('Current total Ws: 2,840'));
check("no static Akello placeholder", !html.includes("of Akello J.'s competence claims"));
check('no static jstf case desc', !html.includes('misrepresent space law credentials'));
check('no static jstf accused', !html.includes('Daniel Jørgensen'));
check('no static jstf court text', !html.includes('Integrity Engine anomaly flag'));
check('no static jstf sponsor', !html.includes('jstf-sponsor-name">Akello Jane'));
check('no static jstf evidence rows', !html.includes('✓ Collected</span>'));
check('no static jstf restrict', !html.includes('Steward privileges suspended'));
check('no static pastf profile', !html.includes('Founded Mar 2026 · 8 members'));
check('no static pastf member scores', !html.includes('29/35'));
check('vstf affil else-branch', html.includes("else setHtml('vstf-stew-affil', '')"));
check('vstf match else-branch', html.includes("setHtml('vstf-stew-match', '');"));
check('vstf mandate else-branch', html.includes("} else setHtml('vstf-stew-mandate', '');"));
check('vstf comp rows else-branch', html.includes("else setHtml('vstf-comp-rows', '')"));
check("jstf meta fallback", html.includes("setText('jstf-case-meta', metaBits.join(' · ') || '—');"));
check('pastf profile else-branch', html.includes("setText('pastf-circle-mandate', '');"));

// batch 3: sidebar member card, nav badges, vote-stats panel, modals, hero initials
check('no static member card', !html.includes('>Oumo Samuel<') && !html.includes('>Ws 847 · Kampala<'));
check('no static inbox badge 3', !html.includes('id="inbox-badge">3<'));
check('no static stf badge 1', !html.includes('id="stf-badge">1<'));
check('no static vs members/voted cells', !html.includes('id="vs-members-cell" style="font-family:var(--mono);font-weight:600">8<') && !html.includes('id="vs-voted-count-cell">4<'));
check('no static vs weights', !html.includes('id="vs-eff-yn-cell">1,964<') && !html.includes('>982</span>') && !html.includes('id="vs-eff-yea-cell">1,653<'));
check('no static vs result cell', !html.includes('id="vs-result-cell" colspan="3" style="color:var(--text-tertiary);font-style:italic">Pending'));
check('no static vs qrm req 6', !html.includes('id="vs-qrm-req">6<'));
check('no static dm-sub counts', !html.includes('across 16 knowledge + 3 affiliate'));
check('no static cd-ini SL', !html.includes('id="cd-ini">SL<'));
check('no static circlecell hero SL', !html.includes('id="circlecell-hero-icon">SL<'));
check('no static res modal motion', html.includes('id="res-modal-text" style="font-size:12px;font-family:inherit;line-height:1.5"></textarea>'));
check('no static org settings summary', !html.includes('Amateur and professional astronomy society'));
check('member card filled by currentUser', html.includes("document.getElementById('member-name').textContent = MOCK.currentUser.name;"));
check('dm-sub derived from MOCK.domains', html.includes("dmSub.textContent = 'Membership constellation across ' + dmK"));

// profile view: static mock block replaced, renderProfileView rebuilds from currentUser
check('profile view static block removed', html.includes('<div class="view" id="view-profile">') && html.includes('<div class="page-sub">Your competence declarations and standing</div>\n  </div>'));
check('no static profile name', !html.includes('<h1>Oumo Samuel</h1>'));
check('no static profile standing', !html.includes('<div class="val">847</div>'));
check('no static profile decl rows', !html.includes('<td class="m">1,800</td><td class="m">1,200</td>'));
check('no static profile activity', !html.includes('Endorsed competence declaration'));
check('renderProfileView derives from currentUser', html.includes("parts.push('<div class=\"profile-bio\">' + (u.bio ? escapeHtml(u.bio) : 'No bio yet.')"));

// registration: competence rows auto-derived by regAutofillCompetences() on step 3
check('reg competences static rows removed', html.includes('<div id="reg-competences"></div>') && !html.includes('reg-comp-domain">Space Law'));
check('reg autofill derives from step 2', html.includes('if(step===3) regAutofillCompetences();'));

// compose avatar derives from currentUser initials
check('compose avatar emptied', html.includes('id="compose-avatar" style="background:var(--gold);width:36px;height:36px;font-size:12px"></div>'));
check('compose avatar filled from currentUser', html.includes("composeAv.textContent = isAuth ? (MOCK.currentUser.initials"));

// AI drafter derives motion/points/action from the cell record
check('drafter motion derives from cell title', html.includes("var _motion = String((_resCell && _resCell.title) || '')"));
check('drafter points derive from objectives/messages', html.includes("if (!_points.length) _points = discussion.map"));
check('drafter action derives from delib_type', html.includes("var _action = /settings/.test((_resCell && _resCell.delib_type) || '')"));
check('gatherDeliberation reads cell messages', html.includes('return ((cell && cell.messages) || []).map'));
check('no hardcoded ai draft motion', !html.includes('Establish proportional liability framework for manoeuvre-induced orbital debris'));
check('no canned deliberation authors', !html.includes("author: 'Namugga Claire'"));

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
