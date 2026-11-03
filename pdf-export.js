/*
 * pdf-export.js — تحميل نسخة PDF مباشرة من المتصفح (DIAGNO-ASSIST)
 *
 * الاستخدام:
 *   PdfExport.save(document.getElementById('العنصر'), 'الاسم.pdf')  ← عنصر واحد
 *   PdfExport.save('<div>محتوى جاهز</div>', 'الاسم.pdf')           ← HTML جاهز
 *   تعيد Promise تُحلّ بـ true عند نجاح التحميل المباشر وبـ false عند التراجع للطباعة.
 *
 * تعتمد على مكتبة html2pdf.js من CDN عند توفر الإنترنت،
 * وعند تعذّر تحميلها تفتح نافذة طباعة (حفظ كـ PDF من المتصفح) كخطة بديلة.
 */
(function (root) {
    'use strict';

    var CDN_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
    var loading = null;

    function loadScript(src, doc) {
        return new Promise(function (resolve, reject) {
            try {
                var d = doc || document;
                var s = d.createElement('script');
                s.src = src;
                s.async = true;
                s.onload = function () { resolve(true); };
                s.onerror = function () { reject(new Error('تعذّر تحميل مكتبة التصدير.')); };
                (d.head || d.body).appendChild(s);
            } catch (e) { reject(e); }
        });
    }

    function ensure() {
        if (root.html2pdf) return Promise.resolve(root.html2pdf);
        if (!loading) {
            loading = loadScript(CDN_URL).then(function () {
                if (!root.html2pdf) throw new Error('مكتبة التصدير غير متاحة.');
                return root.html2pdf;
            }).catch(function (e) {
                loading = null; /* إعادة المحاولة في النقرة القادمة */
                throw e;
            });
        }
        return loading;
    }

    /*
     * الحاوية تُخفى بـ height:0 + overflow:hidden (ثابتة بلا position)
     * لأن عناصر position:fixed/absolute لا تُرسم من html2canvas ويتنتج ملفًا فارغًا.
     */
    function makeClip() {
        var w = document.createElement('div');
        w.style.height = '0';
        w.style.overflow = 'hidden';
        w.setAttribute('aria-hidden', 'true');
        return w;
    }

    function makeHolder() {
        var h = document.createElement('div');
        h.setAttribute('dir', 'rtl');
        h.style.width = '820px';
        h.style.margin = '0 auto';
        h.style.background = '#ffffff';
        h.style.padding = '26px';
        h.style.fontFamily = 'Cairo, Tahoma, "Segoe UI", sans-serif';
        h.style.direction = 'rtl';
        return h;
    }

    function toHtml(source) {
        if (typeof source === 'string') return source;
        if (source && source.outerHTML) return source.outerHTML;
        return '';
    }

    /* تنزيل بايتات جاهزة (مثل PDF من iframe) من النافذة الحالية */
    function downloadBytes(bytes, filename) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(function () {
            try { URL.revokeObjectURL(url); } catch (e) { }
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { }
        }, 4000);
    }

    /* خطة بديلة: نافذة طباعة يمكن حفظها كـ PDF من المتصفح */
    function printFallback(html, filename) {
        try {
            var w = root.open('', '_blank');
            if (!w || !w.document) return false;
            w.document.write(
                '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
                '<title>' + filename + '</title><style>' +
                'body{font-family:Cairo,Tahoma,"Segoe UI",sans-serif;direction:rtl;padding:26px;color:#0f172a;line-height:1.9}' +
                'table{width:100%;border-collapse:collapse;margin:10px 0}' +
                'td,th{border:1px solid #e2e8f0;padding:7px 9px;text-align:right;font-size:13px}' +
                'th{background:#f8fafc}' +
                '</style></head><body>' + html + '</body></html>'
            );
            w.document.close();
            try { w.focus(); } catch (e) { }
            setTimeout(function () { try { w.print(); } catch (e) { } }, 600);
            return true;
        } catch (e) { return false; }
    }

    function save(source, filename) {
        filename = String(filename || 'DIAGNO-ASSIST.pdf').replace(/[\\\/:*?"<>|]+/g, '-');

        var clip = null, holder = null, target = null;
        if (typeof source === 'string') {
            clip = makeClip();
            holder = makeHolder();
            holder.innerHTML = source;
            clip.appendChild(holder);
            (document.body || document.documentElement).appendChild(clip);
            target = holder;
        } else if (source) {
            target = source;
        } else {
            printFallback('<p>لا يوجد محتوى متاح للتحميل.</p>', filename);
            return Promise.resolve(false);
        }

        function cleanup() {
            if (clip && clip.parentNode) clip.parentNode.removeChild(clip);
        }

        return ensure().then(function (html2pdf) {
            return html2pdf()
                .set({
                    margin: [8, 8],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.97 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                })
                .from(target)
                .save();
        }).then(function () {
            cleanup();
            return true;
        }).catch(function () {
            cleanup();
            printFallback(toHtml(source), filename);
            return false;
        });
    }

    /*
     * saveFromPage — تحميل PDF من صفحة كاملة كما هي (نفس محتوى الطباعة/صفحة الملف)
     *   url    : رابط الصفحة داخل الموقع
     *   opts   : { selector: عنصر الالتقاط, check: تعبير يُقيَّم داخل الصفحة (1 جاهز، -1 غير متاح، 0 قيد الانتظار),
     *              missingMsg, margin, width, timeout }
     * يفتح الصفحة في iframe مخفي (لا يظهر ولا يطبع تلقائيًا) ثم يلتقط عنصرها ويحوّله PDF.
     * يعيد Promise: true عند التحميل، ويرفض مع رسالة عند الفشل.
     */
    function saveFromPage(url, filename, opts) {
        opts = opts || {};
        var selector = opts.selector || 'body';
        var check = opts.check || '1';
        var timeout = opts.timeout || 20000;

        filename = String(filename || 'DIAGNO-ASSIST.pdf').replace(/[\\\/:*?"<>|]+/g, '-');

        var wrap = document.createElement('div');
        wrap.style.height = '0';
        wrap.style.overflow = 'hidden';
        wrap.setAttribute('aria-hidden', 'true');
        var frame = document.createElement('iframe');
        frame.style.width = (opts.width || Math.max(1060, Math.round((root.innerWidth || 1280)))) + 'px';
        frame.style.height = '1600px';
        frame.style.border = '0';
        frame.setAttribute('title', 'تصدير');
        wrap.appendChild(frame);
        (document.body || document.documentElement).appendChild(wrap);

        function cleanup() { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } }

        return new Promise(function (resolve, reject) {
            var settled = false;
            var guard = setTimeout(function () { fail('انتهت مهلة تجهيز الصفحة للتصدير.'); }, timeout);

            function fail(msg) {
                if (settled) return;
                settled = true;
                clearTimeout(guard);
                cleanup();
                reject(new Error(msg || 'تعذّر تجهيز الصفحة للتصدير.'));
            }

            function run() {
                if (settled) return;
                var d = null, status = 0;
                try { d = frame.contentDocument; } catch (e) { return fail('تعذّر الوصول إلى صفحة التصدير.'); }
                if (d && d.readyState === 'complete' && d.querySelector(selector)) {
                    try { status = frame.contentWindow.eval(check); } catch (e) { status = 0; }
                }
                if (status === -1) return fail(opts.missingMsg || 'المحتوى غير متاح للتصدير.');
                if (status !== 1 && status !== true) { setTimeout(run, 150); return; }

                var el = d.querySelector(selector);
                settled = true;
                clearTimeout(guard);

                /* html2canvas ينسخ أنماط المستند الذي يعمل فيه فقط، لذلك يجب
                   تشغيل مكتبة التصدير داخل مستند الصفحة نفسها (كما في زر التحميل المباشر)
                   حتى يخرج الملف بنفس تنسيق صفحة الطباعة تمامًا. */
                var iw = null;
                try { iw = d.defaultView || frame.contentWindow; } catch (e) { iw = null; }
                var libReady;
                if (iw && iw.html2pdf) libReady = Promise.resolve(iw.html2pdf);
                else if (iw && iw.PdfExport && iw.PdfExport.ready) libReady = iw.PdfExport.ready();
                else libReady = loadScript(CDN_URL, d).then(function () {
                    if (!iw || !iw.html2pdf) throw new Error('مكتبة التصدير غير متاحة.');
                    return iw.html2pdf;
                });

                /* انتظار تحميل الخطوط داخل الصفحة قبل الالتقاط */
                var fontsReady = (d.fonts && d.fonts.ready) ? Promise.race([
                    d.fonts.ready,
                    new Promise(function (r) { setTimeout(function () { r(null); }, 2500); })
                ]) : Promise.resolve(null);

                Promise.all([libReady, fontsReady]).then(function (parts) {
                    var html2pdf = parts[0];
                    /* بناء الإعدادات داخل عالم الصفحة (realm) — كائنات وصفوف النافذة
                       الأمّية لا تجتاز فحص instanceof داخل الـ iframe وتُرفض بـ
                       «Invalid margin array». */
                    var cfg;
                    try {
                        cfg = iw.eval('(' + JSON.stringify({
                            margin: opts.margin || [8, 8],
                            filename: filename,
                            image: { type: 'jpeg', quality: 0.97 },
                            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
                            jsPDF: { unit: 'mm', format: opts.format || 'a4', orientation: 'portrait' },
                            pagebreak: { mode: ['css', 'legacy'] }
                        }) + ')');
                    } catch (e) { cfg = null; }
                    return html2pdf()
                        .set(cfg || {
                            margin: [8, 8],
                            filename: filename,
                            image: { type: 'jpeg', quality: 0.97 },
                            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                            pagebreak: { mode: ['css', 'legacy'] }
                        })
                        .from(el)
                        .output('arraybuffer');
                }).then(function (bytes) {
                    /* التحميل يجري من النافذة الأمّ — المتصفح يحجب التنزيلات
                       الصادرة من iframe مخفي. */
                    downloadBytes(bytes, filename);
                    cleanup();
                    resolve(true);
                }).catch(function () {
                    cleanup();
                    reject(new Error('تعذّر إنشاء ملف PDF من الصفحة.'));
                });
            }

            frame.onload = function () { run(); };
            frame.onerror = function () { fail('تعذّر تحميل صفحة التصدير.'); };
            frame.src = url;
        });
    }

    root.PdfExport = { save: save, saveFromPage: saveFromPage, ready: ensure };
})(typeof window !== 'undefined' ? window : this);
