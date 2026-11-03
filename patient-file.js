/*
 * patient-file.js — صفحة تفاصيل ملف المريض: المعلومات، الملاحظات المهنية، سجل جلسات التقييم،
 * بدء جلسة جديدة، الأرشفة والحذف. يعتمد على patient-store.js و scale-engine.js.
 */
(function () {
    'use strict';
    var S = window.PatientStore;
    if (!S) return;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function getParam(name) {
        try {
            var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search || '');
            return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
        } catch (e) { return ''; }
    }

    var state = { id: null, patient: null, confirmAction: null, toastTimer: null, open: {} };
    var currentSessions = [];

    function toast(msg, type) {
        var t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');
        if (state.toastTimer) clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
    }

    function sevClass(sess) {
        var txt = String(sess.state || '');
        if (/ضعيف|منخفض|منخفضة|ضعيفة|低/.test(txt)) return 'sev low';
        if (/متوسط|متوسطة/.test(txt)) return 'sev mid';
        if (/مرتفع|شديد|شديدة|مرتفعة/.test(txt)) return 'sev';
        return 'sev na';
    }

    /* ===== الترويسة ===== */
    function renderHero() {
        var p = state.patient;
        $('pName').textContent = p ? ('ملف: ' + p.name) : 'ملف غير موجود';
        $('bcName').textContent = p ? (p.name + ' (' + (p.fileNum || '') + ')') : 'غير موجود';
        if (!p) { $('heroChips').innerHTML = '<span class="hero-chip">لم يتم العثور على هذا الملف في هذا الجهاز</span>'; return; }
        var c = S.sessionCounts(p.id);
        var act = S.getActive();
        var isActive = act && String(act.id) === String(p.id);
        $('heroChips').innerHTML =
            '<span class="hero-chip code">' + esc(p.fileNum || 'بدون رمز') + '</span>' +
            '<span class="hero-chip">' + (p.archived ? 'مؤرشف' : 'نشط') + '</span>' +
            '<span class="hero-chip">' + c.total + ' جلسة تقييم</span>' +
            (isActive ? '<span class="hero-chip">الملف النشط للاختبارات</span>' : '');
    }

    /* ===== المعلومات ===== */
    function renderInfo() {
        var p = state.patient;
        var g = $('infoGrid');
        if (!p) { g.innerHTML = ''; return; }
        var items = [
            ['الرمز', p.fileNum || '—'],
            ['الاسم أو الاسم المستعار', p.name || '—'],
            ['تاريخ الميلاد', p.birth || '—'],
            ['العمر', p.age || '—'],
            ['الجنس', p.sex || '—'],
            ['الحالة الاجتماعية', p.marital || '—'],
            ['رقم الهاتف', p.phone || '—'],
            ['المهنة', p.job || '—'],
            ['المستوى التعليمي', p.edu || '—'],
            ['العنوان', p.address || '—'],
            ['البريد الإلكتروني', p.email || '—'],
            ['تاريخ فتح الملف', p.openedAt || '—'],
            ['الحالة', p.archived ? 'مؤرشف' : 'نشط'],
            ['السبب أو التشخيص المبدئي', p.reason || '—'],
            ['تاريخ الإنشاء', S.fmtDate(p.createdAt || p.openedAt)],
            ['آخر تحديث', S.fmtDate(p.updatedAt || p.createdAt)]
        ];
        g.innerHTML = items.map(function (it) {
            return '<div class="info-item"><div class="k">' + esc(it[0]) + '</div><div class="v">' + esc(it[1]) + '</div></div>';
        }).join('');
    }

    function fillNotes() {
        var p = state.patient;
        if (!p) return;
        $('reasonArea').value = p.reason || '';
    }

    /* ===== سجل المقابلات ===== */
    function ordinal(n) {
        var names = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
        n = parseInt(n, 10) || 1;
        return names[n - 1] || ('رقم ' + n);
    }

    function interviewsOf(p) {
        var arr = (p && Array.isArray(p.interviews)) ? p.interviews.slice() : [];
        arr = arr.filter(function (it) { return it && (it.note || it.no); });
        arr.sort(function (a, b) { return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0); });
        return arr;
    }

    function interviewItem(it, legacy) {
        return '<div class="interview-item">' +
            '<div class="interview-top">' +
            '<span class="interview-title">المقابلة ' + esc(ordinal(it.no)) + (legacy ? ' <span class="chip">ملاحظة سابقة</span>' : '') + '</span>' +
            '<span class="interview-date">' + esc(it.date || '—') + '</span>' +
            '</div>' +
            '<div class="interview-note">' + esc(it.note || '') + '</div>' +
            '</div>';
    }

    function renderInterviews() {
        var box = $('interviewsList');
        if (!box) return;
        var p = state.patient;
        if (!p) { box.innerHTML = ''; return; }
        var arr = interviewsOf(p);
        var html = '';
        if (arr.length) {
            html = arr.map(function (it) { return interviewItem(it, false); }).join('');
        } else if (p.visit) {
            html = interviewItem({ no: 1, note: p.visit, date: p.openedAt || '' }, true);
        }
        box.innerHTML = html || '<div class="empty" style="padding:16px">لا توجد مقابلات مسجلة بعد — اضغط «أضف مقابلة».</div>';
    }

    function setInterviewError(msg) {
        var err = $('interviewError');
        if (!err) return;
        err.textContent = msg || '';
        err.className = 'form-error' + (msg ? ' show' : '');
    }

    function openInterview() {
        if (!state.patient) { toast('افتح ملف مريض أولًا.', 'err'); return; }
        var arr = interviewsOf(state.patient);
        var next = 1;
        arr.forEach(function (it) { var n = parseInt(it.no, 10) || 0; if (n >= next) next = n + 1; });
        $('intNo').value = String(next);
        $('intNote').value = '';
        setInterviewError('');
        var m = $('interviewModal'); if (m) m.classList.add('show');
        var n = $('intNote'); if (n) setTimeout(function () { try { n.focus(); } catch (e) { } }, 60);
    }

    function closeInterview() {
        var m = $('interviewModal'); if (m) m.classList.remove('show');
        setInterviewError('');
    }

    function saveInterview() {
        if (!state.patient) { toast('افتح ملف مريض أولًا.', 'err'); return; }
        var no = parseInt(($('intNo') || {}).value, 10);
        var note = (($('intNote') || {}).value || '').trim();
        if (!no || no < 1) { setInterviewError('حدّد رقم المقابلة (رقم صحيح أكبر من صفر).'); return; }
        if (!note) { setInterviewError('اكتب ملاحظة المقابلة أولًا.'); return; }
        var arr = interviewsOf(state.patient);
        var existing = null;
        arr.forEach(function (it) { if ((parseInt(it.no, 10) || 0) === no) existing = it; });
        if (existing) {
            existing.note = note;
        } else {
            arr.push({ no: no, note: note, date: S.todayStr() });
        }
        arr.sort(function (a, b) { return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0); });
        var r = S.update(state.patient.id, { interviews: arr });
        if (!r.ok) { setInterviewError(r.error || 'تعذّر حفظ المقابلة.'); return; }
        state.patient = r.patient;
        closeInterview();
        renderInterviews();
        toast(existing ? ('✓ تم تحديث المقابلة ' + ordinal(no) + '.') : ('✓ تمت إضافة المقابلة ' + ordinal(no) + '.'), 'ok');
    }

    /* ===== سجل الجلسات ===== */
    function sessKey(s) { return s.kind + ':' + s.scaleId + ':' + s.index; }

    function sessHTML(s) {
        var key = sessKey(s);
        var isOpen = !!state.open[key];
        var ans = (s.session && s.session.answers && s.session.answers.length) ? s.session.answers : [];
        var max = (s.max !== undefined && s.max !== null) ? s.max : (s.session && s.session.max);
        var score = (s.score !== undefined && s.score !== null) ? s.score : '—';
        var body = '';
        if (ans.length) {
            body += '<h5>الإجابات التفصيلية</h5><div class="table-scroll"><table class="ans-table"><thead><tr>' +
                '<th>#</th><th>العبارة</th><th>الإجابة</th><th>الدرجة</th></tr></thead><tbody>' +
                ans.map(function (a) {
                    return '<tr><td>' + esc(a.no) + '</td><td>' + esc(a.text) + '</td><td>' + esc(a.label) + '</td><td class="score">' + esc(a.score) + '</td></tr>';
                }).join('') +
                '</tbody></table></div>';
        }
        var sum = s.summary;
        if (sum) {
            body += '<div class="summary-box"><b>الملخص:</b> ' +
                esc(sum.stateLabel || s.state || '') +
                (sum.pct !== null && sum.pct !== undefined ? ' — نسبة الكل: ' + esc(sum.pct) + '%' : '') +
                (sum.methodLabel ? '<br><b>طريقة الحساب:</b> ' + esc(sum.methodLabel) : '') +
                (sum.avg !== null && sum.avg !== undefined ? ' — <b>المتوسط:</b> ' + esc(sum.avg) : '') +
                (sum.topItems && sum.topItems.length
                    ? '<br><b>أعلى البنود إثارة:</b> ' + sum.topItems.map(function (it) { return esc(it.text) + ' (' + esc(it.pct) + '%)'; }).join(' · ')
                    : '') +
                '</div>';
        }
        body += '<div class="sess-actions">' +
            '<button class="btn btn-primary" data-act="view" data-key="' + esc(key) + '">فتح ملخص التقييم ←</button>' +
            '</div>';
        return '<div class="sess' + (isOpen ? ' open' : '') + '" data-key="' + esc(key) + '">' +
            '<div class="sess-head" data-act="toggle" data-key="' + esc(key) + '">' +
            '<div class="sess-num">' + esc(s.number !== undefined && s.number !== null ? s.number : s.index + 1) + '</div>' +
            '<div class="sess-title">' +
            '<div class="sess-scale">' + esc(s.scaleName) + '</div>' +
            '<div class="sess-date">' + esc(s.date || '—') + (s.dateTime ? ' · ' + esc(S.fmtDate(s.dateTime)) : '') + ' · ' +
            (s.kind === 'custom' ? 'مقياس مخصص' : esc(S.BUILTIN[s.kind] ? S.BUILTIN[s.kind].kind.toUpperCase() : s.kind.toUpperCase())) + '</div>' +
            '</div>' +
            '<span class="chip">الدرجة: ' + esc(score) + (max !== undefined && max !== null ? '/' + esc(max) : '') +
            (s.pct !== undefined && s.pct !== null ? ' · ' + esc(s.pct) + '%' : '') + '</span>' +
            (s.state ? '<span class="chip ' + sevClass(s) + '">' + esc(s.state) + '</span>' : '') +
            '<span class="chip toggle">' + (isOpen ? 'إخفاء ▴' : 'عرض ▾') + '</span>' +
            '</div>' +
            '<div class="sess-body">' + body + '</div>' +
            '</div>';
    }

    function renderSessions() {
        var p = state.patient;
        var list = $('sessList');
        if (!p) { list.innerHTML = ''; return; }
        currentSessions = S.sessionsFor(p.id);
        $('sessCount').textContent = currentSessions.length + ' جلسة';
        if (!currentSessions.length) {
            list.innerHTML = '<div class="empty"><span class="e-ico">📈</span>لا توجد جلسات تقييم بعد لهذا الملف.<br>اضغط «إضافة جلسة تقييم» لبدء أول جلسة مرتبطة بهذا الملف.</div>';
            return;
        }
        list.innerHTML = currentSessions.map(sessHTML).join('');
    }

    /* ===== الملخص / الإحصاءات ===== */
    function renderStats() {
        var p = state.patient;
        if (!p) { $('statsRow').innerHTML = ''; return; }
        var c = S.sessionCounts(p.id);
        var all = currentSessions;
        var last = all.length ? all[0] : null;
        $('statsRow').innerHTML =
            '<div class="stat"><div class="sv">' + c.total + '</div><div class="sl">إجمالي الجلسات</div></div>' +
            '<div class="stat"><div class="sv">' + c.ptsd + '</div><div class="sl">جلسات PTSD</div></div>' +
            '<div class="stat"><div class="sv">' + c.mdd + '</div><div class="sl">جلسات الاكتئاب</div></div>' +
            '<div class="stat"><div class="sv">' + c.custom + '</div><div class="sl">جلسات مخصصة</div></div>' +
            '<div class="stat"><div class="sv" style="font-size:15px">' + (last ? esc(last.date || '—') : '—') + '</div><div class="sl">آخر جلسة</div></div>';
    }

    function renderAll() {
        renderHero();
        renderInfo();
        fillNotes();
        renderInterviews();
        renderSessions();
        renderStats();
        var btnA = $('btnArchive'), btnD = $('btnDelete'), btnS = $('btnStartTest'), btnF = $('btnSaveFile');
        var ok = !!state.patient;
        if (btnA) { btnA.disabled = !ok; btnA.textContent = state.patient && state.patient.archived ? '♻️ استرجاع الملف' : '📦 أرشفة الملف'; }
        if (btnD) btnD.disabled = !ok;
        if (btnS) btnS.disabled = !ok;
        if (btnF) btnF.disabled = !ok;
    }

    /* ===== نموذج تعديل المعلومات ===== */
    function openForm() {
        var p = state.patient;
        if (!p) return;
        var err = $('formError'); if (err) { err.className = 'form-error'; err.textContent = ''; }
        $('fFileNum').value = p.fileNum || '';
        $('fName').value = p.name || '';
        $('fBirth').value = S.dmyToIso(p.birth || '');
        $('fAge').value = parseInt(p.age, 10) || '';
        $('fSex').value = p.sex || '';
        $('fMarital').value = p.marital || '';
        $('fOpened').value = p.openedAt || '';
        $('fPhone').value = p.phone || '';
        $('fJob').value = p.job || '';
        $('fEdu').value = p.edu || '';
        $('fAddress').value = p.address || '';
        $('fEmail').value = p.email || '';
        var m = $('formModal'); if (m) m.classList.add('show');
        var n = $('fName'); if (n) setTimeout(function () { try { n.focus(); } catch (e) { } }, 60);
    }
    function closeForm() { var m = $('formModal'); if (m) m.classList.remove('show'); }

    function saveForm() {
        if (!state.patient) return;
        var birthIso = $('fBirth').value;
        var ageVal = String($('fAge').value || '').trim();
        if (!ageVal && birthIso) ageVal = S.ageFromBirth(birthIso);
        var data = {
            name: $('fName').value,
            age: ageVal,
            birth: S.isoToDmy(birthIso),
            sex: $('fSex').value,
            marital: $('fMarital').value,
            openedAt: $('fOpened').value.trim(),
            phone: $('fPhone').value.trim(),
            job: $('fJob').value.trim(),
            edu: $('fEdu').value,
            address: $('fAddress').value.trim(),
            email: $('fEmail').value.trim()
        };
        var errors = S.validate(data);
        if (errors.length) {
            var err = $('formError');
            if (err) { err.textContent = errors[0]; err.className = 'form-error show'; }
            toast(errors[0], 'err');
            return;
        }
        var r = S.update(state.patient.id, data);
        if (!r.ok) {
            var e2 = $('formError');
            if (e2) { e2.textContent = r.error || 'تعذّر الحفظ.'; e2.className = 'form-error show'; }
            toast(r.error || 'تعذّر الحفظ.', 'err');
            return;
        }
        state.patient = r.patient;
        closeForm();
        renderAll();
        toast('✓ تم تحديث معلومات الملف.', 'ok');
    }

    function saveNotes(msg) {
        if (!state.patient) return false;
        var r = S.update(state.patient.id, {
            reason: ($('reasonArea') || {}).value || ''
        });
        if (!r.ok) { toast(r.error || 'تعذّر حفظ الملاحظات.', 'err'); return false; }
        state.patient = r.patient;
        renderInfo();
        toast(msg || '✓ تم حفظ الملاحظات.', 'ok');
        return true;
    }

    /* ===== نافذة التأكيد ===== */
    function openConfirm(opts) {
        state.confirmAction = opts.onYes || null;
        $('confirmTitle').textContent = opts.title || 'تأكيد';
        $('confirmText').innerHTML = opts.text || '';
        $('confirmWarn').innerHTML = opts.warn || '';
        $('confirmYes').textContent = opts.okLabel || 'تأكيد';
        var m = $('confirmModal'); if (m) m.classList.add('show');
    }
    function closeConfirm() {
        var m = $('confirmModal'); if (m) m.classList.remove('show');
        state.confirmAction = null;
    }

    function askArchive() {
        var p = state.patient;
        if (!p) return;
        if (p.archived) {
            openConfirm({
                title: 'استرجاع الملف', okLabel: 'استرجاع',
                text: 'هل تريد استرجاع الملف <b>' + esc(p.name) + '</b> وجعله نشطًا مجددًا؟ الجلسات تبقى محفوظة.',
                onYes: function () {
                    var r = S.setArchived(p.id, false);
                    if (r.ok) state.patient = r.patient;
                    closeConfirm(); renderAll();
                    toast(r.ok ? '✓ تم استرجاع الملف.' : (r.error || 'تعذّر الاسترجاع'), r.ok ? 'ok' : 'err');
                }
            });
            return;
        }
        openConfirm({
            title: 'أرشفة الملف', okLabel: 'أرشفة',
            text: 'سيتم نقل الملف <b>' + esc(p.name) + '</b> (' + esc(p.fileNum) + ') إلى المؤرشفة. يمكنك استرجاعه لاحقًا وجلساته لا تُحذف.',
            onYes: function () {
                var r = S.setArchived(p.id, true);
                if (r.ok) state.patient = r.patient;
                closeConfirm(); renderAll();
                toast(r.ok ? '✓ تم أرشفة الملف.' : (r.error || 'تعذّر الأرشفة'), r.ok ? 'ok' : 'err');
            }
        });
    }

    function askDelete() {
        var p = state.patient;
        if (!p) return;
        var c = S.sessionCounts(p.id);
        var warn;
        if (c.total > 0) {
            var lines = [];
            if (c.ptsd) lines.push('جلسات PTSD: <b>' + c.ptsd + '</b>');
            if (c.mdd) lines.push('جلسات الاكتئاب: <b>' + c.mdd + '</b>');
            if (c.custom) lines.push('جلسات مخصصة: <b>' + c.custom + '</b>' + (c.names.length ? ' (' + esc(c.names.join('، ')) + ')' : ''));
            warn = '<div class="warn-list">⚠️ <b>تحذير:</b> الحذف سيزيل نهائيًا <b>' + c.total + '</b> جلسة ونتائجها ومسودات هذا الملف:<br>' +
                lines.join('<br>') + '<br>لا يمكن التراجع. للحفاظ على السجل استخدم «أرشفة».</div>';
        } else {
            warn = '<div class="warn-list">لا توجد جلسات مرتبطة. الحذف نهائي ولا يمكن التراجع عنه.</div>';
        }
        openConfirm({
            title: 'تأكيد حذف الملف',
            text: 'هل أنت متأكد من حذف الملف <b>' + esc(p.name) + '</b> (' + esc(p.fileNum) + ')؟',
            warn: warn,
            okLabel: c.total > 0 ? ('حذف و' + c.total + ' جلسة') : 'حذف الملف',
            onYes: function () {
                var r = S.remove(p.id);
                closeConfirm();
                if (r.ok) {
                    state.patient = null;
                    toast('✓ تم حذف الملف' + (r.removed && r.removed.total ? (' و' + r.removed.total + ' جلسة') : '') + '.', 'ok');
                    try { location.href = 'patient-files.html'; return; } catch (e) { }
                    renderAll();
                } else toast(r.error || 'تعذّر الحذف.', 'err');
            }
        });
    }

    /* ===== بدء جلسة تقييم ===== */
    function openScaleModal() {
        var p = state.patient;
        if (!p) return;
        $('scaleFor').textContent = p.name + ' (' + p.fileNum + ')';
        var html = '';
        ['ptsd', 'mdd'].forEach(function (kind) {
            var meta = S.BUILTIN[kind];
            html += '<button class="scale-opt" data-kind="' + kind + '">' +
                '<span class="so-ico">' + (kind === 'ptsd' ? '🧠' : '💙') + '</span>' +
                '<span><span class="so-name">' + esc(meta.name) + '</span>' +
                '<span class="so-sub">مقياس جاهز مدمج — يُحفظ في سجل هذا الملف</span></span>' +
                '<span class="so-go">ابدأ ←</span></button>';
        });
        S.customScales().forEach(function (sc) {
            html += '<button class="scale-opt" data-kind="custom" data-scale="' + esc(sc.id) + '">' +
                '<span class="so-ico">' + esc(sc.icon || '📏') + '</span>' +
                '<span><span class="so-name">' + esc(sc.name) + '</span>' +
                '<span class="so-sub">مقياس مخصص منشور' + (sc.items && sc.items.length ? ' — ' + sc.items.length + ' بندًا' : '') + '</span></span>' +
                '<span class="so-go">ابدأ ←</span></button>';
        });
        $('scaleList').innerHTML = html || '<div class="empty">لا توجد مقاييس متاحة.</div>';
        var m = $('scaleModal'); if (m) m.classList.add('show');
    }
    function closeScaleModal() { var m = $('scaleModal'); if (m) m.classList.remove('show'); }

    function start(kind, scaleId) {
        if (!state.patient) return;
        var r = S.startAssessment(state.patient.id, kind, scaleId);
        if (!r.ok) { closeScaleModal(); toast(r.error || 'تعذّر بدء التقييم.', 'err'); return; }
        try { location.href = r.href; } catch (e) { toast('جاهز لبدء التقييم: ' + r.href, 'ok'); closeScaleModal(); }
    }

    function viewResult(key) {
        if (!state.patient) return;
        var s = null;
        for (var i = 0; i < currentSessions.length; i++) if (sessKey(currentSessions[i]) === key) { s = currentSessions[i]; break; }
        if (!s) { toast('الجلسة غير موجودة.', 'err'); return; }
        var href = S.resultHref(state.patient.id, s);
        if (!href) { toast('لا يوجد ملخص لهذا النوع.', 'err'); return; }
        try { location.href = href; } catch (e) { toast('رابط الملخص: ' + href, 'ok'); }
    }

    /* ===== الربط ===== */
    function bind() {
        var list = $('sessList');
        if (list) {
            list.onclick = function (e) {
                var t = e.target;
                var btn = t && t.closest ? t.closest('[data-act]') : null;
                if (!btn) return;
                var act = btn.getAttribute('data-act');
                var key = btn.getAttribute('data-key');
                if (act === 'toggle') {
                    state.open[key] = !state.open[key];
                    var sess = btn.closest('.sess');
                    if (sess) {
                        sess.classList.toggle('open', !!state.open[key]);
                        var tg = sess.querySelector('.chip.toggle');
                        if (tg) tg.textContent = state.open[key] ? 'إخفاء ▴' : 'عرض ▾';
                    }
                } else if (act === 'view') viewResult(key);
            };
        }
        var scaleList = $('scaleList');
        if (scaleList) {
            scaleList.onclick = function (e) {
                var t = e.target;
                var btn = t && t.closest ? t.closest('.scale-opt') : null;
                if (!btn) return;
                start(btn.getAttribute('data-kind'), btn.getAttribute('data-scale'));
            };
        }
        var bEdit = $('btnEditInfo'); if (bEdit) bEdit.onclick = openForm;
        var bSaveInfo = $('btnSaveInfo'); if (bSaveInfo) bSaveInfo.onclick = function (e) { if (e && e.preventDefault) e.preventDefault(); saveForm(); };
        var editForm = $('editForm');
        if (editForm) editForm.onsubmit = function (e) { if (e && e.preventDefault) e.preventDefault(); saveForm(); return false; };
        var bCancel = $('btnCancelInfo'); if (bCancel) bCancel.onclick = closeForm;
        var bNotes = $('btnSaveNotes'); if (bNotes) bNotes.onclick = function () { saveNotes(); };
        var bBirth = $('fBirth');
        if (bBirth) bBirth.onchange = function () {
            var a = S.ageFromBirth(this.value);
            if (a) $('fAge').value = a;
        };
        var bSaveFile = $('btnSaveFile');
        if (bSaveFile) bSaveFile.onclick = function () {
            if (!saveNotes('✓ تم حفظ الملف.')) return;
            setTimeout(function () { try { location.href = 'patient-files.html'; } catch (e) { } }, 500);
        };
        var bPdf = $('btnDownloadPdf');
        if (bPdf) bPdf.onclick = function () {
            var p = state.patient;
            if (!p) { toast('لا يوجد ملف مريض لتحميله.', 'err'); return; }
            var shell = document.querySelector ? document.querySelector('.file-shell') : null;
            if (!shell) { toast('تعذّر تحديد محتوى الملف.', 'err'); return; }
            var fname = 'ملف-' + (p.fileNum || p.name || 'مريض') + '.pdf';
            if (window.PdfExport) {
                var btn = this, old = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ جارٍ التحميل...';
                var done = function () { btn.innerHTML = old; btn.disabled = false; };
                window.PdfExport.save(shell, fname).then(done, done);
            } else if (window.print) {
                window.print();
            }
        };
        var bReset = $('btnResetNotes'); if (bReset) bReset.onclick = function () { fillNotes(); toast('تم التراجع عن التعديلات غير المحفوظة.'); };
        var bAddInterview = $('btnAddInterview'); if (bAddInterview) bAddInterview.onclick = openInterview;
        var bSaveInterview = $('btnSaveInterview'); if (bSaveInterview) bSaveInterview.onclick = function (e) { if (e && e.preventDefault) e.preventDefault(); saveInterview(); };
        var interviewForm = $('interviewForm');
        if (interviewForm) interviewForm.onsubmit = function (e) { if (e && e.preventDefault) e.preventDefault(); saveInterview(); return false; };
        var bCancelInterview = $('btnCancelInterview'); if (bCancelInterview) bCancelInterview.onclick = closeInterview;
        var bStart = $('btnStartTest'); if (bStart) bStart.onclick = openScaleModal;
        var bScaleCancel = $('btnScaleCancel'); if (bScaleCancel) bScaleCancel.onclick = closeScaleModal;
        var bArchive = $('btnArchive'); if (bArchive) bArchive.onclick = askArchive;
        var bDelete = $('btnDelete'); if (bDelete) bDelete.onclick = askDelete;
        var cYes = $('confirmYes'); if (cYes) cYes.onclick = function () { var a = state.confirmAction; if (typeof a === 'function') a(); else closeConfirm(); };
        var cNo = $('confirmNo'); if (cNo) cNo.onclick = closeConfirm;
        ['formModal', 'confirmModal', 'scaleModal', 'interviewModal'].forEach(function (id) {
            var m = $(id);
            if (m) m.addEventListener('click', function (e) {
                if (e.target !== m) return;
                if (id === 'formModal') closeForm();
                else if (id === 'confirmModal') closeConfirm();
                else if (id === 'interviewModal') closeInterview();
                else closeScaleModal();
            });
        });
        var btn = $('authBtn');
        if (btn) {
            var u = null;
            try { u = JSON.parse(localStorage.getItem('diagUser') || 'null'); } catch (e) { }
            if (u) { btn.textContent = (u.isAdmin ? '👨‍💼 ' : '👤 ') + (u.isAdmin ? 'المدير' : u.name); btn.onclick = function () { location.href = 'profile.html'; }; }
            else btn.onclick = function () { location.href = 'login.html'; };
        }
    }

    function init() {
        state.id = getParam('id');
        state.patient = state.id ? S.get(state.id) : null;
        bind();
        renderAll();
        if (!state.patient) toast('لم يتم العثور على الملف — عد إلى قائمة الملفات.', 'err');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.__patientFile = {
        state: state, init: init, renderAll: renderAll, saveForm: saveForm, saveNotes: saveNotes,
        askArchive: askArchive, askDelete: askDelete, openScaleModal: openScaleModal, start: start,
        viewResult: viewResult, sessions: function () { return currentSessions; },
        openInterview: openInterview, closeInterview: closeInterview, saveInterview: saveInterview,
        renderInterviews: renderInterviews
    };
})();
