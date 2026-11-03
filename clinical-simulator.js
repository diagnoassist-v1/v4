/*
 * منطق المحاكي الإكلينيكي — عرض الحالات، المقابلة، التحليل، والتقييم التعليمي.
 * لا يخزّن بيانات مرضى، ولا يتصل بخادم؛ الحالات افتراضية بالكامل.
 */
(function () {
    'use strict';

    var CASES = window.CLINICAL_CASES || [];
    var CATS = window.CLINICAL_CATS || {};
    var BEST_KEY = 'diagSimBestV1';
    var STAGES = ['brief', 'interview', 'analysis', 'report'];
    var state = {
        diff: 'all',
        caseId: null,
        stage: null,
        asked: {},
        analysis: null,
        qRendered: false,
        aRendered: false
    };

    function $(id) { return document.getElementById(id); }
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
    function caseById(id) { for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i]; return null; }
    function current() { return caseById(state.caseId); }
    function freshAnalysis() { return { symptoms: {}, missing: {}, hyps: {}, criteria: {}, disc: {}, rationale: {} }; }
    function truthyKeys(obj) { return Object.keys(obj || {}).filter(function (k) { return obj[k]; }); }
    function ids(list) { return list.map(function (x) { return x.id; }); }
    function correctIds(list) { return ids(list.filter(function (x) { return x.correct; })); }
    function countSelected(obj) { return truthyKeys(obj).length; }

    function diffLabel(d) {
        return d === 'beginner' ? 'مبتدئ' : d === 'advanced' ? 'متقدم' : 'متوسط';
    }

    function f1(selected, correct) {
        var sel = {}, cor = {}, tp = 0;
        selected.forEach(function (id) { sel[id] = true; });
        correct.forEach(function (id) { cor[id] = true; if (sel[id]) tp++; });
        var fp = selected.length - tp;
        var fn = correct.length - tp;
        if (!correct.length) return 0;
        if (2 * tp + fp + fn === 0) return 0;
        return (2 * tp) / (2 * tp + fp + fn);
    }

    function bestScores() {
        try {
            var raw = localStorage.getItem(BEST_KEY);
            var obj = raw ? JSON.parse(raw) : {};
            return obj && typeof obj === 'object' ? obj : {};
        } catch (e) { return {}; }
    }
    function saveBest(id, score) {
        var all = bestScores();
        if (all[id] && all[id] >= score) return false;
        all[id] = score;
        try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { }
        return true;
    }

    /* ==================== اختيار الحالة ==================== */
    function renderCaseGrid() {
        var grid = $('caseGrid');
        if (!grid) return;
        var best = bestScores();
        var list = CASES.filter(function (c) { return state.diff === 'all' || c.difficulty === state.diff; });
        if (!list.length) {
            grid.innerHTML = '<div class="empty-grid">لا توجد حالات بهذا المستوى.</div>';
            return;
        }
        grid.innerHTML = list.map(function (c, i) {
            var b = best[c.id];
            return '<button type="button" class="case-card diff-' + c.difficulty + '" data-case="' + c.id + '">' +
                '<div class="cc-top">' +
                    '<span class="cc-icon">' + c.icon + '</span>' +
                    '<span class="cc-badge">' + diffLabel(c.difficulty) + '</span>' +
                '</div>' +
                '<h3>' + esc(c.title) + '</h3>' +
                '<p>' + esc(c.complaint) + '</p>' +
                '<div class="cc-meta"><span>👤 ' + esc(c.age) + ' — ' + esc(c.gender) + '</span><span>💬 ' + c.interview.length + ' سؤالًا</span></div>' +
                '<div class="cc-foot">' +
                    (b ? '<span class="cc-best">أفضل نتيجة: <b>' + b + '/100</b></span>' : '<span class="cc-best muted">لم تُجرَّب بعد</span>') +
                    '<span class="cc-go">ابدأ ←</span>' +
                '</div>' +
            '</button>';
        }).join('');
    }

    function updateDiffChips() {
        var chips = document.querySelectorAll('[data-diff]');
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle('active', chips[i].getAttribute('data-diff') === state.diff);
        }
    }

    /* ==================== وصف الحالة ==================== */
    function renderBrief() {
        var c = current(), el = $('briefStage');
        if (!c || !el) return;
        el.innerHTML =
            '<div class="stage-head">' +
                '<div class="sh-kicker">الخطوة 1 — قراءة الحالة</div>' +
                '<h2>' + c.icon + ' ' + esc(c.title) + '</h2>' +
                '<div class="sh-tags">' +
                    '<span class="tag diff-' + c.difficulty + '">' + diffLabel(c.difficulty) + '</span>' +
                    '<span class="tag">حالة افتراضية</span>' +
                    '<span class="tag">' + c.age + ' — ' + c.gender + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="brief-focus">' + esc(c.focus) + '</div>' +
            '<div class="brief-grid">' +
                briefField('سبب طلب المساعدة', c.complaint) +
                briefField('بداية الأعراض ومدتها', c.onset) +
                briefField('الأثر في الحياة اليومية', c.impact) +
                briefField('الخلفية والمعلومات المتاحة', c.background) +
            '</div>' +
            '<div class="notice notice-blue">🔒 لن تظهر الإجابة التشخيصية في هذه المرحلة. اقرأ الوصف جيدًا، ثم ابدأ المقابلة لجمع ما تحتاجه من معلومات.</div>' +
            '<div class="stage-actions">' +
                '<button type="button" class="btn-ghost" data-action="change-case">→ كل الحالات</button>' +
                '<button type="button" class="btn-main" data-action="start-interview">بدء المقابلة الإكلينيكية ←</button>' +
            '</div>';
    }

    function briefField(title, text) {
        return '<div class="brief-field"><span>' + title + '</span><p>' + esc(text) + '</p></div>';
    }

    /* ==================== المقابلة ==================== */
    function renderQuestionBank() {
        var c = current(), bank = $('questionBank');
        if (!c || !bank) return;
        var groups = [], map = {};
        c.interview.forEach(function (q) {
            if (!map[q.cat]) { map[q.cat] = { cat: q.cat, items: [] }; groups.push(map[q.cat]); }
            map[q.cat].items.push(q);
        });
        bank.innerHTML = groups.map(function (g) {
            return '<div class="qgroup"><h4>' + esc(CATS[g.cat] || g.cat) + '</h4>' +
                g.items.map(function (q) {
                    var asked = !!state.asked[q.id];
                    return '<button type="button" class="qbtn' + (asked ? ' asked' : '') + '" data-q="' + q.id + '"' + (asked ? ' disabled' : '') + '>' +
                        '<span class="qmark">' + (asked ? '✓' : '؟') + '</span>' +
                        '<span class="qtext">' + esc(q.q) + '</span>' +
                        '<span class="qask">' + (asked ? 'تم السؤال' : 'اسأل ←') + '</span>' +
                    '</button>';
                }).join('') + '</div>';
        }).join('');
        updateAskedCount();
    }

    function renderTranscript() {
        var c = current(), box = $('transcript');
        if (!c || !box) return;
        var asked = c.interview.filter(function (q) { return state.asked[q.id]; });
        if (!asked.length) {
            box.innerHTML = '<div class="empty-transcript"><span>💬</span><p>لم تطرح أي سؤال بعد.</p><small>اختر سؤالًا من بنك الأسئلة لعرض إجابة الحالة الافتراضية.</small></div>';
            return;
        }
        box.innerHTML = asked.map(function (q) {
            return '<div class="qa"><div class="qa-q"><span>س</span><div>' + esc(q.q) + '</div></div>' +
                '<div class="qa-a"><span>ج</span><div>' + esc(q.a) + '</div></div></div>';
        }).join('');
        box.scrollTop = box.scrollHeight;
    }

    function updateAskedCount() {
        var c = current(), el = $('askedCount');
        if (!c || !el) return;
        var n = c.interview.filter(function (q) { return state.asked[q.id]; }).length;
        el.textContent = 'طُرح ' + n + ' من ' + c.interview.length + ' سؤالًا';
    }

    function askQuestion(id) {
        var c = current();
        if (!c || state.asked[id]) return;
        var q = null;
        for (var i = 0; i < c.interview.length; i++) if (c.interview[i].id === id) q = c.interview[i];
        if (!q) return;
        state.asked[id] = true;

        var btn = document.querySelector('[data-q="' + id + '"]');
        if (btn) {
            btn.classList.add('asked');
            btn.disabled = true;
            var ask = btn.querySelector('.qask');
            var mark = btn.querySelector('.qmark');
            if (ask) ask.textContent = 'تم السؤال';
            if (mark) mark.textContent = '✓';
        }

        var box = $('transcript');
        if (box) {
            var empty = box.querySelector('.empty-transcript');
            if (empty) box.innerHTML = '';
            box.insertAdjacentHTML('beforeend',
                '<div class="qa"><div class="qa-q"><span>س</span><div>' + esc(q.q) + '</div></div>' +
                '<div class="qa-a"><span>ج</span><div>' + esc(q.a) + '</div></div></div>');
            box.scrollTop = box.scrollHeight;
        }
        updateAskedCount();
    }

    /* ==================== التحليل ==================== */
    function checklistHTML(items, group) {
        return items.map(function (it) {
            return '<label class="check-item"><input type="checkbox" data-group="' + group + '" value="' + esc(it.id) + '">' +
                '<span class="ci-text">' + esc(it.label) + '</span></label>';
        }).join('');
    }

    function renderAnalysis() {
        var c = current();
        if (!c) return;
        $('symptomGrid').innerHTML = checklistHTML(c.symptoms, 'symptoms');
        $('missingGrid').innerHTML = checklistHTML(c.missing, 'missing');
        $('hypGrid').innerHTML = c.candidates.map(function (cd) {
            return '<label class="hyp-card"><input type="checkbox" data-group="hyps" value="' + esc(cd.id) + '">' +
                '<span class="hyp-body"><b>' + esc(cd.name) + '</b><small>فرضية محتملة — قارنها بالمعايير قبل تثبيتها.</small></span></label>';
        }).join('');
        $('discGrid').innerHTML = checklistHTML(c.discriminate, 'disc');
        $('rationaleGrid').innerHTML = checklistHTML(c.rationale, 'rationale');
        updateCounts();
        renderCriteria();
        hideAnalysisError();
        updateCoverageNote();
    }

    function updateCoverageNote() {
        var c = current(), cov = $('analysisCoverage');
        if (!c || !cov) return;
        var n = c.interview.filter(function (q) { return state.asked[q.id]; }).length;
        cov.textContent = 'أجريت ' + n + ' من ' + c.interview.length + ' سؤالًا. يمكنك العودة للمقابلة في أي وقت لطرح المزيد قبل التقييم.';
    }

    function updateCounts() {
        var A = state.analysis;
        if (!A) return;
        setText('symCount', countSelected(A.symptoms) + ' محدد');
        setText('missCount', countSelected(A.missing) + ' محدد');
        setText('hypCount', countSelected(A.hyps) + ' مختارة');
        setText('discCount', countSelected(A.disc) + ' محدد');
        setText('ratCount', countSelected(A.rationale) + ' محددة');
    }

    function setText(id, text) {
        var el = $(id);
        if (el) el.textContent = text;
    }

    function renderCriteria() {
        var c = current(), wrap = $('criteriaWrap'), A = state.analysis;
        if (!c || !wrap || !A) return;
        var chosen = c.candidates.filter(function (cd) { return A.hyps[cd.id] && c.criteria[cd.id]; });
        if (!chosen.length) {
            var anyHyp = countSelected(A.hyps) > 0;
            wrap.innerHTML = '<div class="crit-empty">' + (anyHyp
                ? 'الفرضيات المختارة لا تحتوي معايير مقارنة في هذه الحالة. راجع اختياراتك أو أضف الفرضية الأساسية.'
                : 'اختر فرضية واحدة على الأقل أعلاه لتظهر معاييرها للمقارنة.') + '</div>';
            return;
        }
        wrap.innerHTML = chosen.map(function (cd) {
            var rows = c.criteria[cd.id].map(function (cr, idx) {
                var key = cd.id + '|' + idx;
                var cur = A.criteria[key] || '';
                return '<div class="crit-row">' +
                    '<div class="crit-text">' + esc(cr.label) + '</div>' +
                    '<div class="seg" data-key="' + key + '">' +
                        segBtn('yes', 'يتحقق', cur) +
                        segBtn('no', 'لا يتحقق', cur) +
                        segBtn('unknown', 'غير معروف', cur) +
                    '</div>' +
                '</div>';
            }).join('');
            return '<div class="crit-card">' +
                '<div class="crit-head"><span>' + esc(cd.name) + '</span><small>' + c.criteria[cd.id].length + ' معايير</small></div>' +
                rows + '</div>';
        }).join('');
    }

    function segBtn(value, label, currentValue) {
        return '<button type="button" class="seg-btn' + (currentValue === value ? ' on ' + value : '') + '" data-val="' + value + '" aria-pressed="' + (currentValue === value) + '">' + label + '</button>';
    }

    function showAnalysisError(msg) {
        var el = $('analysisError');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function hideAnalysisError() {
        var el = $('analysisError');
        if (el) el.classList.remove('show');
    }

    /* ==================== التقييم ==================== */
    function compute(c) {
        var A = state.analysis;

        var selSym = truthyKeys(A.symptoms), corSym = correctIds(c.symptoms);
        var symScore = Math.round(20 * f1(selSym, corSym));
        var symHit = selSym.filter(function (id) { return corSym.indexOf(id) >= 0; }).length;
        var symExtra = selSym.length - symHit;

        var askedCats = {};
        c.interview.forEach(function (q) { if (state.asked[q.id]) askedCats[q.cat] = true; });
        var covered = c.requiredCats.filter(function (cat) { return askedCats[cat]; }).length;
        var selMiss = truthyKeys(A.missing), corMiss = correctIds(c.missing);
        var missHit = selMiss.filter(function (id) { return corMiss.indexOf(id) >= 0; }).length;
        var missScore = Math.round(10 * (c.requiredCats.length ? covered / c.requiredCats.length : 0) + 10 * f1(selMiss, corMiss));

        var critTotal = 0, critOk = 0, critDetails = [];
        c.candidates.forEach(function (cd) {
            if (!A.hyps[cd.id] || !c.criteria[cd.id]) return;
            c.criteria[cd.id].forEach(function (cr, idx) {
                var key = cd.id + '|' + idx;
                var ans = A.criteria[key] || '';
                critTotal++;
                if (ans === cr.truth) critOk++;
                critDetails.push({ cand: cd, label: cr.label, truth: cr.truth, answer: ans, ok: ans === cr.truth });
            });
        });
        var analysisScore = critTotal ? Math.round(20 * (critOk / critTotal)) : 0;

        var hypPoints = 0;
        c.candidates.forEach(function (cd) {
            if (!A.hyps[cd.id]) return;
            if (cd.role === 'primary') hypPoints += 6;
            else if (cd.role === 'differential') hypPoints += 2;
            else hypPoints -= 3;
        });
        hypPoints = clamp(hypPoints, 0, 10);

        var selDisc = truthyKeys(A.disc), corDisc = correctIds(c.discriminate);
        var discHit = selDisc.filter(function (id) { return corDisc.indexOf(id) >= 0; }).length;
        var discScore = Math.round(10 * f1(selDisc, corDisc));
        var diffScore = hypPoints + discScore;

        var selRat = truthyKeys(A.rationale), corRat = correctIds(c.rationale);
        var ratHit = selRat.filter(function (id) { return corRat.indexOf(id) >= 0; }).length;
        var ratExtra = selRat.length - ratHit;
        var rationaleScore = Math.round(20 * f1(selRat, corRat));

        var total = symScore + missScore + analysisScore + diffScore + rationaleScore;

        return {
            total: total,
            symScore: symScore, symHit: symHit, symExtra: symExtra, symCorrectCount: corSym.length,
            missScore: missScore, covered: covered, reqCount: c.requiredCats.length,
            missHit: missHit, missCorrectCount: corMiss.length,
            analysisScore: analysisScore, critOk: critOk, critTotal: critTotal, critDetails: critDetails,
            hypPoints: hypPoints, discScore: discScore, diffScore: diffScore, discHit: discHit, discCorrectCount: corDisc.length,
            rationaleScore: rationaleScore, ratHit: ratHit, ratExtra: ratExtra, ratCorrectCount: corRat.length
        };
    }

    function band(score) {
        if (score >= 85) return { label: 'ممتاز', cls: 'excellent', text: 'تحليل متكامل ومتوازن. راجعت الأدلة والبدائل وربطت كل فرضية بما يدعمها أو يعارضها.' };
        if (score >= 70) return { label: 'جيد جدًا', cls: 'verygood', text: 'أداء قوي مع بعض الفجوات. راجع المعلومات الناقصة والمعلومات الفارقة لرفع دقة التحليل.' };
        if (score >= 55) return { label: 'جيد', cls: 'good', text: 'أساس جيد، لكن بعض الفرضيات أو المعايير لم تُعالج بدقة. راجع النموذج المرجعي أدناه.' };
        if (score >= 40) return { label: 'مقبول', cls: 'fair', text: 'تحتاج إلى مراجعة منهجية: استخرج الأعراض أولًا، ثم المعلومات الناقصة، ثم قارن الفرضيات بالمعايير.' };
        return { label: 'يحتاج مراجعة', cls: 'weak', text: 'أعد قراءة الحالة خطوة بخطوة، وقارن كل فرضية بمعاييرها قبل اختيار التشخيص.' };
    }

    function valLabel(v) {
        return v === 'yes' ? 'يتحقق' : v === 'no' ? 'لا يتحقق' : v === 'unknown' ? 'غير معروف' : 'لم تُجب';
    }

    function renderReport(c, res) {
        var b = band(res.total);
        var best = bestScores();
        var prevBest = best[c.id];
        var isNew = saveBest(c.id, res.total);
        var pct = res.total;

        var metrics = [
            { name: 'استخراج الأعراض', score: res.symScore, icon: '🔎', detail: 'أصبت ' + res.symHit + ' من ' + res.symCorrectCount + ' عرضًا' + (res.symExtra ? '، وأضفت ' + res.symExtra + ' عرضًا غير وارد.' : ' دون إضافات خاطئة.') },
            { name: 'جمع المعلومات', score: res.missScore, icon: '🗂️', detail: 'غطيت ' + res.covered + ' من ' + res.reqCount + ' مجالات أساسية، وحددت ' + res.missHit + ' من ' + res.missCorrectCount + ' معلومة ناقصة.' },
            { name: 'التحليل التشخيصي', score: res.analysisScore, icon: '⚖️', detail: res.critTotal ? 'طابقت ' + res.critOk + ' من ' + res.critTotal + ' حكمًا معياريًا.' : 'لم تُجرِ مقارنة معايير لهذه الحالة.' },
            { name: 'التشخيص الفارقي', score: res.diffScore, icon: '🔀', detail: 'اختيار الفرضيات ' + res.hypPoints + '/10، والمعلومات الفارقة ' + res.discHit + ' من ' + res.discCorrectCount + '.' },
            { name: 'التبرير العلمي', score: res.rationaleScore, icon: '📚', detail: 'اخترت ' + res.ratHit + ' من ' + res.ratCorrectCount + ' تبريرًا صحيحًا' + (res.ratExtra ? '، و' + res.ratExtra + ' غير دقيق.' : '.') }
        ];

        var metricsHTML = metrics.map(function (m) {
            var w = Math.round((m.score / 20) * 100);
            return '<div class="metric">' +
                '<div class="metric-head"><span>' + m.icon + ' ' + m.name + '</span><b>' + m.score + '/20</b></div>' +
                '<div class="bar"><i style="width:' + w + '%"></i></div>' +
                '<p>' + esc(m.detail) + '</p>' +
            '</div>';
        }).join('');

        var evidence = c.reference.evidence.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        var limits = c.reference.limits.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        var mistakes = c.reference.mistakes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        var alts = c.reference.alternatives.map(function (a) {
            return '<div class="alt-card"><div class="alt-top"><b>' + esc(a.name) + '</b><span class="verdict">' + esc(a.verdict) + '</span></div><p>' + esc(a.reason) + '</p></div>';
        }).join('');

        var keySymptoms = answerList(c.symptoms, state.analysis.symptoms);
        var keyMissing = answerList(c.missing, state.analysis.missing);
        var keyDisc = answerList(c.discriminate, state.analysis.disc);
        var keyRat = answerList(c.rationale, state.analysis.rationale);

        var hypKey = c.candidates.map(function (cd) {
            var role = cd.role === 'primary' ? 'الفرضية الأساسية' : cd.role === 'differential' ? 'فرضية فارقية' : 'فرضية غير مدعومة';
            return '<div class="hyp-key ' + cd.role + (state.analysis.hyps[cd.id] ? ' picked' : '') + '">' +
                '<div class="hk-top"><b>' + esc(cd.name) + '</b><span class="hk-role">' + role + '</span></div>' +
                '<p>' + esc(cd.note) + '</p>' +
                '<small>' + (state.analysis.hyps[cd.id] ? '✓ اخترتها' : 'لم تخترها') + '</small>' +
            '</div>';
        }).join('');

        var critKey = c.candidates.filter(function (cd) { return c.criteria[cd.id]; }).map(function (cd) {
            var rows = c.criteria[cd.id].map(function (cr, idx) {
                var ans = state.analysis.criteria[cd.id + '|' + idx] || '';
                var ok = ans === cr.truth;
                return '<tr class="' + (ok ? 'row-ok' : 'row-bad') + '">' +
                    '<td>' + esc(cr.label) + '</td>' +
                    '<td>' + valLabel(cr.truth) + '</td>' +
                    '<td>' + valLabel(ans) + '</td>' +
                    '<td>' + (ok ? '✓' : '✗') + '</td>' +
                '</tr>';
            }).join('');
            return '<div class="crit-key"><h5>' + esc(cd.name) + '</h5>' +
                '<table class="crit-table"><thead><tr><th>المعيار</th><th>المرجع</th><th>إجابتك</th><th>النتيجة</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        }).join('');

        $('reportStage').innerHTML =
            '<div class="score-hero">' +
                '<div class="score-ring" style="background:conic-gradient(#0d9488 0 ' + pct + '%, #e5edf7 ' + pct + '% 100%)">' +
                    '<div class="score-inner"><b>' + res.total + '</b><span>/ 100</span></div>' +
                '</div>' +
                '<div class="score-copy">' +
                    '<span class="band ' + b.cls + '">' + b.label + '</span>' +
                    '<h2>التقييم المرجعي للأداء</h2>' +
                    '<p>' + b.text + '</p>' +
                    '<div class="score-chips">' +
                        '<span>الفرضية الأساسية: <b>' + esc(c.reference.primary) + '</b></span>' +
                        (isNew ? '<span class="new-best">🎉 أفضل نتيجة لك في هذه الحالة</span>' : (prevBest ? '<span>أفضل نتيجة سابقة: ' + prevBest + '/100</span>' : '')) +
                    '</div>' +
                    '<div class="notice notice-amber">⚠️ هذه الدرجة تقيّم جودة التحليل وفق نموذج إجابة مرجعي تعليمي، ولا تُعتبر مقياسًا للكفاءة المهنية الحقيقية، ولا تُستخدم لتشخيص مرضى حقيقيين.</div>' +
                '</div>' +
            '</div>' +
            '<div class="metrics">' + metricsHTML + '</div>' +
            '<div class="ref-grid">' +
                '<div class="ref-card ref-main"><h3>🧠 التفسير المرجعي</h3><h4>' + esc(c.reference.primary) + '</h4><p>' + esc(c.reference.summary) + '</p></div>' +
                '<div class="ref-card ref-good"><h3>✅ الأدلة الداعمة</h3><ul>' + evidence + '</ul></div>' +
                '<div class="ref-card ref-warn"><h3>⚠️ ما يحدّ من اليقين</h3><ul>' + limits + '</ul></div>' +
            '</div>' +
            '<div class="ref-card ref-alts"><h3>🔀 الفرضيات البديلة</h3><div class="alt-grid">' + alts + '</div></div>' +
            '<div class="ref-card ref-mistakes"><h3>🚫 أخطاء شائعة في هذه الحالة</h3><ul>' + mistakes + '</ul></div>' +
            '<details class="keybox"><summary>عرض مفتاح الإجابة الكامل ومقارنة اختياراتك</summary>' +
                '<div class="key-section"><h4>الأعراض</h4>' + keySymptoms + '</div>' +
                '<div class="key-section"><h4>المعلومات الناقصة</h4>' + keyMissing + '</div>' +
                '<div class="key-section"><h4>الفرضيات التشخيصية</h4><div class="hyp-key-grid">' + hypKey + '</div></div>' +
                '<div class="key-section"><h4>مقارنة المعايير</h4>' + critKey + '</div>' +
                '<div class="key-section"><h4>المعلومات اللازمة للتمييز</h4>' + keyDisc + '</div>' +
                '<div class="key-section"><h4>عبارات التبرير</h4>' + keyRat + '</div>' +
            '</details>' +
            '<div class="stage-actions report-actions">' +
                '<button type="button" class="btn-ghost" data-action="another">→ اختبار حالة أخرى</button>' +
                '<button type="button" class="btn-main" data-action="retry">↺ إعادة المحاولة على هذه الحالة</button>' +
            '</div>';
    }

    function answerList(items, selectedMap) {
        return '<div class="ans-list">' + items.map(function (it) {
            var sel = !!selectedMap[it.id];
            var cls = it.correct ? 'correct' : 'distractor';
            var tag = it.correct ? 'صحيح' : 'غير وارد';
            if (sel && it.correct) tag = '✓ اخترته — صحيح';
            else if (sel && !it.correct) tag = '✗ اخترته — غير وارد';
            else if (!sel && it.correct) tag = 'فاتك — صحيح';
            return '<div class="ans-item ' + cls + (sel ? ' selected' : '') + '">' +
                '<span class="ans-dot"></span><span class="ans-text">' + esc(it.label) + '</span>' +
                '<span class="ans-tag">' + tag + '</span>' +
            '</div>';
        }).join('') + '</div>';
    }

    /* ==================== التنقل ==================== */
    function setStage(name) {
        STAGES.forEach(function (s) {
            var el = $(s + 'Stage');
            if (el) el.hidden = s !== name;
        });
        state.stage = name;

        var steps = document.querySelectorAll('.step');
        var currentIndex = STAGES.indexOf(name);
        for (var i = 0; i < steps.length; i++) {
            var idx = STAGES.indexOf(steps[i].getAttribute('data-step'));
            steps[i].classList.toggle('active', idx === currentIndex);
            steps[i].classList.toggle('done', idx < currentIndex);
        }

        if (name === 'interview' && !state.qRendered) {
            renderQuestionBank();
            renderTranscript();
            state.qRendered = true;
        }
        if (name === 'analysis' && !state.aRendered) {
            renderAnalysis();
            state.aRendered = true;
        }
        if (name === 'analysis') updateCoverageNote();

        var top = $('stageTop');
        if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function startCase(id) {
        var c = caseById(id);
        if (!c) return;
        state.caseId = id;
        state.asked = {};
        state.analysis = freshAnalysis();
        state.qRendered = false;
        state.aRendered = false;
        $('casePicker').hidden = true;
        $('simWrap').hidden = false;
        renderBrief();
        setStage('brief');
    }

    function showPicker() {
        state.caseId = null;
        state.asked = {};
        state.analysis = null;
        state.qRendered = false;
        state.aRendered = false;
        $('simWrap').hidden = true;
        $('casePicker').hidden = false;
        renderCaseGrid();
        updateDiffChips();
        var picker = $('casePicker');
        if (picker && picker.scrollIntoView) picker.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function submitAnalysis() {
        var c = current(), A = state.analysis;
        if (!c || !A) return;
        var chosen = truthyKeys(A.hyps);
        if (!chosen.length) {
            showAnalysisError('اختر فرضية تشخيصية واحدة على الأقل قبل عرض التقييم.');
            return;
        }
        var rows = 0, answered = 0;
        chosen.forEach(function (id) {
            if (!c.criteria[id]) return;
            c.criteria[id].forEach(function (cr, idx) {
                rows++;
                if (A.criteria[id + '|' + idx]) answered++;
            });
        });
        if (rows > 0 && answered === 0) {
            showAnalysisError('أكمل مقارنة معايير الفرضيات المختارة (يتحقق / لا يتحقق / غير معروف) قبل عرض التقييم.');
            return;
        }
        hideAnalysisError();
        var res = compute(c);
        renderReport(c, res);
        setStage('report');
    }

    /* ==================== الأحداث ==================== */
    function onClick(e) {
        var t = e.target;
        if (!t || !t.closest) return;

        var diff = t.closest('[data-diff]');
        if (diff) {
            state.diff = diff.getAttribute('data-diff');
            updateDiffChips();
            renderCaseGrid();
            return;
        }

        var card = t.closest('[data-case]');
        if (card) { startCase(card.getAttribute('data-case')); return; }

        var q = t.closest('[data-q]');
        if (q) { askQuestion(q.getAttribute('data-q')); return; }

        var seg = t.closest('.seg-btn');
        if (seg) {
            var segWrap = seg.parentElement;
            var key = segWrap.getAttribute('data-key');
            var val = seg.getAttribute('data-val');
            if (state.analysis) state.analysis.criteria[key] = val;
            var siblings = segWrap.querySelectorAll('.seg-btn');
            for (var i = 0; i < siblings.length; i++) {
                siblings[i].classList.toggle('on', siblings[i] === seg);
                siblings[i].classList.remove('yes', 'no', 'unknown');
                if (siblings[i] === seg) siblings[i].classList.add(val);
                siblings[i].setAttribute('aria-pressed', siblings[i] === seg ? 'true' : 'false');
            }
            return;
        }

        var action = t.closest('[data-action]');
        if (!action) return;
        var name = action.getAttribute('data-action');
        if (name === 'start-interview') setStage('interview');
        else if (name === 'to-analysis') setStage('analysis');
        else if (name === 'back-brief') setStage('brief');
        else if (name === 'back-interview') setStage('interview');
        else if (name === 'grade') submitAnalysis();
        else if (name === 'change-case' || name === 'another') showPicker();
        else if (name === 'retry') {
            var id = state.caseId;
            if (id) startCase(id);
        }
    }

    function onChange(e) {
        var t = e.target;
        if (!t || !t.matches || !t.matches('input[type="checkbox"][data-group]')) return;
        var group = t.getAttribute('data-group');
        if (!state.analysis || !state.analysis[group]) return;
        if (t.checked) state.analysis[group][t.value] = true;
        else delete state.analysis[group][t.value];
        var label = t.closest('.check-item') || t.closest('.hyp-card');
        if (label) label.classList.toggle('on', t.checked);
        updateCounts();
        if (group === 'hyps') renderCriteria();
    }

    function init() {
        if (!CASES.length || !$('caseGrid')) return;
        renderCaseGrid();
        updateDiffChips();
        document.addEventListener('click', onClick);
        document.addEventListener('change', onChange);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.__clinicalSim = { startCase: startCase, showPicker: showPicker, state: state, compute: compute };
})();
