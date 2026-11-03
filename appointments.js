/*
 * appointments.js — تنظيم الجلسات والمواعيد
 * يعتمد على patient-store.js لربط المواعيد بملفات الحالات وجلسات التقييم.
 *
 * مفاتيح التخزين:
 *   diagAppointments   -> قائمة المواعيد
 *   diagReassessAck    -> { patientId: ISO } آخر مرة راجع فيها الأخصائي الحالة
 */
(function () {
    'use strict';

    var S = window.PatientStore;
    if (!S) return;

    var AKEY = 'diagAppointments';
    var ACK_KEY = 'diagReassessAck';
    var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    var state = { filter: 'upcoming', q: '', editingId: null, summaryId: null, confirmId: null };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

    var toastTimer = null;
    function toast(msg, type) {
        var t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
    }

    /* ================== التخزين ================== */
    function load() {
        var raw = safeGet(AKEY);
        if (!raw) return [];
        try {
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(function (a) { return isObj(a) && a.id; }) : [];
        } catch (e) { return []; }
    }
    function save(list) { return safeSet(AKEY, JSON.stringify(list || [])); }
    function uid() { return 'ap' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function ackMap() {
        var raw = safeGet(ACK_KEY);
        if (!raw) return {};
        try { var o = JSON.parse(raw); return isObj(o) ? o : {}; } catch (e) { return {}; }
    }
    function setAck(pid) {
        var m = ackMap();
        m[pid] = new Date().toISOString();
        safeSet(ACK_KEY, JSON.stringify(m));
    }

    /* ================== التواريخ ================== */
    function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
    function todayISO() {
        var d = new Date();
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function dtOf(a) {
        if (!a || !a.date) return null;
        var t = Date.parse(a.date + 'T' + (a.time || '00:00') + ':00');
        return isNaN(t) ? null : new Date(t);
    }
    function dateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function fmtDateLong(iso) {
        if (!iso) return '—';
        var p = String(iso).split('-');
        if (p.length !== 3) return iso;
        var d = new Date(+p[0], +p[1] - 1, +p[2]);
        if (isNaN(d.getTime())) return iso;
        return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    }
    function fmtDateShort(iso) {
        if (!iso) return '—';
        var p = String(iso).split('-');
        if (p.length !== 3) return iso;
        return p[2] + '/' + p[1] + '/' + p[0];
    }
    function daysWord(n) {
        if (n === 1) return 'يوم';
        if (n === 2) return 'يومين';
        if (n >= 3 && n <= 10) return n + ' أيام';
        return n + ' يومًا';
    }
    function relDay(iso) {
        if (!iso) return '';
        var p = String(iso).split('-');
        if (p.length !== 3) return '';
        var target = new Date(+p[0], +p[1] - 1, +p[2]);
        if (isNaN(target.getTime())) return '';
        var diff = Math.round((dateOnly(target) - dateOnly(new Date())) / 86400000);
        if (diff === 0) return 'اليوم';
        if (diff === 1) return 'غدًا';
        if (diff === -1) return 'أمس';
        if (diff > 1) return 'بعد ' + daysWord(diff);
        return 'متأخر ' + daysWord(Math.abs(diff));
    }
    function sessionTs(s) {
        if (!s) return 0;
        if (s.dateTime) { var t = Date.parse(s.dateTime); if (!isNaN(t)) return t; }
        var p = String(s.date || '').split('/');
        if (p.length === 3) {
            var t2 = new Date(+p[2], +p[1] - 1, +p[0]).getTime();
            if (!isNaN(t2)) return t2;
        }
        return 0;
    }

    /* ================== الحالات ================== */
    function activePatients() {
        return S.load().filter(function (p) { return !p.archived; }).sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
        });
    }
    function patientName(a) {
        var p = a && a.patientId ? S.get(a.patientId) : null;
        return (p && p.name) || a.patientName || 'حالة محذوفة';
    }
    function patientCode(a) {
        var p = a && a.patientId ? S.get(a.patientId) : null;
        return (p && p.fileNum) || a.fileCode || '';
    }

    /* ================== التذكير ================== */
    function nextUpcoming() {
        var now = new Date();
        var out = [];
        load().forEach(function (a) {
            if (a.status !== 'scheduled') return;
            var d = dtOf(a);
            if (d && d >= now) out.push({ a: a, dt: d });
        });
        out.sort(function (x, y) { return x.dt - y.dt; });
        return out[0] || null;
    }
    function latestOverdue() {
        var now = new Date();
        var out = [];
        load().forEach(function (a) {
            if (a.status !== 'scheduled') return;
            var d = dtOf(a);
            if (d && d < now) out.push({ a: a, dt: d });
        });
        out.sort(function (x, y) { return y.dt - x.dt; });
        return out[0] || null;
    }

    function renderReminder() {
        var bar = $('reminderBar'), ico = $('remIco'), kicker = $('remKicker');
        var title = $('remTitle'), sub = $('remSub'), actions = $('remActions');
        if (!bar) return;
        bar.className = 'reminder';
        var next = nextUpcoming();
        var overdue = next ? null : latestOverdue();

        if (next) {
            var a = next.a;
            ico.textContent = '⏰';
            kicker.textContent = 'تذكير بالموعد القادم';
            title.textContent = patientName(a) + ' — ' + relDay(a.date) + ' · ' + (a.time || '—');
            sub.textContent = fmtDateLong(a.date) + ' • ' + (a.type || 'جلسة') + ' • ' + (a.duration || 45) + ' دقيقة • ' + (a.mode || 'حضوري');
            actions.innerHTML =
                '<button type="button" class="rem-btn solid" data-rem="show" data-id="' + esc(a.id) + '">عرض في الجدول ←</button>' +
                '<button type="button" class="rem-btn" data-rem="attended" data-id="' + esc(a.id) + '">✓ تسجيل الحضور</button>' +
                '<button type="button" class="rem-btn" data-rem="summary" data-id="' + esc(a.id) + '">📝 ملخص</button>';
            return;
        }
        if (overdue) {
            var o = overdue.a;
            bar.className = 'reminder overdue';
            ico.textContent = '⚠️';
            kicker.textContent = 'موعد لم تُسجَّل نتيجته';
            title.textContent = patientName(o) + ' — ' + relDay(o.date) + ' · ' + (o.time || '—');
            sub.textContent = fmtDateLong(o.date) + ' • لم يُسجَّل حضور أو غياب لهذا الموعد بعد.';
            actions.innerHTML =
                '<button type="button" class="rem-btn solid" data-rem="attended" data-id="' + esc(o.id) + '">✓ حضر</button>' +
                '<button type="button" class="rem-btn" data-rem="missed" data-id="' + esc(o.id) + '">✕ غاب</button>' +
                '<button type="button" class="rem-btn" data-rem="edit" data-id="' + esc(o.id) + '">تعديل</button>';
            return;
        }
        bar.className = 'reminder empty';
        ico.textContent = '🗓️';
        kicker.textContent = 'التذكير';
        title.textContent = 'لا توجد مواعيد قادمة حاليًا';
        sub.textContent = 'أنشئ موعدًا جديدًا لتبدأ بتنظيم جدولك، وسيظهر هنا الموعد الأقرب تلقائيًا.';
        actions.innerHTML = '<button type="button" class="rem-btn solid" data-rem="new">＋ موعد جديد</button>';
    }

    /* ================== الإحصاءات ================== */
    function renderStats() {
        var all = load();
        var now = new Date();
        var today = todayISO();
        var todayCount = 0, upcoming = 0, attended = 0, missed = 0;
        all.forEach(function (a) {
            var d = dtOf(a);
            if (a.status !== 'cancelled' && a.date === today) todayCount++;
            if (a.status === 'scheduled' && d && d >= now) upcoming++;
            if (a.status === 'attended') attended++;
            if (a.status === 'missed') missed++;
        });
        if ($('stToday')) $('stToday').textContent = todayCount;
        if ($('stUpcoming')) $('stUpcoming').textContent = upcoming;
        if ($('stAttended')) $('stAttended').textContent = attended;
        if ($('stMissed')) $('stMissed').textContent = missed;
    }

    /* ================== الجدول ================== */
    function filtered() {
        var list = load();
        var q = state.q.trim().toLowerCase();
        var now = new Date();
        list = list.filter(function (a) {
            if (state.filter === 'today' && a.date !== todayISO()) return false;
            if (state.filter === 'upcoming' && a.status !== 'scheduled') return false;
            if (state.filter === 'attended' && a.status !== 'attended') return false;
            if (state.filter === 'missed' && a.status !== 'missed') return false;
            if (q) {
                var hay = (patientName(a) + ' ' + patientCode(a) + ' ' + String(a.notes || '') + ' ' + String(a.type || '')).toLowerCase();
                if (hay.indexOf(q) < 0) return false;
            }
            return true;
        });
        list.sort(function (a, b) {
            var da = dtOf(a), db = dtOf(b);
            if (state.filter === 'upcoming') {
                /* القادمة أولًا تصاعديًا، ثم المواعيد التي لم تُسجَّل الأحدث أولًا */
                var nowT = Date.now();
                var fa = (da && da.getTime() >= nowT) ? 0 : 1;
                var fb = (db && db.getTime() >= nowT) ? 0 : 1;
                if (fa !== fb) return fa - fb;
                if (fa === 0) return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
                return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
            }
            if (state.filter === 'today') {
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            }
            if (state.filter === 'attended' || state.filter === 'missed') {
                return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
            }
            /* الكل: المواعيد القادمة أولًا ثم الأحدث */
            var sa = a.status === 'scheduled' ? 0 : 1, sb = b.status === 'scheduled' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            if (sa === 0) return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        return list;
    }

    function statusInfo(a) {
        if (a.status === 'attended') return { cls: 'st-attended', label: '✓ حضر' };
        if (a.status === 'missed') return { cls: 'st-missed', label: '✕ غاب' };
        if (a.status === 'cancelled') return { cls: 'st-cancelled', label: 'ملغى' };
        var d = dtOf(a);
        if (d && d < new Date()) return { cls: 'st-overdue', label: '⏰ لم يُسجَّل' };
        return { cls: 'st-scheduled', label: 'قادم' };
    }

    function rowHTML(a, nextId) {
        var st = statusInfo(a);
        var d = dtOf(a);
        var cls = (nextId && a.id === nextId) ? 'is-next' : (a.status === 'scheduled' && d && d < new Date() ? 'is-past-scheduled' : '');
        var pName = patientName(a);
        var pCode = patientCode(a);
        var hasSummary = !!(a.summary && a.summary.text);
        var actions = '';
        if (a.status === 'scheduled') {
            actions += '<button type="button" class="abtn ok" data-act="attended" data-id="' + esc(a.id) + '">✓ حضر</button>';
            actions += '<button type="button" class="abtn warn" data-act="missed" data-id="' + esc(a.id) + '">✕ غاب</button>';
        }
        actions += '<button type="button" class="abtn summary" data-act="summary" data-id="' + esc(a.id) + '">' + (hasSummary ? 'عرض الملخص' : '＋ ملخص') + '</button>';
        actions += '<button type="button" class="abtn" data-act="edit" data-id="' + esc(a.id) + '">تعديل</button>';
        actions += '<button type="button" class="abtn danger" data-act="delete" data-id="' + esc(a.id) + '">حذف</button>';

        return '<tr class="' + cls + '">' +
            '<td><div class="dt-main">' + esc(fmtDateLong(a.date)) + '</div>' +
            '<div class="dt-sub">' + esc(a.time || '—') + ' • ' + esc(a.duration || 45) + ' د • ' + esc(a.mode || 'حضوري') + '</div></td>' +
            '<td>' + (a.patientId ? '<a class="pt-link" href="patient-file.html?id=' + encodeURIComponent(a.patientId) + '" title="فتح ملف الحالة">' + esc(pName) + '</a>' : '<span class="pt-link" style="cursor:default">' + esc(pName) + '</span>') +
            (pCode ? '<span class="pt-code">' + esc(pCode) + '</span>' : '') + '</td>' +
            '<td><span class="type-chip">' + esc(a.type || 'جلسة') + '</span></td>' +
            '<td><span class="status ' + st.cls + '">' + st.label + '</span></td>' +
            '<td>' + (hasSummary ? '<button type="button" class="abtn summary" data-act="summary" data-id="' + esc(a.id) + '">📄 عرض</button>' : '<span class="sum-none">—</span>') + '</td>' +
            '<td><div class="row-actions">' + actions + '</div></td>' +
            '</tr>';
    }

    function renderTable() {
        var list = filtered();
        var body = $('apptBody'), empty = $('emptyState'), wrap = $('tableWrap'), count = $('countLine');
        var all = load();
        var next = nextUpcoming();
        var nextId = next ? next.a.id : null;

        if (body) body.innerHTML = list.map(function (a) { return rowHTML(a, nextId); }).join('');
        if (count) count.textContent = all.length ? ('عرض ' + list.length + ' من ' + all.length + ' موعد') : '';

        if (empty) {
            if (list.length) {
                empty.style.display = 'none';
                if (wrap) wrap.style.display = '';
            } else {
                empty.style.display = 'block';
                if (wrap) wrap.style.display = 'none';
                var noData = !all.length;
                var titles = { upcoming: 'لا توجد مواعيد قادمة', today: 'لا توجد مواعيد اليوم', attended: 'لا توجد جلسات حضور مسجّلة', missed: 'لا توجد جلسات غياب مسجّلة', all: 'لا توجد مواعيد بعد' };
                $('emptyTitle').textContent = noData ? 'لا توجد مواعيد بعد' : (titles[state.filter] || 'لا توجد نتائج');
                $('emptyText').textContent = noData
                    ? 'أنشئ أول موعد واربطه بملف حالة، ثم سجّل الحضور والغياب وملخص كل جلسة.'
                    : (state.q ? 'لا توجد مواعيد مطابقة لبحثك. جرّب كلمة أخرى أو غيّر التصفية.' : 'جرّب تغيير التصفية أو أنشئ موعدًا جديدًا.');
                $('btnEmptyNew').style.display = '';
            }
        }
    }

    /* ================== إعادة التقييم ================== */
    function reassessCases() {
        var acks = ackMap();
        var out = [];
        activePatients().forEach(function (p) {
            var sessions = S.sessionsFor(p.id);
            var last = sessions[0] || null;
            var lastTs = last ? sessionTs(last) : 0;
            var ackTs = acks[p.id] ? Date.parse(acks[p.id]) : 0;
            /* بعد «تمت المراجعة» تُخفى الأسباب حتى يُسجَّل تقييم أحدث من لحظة المراجعة */
            var reviewed = !!(ackTs && ackTs > lastTs);
            var reasons = [];

            if (!reviewed) {
                if (!last) {
                    reasons.push({ t: 'لا يوجد تقييم موثّق في الملف بعد', k: 'none' });
                } else {
                    var days = Math.floor((Date.now() - lastTs) / 86400000);
                    if (days >= 90) reasons.push({ t: 'مرّ ' + days + ' يومًا على آخر تقييم', k: 'stale' });
                    var pct = parseFloat(last.pct);
                    var severe = (isFinite(pct) && pct >= 70) || /شديد/.test(String(last.state || ''));
                    if (severe) reasons.push({ t: 'آخر نتيجة تشير إلى شدة مرتفعة' + (isFinite(pct) ? ' (' + Math.round(pct) + '%)' : ''), k: 'severe' });
                }
            }
            if (p.needsReassessment) reasons.push({ t: 'مُعلَّم في ملف الحالة كحاجة للمراجعة', k: 'manual' });

            if (reasons.length) out.push({ p: p, last: last, reasons: reasons, sessions: sessions.length });
        });
        return out;
    }

    function renderReassessment() {
        var list = reassessCases();
        var wrap = $('reassessList'), empty = $('reassessEmpty'), count = $('reassessCount');
        if (wrap) {
            wrap.innerHTML = list.map(function (c) {
                var p = c.p;
                var reasons = c.reasons.map(function (r) { return '<div class="rc-reason">⚠️ ' + esc(r.t) + '</div>'; }).join('');
                var lastLine = c.last
                    ? ('آخر تقييم: ' + esc(c.last.scaleName || 'تقييم') + ' — ' + esc(c.last.date || S.fmtDate(c.last.dateTime)) + ' • ' + c.sessions + ' جلسة')
                    : 'لا توجد جلسات تقييم محفوظة';
                return '<div class="reassess-card">' +
                    '<div class="rc-head">' +
                    '<div class="rc-avatar">' + esc(String(p.name || 'ح').charAt(0)) + '</div>' +
                    '<div><div class="rc-name">' + esc(p.name) + '</div><div class="rc-code">' + esc(p.fileNum || '') + (p.age ? ' • ' + esc(p.age) + ' سنة' : '') + '</div></div>' +
                    '</div>' +
                    '<div class="rc-meta">' + lastLine + '</div>' +
                    '<div class="rc-reasons">' + reasons + '</div>' +
                    '<div class="rc-actions">' +
                    '<button type="button" class="abtn primary" data-rc="start" data-id="' + esc(p.id) + '">بدء إعادة التقييم ←</button>' +
                    '<button type="button" class="abtn" data-rc="review" data-id="' + esc(p.id) + '">تمت المراجعة</button>' +
                    '</div></div>';
            }).join('');
        }
        if (empty) empty.style.display = list.length ? 'none' : 'block';
        if (count) count.textContent = list.length ? (list.length + ' حالة تحتاج متابعة') : '';
    }

    function markReviewed(pid) {
        var p = S.get(pid);
        if (!p) { toast('الملف غير موجود.', 'err'); return; }
        setAck(pid);
        if (p.needsReassessment) S.update(pid, { needsReassessment: false });
        render();
        toast('✓ تم تسجيل مراجعة الحالة — ستعود للظهور عند مرور 90 يومًا على آخر تقييم.', 'ok');
    }

    /* ================== النموذج ================== */
    function fillPatients(selectedId, fallbackName) {
        var sel = $('aPatient');
        if (!sel) return;
        var list = activePatients();
        var html = '<option value="">— اختر ملف الحالة —</option>';
        list.forEach(function (p) {
            html += '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.fileNum ? ' — ' + esc(p.fileNum) : '') + '</option>';
        });
        var exists = list.some(function (p) { return String(p.id) === String(selectedId); });
        if (selectedId && !exists) {
            html += '<option value="' + esc(selectedId) + '">' + esc(fallbackName || 'ملف غير متاح') + '</option>';
        }
        sel.innerHTML = html;
        sel.value = selectedId || '';
        var hint = $('aPatientHint');
        if (hint) {
            hint.innerHTML = list.length
                ? 'تربط الجلسة بملف الحالة لتظهر ضمن سجلّه وتُتاح إعادة التقييم من هناك.'
                : 'لا توجد ملفات مرضى بعد. <a href="patient-files.html">أنشئ ملف حالة أولًا</a> ثم عُد لإنشاء الموعد.';
        }
    }

    function nextSlot() {
        var d = new Date(Date.now() + 60 * 60 * 1000);
        d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function openForm(id) {
        state.editingId = id || null;
        var err = $('formError');
        if (err) { err.className = 'form-error'; err.textContent = ''; }
        if (id) {
            var a = null;
            load().forEach(function (x) { if (String(x.id) === String(id)) a = x; });
            if (!a) { toast('الموعد غير موجود.', 'err'); return; }
            $('formTitle').textContent = '✏️ تعديل الموعد';
            $('formSub').textContent = 'يمكنك تغيير الموعد أو ملف الحالة أو تسجيل حالة الحضور مباشرة.';
            fillPatients(a.patientId, a.patientName);
            $('aDate').value = a.date || todayISO();
            $('aTime').value = a.time || '';
            $('aDuration').value = String(a.duration || 45);
            $('aType').value = a.type || 'جلسة متابعة';
            $('aMode').value = a.mode || 'حضوري';
            $('aStatus').value = a.status || 'scheduled';
            $('aNotes').value = a.notes || '';
        } else {
            $('formTitle').textContent = '＋ موعد جديد';
            $('formSub').textContent = 'اربط الموعد بملف الحالة، ثم حدّد التاريخ والوقت ونوع الجلسة.';
            fillPatients('', '');
            $('aDate').value = todayISO();
            $('aTime').value = nextSlot();
            $('aDuration').value = '45';
            $('aType').value = 'جلسة متابعة';
            $('aMode').value = 'حضوري';
            $('aStatus').value = 'scheduled';
            $('aNotes').value = '';
        }
        var m = $('formModal');
        if (m) m.classList.add('show');
        setTimeout(function () { try { $('aPatient').focus(); } catch (e) { } }, 60);
    }
    function closeForm() { var m = $('formModal'); if (m) m.classList.remove('show'); }

    function showError(msg) {
        var err = $('formError');
        if (err) { err.textContent = msg; err.className = 'form-error show'; }
    }

    function saveForm() {
        var pid = $('aPatient').value;
        var date = $('aDate').value;
        var time = $('aTime').value;
        if (!pid) { showError('اختر ملف الحالة الذي يرتبط به الموعد.'); return; }
        if (!date) { showError('حدّد تاريخ الموعد.'); return; }
        if (!time) { showError('حدّد وقت الموعد.'); return; }
        var p = S.get(pid);
        if (!p && !state.editingId) { showError('ملف الحالة غير موجود.'); return; }

        var list = load();
        var dupe = list.some(function (x) {
            return String(x.id) !== String(state.editingId) && String(x.patientId) === String(pid) && x.date === date && x.time === time;
        });
        if (dupe) { showError('يوجد موعد آخر لهذا الملف في نفس التاريخ والوقت.'); return; }

        var base = null;
        list.forEach(function (x) { if (String(x.id) === String(state.editingId)) base = x; });
        var rec = base || {};
        rec.id = base ? base.id : uid();
        rec.patientId = pid;
        rec.patientName = p ? p.name : (base ? base.patientName : '');
        rec.fileCode = p ? p.fileNum : (base ? base.fileCode : '');
        rec.date = date;
        rec.time = time;
        rec.duration = parseInt($('aDuration').value, 10) || 45;
        rec.type = $('aType').value;
        rec.mode = $('aMode').value;
        rec.status = $('aStatus').value;
        rec.notes = $('aNotes').value.trim();
        rec.updatedAt = new Date().toISOString();
        if (!base) { rec.createdAt = rec.updatedAt; rec.summary = null; }

        if (base) {
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(base.id)) { list[i] = rec; break; }
            }
        } else {
            list.push(rec);
        }
        save(list);
        closeForm();
        state.editingId = null;
        render();
        toast(base ? '✓ تم تحديث الموعد.' : '✓ تم إنشاء الموعد وربطه بملف الحالة.', 'ok');
    }

    /* ================== الملخص ================== */
    function openSummary(id) {
        var a = null;
        load().forEach(function (x) { if (String(x.id) === String(id)) a = x; });
        if (!a) { toast('الموعد غير موجود.', 'err'); return; }
        state.summaryId = a.id;
        $('sumTitle').textContent = '📝 ملخص الجلسة';
        $('sumSub').textContent = patientName(a) + ' — ' + fmtDateLong(a.date) + ' · ' + (a.time || '');
        $('sumMeta').innerHTML =
            '<span class="badge">' + esc(a.type || 'جلسة') + '</span>' +
            '<span class="badge">' + esc(a.duration || 45) + ' دقيقة</span>' +
            '<span class="badge">' + esc(a.mode || 'حضوري') + '</span>';
        var s = a.summary || {};
        $('sumText').value = s.text || '';
        $('sumGoals').value = s.goals || '';
        $('sumHomework').value = s.homework || '';
        $('sumNext').value = s.nextPlan || '';
        var err = $('sumError'); if (err) { err.className = 'form-error'; err.textContent = ''; }

        var checkWrap = $('sumCheckWrap'), check = $('sumMarkAttended');
        if (checkWrap && check) {
            if (a.status === 'attended') {
                checkWrap.style.display = 'none';
            } else {
                checkWrap.style.display = '';
                check.checked = a.status === 'scheduled';
            }
        }
        var m = $('summaryModal');
        if (m) m.classList.add('show');
        setTimeout(function () { try { $('sumText').focus(); } catch (e) { } }, 60);
    }
    function closeSummary() { var m = $('summaryModal'); if (m) m.classList.remove('show'); }

    function saveSummary() {
        var text = $('sumText').value.trim();
        if (!text) {
            var err = $('sumError');
            if (err) { err.textContent = 'ملخص الجلسة مطلوب قبل الحفظ.'; err.className = 'form-error show'; }
            return;
        }
        var list = load();
        var found = null;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(state.summaryId)) { found = list[i]; break; }
        }
        if (!found) { toast('الموعد غير موجود.', 'err'); return; }
        found.summary = {
            text: text,
            goals: $('sumGoals').value.trim(),
            homework: $('sumHomework').value.trim(),
            nextPlan: $('sumNext').value.trim(),
            savedAt: new Date().toISOString()
        };
        var check = $('sumMarkAttended');
        if (check && check.checked && $('sumCheckWrap').style.display !== 'none') found.status = 'attended';
        found.updatedAt = new Date().toISOString();
        save(list);
        closeSummary();
        render();
        toast('✓ تم حفظ ملخص الجلسة.', 'ok');
    }

    /* ================== الحضور والحذف ================== */
    function mark(id, status) {
        var list = load();
        var found = null;
        list.forEach(function (x) { if (String(x.id) === String(id)) found = x; });
        if (!found) { toast('الموعد غير موجود.', 'err'); return; }
        found.status = status;
        found.updatedAt = new Date().toISOString();
        save(list);
        render();
        toast(status === 'attended' ? '✓ تم تسجيل حضور المريض.' : (status === 'missed' ? '✓ تم تسجيل غياب المريض.' : '✓ تم تحديث حالة الموعد.'), status === 'missed' ? '' : 'ok');
    }

    function askDelete(id) {
        var a = null;
        load().forEach(function (x) { if (String(x.id) === String(id)) a = x; });
        if (!a) return;
        state.confirmId = id;
        $('confirmTitle').textContent = '🗑️ حذف الموعد';
        $('confirmText').innerHTML = 'هل تريد حذف موعد <b>' + esc(patientName(a)) + '</b> بتاريخ <b>' + esc(fmtDateLong(a.date)) + ' — ' + esc(a.time || '') + '</b>؟' +
            (a.summary && a.summary.text ? '<br><span style="color:#b91c1c;font-weight:800">سيُحذف ملخص الجلسة المرتبط به أيضًا.</span>' : '');
        var m = $('confirmModal');
        if (m) m.classList.add('show');
    }
    function closeConfirm() { var m = $('confirmModal'); if (m) m.classList.remove('show'); state.confirmId = null; }

    function deleteConfirmed() {
        var id = state.confirmId;
        if (!id) { closeConfirm(); return; }
        var list = load().filter(function (x) { return String(x.id) !== String(id); });
        save(list);
        closeConfirm();
        render();
        toast('✓ تم حذف الموعد.', 'ok');
    }

    /* ================== الربط ================== */
    function render() {
        renderStats();
        renderReminder();
        renderTable();
        renderReassessment();
    }

    function bind() {
        var table = $('apptBody');
        if (table) {
            table.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
                if (!btn) return;
                var id = btn.getAttribute('data-id');
                var act = btn.getAttribute('data-act');
                if (act === 'attended') mark(id, 'attended');
                else if (act === 'missed') mark(id, 'missed');
                else if (act === 'summary') openSummary(id);
                else if (act === 'edit') openForm(id);
                else if (act === 'delete') askDelete(id);
            });
        }

        var rem = $('reminderBar');
        if (rem) {
            rem.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('[data-rem]') : null;
                if (!btn) return;
                var act = btn.getAttribute('data-rem');
                var id = btn.getAttribute('data-id');
                if (act === 'new') openForm(null);
                else if (act === 'attended') mark(id, 'attended');
                else if (act === 'missed') mark(id, 'missed');
                else if (act === 'summary') openSummary(id);
                else if (act === 'edit') openForm(id);
                else if (act === 'show') {
                    state.filter = 'upcoming';
                    state.q = '';
                    if ($('searchInput')) $('searchInput').value = '';
                    var tabs = document.querySelectorAll('.tab');
                    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-filter') === 'upcoming');
                    render();
                    var row = table ? table.querySelector('tr.is-next') : null;
                    if (row && row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }

        var rc = $('reassessList');
        if (rc) {
            rc.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('[data-rc]') : null;
                if (!btn) return;
                var id = btn.getAttribute('data-id');
                if (btn.getAttribute('data-rc') === 'review') markReviewed(id);
                else location.href = 'patient-file.html?id=' + encodeURIComponent(id);
            });
        }

        var search = $('searchInput');
        if (search) search.addEventListener('input', function () { state.q = this.value; renderTable(); });

        var tabs = document.querySelectorAll('.tab');
        for (var i = 0; i < tabs.length; i++) {
            (function (tab) {
                tab.addEventListener('click', function () {
                    state.filter = tab.getAttribute('data-filter');
                    for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
                    tab.classList.add('active');
                    renderTable();
                });
            })(tabs[i]);
        }

        var bNew = $('btnNew'); if (bNew) bNew.onclick = function () { openForm(null); };
        var bEmpty = $('btnEmptyNew'); if (bEmpty) bEmpty.onclick = function () { openForm(null); };
        var form = $('apptForm');
        if (form) form.onsubmit = function (e) { if (e && e.preventDefault) e.preventDefault(); saveForm(); return false; };
        var bCancel = $('btnCancelAppt'); if (bCancel) bCancel.onclick = closeForm;
        var sForm = $('summaryForm');
        if (sForm) sForm.onsubmit = function (e) { if (e && e.preventDefault) e.preventDefault(); saveSummary(); return false; };
        var bCancelSum = $('btnCancelSummary'); if (bCancelSum) bCancelSum.onclick = closeSummary;
        var cYes = $('confirmYes'); if (cYes) cYes.onclick = deleteConfirmed;
        var cNo = $('confirmNo'); if (cNo) cNo.onclick = closeConfirm;

        var fm = $('formModal');
        if (fm) fm.addEventListener('click', function (e) { if (e.target === fm) closeForm(); });
        var sm = $('summaryModal');
        if (sm) sm.addEventListener('click', function (e) { if (e.target === sm) closeSummary(); });
        var cm = $('confirmModal');
        if (cm) cm.addEventListener('click', function (e) { if (e.target === cm) closeConfirm(); });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            closeForm(); closeSummary(); closeConfirm();
        });

        var btn = $('authBtn');
        if (btn) {
            var u = null;
            try { u = JSON.parse(localStorage.getItem('diagUser') || 'null'); } catch (e) { }
            if (u) {
                btn.textContent = (u.isAdmin ? '👨‍💼 ' : '👤 ') + (u.isAdmin ? 'المدير' : u.name);
                btn.onclick = function () { location.href = 'profile.html'; };
            } else btn.onclick = function () { location.href = 'login.html'; };
        }
    }

    function init() {
        bind();
        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.__appointments = {
        state: state, load: load, save: save, render: render,
        openForm: openForm, openSummary: openSummary, mark: mark,
        reassessCases: reassessCases
    };
})();
