/*
 * interview-questions.js — مولّد أسئلة المقابلة
 * يعتمد على dsm-db.js + differential-engine.js لربط الأسئلة بالمعايير والمعلومات الناقصة.
 *
 * الفكرة: لا نعرض أسئلة ثابتة فقط، بل نستخرج من نص الأعراض:
 *   1) مجالات العرض المتعرف عليها -> أسئلة متابعة مرتبطة بمعايير تلك المجالات.
 *   2) الفرضيات المحتملة -> المعايير التي لا يغطيها النص -> أسئلة تستكشف المعلومة الناقصة.
 *   3) المعلومات الفارقة بين الفرضيات -> أسئلة التمييز.
 * كل سؤال يعرض بوضوح المعيار أو المعلومة التي يساعد على استكشافها.
 */
(function () {
    'use strict';

    /* ================== محاور التنظيم ================== */
    var AXES = [
        { key: 'duration', label: 'مدة الأعراض', ico: '⏳' },
        { key: 'severity', label: 'شدتها وتكرارها', ico: '📊' },
        { key: 'onset', label: 'بداية ظهورها', ico: '📍' },
        { key: 'impact', label: 'أثرها في الحياة اليومية', ico: '🌍' },
        { key: 'events', label: 'علاقتها بالأحداث السابقة', ico: '🔗' },
        { key: 'factors', label: 'العوامل التي قد تفسرها', ico: '🧪' },
        { key: 'differential', label: 'المعلومات اللازمة للتمييز بين التشخيصات', ico: '🔀' }
    ];
    var AXIS_BY_KEY = {};
    AXES.forEach(function (a, i) { a.order = i; AXIS_BY_KEY[a.key] = a; });

    /* ================== بنك الأسئلة حسب مجال العرض ================== */
    /* كل سؤال: [المحور, نص السؤال, المعيار أو المعلومة التي يستكشفها] */
    var DOMAINS = [
        {
            key: 'sleep', label: 'النوم', ico: '🌙',
            kw: ['نوم', 'ينام', 'ارق', 'سهر', 'كوابيس', 'نعاس', 'استيقاظ', 'احلام', 'منوم', 'نوم متقطع'],
            qs: [
                ['duration', 'منذ متى بدأت صعوبة النوم؟ وهل هي مستمرة أم متقطعة؟', 'معيار اضطراب الأرق (DSM-5-TR): صعوبة النوم 3 ليالٍ أسبوعيًا على الأقل لمدة 3 أشهر'],
                ['severity', 'كم ليلة في الأسبوع تصعب عليك؟ وكم يستغرق النوم؟ وكم مرة تستيقظ ليلًا؟', 'معيار الأرق: التكرار 3 ليالٍ أسبوعيًا على الأقل'],
                ['onset', 'هل بدأت الشكوى تدريجيًا أم بعد حدث أو تغيير في نمط الحياة أو دواء؟', 'بداية العرض والعلاقة الزمنية بضاغط أو دواء'],
                ['impact', 'هل يؤثر قلة النوم في أدائك نهارًا (تركيز، مزاج، عمل، قيادة)؟', 'معيار الأرق: ضيق أو ضعف في الأداء النهاري'],
                ['events', 'هل ظهرت مشكلة النوم بعد صدمة أو فترة ضغط نفسي شديد؟', 'التمييز بين الأرق الأولي والأرق المرتبط بالصدمة أو القلق'],
                ['factors', 'هل توجد عوامل أخرى قد تفسر اضطراب النوم: انقطاع نفس، ألم، كافيين، أدوية، عمل ليلي، اكتئاب أو قلق؟', 'معيار الاستبعاد: سبب عضوي أو مادة أو اضطراب نفسي آخر'],
                ['differential', 'هل الشكوى الأساسية أرق، أم نعاس مفرط رغم نوم كافٍ، أم كوابيس متكررة?', 'التمييز بين اضطراب الأرق وفرط النوم واضطراب الكوابيس']
            ]
        },
        {
            key: 'mood', label: 'المزاج والاكتئاب', ico: '🌧️',
            kw: ['اكتئاب', 'مزاج', 'حزن', 'حزين', 'فقدان الاهتمام', 'فقد الاهتمام', 'متعه', 'متعة', 'طاقه', 'بكاء', 'انتحار', 'موت', 'عزله', 'يأس', 'ذنب'],
            qs: [
                ['duration', 'منذ متى تشعر بانخفاض المزاج أو فقدان الاهتمام؟ وهل استمر أسبوعين متواصلين على الأقل؟', 'معيار الاضطراب الاكتئابي الجسيم: مدة أسبوعين على الأقل'],
                ['severity', 'هل المزاج المنخفض معظم اليوم في أغلب الأيام؟ وكم يومًا في الأسبوع؟', 'معيار MDD: معظم اليوم، كل يوم تقريبًا'],
                ['onset', 'متى ظهرت الأعراض أول مرة؟ وهل بدأت تدريجيًا أم بعد حدث؟', 'بداية الأعراض وعمر المريض عند الظهور'],
                ['impact', 'كيف أثّرت الأعراض في العمل أو الدراسة أو العلاقات أو العناية بالذات؟', 'معيار الضيق السريري أو الضعف الوظيفي'],
                ['events', 'هل سبقتها خسارة أو انفصال أو ضاغط نفسي واضح؟', 'العلاقة الزمنية بالضاغط (اضطراب التكيف مقابل الاكتئاب)'],
                ['factors', 'هل توجد حالة طبية أو دواء أو مادة قد تفسر الأعراض؟', 'معيار الاستبعاد: سبب طبي أو مادة'],
                ['differential', 'هل حدثت سابقًا نوبة ارتفاع مزاج أو طاقة أو قلة نوم مع نشاط؟', 'تمييز الاكتئاب أحادي القطب عن ثنائي القطب (نوبة هوس أو تحت هوس)']
            ]
        },
        {
            key: 'anxiety', label: 'القلق والخوف', ico: '💓',
            kw: ['قلق', 'توتر', 'خوف', 'خائف', 'هلع', 'رهاب', 'تجنب', 'خفقان', 'رهبه', 'وسواس اجتماعي', 'عصبيه'],
            qs: [
                ['duration', 'منذ متى تشعر بالقلق المفرط؟ وهل هو مستمر معظم الأيام منذ ستة أشهر أو أكثر؟', 'معيار اضطراب القلق العام: مدة 6 أشهر على الأقل'],
                ['severity', 'كم يومًا في الأسبوع يحدث القلق؟ وما مدى صعوبة ضبطه؟', 'معيار GAD: معظم الأيام وصعوبة ضبط القلق'],
                ['onset', 'متى بدأ القلق أول مرة؟ وهل كان مفاجئًا أم تدريجيًا؟', 'بداية الأعراض وسياق ظهورها'],
                ['impact', 'هل يعيق القلق العمل أو الدراسة أو العلاقات أو النوم أو الخروج من المنزل؟', 'معيار الضعف الوظيفي أو الضيق السريري'],
                ['events', 'هل بدأ بعد ضاغط أو تغيير أو فقد؟', 'العلاقة الزمنية بضاغط نفسي'],
                ['factors', 'هل يوجد كافيين أو أدوية أو حالة طبية (غدة، قلب) أو مادة قد تفسر القلق؟', 'معيار الاستبعاد: مادة أو حالة طبية'],
                ['differential', 'هل القلق معمّم لأمور متعددة أم محصور بمثير واحد؟ وهل توجد نوبات هلع؟', 'التمييز بين GAD والرهاب واضطراب الهلع']
            ]
        },
        {
            key: 'trauma', label: 'الصدمة والضاغط', ico: '🫂',
            kw: ['صدمه', 'حادث', 'اعتداء', 'اغتصاب', 'حرب', 'قصف', 'تهديد', 'كارثه', 'وفاه', 'فلاش باك', 'ذكريات', 'كابوس', 'كوابيس', 'فقد عزيز', 'فقدان شخص'],
            qs: [
                ['duration', 'متى تعرضت للحدث الصادم؟ ومتى بدأت الأعراض بعده؟', 'PTSD: استمرار الأعراض أكثر من شهر؛ اضطراب الكرب الحاد: من 3 أيام إلى شهر'],
                ['severity', 'كم مرة تعود الذكريات أو الكوابيس؟ وما شدتها؟', 'معيار PTSD: ذكريات اقتحامية أو كوابيس متكررة'],
                ['onset', 'هل بدأت الأعراض مباشرة بعد الحدث أم تأخرت؟', 'الفاصل الزمني بين الحدث وبداية الأعراض'],
                ['impact', 'هل تتجنب أماكن أو أشخاصًا أو ذكريات؟ وما أثر ذلك على حياتك؟', 'معيار PTSD: تجنب المذكّرات والأماكن والأشخاص'],
                ['events', 'ما طبيعة الحدث: تهديد حياة، إصابة، اعتداء، أو مشاهدة حدث مؤلم؟', 'معيار PTSD: التعرض لصدمة أو تهديد شديد'],
                ['factors', 'هل توجد إصابة دماغية أو مادة أو دواء قد تفسر الأعراض؟', 'معيار الاستبعاد: سبب عضوي أو مادة'],
                ['differential', 'هل تستمر الأعراض أكثر من شهر، وهل تشمل تجنبًا وفرط استثارة وتغيّرًا معرفيًا؟', 'التمييز بين PTSD والكرب الحاد واضطراب التكيف']
            ]
        },
        {
            key: 'psychosis', label: 'الأعراض الذهانية', ico: '🌀',
            kw: ['هلاوس', 'هلوسه', 'اوهام', 'وهم', 'اصوات', 'سماع اصوات', 'اضطهاد', 'ذهان', 'فصام', 'جنون', 'مؤامره'],
            qs: [
                ['duration', 'متى حدثت أول أعراض ذهانية؟ وما المدة الإجمالية لاستمرارها؟', 'معيار المدة: أكثر من 6 أشهر للفصام، 1–6 أشهر للفصامي الشكل، أقل من شهر للذهاني الوجيز'],
                ['severity', 'ما نوع الأعراض (هلاوس أو أوهام)؟ وما مدى اقتناعك بها؟', 'معيار الأعراض الذهانية الأساسية'],
                ['onset', 'في أي عمر بدأت؟ وهل كانت تدريجية أم مفاجئة؟', 'عمر البداية ونمط الظهور'],
                ['impact', 'هل تأثر الأداء الدراسي أو المهني أو الاجتماعي؟', 'معيار التدهور الوظيفي'],
                ['events', 'هل بدأت بعد ضاغط شديد أو صدمة؟', 'العلاقة الزمنية بضاغط نفسي'],
                ['factors', 'هل تعاطيت مواد أو أدوية أو توجد حالة طبية قد تفسر الأعراض؟', 'معيار الاستبعاد: مادة أو حالة طبية'],
                ['differential', 'هل تحدث الأعراض فقط خلال نوبات المزاج؟', 'التمييز بين الفصام والفصام العاطفي والذهان الناجم عن مادة']
            ]
        },
        {
            key: 'attention', label: 'الانتباه والحركة', ico: '⚡',
            kw: ['تركيز', 'انتباه', 'تشتت', 'نسيان', 'اندفاع', 'فرط الحركه', 'ملل', 'مهمات', 'فوضوي', 'تململ'],
            qs: [
                ['duration', 'منذ متى تعاني من التشتت أو الاندفاع أو فرط الحركة؟ وهل بدأت قبل سن 12؟', 'معيار ADHD: ظهور عدة أعراض قبل سن 12'],
                ['severity', 'كم عرضًا من أعراض عدم الانتباه أو فرط الحركة أو الاندفاع لديك؟', 'معيار ADHD: عدد الأعراض المطلوب في كل نمط'],
                ['onset', 'هل كانت الأعراض موجودة في الطفولة أم بدأت حديثًا؟', 'بداية الأعراض وعمرها'],
                ['impact', 'هل تظهر في بيئتين أو أكثر (بيت، دراسة، عمل) وتسبب ضعفًا واضحًا؟', 'معيار ADHD: بيئتان أو أكثر مع ضعف وظيفي'],
                ['events', 'هل بدأت بعد ضغط أو اكتئاب أو تغيّر كبير في الحياة؟', 'السياق الزمني للبداية'],
                ['factors', 'هل توجد مشكلة نوم أو قلق أو اكتئاب أو دواء قد تفسر ضعف التركيز؟', 'معيار الاستبعاد: تفسير بديل للأعراض'],
                ['differential', 'هل الأعراض مستمرة منذ الطفولة أم ظهرت حديثًا؟', 'التمييز بين ADHD والقلق والاكتئاب واضطراب النوم']
            ]
        },
        {
            key: 'eating', label: 'الأكل والوزن', ico: '🍽️',
            kw: ['اكل', 'طعام', 'وزن', 'شهيه', 'شراهه', 'قيء', 'استفراغ', 'نحافه', 'سمنه', 'تفريغ', 'ملينات', 'صوره الجسم'],
            qs: [
                ['duration', 'منذ متى بدأ سلوك الأكل غير المعتاد؟', 'المدة الزمنية للعرض'],
                ['severity', 'كم نوبة شراهة أو تفريغ في الأسبوع؟ وما وزنك وطولك؟', 'معيار الشره العصبي: نوبات متكررة وسلوكيات تعويضية'],
                ['onset', 'متى بدأ أول مرة؟ وهل ارتبط بحدث أو تعليقات على الوزن؟', 'بداية العرض وسياقه'],
                ['impact', 'هل يؤثر على الصحة أو العلاقات أو الدراسة أو العمل؟', 'معيار الضعف الوظيفي أو الضيق'],
                ['events', 'هل بدأ بعد ضغط أو تعليقات على الشكل أو حدث مؤلم؟', 'العلاقة الزمنية بضاغط أو حدث'],
                ['factors', 'هل توجد حالة طبية (غدة، سكري، هضم) أو دواء قد يفسر تغيّر الشهية أو الوزن؟', 'معيار الاستبعاد: سبب طبي'],
                ['differential', 'هل الشكوى تقييد شديد، أم شراهة مع تفريغ، أم شراهة دون تفريغ؟', 'التمييز بين فقدان الشهية العصبي والشره العصبي واضطراب نهم الطعام']
            ]
        },
        {
            key: 'substance', label: 'المواد والتعاطي', ico: '🧪',
            kw: ['مخدرات', 'حشيش', 'كحول', 'خمر', 'ترامادول', 'تعاطي', 'ادمان', 'تدخين', 'منشطات', 'مواد'],
            qs: [
                ['duration', 'منذ متى يتعاطى؟ وما نمط التعاطي (يومي، أسبوعي، نوبات)؟', 'المدة ونمط التعاطي'],
                ['severity', 'ما الكمية والتكرار؟ وهل تظهر أعراض انسحاب عند التوقف؟', 'معيار الاعتماد وأعراض الانسحاب'],
                ['onset', 'متى بدأ التعاطي؟ وهل سبق الأعراض النفسية أم جاء بعدها؟', 'الترتيب الزمني بين التعاطي والأعراض'],
                ['impact', 'ما أثره على العمل والأسرة والصحة والقانون؟', 'معيار الضعف الوظيفي'],
                ['events', 'هل بدأ التعاطي بعد ضغط أو صدمة؟', 'العلاقة الزمنية بضاغط'],
                ['factors', 'هل الأعراض النفسية مستمرة بعد التوقف؟ وكم مضى على آخر استخدام؟', 'معيار الاستبعاد: اضطراب ناجم عن مادة'],
                ['differential', 'هل الأعراض مستمرة أكثر من شهر بعد التوقف؟', 'التمييز بين الاضطراب الأولي والناجم عن مادة']
            ]
        },
        {
            key: 'somatic', label: 'الشكاوى الجسدية', ico: '🩺',
            kw: ['وجع', 'الم في', 'صداع', 'تعب', 'ارهاق', 'دوخه', 'دوار', 'خفقان', 'هضم', 'معده', 'تنفس', 'تنميل', 'جسدي', 'ضيق نفس'],
            qs: [
                ['duration', 'منذ متى بدأت الشكاوى الجسدية؟', 'المدة الزمنية للشكاوى'],
                ['severity', 'كم شكوى جسدية لديك؟ وكم مرة راجعت طبيبًا أو أجريت فحوصًا؟', 'معيار الأعراض الجسدية: شكاوى متعددة ومستمرة'],
                ['onset', 'متى بدأت أول شكوى؟ وهل بدأت بعد مرض أو ضغط؟', 'بداية العرض وسياقه'],
                ['impact', 'هل تؤثر على العمل أو العلاقات أو الأنشطة اليومية؟', 'معيار الضعف الوظيفي'],
                ['events', 'هل بدأت بعد ضغط أو مرض أو فقد؟', 'العلاقة الزمنية بضاغط أو مرض'],
                ['factors', 'ما نتائج الفحوص الطبية؟ وهل توجد حالة طبية تفسرها؟', 'معيار الاستبعاد: تفسير طبي كافٍ'],
                ['differential', 'هل الشكوى ألم/تعب متعدد، أم عرض عصبي (ضعف/تنميل)، أم قلق شديد من مرض؟', 'التمييز بين الأعراض الجسدية والتحويل وقلق المرض']
            ]
        },
        {
            key: 'obsessive', label: 'الوساوس والأفعال القهرية', ico: '🔁',
            kw: ['وسواس', 'وساوس', 'قهري', 'تكرار', 'غسل', 'تنظيف', 'تحقق', 'ترتيب', 'طقوس', 'اكتناز', 'جمع'],
            qs: [
                ['duration', 'منذ متى توجد الأفكار المتطفلة أو الأفعال التكرارية؟', 'المدة الزمنية للعرض'],
                ['severity', 'كم ساعة يوميًا تستهلكها الأفكار أو الأفعال؟ وما مقدار مقاومتها؟', 'معيار OCD: تستغرق وقتًا أو تسبب ضيقًا'],
                ['onset', 'متى بدأت أول مرة؟ وهل كانت تدريجية أم بعد حدث؟', 'بداية العرض وسياقه'],
                ['impact', 'هل تستهلك وقتًا أو تعيق الحياة اليومية أو العلاقات؟', 'معيار الضعف الوظيفي'],
                ['events', 'هل بدأت بعد ضغط أو حدث مؤلم؟', 'العلاقة الزمنية بضاغط'],
                ['factors', 'هل توجد أسباب عضوية أو أدوية أو مواد قد تفسر الأعراض؟', 'معيار الاستبعاد: سبب عضوي أو مادة'],
                ['differential', 'هل الأفكار عن التلوث/التحقق/الترتيب، أم اكتناز أشياء، أم عيب في الجسد؟', 'التمييز بين OCD والاكتناز وتشوه صورة الجسد']
            ]
        },
        {
            key: 'social', label: 'المواقف الاجتماعية', ico: '👥',
            kw: ['اجتماعي', 'الناس', 'خجل', 'خجول', 'مناسبات', 'نظرات', 'اداء امام', 'خطابه', 'مواقف اجتماعيه'],
            qs: [
                ['duration', 'منذ متى تشعر بالخوف أو التوتر في المواقف الاجتماعية؟', 'المدة الزمنية للعرض'],
                ['severity', 'كم موقفًا اجتماعيًا تتجنبه؟ وما شدة القلق قبله أو خلاله؟', 'معيار القلق الاجتماعي: خوف مستمر من مواقف اجتماعية محددة'],
                ['onset', 'متى بدأ أول مرة؟ وهل كان تدريجيًا أم بعد موقف محرج؟', 'بداية العرض وسياقه'],
                ['impact', 'هل يؤثر على العمل أو الدراسة أو العلاقات؟', 'معيار الضعف الوظيفي أو الضيق'],
                ['events', 'هل بدأ بعد موقف محرج أو تنمر أو نقد؟', 'العلاقة الزمنية بحدث سابق'],
                ['factors', 'هل الخوف مرتبط بمادة أو حالة طبية أو دواء؟', 'معيار الاستبعاد: سبب عضوي أو مادة'],
                ['differential', 'هل الخوف من مواقف اجتماعية فقط، أم من أماكن/مواصلات، أم مثير نوعي؟', 'التمييز بين القلق الاجتماعي ورهاب الخلاء والرهاب النوعي']
            ]
        },
        {
            key: 'behavior', label: 'الغضب والسلوك', ico: '💢',
            kw: ['عصبيه', 'غضب', 'عدوان', 'ضرب', 'صراخ', 'مشاجره', 'تمرد', 'سرقه', 'كذب', 'تخريب', 'عنف', 'انفجار', 'تهيج'],
            qs: [
                ['duration', 'منذ متى تحدث نوبات الغضب أو السلوك التخريبي؟', 'المدة الزمنية للسلوك'],
                ['severity', 'كم نوبة في الأسبوع؟ وهل تصل إلى إيذاء أو تخريب؟', 'معيار الانفجار المتقطع: نوبات متكررة وغير متناسبة'],
                ['onset', 'متى بدأ؟ وهل كان في الطفولة أم حديثًا؟', 'بداية السلوك وعمره'],
                ['impact', 'ما أثرها على المدرسة أو العمل أو العلاقات أو القانون؟', 'معيار الضعف الوظيفي'],
                ['events', 'هل تحدث بعد رفض أو إحباط بسيط؟', 'معيار الانفجار المتقطع: رد فعل غير متناسب مع المثير'],
                ['factors', 'هل توجد مادة أو دواء أو حالة طبية أو نوبات صرع؟', 'معيار الاستبعاد: سبب عضوي أو مادة'],
                ['differential', 'هل يوجد نمط مستمر من انتهاك حقوق الآخرين أم نوبات غضب متفرقة؟', 'التمييز بين الانفجار المتقطع واضطراب المعارضة واضطراب المسلك']
            ]
        }
    ];

    var GENERIC = [
        ['duration', 'منذ متى بدأت هذه الأعراض؟ وهل هي مستمرة أم متقطعة؟', 'المدة الزمنية العامة للعرض'],
        ['severity', 'كم مرة تحدث في الأسبوع؟ وما شدتها في أسوأ يوم؟', 'التكرار والشدة'],
        ['onset', 'متى ظهرت أول مرة؟ وفي أي عمر أو مرحلة؟', 'بداية الظهور والعمر'],
        ['impact', 'كيف تؤثر في العمل أو الدراسة أو العلاقات أو الرعاية الذاتية؟', 'الأثر الوظيفي'],
        ['events', 'هل بدأت بعد حدث أو ضاغط معين؟ وما العلاقة الزمنية بينهما؟', 'العلاقة بالأحداث السابقة'],
        ['factors', 'هل يمكن أن تفسرها مادة أو دواء أو حالة طبية أو قلة نوم أو عامل آخر؟', 'العوامل المفسِّرة البديلة'],
        ['differential', 'ما المعلومات الإضافية التي تميّزها عن اضطراب آخر محتمل؟', 'المعلومات الفارقة']
    ];

    /* الاضطرابات المرشحة لكل مجال عرض — تُستخدم لترجيح فرضيات المولّد */
    var DOMAIN_DISORDERS = {
        sleep: ['insomnia', 'nightmare', 'hypersomnolence', 'mdd', 'gad', 'ptsd'],
        mood: ['mdd', 'pdd', 'bipolar1', 'bipolar2', 'cyclothymic', 'dmdd', 'pmdd', 'adjustment', 'depression_secondary'],
        anxiety: ['gad', 'panic', 'social_anxiety', 'agoraphobia', 'specific_phobia', 'separation_anxiety', 'illness_anxiety', 'selective_mutism'],
        trauma: ['ptsd', 'acute_stress', 'adjustment', 'reactive_attachment', 'dissociative_identity', 'dissociative_amnesia'],
        psychosis: ['schizophrenia', 'schizophreniform', 'brief_psychotic', 'delusional', 'schizoaffective', 'substance_psychotic'],
        attention: ['adhd', 'autism', 'tic', 'odd', 'ied', 'selective_mutism'],
        eating: ['anorexia', 'bulimia', 'binge_eating', 'arfid'],
        substance: ['substance_use', 'substance_psychotic', 'gambling'],
        somatic: ['somatic_symptom', 'conversion', 'illness_anxiety', 'gad', 'ocd'],
        obsessive: ['ocd', 'body_dysmorphic', 'hoarding', 'trichotillomania', 'excoriation', 'ocpd'],
        social: ['social_anxiety', 'avoidant_pd', 'agoraphobia', 'separation_anxiety', 'dependent_pd'],
        behavior: ['ied', 'odd', 'conduct', 'antisocial', 'dmdd', 'bpd', 'gambling']
    };

    var PRIMARY = {
        sleep: 'insomnia', mood: 'mdd', anxiety: 'gad', trauma: 'ptsd', psychosis: 'schizophrenia',
        attention: 'adhd', substance: 'substance_use', somatic: 'somatic_symptom', obsessive: 'ocd',
        social: 'social_anxiety', behavior: 'ied'
    };

    var STEMS = {
        duration: 'منذ متى توجد هذه الملاحظة؟ وهل استمرت للمدة التي يشترطها المعيار؟',
        severity: 'كم مرة تحدث في الأسبوع، وما شدتها في أسوأ يوم؟',
        onset: 'متى ظهرت أول مرة، وفي أي عمر أو مرحلة؟',
        impact: 'ما أثرها على العمل أو الدراسة أو العلاقات أو الرعاية الذاتية؟',
        events: 'هل بدأت بعد حدث معين؟ وما العلاقة الزمنية بينهما؟',
        factors: 'هل يمكن أن تفسرها مادة أو دواء أو حالة طبية أو عامل آخر؟',
        differential: 'ما المعلومة الإضافية التي تؤكدها أو تنفيها وتميّزها عن غيرها؟'
    };

    /* ================== أدوات مساعدة ================== */
    var TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

    function normalize(s) {
        return String(s == null ? '' : s)
            .replace(TASHKEEL, '')
            .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
            .replace(/\u0649/g, '\u064A')
            .replace(/\u0629/g, '\u0647')
            .replace(/\u0624/g, '\u0648')
            .replace(/[\u064B-\u0652]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var toastTimer = null;
    function toast(msg) {
        var t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast show ok';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
    }

    function DB() { return window.DSM_DB; }
    function Engine() { return window.DifferentialEngine; }

    /* ================== تحليل النص ================== */
    function domainHits(normText) {
        var out = [];
        DOMAINS.forEach(function (d, order) {
            var hits = 0, matched = [];
            d.kw.forEach(function (k) {
                var nk = normalize(k);
                if (nk && normText.indexOf(nk) >= 0) { hits++; matched.push(k); }
            });
            if (hits) out.push({ domain: d, hits: hits, matched: matched, order: order });
        });
        out.sort(function (a, b) {
            if (b.hits !== a.hits) return b.hits - a.hits;
            return a.order - b.order;
        });
        return out;
    }

    function axisForCriterion(label) {
        var t = normalize(label);
        if (/(مده|اسبوع|شهر|سنه|سنوات|اشهر|يوم|ساعه|مستمر|استمرار|عشر|اقل من)/.test(t)) return 'duration';
        if (/(مره|مرات|متكرر|يوميا|شديد|شده|عدد|اكثر|اقل|وقت|انتحار|موت|ايذاء|خطر|نوبات)/.test(t)) return 'severity';
        if (/(بدايه|بدا|ظهر|عمر|سن |طفوله|مراهقه|قبل)/.test(t)) return 'onset';
        if (/(اداء|عمل|دراس|اجتماع|علاق|ضعف|تدهور|حياه|وظيف|رعايه|ضيق|اعاق)/.test(t)) return 'impact';
        if (/(صدمه|ضاغط|اعتداء|حادث|وفاه|مذك|بعد حدث)/.test(t)) return 'events';
        if (/(ماده|دواء|طبي|جسمي|عضوي|سبب|تفسير|كافيين|نوم|دوره|طمث|فرصه كافيه)/.test(t)) return 'factors';
        return 'differential';
    }

    function matchedCriteria(disorderId, text) {
        var E = Engine();
        if (!E || !text) return {};
        try {
            var rows = E.explain(text);
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].id !== disorderId) continue;
                var map = {};
                (rows[i].hits || []).forEach(function (h) { map[h.crit] = true; });
                return map;
            }
        } catch (e) { }
        return {};
    }

    function getDisorder(id) {
        var db = DB();
        if (!db) return null;
        for (var i = 0; i < db.disorders.length; i++) if (db.disorders[i].id === id) return db.disorders[i];
        return null;
    }

    /*
     * اختيار الفرضيات: لا نعتمد على ترتيب المحرك وحده (يتأثر بذكر المدة)،
     * بل نبدأ بالاضطراب الأساسي للمجال المعروض ثم نرجّح بالأدلة النصية
     * داخل الاضطرابات المرتبطة بهذا المجال.
     */
    function pickCandidates(text, domains) {
        var E = Engine();
        var evidence = {}, engineCands = [];
        if (text && E) {
            try { E.explain(text).forEach(function (r) { evidence[r.id] = r.score; }); } catch (e) { }
            try {
                engineCands = (E.analyzeSymptoms(text).candidates || []).map(function (c) { return getDisorder(c.id); }).filter(Boolean);
            } catch (e) { engineCands = []; }
        }

        var allow = {};
        domains.forEach(function (d) {
            (DOMAIN_DISORDERS[d.key] || []).forEach(function (id) { allow[id] = true; });
        });

        var picked = [], seen = {};
        function push(d) {
            if (!d || seen[d.id] || picked.length >= 3) return;
            seen[d.id] = true;
            picked.push(d);
        }

        if (domains.length) {
            var primary = PRIMARY[domains[0].key];
            if (primary) push(getDisorder(primary));

            Object.keys(allow).map(getDisorder).filter(Boolean)
                .sort(function (a, b) { return (evidence[b.id] || 0) - (evidence[a.id] || 0); })
                .forEach(function (d) { if (picked.length < 2 && (evidence[d.id] || 0) > 0) push(d); });
        }

        engineCands.forEach(function (d) {
            if (!domains.length || allow[d.id]) push(d);
        });

        if (picked.length < 2 && domains.length) {
            Object.keys(allow).map(getDisorder).filter(Boolean).forEach(function (d) { if (picked.length < 2) push(d); });
        }
        if (!picked.length) engineCands.forEach(push);
        return picked;
    }

    /* ================== بناء الأسئلة ================== */
    function build(text, manualId) {
        var norm = normalize(text);
        var hits = domainHits(norm);
        var domains = hits.slice(0, 3).map(function (h) { return h.domain; });

        var byAxis = {};
        AXES.forEach(function (a) { byAxis[a.key] = []; });
        var seen = {};

        function add(axis, qText, link, src, opts) {
            if (!AXIS_BY_KEY[axis]) axis = 'differential';
            /* أسئلة المعايير تُعرَّف بالنص + المعيار لتجنّب حجب معيار اضطراب آخر بنفس الصياغة */
            var key = axis + '|' + qText + '|' + (src === 'follow' ? '' : link);
            if (seen[key]) return;
            seen[key] = true;
            byAxis[axis].push({ axis: axis, text: qText, link: link, src: src, opts: opts || null });
        }

        domains.forEach(function (d) {
            d.qs.forEach(function (row) { add(row[0], row[1], row[2], 'follow'); });
        });
        if (!domains.length && !manualId) {
            GENERIC.forEach(function (row) { add(row[0], row[1], row[2], 'follow'); });
        }

        var manual = manualId ? getDisorder(manualId) : null;
        var candidates = manual ? [manual] : pickCandidates(text, domains);

        var coverage = [];
        var gapsTotal = 0, gapsShown = 0;
        candidates.slice(0, 2).forEach(function (d, ci) {
            var matched = matchedCriteria(d.id, text);
            var matchedCount = 0;
            var missing = [];
            d.c.forEach(function (raw, idx) {
                var label = String(raw).split('::')[0].trim();
                if (matched[idx]) matchedCount++;
                else missing.push(label);
            });
            coverage.push({ id: d.id, ar: d.ar, matched: matchedCount, total: d.c.length });

            var cap = ci === 0 ? (manual ? 6 : 4) : 3;
            gapsTotal += missing.length;
            var shown = missing.slice(0, cap);
            gapsShown += shown.length;
            shown.forEach(function (label) {
                var axis = axisForCriterion(label);
                add(axis,
                    'بخصوص «' + label + '»: ' + STEMS[axis],
                    'معيار ' + d.ar + ' — «' + label + '»',
                    'gap');
            });
        });

        if (candidates.length >= 2) {
            var E2 = Engine();
            if (E2 && typeof E2.buildQuestions === 'function') {
                try {
                    E2.buildQuestions(candidates.map(function (d) { return d.id; })).forEach(function (q) {
                        add('differential', q.q, 'معلومة فارقة: ' + q.hint, 'diff',
                            (q.opts || []).map(function (o) { return o.l; }));
                    });
                } catch (e) { }
            }
        }

        return {
            domains: hits.map(function (h) { return h.domain; }),
            usedDomains: domains,
            candidates: candidates,
            byAxis: byAxis,
            coverage: coverage,
            gapsTotal: gapsTotal,
            gapsShown: gapsShown,
            manual: manual,
            hasText: !!text
        };
    }

    function badgeFor(q) {
        if (q.src === 'gap') return { cls: 'gap', label: 'معلومة ناقصة' };
        if (q.src === 'diff') return { cls: 'diff', label: 'معلومة فارقة' };
        if (/معيار/.test(q.link)) return { cls: 'crit', label: 'مرتبط بمعيار' };
        return { cls: 'follow', label: 'سؤال متابعة' };
    }

    /* ================== العرض ================== */
    var lastGroups = [];

    function render(data, text) {
        var axesWrap = $('axesWrap');
        var meta = $('metaChips');
        var coverageWrap = $('coverageWrap');

        var domainChips = data.domains.map(function (d) {
            return '<span class="chip detected">🩺 ' + escapeHtml(d.label) + '</span>';
        }).join('');
        var hypo = data.candidates.map(function (d) {
            return '<span class="chip hypo">🔎 فرضية: ' + escapeHtml(d.ar) + '</span>';
        }).join('');
        meta.innerHTML = (domainChips + hypo) || '<span class="chip warn">لم يتم التعرف على مجال عرض محدد — عُرضت أسئلة عامة</span>';

        if (data.hasText && data.coverage.length) {
            coverageWrap.innerHTML = data.coverage.map(function (c) {
                var pct = c.total ? Math.round((c.matched / c.total) * 100) : 0;
                return '<div class="cov">' +
                    '<div class="cov-row"><span>معلومات النص المرتبطة بمعايير <b>' + escapeHtml(c.ar) + '</b></span><span>' + c.matched + ' / ' + c.total + '</span></div>' +
                    '<div class="cov-bar"><div class="cov-fill" style="width:' + pct + '%"></div></div>' +
                    '</div>';
            }).join('') +
                '<div class="cov-note">هذه النسبة تعني أن النص يذكر معلومات قد ترتبط بالمعايير، ولا تعني تحققها. المعايير غير المذكورة عولجت بأسئلة «معلومة ناقصة».</div>';
        } else {
            coverageWrap.innerHTML = '';
        }

        lastGroups = [];
        var html = '';
        var total = 0;
        AXES.forEach(function (ax) {
            var list = data.byAxis[ax.key] || [];
            if (!list.length) return;
            lastGroups.push({ axis: ax, questions: list });
            html += '<div class="axis-block">' +
                '<div class="axis-head">' +
                '<div class="axis-ico">' + ax.ico + '</div>' +
                '<h2>' + escapeHtml(ax.label) + '</h2>' +
                '<span class="axis-count">' + list.length + ' سؤال</span>' +
                '</div><div class="q-list">';
            list.forEach(function (q, i) {
                total++;
                var b = badgeFor(q);
                var isCrit = /معيار/.test(q.link);
                html += '<div class="q-card">' +
                    '<div class="q-top">' +
                    '<span class="q-num">' + (i + 1) + '.</span>' +
                    '<div class="q-text">' + escapeHtml(q.text) + '</div>' +
                    '<span class="q-badge ' + b.cls + '">' + b.label + '</span>' +
                    '</div>' +
                    '<div class="q-link">🎯 <b>يساعد على استكشاف:</b> ' + escapeHtml(q.link) + '</div>' +
                    (q.opts && q.opts.length ? '<div class="q-opts"><b>خيارات محتملة:</b> ' + escapeHtml(q.opts.join(' • ')) + '</div>' : '') +
                    (isCrit ? '<div class="q-note">⚠️ الإجابة وحدها لا تثبت تحقق هذا المعيار.</div>' : '') +
                    '</div>';
            });
            html += '</div>';
            if (data.gapsTotal > data.gapsShown && ax.key === 'differential') {
                html += '<div class="more-note">توجد معايير إضافية غير مغطاة في النص ولم تُعرض هنا لتجنب إطالة المقابلة؛ راجع المعايير الكاملة للفرضية عند الحاجة.</div>';
            }
            html += '</div>';
        });

        if (!total) {
            axesWrap.innerHTML = '<div class="card"><div class="empty-hint"><span class="e-ico">🔍</span>لم نتمكن من توليد أسئلة من هذا النص. أضف وصفًا للأعراض أو اختر اضطرابًا محتملًا.</div></div>';
            return 0;
        }

        axesWrap.innerHTML = html;
        return total;
    }

    /* ================== التوليد ================== */
    function showError(msg) {
        var e = $('formError');
        if (!e) return;
        e.textContent = msg;
        e.className = 'form-error show';
    }
    function clearError() {
        var e = $('formError');
        if (e) { e.className = 'form-error'; e.textContent = ''; }
    }

    function generate() {
        clearError();
        var text = ($('symptomInput').value || '').trim();
        var manualId = $('disorderSelect').value;
        if (!text && !manualId) {
            showError('اكتب وصفًا للأعراض أو اختر اضطرابًا محتملًا لتوليد الأسئلة.');
            return;
        }
        if (text && normalize(text).length < 3 && !manualId) {
            showError('الوصف قصير جدًا. اكتب عرضًا واحدًا على الأقل لتوليد أسئلة مفيدة.');
            return;
        }

        var data = build(text, manualId);
        var results = $('results');
        var empty = $('emptyHint');
        if (results) results.style.display = '';
        if (empty) empty.style.display = 'none';

        var count = render(data, text);
        if (count && results && results.scrollIntoView) {
            setTimeout(function () { results.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
        }
    }

    /* ================== النسخ ================== */
    function copyAll() {
        if (!lastGroups.length) { toast('لا توجد أسئلة لنسخها.'); return; }
        var lines = ['أسئلة المقابلة المقترحة — DIAGNO-ASSIST', ''];
        lastGroups.forEach(function (g) {
            lines.push('[' + g.axis.label + ']');
            g.questions.forEach(function (q, i) {
                lines.push((i + 1) + ') ' + q.text);
                lines.push('   يرتبط بـ: ' + q.link);
            });
            lines.push('');
        });
        lines.push('تنبيه: الأسئلة أدوات مساعدة للمقابلة، والإجابة وحدها لا تثبت تحقق المعيار ولا تكفي للتشخيص.');
        var txt = lines.join('\n');

        function done() { toast('✓ تم نسخ الأسئلة.'); }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = txt;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { toast('تعذّر النسخ التلقائي.'); }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(done).catch(fallback);
        } else fallback();
    }

    /* ================== زر التجربة: ملء بستة أعراض لاضطراب ================== */
    function sixSymptoms(d) {
        var labels = [], kws = [];
        (d.c || []).forEach(function (c) {
            var parts = String(c).split('::');
            var label = (parts[0] || '').trim();
            if (label) labels.push(label);
            if (parts[1]) parts[1].split('|').forEach(function (k) { k = k.trim(); if (k) kws.push(k); });
        });
        var out = labels.slice(0, 6);
        for (var i = 0; out.length < 6 && i < kws.length; i++) out.push(kws[i]);
        return out.join('، ');
    }

    function bindTrial() {
        var btn = $('btnTrial'), box = $('trialChips');
        if (!btn || !box) return;
        var built = false;
        btn.onclick = function () {
            if (!built) {
                var db = DB();
                var list = (db && db.disorders) ? db.disorders : [];
                box.innerHTML = list.map(function (d) {
                    return '<button type="button" class="trial-chip" data-id="' + escapeHtml(d.id) + '">' +
                        (d.ico || '🔹') + ' ' + escapeHtml(d.ar) + '</button>';
                }).join('');
                built = true;
            }
            var isOpen = !!box.style.display && box.style.display !== 'none';
            box.style.display = isOpen ? 'none' : '';
        };
        box.onclick = function (e) {
            var t = e.target;
            var b = t && t.closest ? t.closest('.trial-chip') : null;
            if (!b) return;
            var db = DB();
            var id = b.getAttribute('data-id');
            var d = (db && db.disorders) ? db.disorders.filter(function (x) { return x.id === id; })[0] : null;
            if (!d) return;
            var ta = $('symptomInput');
            if (ta) { ta.value = sixSymptoms(d); if (ta.focus) ta.focus(); }
            clearError();
            box.style.display = 'none';
        };
    }

    /* ================== التهيئة ================== */
    function fillDisorders() {
        var sel = $('disorderSelect');
        var db = DB();
        if (!sel || !db) return;
        var groups = {};
        db.disorders.forEach(function (d) { (groups[d.cat] = groups[d.cat] || []).push(d); });
        var html = '<option value="">— اقتراح تلقائي من الأعراض —</option>';
        db.categories.forEach(function (c) {
            var list = groups[c.id] || [];
            if (!list.length) return;
            html += '<optgroup label="' + escapeHtml(c.ar) + '">';
            list.forEach(function (d) {
                html += '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.ar) + '</option>';
            });
            html += '</optgroup>';
        });
        sel.innerHTML = html;
    }

    function fillPatients() {
        var sel = $('patientSelect');
        var S = window.PatientStore;
        if (!sel || !S) return;
        var list = S.load().filter(function (p) { return !p.archived; }).sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
        });
        var html = '<option value="">— بدون ربط —</option>';
        list.forEach(function (p) {
            html += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.fileNum ? ' — ' + escapeHtml(p.fileNum) : '') + '</option>';
        });
        sel.innerHTML = html;
        sel.onchange = function () {
            var p = S.get(this.value);
            var box = $('symptomInput');
            if (!p || !box) return;
            if (box.value.trim()) return;
            var parts = [];
            if (p.reason) parts.push(p.reason);
            if (p.notes) parts.push(p.notes);
            if (parts.length) box.value = parts.join('\n');
        };
    }

    function reset() {
        if ($('symptomInput')) $('symptomInput').value = '';
        if ($('disorderSelect')) $('disorderSelect').value = '';
        if ($('patientSelect')) $('patientSelect').value = '';
        clearError();
        var results = $('results');
        if (results) results.style.display = 'none';
        var empty = $('emptyHint');
        if (empty) empty.style.display = '';
        lastGroups = [];
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function bind() {
        var btn = $('btnGenerate');
        if (btn) btn.onclick = generate;
        var resetBtn = $('btnReset');
        if (resetBtn) resetBtn.onclick = reset;
        var copyBtn = $('btnCopy');
        if (copyBtn) copyBtn.onclick = copyAll;

        var ta = $('symptomInput');
        if (ta) ta.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
        });

        var auth = $('authBtn');
        if (auth) {
            var u = null;
            try { u = JSON.parse(localStorage.getItem('diagUser') || 'null'); } catch (e) { }
            if (u) {
                auth.textContent = (u.isAdmin ? '👨‍💼 ' : '👤 ') + (u.isAdmin ? 'المدير' : u.name);
                auth.onclick = function () { location.href = 'profile.html'; };
            } else auth.onclick = function () { location.href = 'login.html'; };
        }
    }

    function init() {
        fillDisorders();
        fillPatients();
        bind();
        bindTrial();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.__interviewQuestions = { build: build, generate: generate, axes: AXES, domains: DOMAINS };
})();
