(function () {
    'use strict';
    var E = window.ScaleEngine;
    if (!E) return;

    var DRAFT_KEY = 'diagBuilderDraft';
    var STEPS = [
        { t: 'تعريف المقياس', h: 'اسم المقياس والمؤلف والإصدار.' },
        { t: 'خيارات الإجابة', h: 'مجموعات الدرجات المستخدمة في بنود المقياس (اسم الخيار وقيمته).' },
        { t: 'البنود', h: 'عبارات المقياس، مع تحديد مجموعة الخيارات لكل بند وإمكانية عكس اتجاه الدرجة.' },
        { t: 'الأبعاد الفرعية', h: 'اختياري: تقسيم المقياس إلى محاور تُحتسب درجاتها بشكل منفصل.' },
        { t: 'فئات التفسير', h: 'حدود الشدة (منخفضة/متوسطة/مرتفعة...) داخل نطاق النتيجة الممكن.' },
        { t: 'المراجعة والنشر', h: 'تحقق نهائي، معاينة حسابية، ثم حفظ المقياس.' }
    ];
    var CAT3 = ['منخفضة', 'متوسطة', 'مرتفعة'];
    var CAT4 = ['منخفضة', 'متوسطة', 'مرتفعة', 'شديدة'];

    var state = { scale: null, editingId: null, step: 0, preview: {}, published: false };
    var saveTimer = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function param(k) { var m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; }
    function fmt(n) { return (typeof n === 'number' && Math.round(n) !== n) ? Number(n.toFixed(4)) : n; }

    function blankScale() {
        return {
            id: E.makeId(),
            version: 1,
            name: '',
            icon: '📝',
            description: '',
            instructions: '',
            targetGroup: '',
            author: '',
            optionSets: [{ id: 'os1', name: '', options: [{ label: 'أبدًا', score: 0 }, { label: 'نادرًا', score: 1 }, { label: 'أحيانًا', score: 2 }, { label: 'غالبًا', score: 3 }, { label: 'دائمًا', score: 4 }] }],
            defaultOptionSetId: 'os1',
            items: [{ text: '', reverse: false, optionSetId: 'os1', dimensionId: null, reverseMap: null }],
            dimensions: [],
            scoring: { method: 'sum', meanMode: 'answered', includeDimensions: true },
            standard: { enabled: false, type: 'T', source: '', date: '', referenceGroup: '', selectionRule: '', sex: '', ageMin: '', ageMax: '', min: 0, max: 100, table: null, equation: null },
            cutoffs: { enabled: false, kind: 'custom', source: '', population: '', sensitivity: '', usage: '' },
            categories: [
                { label: 'منخفضة', min: 0, max: 20, color: '#16a34a' },
                { label: 'متوسطة', min: 21, max: 30, color: '#2563eb' },
                { label: 'مرتفعة', min: 31, max: 40, color: '#dc2626' }
            ],
            missingPolicy: { type: 'all', maxCount: 0, maxPercent: 0, ruleText: '' }
        };
    }

    function getPath(obj, path) {
        var p = path.split('.'), t = obj;
        for (var i = 0; i < p.length; i++) { if (t === undefined || t === null) return undefined; t = t[p[i]]; }
        return t;
    }
    function setPath(obj, path, val) {
        var p = path.split('.'), t = obj;
        for (var i = 0; i < p.length - 1; i++) {
            var k = p[i];
            if (!t[k] || typeof t[k] !== 'object') t[k] = /^\d+$/.test(p[i + 1]) ? [] : {};
            t = t[k];
        }
        t[p[p.length - 1]] = val;
    }

    function san() {
        var s = state.scale;
        if (!s) return null;
        var tmp = clone(s);
        tmp.id = tmp.id || 'cs-tmp';
        tmp.name = (tmp.name || '').trim() || 'مقياس مؤقت';
        if (!tmp.items || !tmp.items.length) tmp.items = [{ text: '', reverse: false, optionSetId: null, dimensionId: null, reverseMap: null }];
        return E._sanitizeScale(tmp);
    }

    function validateNow() {
        var s = san();
        var v = E.validateScale(s);
        var errs = v.errors.slice();
        if (!(state.scale.name || '').trim()) errs.unshift('اسم المقياس مطلوب.');
        if (!(state.scale.id || '').trim()) errs.unshift('معرّف المقياس مفقود.');
        return { errors: errs, warnings: v.warnings };
    }

    function markDirty() {
        state.published = false;
        var el = $('saveState');
        if (el) { el.textContent = 'يوجد تغييرات غير محفوظة...'; el.classList.add('dirty'); }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 500);
    }
    function saveDraft() {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(state.scale));
            var el = $('saveState');
            if (el) { el.textContent = 'مسودة محفوظة تلقائيًا'; el.classList.remove('dirty'); }
        } catch (e) { }
    }
    function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { } }

    var toastTimer = null;
    function toast(msg, kind) {
        var el = $('toast');
        el.className = 'toast show' + (kind ? ' ' + kind : '');
        el.textContent = msg;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
    }

    /* ========================= تهيئة ========================= */
    function init() {
        var id = param('id');
        if (id) {
            var sc = E.getScale(id);
            if (sc) { state.scale = clone(sc); state.editingId = id; }
            else { state.scale = blankScale(); toast('لم يُعثر على المقياس المطلوب — تم فتح مقياس جديد.', 'bad'); }
        } else {
            var d = null;
            try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { }
            if (d && d.id && d.items && d.items.length) {
                state.scale = d;
                var note = $('draftNote');
                if (note) note.classList.remove('hidden');
            } else state.scale = blankScale();
        }
        bindGlobal();
        renderStepper();
        renderManage();
        renderStep();
    }

    function bindGlobal() {
        document.addEventListener('input', onFieldEvent);
        document.addEventListener('change', onFieldEvent);
        document.addEventListener('click', onClickEvent);

        $('newBtn').onclick = function () { newScale(); };
        $('discardDraftBtn').onclick = function () { clearDraft(); location.href = 'scale-builder.html'; };
        $('prevBtn').onclick = function () { goStep(state.step - 1); };
        $('nextBtn').onclick = function () { goStep(state.step + 1); };

        (function () {
            var b = $('authBtn');
            var u = null;
            try { u = JSON.parse(localStorage.getItem('diagUser') || 'null'); } catch (e) { }
            if (u) { b.textContent = (u.isAdmin ? '👨‍💼 ' : '👤 ') + (u.isAdmin ? 'المدير' : u.name); b.onclick = function () { location.href = 'profile.html'; }; }
            else b.onclick = function () { location.href = 'login.html'; };
        })();
    }

    function newScale() {
        if (state.scale && !state.editingId && ((state.scale.name || '').trim() || hasExtraItems())) {
            if (!confirm('سيتم فتح مقياس جديد وإهمال المسودة الحالية. هل تريد المتابعة؟')) return;
        }
        clearDraft();
        state.scale = blankScale();
        state.editingId = null;
        state.step = 0;
        state.preview = {};
        state.published = false;
        var note = $('draftNote'); if (note) note.classList.add('hidden');
        history.replaceState(null, '', 'scale-builder.html');
        renderStepper();
        renderStep();
        renderManage();
    }
    function hasExtraItems() {
        return state.scale && state.scale.items && state.scale.items.length > 1;
    }

    function onFieldEvent(e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        var rmap = el.getAttribute('data-rmap');
        if (rmap !== null) {
            var parts = el.value.split(',');
            var arr = [];
            for (var i = 0; i < parts.length; i++) {
                var n = Number(parts[i].trim());
                if (parts[i].trim() !== '' && isFinite(n)) arr.push(n);
            }
            setPath(state.scale, rmap, arr.length ? arr : null);
            markDirty();
            return;
        }
        var path = el.getAttribute('data-f');
        if (path === null) return;
        var val;
        if (el.type === 'checkbox') val = el.checked;
        else if (el.type === 'radio') { if (!el.checked) return; val = el.value; }
        else if (el.getAttribute('data-num') !== null) { val = el.value === '' ? '' : Number(el.value); if (typeof val === 'number' && !isFinite(val)) return; }
        else val = el.value;
        setPath(state.scale, path, val);
        markDirty();
        if (el.getAttribute('data-render') !== null) renderStep();
    }

    function onClickEvent(e) {
        var el = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!el) return;
        var act = el.getAttribute('data-act');
        var i = parseInt(el.getAttribute('data-i'), 10);
        var j = parseInt(el.getAttribute('data-j'), 10);
        var s = state.scale;

        switch (act) {
            case 'addSet': {
                var nid = 'os' + (s.optionSets.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
                s.optionSets.push({ id: nid, name: 'مجموعة ' + (s.optionSets.length + 1), options: [{ label: 'أبدًا', score: 0 }, { label: 'دائمًا', score: 4 }] });
                break;
            }
            case 'delSet':
                if (s.optionSets.length <= 1) { toast('يجب الإبقاء على مجموعة خيارات واحدة على الأقل.', 'bad'); return; }
                s.optionSets.splice(i, 1);
                var defOk = false;
                for (var dq = 0; dq < s.optionSets.length; dq++) if (s.optionSets[dq].id === s.defaultOptionSetId) defOk = true;
                if (!defOk) s.defaultOptionSetId = s.optionSets[0].id;
                for (var t = 0; t < s.items.length; t++) {
                    if (s.items[t].optionSetId !== undefined) {
                        var ok = false;
                        for (var q = 0; q < s.optionSets.length; q++) if (s.optionSets[q].id === s.items[t].optionSetId) ok = true;
                        if (!ok) s.items[t].optionSetId = null;
                    }
                }
                break;
            case 'addOpt':
                s.optionSets[i].options.push({ label: 'خيار ' + (s.optionSets[i].options.length + 1), score: s.optionSets[i].options.length });
                break;
            case 'delOpt':
                if (s.optionSets[i].options.length <= 2) { toast('لا يمكن حذف أقل من خيارين.', 'bad'); return; }
                s.optionSets[i].options.splice(j, 1);
                break;
            case 'addItem':
                s.items.push({ text: '', reverse: false, optionSetId: s.defaultOptionSetId, dimensionId: null, reverseMap: null });
                break;
            case 'delItem':
                if (s.items.length <= 1) { toast('يجب الإبقاء على بند واحد على الأقل.', 'bad'); return; }
                s.items.splice(i, 1);
                for (var d = 0; d < s.dimensions.length; d++) {
                    var ix = [];
                    for (var z = 0; z < s.dimensions[d].itemIndexes.length; z++) {
                        var v = s.dimensions[d].itemIndexes[z];
                        if (v < i) ix.push(v); else if (v > i) ix.push(v - 1);
                    }
                    s.dimensions[d].itemIndexes = ix;
                }
                break;
            case 'upItem':
                if (i <= 0) return;
                swap(s.items, i, i - 1);
                for (var d2 = 0; d2 < s.dimensions.length; d2++) {
                    var ixs = s.dimensions[d2].itemIndexes;
                    for (var y = 0; y < ixs.length; y++) {
                        if (ixs[y] === i) ixs[y] = i - 1;
                        else if (ixs[y] === i - 1) ixs[y] = i;
                    }
                    s.dimensions[d2].itemIndexes.sort(function (a, b) { return a - b; });
                }
                break;
            case 'downItem':
                if (i >= s.items.length - 1) return;
                swap(s.items, i, i + 1);
                for (var d3 = 0; d3 < s.dimensions.length; d3++) {
                    var ixs3 = s.dimensions[d3].itemIndexes;
                    for (var y3 = 0; y3 < ixs3.length; y3++) {
                        if (ixs3[y3] === i) ixs3[y3] = i + 1;
                        else if (ixs3[y3] === i + 1) ixs3[y3] = i;
                    }
                    s.dimensions[d3].itemIndexes.sort(function (a, b) { return a - b; });
                }
                break;
            case 'bulkAdd': {
                var ta = $('bulkText');
                var lines = (ta.value || '').split('\n');
                var added = 0;
                for (var L = 0; L < lines.length; L++) {
                    var txt = lines[L].trim();
                    if (!txt) continue;
                    s.items.push({ text: txt, reverse: false, optionSetId: s.defaultOptionSetId, dimensionId: null, reverseMap: null });
                    added++;
                }
                if (!added) { toast('لم يُعثر على بنود نصية لإضافتها.', 'bad'); return; }
                ta.value = '';
                toast('تمت إضافة ' + added + ' بنود.', 'ok');
                break;
            }
            case 'addDim':
                s.dimensions.push({ id: 'dim' + (s.dimensions.length + 1) + '-' + Math.random().toString(36).slice(2, 5), name: 'بُعد ' + (s.dimensions.length + 1), description: '', itemIndexes: [], scoring: 'sum', categories: [] });
                break;
            case 'delDim':
                s.dimensions.splice(i, 1);
                break;
            case 'toggleDimItem': {
                var di = parseInt(el.getAttribute('data-dim'), 10);
                var ii = parseInt(el.getAttribute('data-item'), 10);
                var dim = s.dimensions[di];
                var pos = dim.itemIndexes.indexOf(ii);
                if (pos >= 0) dim.itemIndexes.splice(pos, 1);
                else { dim.itemIndexes.push(ii); dim.itemIndexes.sort(function (a, b) { return a - b; }); }
                var cnt = document.getElementById('dimCount-' + di);
                if (cnt) cnt.textContent = dim.itemIndexes.length + ' بنود';
                el.classList.toggle('on', pos < 0);
                break;
            }
            case 'addCat': {
                var dom0 = E.domainOf(san());
                s.categories.push({ label: 'فئة جديدة', min: 0, max: dom0.max, color: E.PALETTE[s.categories.length % E.PALETTE.length] });
                break;
            }
            case 'delCat':
                s.categories.splice(i, 1);
                break;
            case 'genCats':
                genCats(parseInt(el.getAttribute('data-count'), 10) || 3);
                break;
            case 'runPreview':
                runPreview();
                return;
            case 'publish':
                publish();
                return;
            case 'editScale':
                if (dirtyConfirm()) location.href = 'scale-builder.html?id=' + el.getAttribute('data-id');
                return;
            case 'dupScale': {
                var src = E.getScale(el.getAttribute('data-id'));
                if (!src) return;
                var copy = clone(src);
                copy.id = E.makeId();
                copy.name = src.name + ' (نسخة)';
                copy.version = 1;
                copy.createdAt = '';
                copy.createdAtISO = '';
                var rr = E.upsertScale(copy);
                if (!rr.ok) { toast(rr.error, 'bad'); return; }
                toast('تم إنشاء نسخة باسم "' + copy.name + '".', 'ok');
                renderManage();
                return;
            }
            case 'delScale': {
                var did = el.getAttribute('data-id');
                var dsc = E.getScale(did);
                if (!dsc) return;
                if (!confirm('حذف المقياس "' + dsc.name + '"؟ لن تُحذف سجلات التقييم السابقة.')) return;
                var dr = E.deleteScale(did);
                if (!dr.ok) { toast(dr.error, 'bad'); return; }
                if (state.editingId === did) { state.editingId = null; state.scale = blankScale(); state.step = 0; renderStepper(); renderStep(); }
                toast('تم حذف المقياس (بقيت سجلات التقييم).', 'ok');
                renderManage();
                return;
            }
            case 'openTest': {
                var tid = el.getAttribute('data-id');
                var ts = E.getScale(tid);
                if (!ts || E.validateScale(ts).errors.length) { toast('لا يمكن اختبار مقياس غير مكتمل — راجع التحقق أولًا.', 'bad'); return; }
                localStorage.setItem('chosenCustomScale', tid);
                location.href = 'custom-test.html';
                return;
            }
            default: return;
        }
        markDirty();
        renderStep();
    }

    function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
    function swap(arr, a, b) { var x = arr[a]; arr[a] = arr[b]; arr[b] = x; }
    function dirtyConfirm() {
        if ($('saveState') && $('saveState').classList.contains('dirty')) {
            return confirm('لديك تغييرات غير محفوظة في المسودة. سيُستعاد تلقائيًا لاحقًا عند العودة. هل تريد المتابعة؟');
        }
        return true;
    }

    function genCats(count) {
        var s = san();
        var dom = E.domainOf(s);
        var discrete = E.isDiscreteDomain(s);
        var labels = count >= 4 ? CAT4 : CAT3;
        var cats = [];
        if (discrete) {
            var span = dom.max - dom.min;
            var n = Math.min(count, span + 1);
            if (n < 1) { toast('النطاق الحالي صغير جدًا لتوليد فئات.', 'bad'); return; }
            var step = span / n;
            for (var i = 0; i < n; i++) {
                var mn = i === 0 ? dom.min : Math.round(dom.min + step * i);
                var mx = i === n - 1 ? dom.max : Math.round(dom.min + step * (i + 1)) - 1;
                if (i > 0 && mn <= cats[i - 1].max) mn = cats[i - 1].max + 1;
                if (mx < mn) mx = mn;
                cats.push({ label: labels[i] || ('فئة ' + (i + 1)), min: mn, max: Math.min(mx, dom.max), color: E.PALETTE[Math.min(i, E.PALETTE.length - 1)] });
            }
            cats[cats.length - 1].max = dom.max;
        } else {
            var width = (dom.max - dom.min) / n;
            for (var k = 0; k < n; k++) {
                var mn2 = k === 0 ? dom.min : fmt(dom.min + width * k);
                var mx2 = k === n - 1 ? dom.max : fmt(dom.min + width * (k + 1));
                cats.push({ label: labels[k] || ('فئة ' + (k + 1)), min: mn2, max: mx2, color: E.PALETTE[Math.min(k, E.PALETTE.length - 1)] });
            }
        }
        state.scale.categories = cats;
        toast('تم توليد ' + cats.length + ' فئات تغطي النطاق ' + dom.min + ' إلى ' + dom.max + '.', 'ok');
    }

    /* ========================= تنقّل الخطوات ========================= */
    function goStep(n) {
        if (n < 0 || n >= STEPS.length) return;
        state.step = n;
        renderStepper();
        renderStep();
        window.scrollTo({ top: document.querySelector('.stepper').offsetTop - 110, behavior: 'smooth' });
    }

    function renderStepper() {
        var html = '';
        for (var i = 0; i < STEPS.length; i++) {
            html += '<div class="step-pill' + (i === state.step ? ' active' : (i < state.step ? ' done' : '')) + '" data-act-step="' + i + '">' +
                '<span class="num">' + (i < state.step ? '✓' : (i + 1)) + '</span><span>' + STEPS[i].t + '</span></div>';
        }
        $('stepper').innerHTML = html;
        var pills = $('stepper').querySelectorAll('[data-act-step]');
        for (var p = 0; p < pills.length; p++) {
            pills[p].onclick = function () { goStep(parseInt(this.getAttribute('data-act-step'), 10)); };
        }
    }

    function renderStep() {
        if (!state.scale) return;
        $('stepTitle').textContent = (state.step + 1) + '. ' + STEPS[state.step].t;
        $('stepHint').textContent = STEPS[state.step].h;
        var body = $('stepBody');
        var html = '';
        switch (state.step) {
            case 0: html = stepGeneral(); break;
            case 1: html = stepOptions(); break;
            case 2: html = stepItems(); break;
            case 3: html = stepDims(); break;
            case 4: html = stepCats(); break;
            case 5: html = stepReview(); break;
        }
        body.innerHTML = html;
        $('prevBtn').disabled = state.step === 0;
        $('prevBtn').style.visibility = state.step === 0 ? 'hidden' : 'visible';
        $('nextBtn').style.display = state.step >= STEPS.length - 1 ? 'none' : 'inline-flex';
        $('footMid').textContent = 'الخطوة ' + (state.step + 1) + ' من ' + STEPS.length;
        if (state.step === STEPS.length - 1) renderValidation();
    }

    /* ========================= الخطوة 1: التعريف ========================= */
    function stepGeneral() {
        var s = state.scale;
        return '<div class="grid2">' +
            fld('اسم المقياس *', '<input type="text" data-f="name" value="' + esc(s.name) + '">', 'اسم يظهر في قائمة المقاييس وفي صفحة التطبيق.', true) +
            fld('المؤلف / المصدر', '<input type="text" data-f="author" value="' + esc(s.author) + '">', '', false) +
            fld('رقم الإصدار الحالي', '<input type="text" readonly value="' + esc('v' + (s.version || 1) + (state.editingId ? '' : ' (لم يُنشر بعد)')) + '">', 'يزداد تلقائيًا مع كل تعديل بعد النشر.', false) +
            '</div>';
    }
    function fld(label, input, hint, required, full) {
        return '<div class="field' + (full ? ' full' : '') + '">' +
            '<label>' + (required ? '<span style="color:#dc2626">*</span> ' : '') + label + '</label>' + input +
            (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    }

    /* ========================= الخطوة 2: خيارات الإجابة ========================= */
    function stepOptions() {
        var s = state.scale, html = '';
        for (var i = 0; i < s.optionSets.length; i++) {
            var os = s.optionSets[i];
            var isDef = os.id === s.defaultOptionSetId;
            html += '<div class="box"><div class="box-head"><h4>' + esc(os.name || ('مجموعة ' + (i + 1))) + (isDef ? ' <span class="badge">افتراضية</span>' : '') + '</h4>' +
                '<div class="box-tools">' +
                '<label class="checkbox" style="padding:7px 12px;font-size:12.5px"><input type="radio" name="defset" value="' + esc(os.id) + '" data-f="defaultOptionSetId" data-render' + (isDef ? ' checked' : '') + '> استخدامها كافتراضية</label>' +
                (s.optionSets.length > 1 ? '<button class="mini-btn" data-act="delSet" data-i="' + i + '" title="حذف المجموعة">🗑</button>' : '') +
                '</div></div>' +
                '<div class="field" style="margin-bottom:12px"><label>اسم المجموعة</label><input type="text" data-f="optionSets.' + i + '.name" value="' + esc(os.name) + '" data-render></div>';
            for (var j = 0; j < os.options.length; j++) {
                html += '<div class="opt-row">' +
                    '<input type="text" data-f="optionSets.' + i + '.options.' + j + '.label" value="' + esc(os.options[j].label) + '" placeholder="نص الخيار" style="font-family:inherit;font-size:14px;padding:11px 13px;border:1.5px solid var(--line);border-radius:12px;background:#fff">' +
                    '<input type="number" data-num data-f="optionSets.' + i + '.options.' + j + '.score" value="' + esc(os.options[j].score) + '" placeholder="الدرجة" style="font-family:inherit;font-size:14px;padding:11px 13px;border:1.5px solid var(--line);border-radius:12px;background:#fff">' +
                    '<button class="mini-btn" data-act="delOpt" data-i="' + i + '" data-j="' + j + '" title="حذف الخيار">🗑</button>' +
                    '</div>';
            }
            html += '<button class="add-btn" data-act="addOpt" data-i="' + i + '">+ خيار</button>';
            html += '<div class="map-box">ترتيب الدرجات مسموح تصاعديًا أو تنازليًا. الدرجات غير المتسلسلة (مثل 0/1/5) تتطلب خريطة عكس صريحة عند عكس بند ما.</div>';
            html += '</div>';
        }
        html += '<button class="add-btn" data-act="addSet">+ مجموعة خيارات جديدة</button>';
        return html;
    }

    /* ========================= الخطوة 3: البنود ========================= */
    function stepItems() {
        var s = state.scale, html = '';
        html += '<div class="dom-info"><span class="info-chip">' + s.items.length + ' بنود</span><span class="info-chip">' + s.optionSets.length + ' مجموعات خيارات</span><span class="info-chip">النطاق المقدَّر: ' + rangeText() + '</span></div>';
        for (var i = 0; i < s.items.length; i++) {
            var it = s.items[i];
            html += '<div class="box"><div class="box-head"><h4>بند ' + (i + 1) + '</h4><div class="box-tools">' +
                '<button class="mini-btn up" data-act="upItem" data-i="' + i + '" title="تحريك لأعلى">↑</button>' +
                '<button class="mini-btn down" data-act="downItem" data-i="' + i + '" title="تحريك لأسفل">↓</button>' +
                '<button class="mini-btn" data-act="delItem" data-i="' + i + '" title="حذف البند">🗑</button>' +
                '</div></div>' +
                '<div class="field"><label>نص البند</label><textarea class="item-text" data-f="items.' + i + '.text">' + esc(it.text) + '</textarea></div>' +
                '<div class="grid2" style="margin-top:12px">' +
                '<div class="field"><label>مجموعة الخيارات</label><select data-f="items.' + i + '.optionSetId" data-render>' + setOpts(s, it.optionSetId) + '</select></div>' +
                '<div class="field"><label>اتجاه الدرجة</label><label class="checkbox"><input type="checkbox" data-f="items.' + i + '.reverse" data-render' + (it.reverse ? ' checked' : '') + '> بند عكسي (تُقلب درجته)</label></div>' +
                '</div>' + reverseBox(s, i) + '</div>';
        }
        html += '<button class="add-btn" data-act="addItem">+ بند جديد</button>';
        html += '<details class="box" style="margin-top:14px"><summary style="cursor:pointer;font-weight:800;font-size:14px">+ إضافة عدة بنود دفعة واحدة (سطر لكل بند)</summary>' +
            '<div class="field" style="margin-top:12px"><textarea id="bulkText" placeholder="كل سطر يصبح بندًا جديدًا بنفس مجموعة الخيارات الافتراضية"></textarea></div>' +
            '<button class="add-btn" data-act="bulkAdd" style="margin-top:10px">إضافة البنود</button></details>';
        return html;
    }
    function setOpts(s, cur) {
        var html = '';
        for (var k = 0; k < s.optionSets.length; k++) {
            html += '<option value="' + esc(s.optionSets[k].id) + '"' + (s.optionSets[k].id === cur ? ' selected' : '') + '>' + esc(s.optionSets[k].name || ('مجموعة ' + (k + 1))) + '</option>';
        }
        return html;
    }
    function reverseBox(s, i) {
        var it = s.items[i];
        if (!it.reverse) return '';
        var os = null;
        for (var k = 0; k < s.optionSets.length; k++) if (s.optionSets[k].id === it.optionSetId) os = s.optionSets[k];
        if (!os) os = s.optionSets[0];
        var scores = [];
        for (var j = 0; j < (os ? os.options.length : 0); j++) scores.push(Number(os.options[j].score));
        var auto = E.autoReverseMap(scores);
        var val = isArr(it.reverseMap) ? it.reverseMap.join(', ') : '';
        var html = '<div class="map-box' + (auto ? '' : ' warn') + '">';
        if (auto) html += 'خريطة عكس تلقائية جاهزة: <b>[' + auto.join('، ') + ']</b> — تُستخدم تلقائيًا ما لم تُدخل خريطة يدوية.';
        else html += 'درجات هذه المجموعة غير متسلسلة — <b>الخريطة اليدوية مطلوبة</b> لعكس هذا البند بدقّة.';
        html += '</div>';
        html += '<div class="field" style="margin-top:10px"><label>الخريطة العكسية اليدوية (اختياري، مفصولة بفواصل)</label>' +
            '<input type="text" data-rmap="items.' + i + '.reverseMap" value="' + esc(val) + '" placeholder="' + (auto ? auto.join(',') : 'مثال: 4,3,2,1,0') + '"></div>';
        return html;
    }

    /* ========================= الخطوة 4: الأبعاد ========================= */
    function stepDims() {
        var s = state.scale, html = '';
        html += '<div class="empty-note" style="margin-bottom:16px">الأبعاد الفرعية اختيارية: تُظهر درجة كل محور منفصلة عن الدرجة الكلية.</div>';
        for (var i = 0; i < s.dimensions.length; i++) {
            var dim = s.dimensions[i];
            html += '<div class="box"><div class="box-head"><h4>بُعد ' + (i + 1) + ' — ' + esc(dim.name) + ' <span class="badge" id="dimCount-' + i + '">' + dim.itemIndexes.length + ' بنود</span></h4>' +
                '<div class="box-tools"><button class="mini-btn" data-act="delDim" data-i="' + i + '">🗑</button></div></div>' +
                '<div class="grid2">' +
                fld('اسم البُعد', '<input type="text" data-f="dimensions.' + i + '.name" value="' + esc(dim.name) + '">', '', false) +
                '</div>' +
                '<div class="section-sub">بنود البُعد</div>' + dimItemBoxes(i) +
                '</div>';
        }
        html += '<button class="add-btn" data-act="addDim">+ بُعد فرعي</button>';
        return html;
    }
    function dimItemBoxes(di) {
        var s = state.scale, dim = s.dimensions[di], html = '<div class="dim-items">';
        for (var i = 0; i < s.items.length; i++) {
            var on = dim.itemIndexes.indexOf(i) >= 0;
            var txt = (s.items[i].text || '').trim() || 'بند بلا نص';
            html += '<label class="dim-item' + (on ? ' on' : '') + '"><input type="checkbox" data-act="toggleDimItem" data-dim="' + di + '" data-item="' + i + '"' + (on ? ' checked' : '') + '>' +
                '<span><b>بند ' + (i + 1) + ':</b> ' + esc(txt.slice(0, 60)) + (txt.length > 60 ? '…' : '') + '</span></label>';
        }
        return html + '</div>';
    }
    function catRows(cats, path) {
        var html = '<div class="cat-head"><span>الفئة</span><span>من</span><span>إلى</span><span>اللون</span><span></span></div>';
        for (var i = 0; i < cats.length; i++) {
            html += '<div class="cat-row">' +
                '<input type="text" data-f="' + path + '.' + i + '.label" value="' + esc(cats[i].label) + '" style="font-family:inherit;font-size:14px;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px">' +
                '<input type="number" data-num data-f="' + path + '.' + i + '.min" value="' + esc(cats[i].min) + '" style="font-family:inherit;font-size:14px;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px">' +
                '<input type="number" data-num data-f="' + path + '.' + i + '.max" value="' + esc(cats[i].max === null || cats[i].max === undefined ? '' : cats[i].max) + '" placeholder="إلى" style="font-family:inherit;font-size:14px;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px">' +
                '<input type="color" data-f="' + path + '.' + i + '.color" value="' + esc(cats[i].color || '#2563eb') + '">' +
                '<button class="mini-btn" data-act="delCat" data-i="' + i + '">🗑</button>' +
                '</div>';
        }
        return html;
    }

    /* ========================= الخطوة 5: الفئات ========================= */
    function stepCats() {
        var s = state.scale;
        var ss = san();
        var dom = E.domainOf(ss);
        var discrete = E.isDiscreteDomain(ss);
        var html = '<div class="dom-info">' + domChips() + '</div>';
        html += '<div class="empty-note" style="margin-bottom:16px">قاعدة التغطية: أول فئة تبدأ من <b>' + dom.min + '</b> وآخر فئة تنتهي عند <b>' + dom.max + '</b>، ولا فجوة ولا تداخل بين الفئات (' + (discrete ? 'الأعداد الصحيحة: تنتهي فئة عند درجة أقل بواحد من بداية التالية' : 'القيم المتصلة: تنتهي فئة حيث تبدأ التالية') + ').</div>';
        html += catRows(s.categories, 'categories');
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">' +
            '<button class="add-btn" data-act="addCat">+ فئة</button>' +
            '<button class="add-btn" data-act="genCats" data-count="3">توليد 3 فئات</button>' +
            '<button class="add-btn" data-act="genCats" data-count="4">توليد 4 فئات</button>' +
            '</div>';
        var errs = E.validateCategories(s.categories, dom, discrete, '');
        html += '<div style="margin-top:16px">' + (errs.length ? valBox('err', 'فئات التفسير', errs) : valBox('ok', 'فئات التفسير', ['تغطية صحيحة للكامل النطاق ' + dom.min + ' - ' + dom.max + '.'])) + '</div>';
        return html;
    }

    /* ========================= الخطوة 6: المراجعة ========================= */
    function stepReview() {
        var s = san();
        var html = '<div id="valArea"></div>';
        html += '<div class="chips">' + domChips() +
            '<span class="info-chip">' + state.scale.items.length + ' بنود</span>' +
            '<span class="info-chip">' + state.scale.dimensions.length + ' أبعاد</span>' +
            '<span class="info-chip">' + (state.editingId ? 'إصدار v' + (state.scale.version || 1) : 'جديد (لم يُنشر)') + '</span>' +
            '</div>';

        html += '<div class="section-sub">معاينة التطبيق</div>';
        html += '<div class="preview-grid">';
        for (var i = 0; i < s.items.length; i++) {
            var opts = E.optionsFor(s, i);
            var cur = state.preview[i];
            var sel = '<select data-prev="' + i + '"><option value="">— لم يُجب —</option>';
            for (var j = 0; j < opts.length; j++) {
                sel += '<option value="' + j + '"' + (cur === j ? ' selected' : '') + '>' + esc(opts[j].label) + ' (' + fmt(opts[j].score) + ')</option>';
            }
            sel += '</select>';
            html += '<div class="preview-item"><div class="pt">' + (i + 1) + '. ' + esc(s.items[i].text || 'بند بلا نص') + '</div>' + sel + '</div>';
        }
        html += '</div>';
        html += '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-act="runPreview">احسب المعاينة الآن</button></div>';
        html += '<div id="previewResult"></div>';

        html += '<div class="section-sub">النشر</div>';
        html += '<div class="empty-note" style="margin-bottom:16px">النشر يحفظ المقياس في "مقاييسي المخصصة" ويمكن تطبيقه على المرضى من صفحة اختيار المقياس. أي تعديل لاحق يرفع رقم الإصدار تلقائيًا مع حفظ نسخة الجلسات السابقة.</div>';
        html += '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
            '<button class="btn btn-ok" data-act="publish">' + (state.editingId ? 'حفظ التعديلات ونشر' : 'نشر المقياس') + ' ✓</button>' +
            (state.published ? '<a class="btn btn-ghost" href="custom-test.html" onclick="localStorage.setItem(\'chosenCustomScale\',\'' + esc(state.scale.id) + '\')">اختبر المقياس ←</a>' : '') +
            (state.published ? '<a class="btn btn-ghost" href="tools-severity-scale.html">عرض في قائمة اختيار المقياس ←</a>' : '') +
            '</div>';
        return html;
    }

    function renderValidation() {
        var el = $('valArea');
        if (!el) return;
        var v = validateNow();
        var html = '';
        if (v.errors.length) html += valBox('err', 'أخطاء تمنع النشر (' + v.errors.length + ')', v.errors);
        if (v.warnings.length) html += valBox('warn', 'تنبيهات (' + v.warnings.length + ')', v.warnings);
        if (!v.errors.length && !v.warnings.length) html += valBox('ok', 'التحقق النهائي', ['لا أخطاء ولا تنبيهات — المقياس جاهز للنشر.']);
        else if (!v.errors.length) html += valBox('ok', 'لا توجد أخطاء', ['يمكن النشر رغم التنبيهات الواردة أعلاه.']);
        el.innerHTML = html;
    }

    function valBox(kind, title, list) {
        var icon = kind === 'err' ? '⛔' : (kind === 'warn' ? '⚠️' : '✅');
        var html = '<div class="val-box val-' + (kind === 'ok' ? 'ok' : kind) + '"><h5>' + icon + ' ' + esc(title) + '</h5><ul>';
        for (var i = 0; i < list.length; i++) html += '<li>' + esc(list[i]) + '</li>';
        return html + '</ul></div>';
    }

    function domChips() {
        var s = san();
        var dom = E.domainOf(s);
        var discrete = E.isDiscreteDomain(s);
        return '<span class="info-chip">النطاق: ' + fmt(dom.min) + ' ← ' + fmt(dom.max) + '</span>' +
            '<span class="info-chip">النوع: ' + (discrete ? 'أعداد صحيحة' : 'قيم متصلة') + '</span>' +
            '<span class="info-chip">الطريقة: ' + esc(E.methodLabel(E.effectiveMethod(s))) + '</span>';
    }
    function rangeText() {
        var s = san();
        if (!s) return '-';
        var dom = E.domainOf(s);
        return fmt(dom.min) + ' - ' + fmt(dom.max);
    }

    /* ========================= المعاينة ========================= */
    function runPreview() {
        var s = san();
        var answers = {};
        var answered = 0;
        for (var i = 0; i < s.items.length; i++) {
            var v = state.preview[i];
            if (v === undefined || v === null || v === '') continue;
            answers[i] = v;
            answered++;
        }
        var comp = E.checkCompleteness(s, answers);
        var out = $('previewResult');
        if (!comp.ok) {
            out.innerHTML = valBox('warn', 'المعاينة غير مكتملة', [comp.reason || 'أجب عن البنود المطلوبة للمعاينة (' + answered + ' من ' + s.items.length + ').']);
            return;
        }
        var r = E.compute(s, answers);
        if (!r.ok) {
            out.innerHTML = valBox('err', 'تعذّر احتساب المعاينة', r.errors);
            return;
        }
        var color = r.category && r.category.color ? r.category.color : '#2563eb';
        var scoreStr = r.score === null || r.score === undefined ? '—' : fmt(r.score);
        var html = '<div class="result-box"><div class="result-main">' +
            '<div class="score-circle" style="background:' + esc(color) + '"><span class="v">' + esc(scoreStr) + '</span><span class="l">' + (r.avg !== null && r.avg !== undefined ? 'متوسط' : 'الدرجة') + '</span></div>' +
            '<div class="result-meta"><h4>' + (r.category ? esc(r.category.label) : 'بلا فئة تفسير') + '</h4>' +
            '<p>الدرجة الخام: <b>' + esc(fmt(r.raw)) + '</b> من ' + fmt(r.min) + ' إلى ' + fmt(r.max) + ' — المجاب: ' + r.answered + ' من ' + r.total + ' بنود' +
            (r.pct !== null && r.pct !== undefined ? ' — النسبة: ' + esc(fmt(r.pct)) + '%' : '') + '</p>';
        if (r.standard && r.standard.available) html += '<p>الدرجة المعيارية: <b>' + esc(fmt(r.standard.value)) + '</b> (' + esc(E.STANDARD_TYPE_LABELS[s.standard.type] || s.standard.type) + ')</p>';
        else if (r.standard && r.standard.available === false && r.standard.reason) html += '<p>المعيار: ' + esc(r.standard.reason) + '</p>';
        html += '</div></div>';
        if (r.dimensions && r.dimensions.length) {
            html += '<div class="dim-bars">';
            for (var d = 0; d < r.dimensions.length; d++) {
                var dm = r.dimensions[d];
                var pctW = (dm.max > dm.min) ? Math.max(2, Math.min(100, ((dm.score - dm.min) / (dm.max - dm.min)) * 100)) : 50;
                html += '<div class="dim-bar"><span class="nm">' + esc(dm.name || ('بُعد ' + (d + 1))) + '</span>' +
                    '<span class="track"><span class="fill" style="width:' + pctW + '%"></span></span>' +
                    '<span class="vv">' + esc(fmt(dm.score)) + (dm.category ? ' · ' + esc(dm.category.label) : '') + '</span></div>';
            }
            html += '</div>';
        }
        if (r.notes && r.notes.length) {
            html += '<div class="dim-bars">';
            for (var n = 0; n < r.notes.length; n++) html += '<div class="dim-bar"><span style="font-size:12.5px;color:var(--muted)">• ' + esc(r.notes[n]) + '</span></div>';
            html += '</div>';
        }
        html += '</div>';
        out.innerHTML = html;
    }

    /* ========================= النشر والإدارة ========================= */
    function publish() {
        var v = validateNow();
        renderValidation();
        if (v.errors.length) {
            toast('لا يمكن النشر: ' + v.errors.length + ' أخطاء يجب إصلاحها.', 'bad');
            var area = $('valArea');
            if (area) area.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        var r = E.upsertScale(state.scale);
        if (!r.ok) { toast(r.error, 'bad'); return; }
        state.scale = clone(r.scale);
        state.editingId = r.scale.id;
        state.published = true;
        clearDraft();
        history.replaceState(null, '', 'scale-builder.html?id=' + r.scale.id);
        var note = $('draftNote'); if (note) note.classList.add('hidden');
        toast('تم النشر بنجاح — الإصدار v' + r.scale.version + '.', 'ok');
        var el = $('saveState');
        if (el) { el.textContent = 'منشور — الإصدار v' + r.scale.version; el.classList.remove('dirty'); }
        renderStep();
        renderManage();
    }

    function renderManage() {
        var list = E.loadScales();
        var el = $('manageList');
        if (!list.length) {
            el.innerHTML = '<div class="manage-empty">لا توجد مقاييس مخصصة بعد — ابدأ بـ "+ مقياس جديد" أو استورد مقياسًا لتراه هنا.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var v = E.validateScale(s);
            var okBadge = v.errors.length ? '<span class="badge" style="background:#fef2f2;color:#b91c1c;border-color:#fecaca">' + v.errors.length + ' أخطاء</span>' : '<span class="badge" style="background:#f0fdf4;color:#15803d;border-color:#bbf7d0">جاهز</span>';
            html += '<div class="mscale"><h4>' + esc(s.name) + '</h4>' +
                '<div class="meta"><span>v' + (s.version || 1) + '</span><span>' + s.items.length + ' بنود</span><span>' + esc(E.methodLabel(s.scoring.method)) + '</span><span>' + esc(s.updatedAt ? s.updatedAt.slice(0, 10) : (s.createdAt || '')) + '</span>' + okBadge + '</div>' +
                '<div class="row">' +
                '<button class="btn btn-sm btn-ghost" data-act="editScale" data-id="' + esc(s.id) + '">تعديل</button>' +
                '<button class="btn btn-sm btn-soft" data-act="dupScale" data-id="' + esc(s.id) + '">نسخ</button>' +
                (v.errors.length ? '' : '<button class="btn btn-sm btn-ok" style="padding:10px 16px;font-size:13px" data-act="openTest" data-id="' + esc(s.id) + '">اختبار ←</button>') +
                '<button class="btn btn-sm btn-danger" data-act="delScale" data-id="' + esc(s.id) + '">حذف</button>' +
                '</div></div>';
        }
        el.innerHTML = html;
    }

    document.addEventListener('change', function (e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        var p = el.getAttribute('data-prev');
        if (p === null) return;
        state.preview[p] = el.value === '' ? null : Number(el.value);
        runPreview();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
