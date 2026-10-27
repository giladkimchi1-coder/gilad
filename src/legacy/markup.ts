// Markup of the app screens, ported from the prototype (current-app.html).
export const MARKUP = String.raw`
<header class="board">
  <div class="wrap">
    <div class="board-top">
      <div>
        <div class="row" style="gap:8px 12px">
          <h1 id="projName">כרם בן זמרה</h1>
          <select id="projSel" aria-label="בחירת פרויקט"></select>
        </div>
        <div class="meta" id="projMeta"></div>
      </div>
      <div class="who" id="who"></div>
    </div>
  </div>
  <nav class="tabs" aria-label="אזורים">
    <div class="wrap" role="tablist">
      <button role="tab" id="tab-plan" aria-selected="true" data-view="plan">תוכנית יומית</button>
      <button role="tab" id="tab-gantt" aria-selected="false" data-view="gantt">גאנט</button>
      <button role="tab" id="tab-log" aria-selected="false" data-view="log">יומן עבודה</button>
      <button role="tab" id="tab-budget" class="admin-only" aria-selected="false" data-view="budget">תקציב</button>
      <button role="tab" id="tab-docs" aria-selected="false" data-view="docs">תעודות וחשבוניות</button>
      <button role="tab" id="tab-orders" aria-selected="false" data-view="orders">הזמנות רכש</button>
      <button role="tab" id="tab-plans" aria-selected="false" data-view="plans">תוכניות</button>
      <button role="tab" id="tab-workers" aria-selected="false" data-view="workers">פועלים</button>
    </div>
  </nav>
</header>

<main>
<div class="wrap">
  <div class="banner warn" id="offline" hidden>אין חיבור לנתוני הפרויקט. בדוק את החיבור לאינטרנט ורענן את הדף.</div>

  <!-- shared day picker -->
  <section id="daypick" class="panel" aria-label="בחירת יום">
    <div class="daybar row spread">
      <div class="row">
        <button class="ghost" id="prevDay" aria-label="יום קודם">→</button>
        <span class="date-big" id="dateLabel"></span>
        <button class="ghost" id="nextDay" aria-label="יום הבא">←</button>
      </div>
      <div class="row">
        <button id="todayBtn">היום</button>
        <input type="date" id="datePick" aria-label="בחר תאריך">
      </div>
    </div>
    <div class="week" id="week"></div>
  </section>

  <!-- PLAN -->
  <section data-panel="plan" class="view">
    <div class="panel askpanel" id="askPanel" hidden style="margin-bottom:20px">
      <div class="row spread"><h2>מה קרה עם המשימות האלה?</h2><span class="small muted">התשובות מעדכנות את הגאנט ואת הצפי</span></div>
      <div id="askList" class="asklist"></div>
    </div>
    <div class="panel" id="ordAskPanel" hidden style="margin-bottom:20px">
      <div class="row spread"><h2>הזמנות שמתעכבות</h2><span class="small muted">האם הסחורה הגיעה?</span></div>
      <div id="ordAskList" class="asklist"></div>
    </div>
    <div class="grid2">
      <div class="panel">
        <div class="row spread"><h2>מפעל</h2><span class="pill factory">קיבוץ יבנה</span></div>
        <div class="tasklist" id="tasks-factory"></div>
      </div>
      <div class="panel">
        <div class="row spread"><h2>אתר</h2><span class="pill site">כרם בן זמרה</span></div>
        <div class="tasklist" id="tasks-site"></div>
      </div>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread"><h2>הזמנות והתראות</h2><span class="pill wait">לפי הגאנט</span></div>
      <div class="tasklist" id="tasks-orders"></div>
    </div>
    <div class="panel" style="margin-top:20px">
      <h2>הוספת משימה ליום הזה</h2>
      <form id="taskForm" class="grid2">
        <label class="f">משימה<input id="tTitle" required placeholder="למשל: ריתוך שלד מודול ממ&quot;ד"></label>
        <label class="f">מיקום<select id="tWhere"><option value="factory">מפעל</option><option value="site">אתר</option></select></label>
        <label class="f">צוות / קבלן<select id="tCrew"></select></label>
        <div class="f" style="justify-content:flex-end"><button class="primary" type="submit">הוסף משימה</button></div>
      </form>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread"><h2>משימות ידניות שלא שובצו</h2><span class="small muted">"שבץ" מעביר משימה ליום שבחרת למעלה</span></div>
      <div class="tasklist" id="tasks-backlog"></div>
    </div>
  </section>

  <!-- GANTT -->
  <section data-panel="gantt" class="view" hidden>
    <div class="kpis" id="gKpis"></div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread">
        <label class="row small" style="gap:8px">תאריך היתר בנייה<input type="date" id="gPermit" style="width:auto"></label>
        <div class="filters" id="gFilters">
          <button aria-pressed="true" data-f="all">הכל</button>
          <button aria-pressed="false" data-f="open">פתוח</button>
          <button aria-pressed="false" data-f="active">בביצוע</button>
          <button aria-pressed="false" data-f="late">באיחור</button>
          <button aria-pressed="false" data-f="critical">נתיב קריטי</button>
        </div>
      </div>
      <div class="small muted">המתוכנן הוא הגאנט המקורי. הצפי מתעדכן לפי מה שסימנת שהתחיל או הסתיים, ולפי התלויות בין המשימות. משימות אתר ישובצו כשתזין תאריך היתר.</div>
    </div>
    <div id="gGroups" style="display:flex;flex-direction:column;gap:20px;margin-top:20px"></div>
  </section>
  <!-- LOG -->
  <section data-panel="log" class="view" hidden>
    <div class="panel summary" id="logSummary" hidden>
      <div class="row spread">
        <h2>סיכום יומן</h2>
        <div class="row">
          <button type="button" id="sumCopy">העתק טקסט</button>
          <button type="button" class="primary" id="sumEdit">ערוך יומן</button>
        </div>
      </div>
      <div id="sumBody"></div>
    </div>
    <div class="panel admin-only" id="outPanel" hidden style="margin-top:20px">
      <div class="row spread"><h2>שליחה לוואטסאפ</h2><span class="small muted">שום דבר לא נשלח בלי האישור שלך</span></div>
      <div class="grid2">
        <div class="outbox">
          <div class="row spread"><h3>יומן → "מודולר-מש' קזס כרם בן זמרה"</h3><span id="outLogSt"></span></div>
          <pre class="opreview" id="outLogTxt"></pre>
          <div class="small muted" id="outLogMeta"></div>
          <div class="row" id="outLogBtns"></div>
        </div>
        <div class="outbox">
          <div class="row spread"><h3>תעודות → "כרם בן זמרה תעודות משלוח"</h3><span id="outDocSt"></span></div>
          <pre class="opreview" id="outDocTxt"></pre>
          <div class="small muted" id="outDocMeta"></div>
          <div class="row" id="outDocBtns"></div>
        </div>
      </div>
      <div class="small muted">אחרי האישור לחץ "שתף לוואטסאפ" ובחר את הקבוצה. נשלח רק הנוסח שאישרת, בלי שעות ובלי סכומים. שליחה אוטומטית תתווסף כשנחליט על דרך השליחה.</div>
    </div>
    <div class="panel" id="logEditor">
      <div class="row spread"><h2>יומן עבודה</h2><span class="small muted" id="logMeta"></span></div>
      <div class="grid2">
        <label class="f">מזג אוויר<select id="lWeather"><option value="">—</option><option>בהיר</option><option>מעונן</option><option>גשם</option><option>רוח חזקה</option><option>שרב</option></select></label>
        <label class="f">שעות עבודה<input id="lHours" placeholder="07:00–16:00"></label>
      </div>
      <div class="row"><button type="button" id="copyPrev">העתק עבודות ופועלים מהיומן הקודם</button></div>
      <div class="locs">
        <div class="locblock" data-loc="factory">
          <div class="row spread"><h2>רצפת ייצור (מפעל)</h2><span class="pill factory">קיבוץ יבנה</span></div>
          <h3>עבודות ופועלים</h3><div class="jobs"></div>
          <div><button class="ghost addjob" type="button">+ מלאכה</button></div>
          <h3>קבלני משנה</h3><div class="rows" data-kind="subs"></div>
          <div><button class="ghost add" type="button" data-kind="subs">+ קבלן משנה</button></div>
          <h3>כלי צמ"ה</h3><div class="rows" data-kind="equip"></div>
          <div><button class="ghost add" type="button" data-kind="equip">+ כלי צמ"ה</button></div>
          <h3>סחורה שהגיעה</h3><div class="goods"></div>
          <textarea class="goodsx" aria-label="סחורה נוספת למפעל" placeholder="סחורה שהגיעה בלי תעודה שנקלטה"></textarea>
        </div>
        <div class="locblock" data-loc="site">
          <div class="row spread"><h2>אתר</h2><span class="pill site">כרם בן זמרה</span></div>
          <h3>עבודות ופועלים</h3><div class="jobs"></div>
          <div><button class="ghost addjob" type="button">+ מלאכה</button></div>
          <h3>קבלני משנה</h3><div class="rows" data-kind="subs"></div>
          <div><button class="ghost add" type="button" data-kind="subs">+ קבלן משנה</button></div>
          <h3>כלי צמ"ה</h3><div class="rows" data-kind="equip"></div>
          <div><button class="ghost add" type="button" data-kind="equip">+ כלי צמ"ה</button></div>
          <h3>סחורה שהגיעה</h3><div class="goods"></div>
          <textarea class="goodsx" aria-label="סחורה נוספת לאתר" placeholder="סחורה שהגיעה בלי תעודה שנקלטה"></textarea>
        </div>
      </div>
      <div class="hrsbox admin-only">
        <div class="row spread"><h3>שעות עבודה ושכר</h3><span class="small muted" id="hrsStd"></span></div>
        <div id="hrsRows" class="hrsrows"></div>
        <div class="small" id="hrsTotal"></div>
      </div>
      <label class="f">עיכובים, תקלות והערות<textarea id="lIssues" placeholder="מה עיכב, מי לא הגיע, הוראות מפקח, שינויים מהלקוח"></textarea></label>
      <datalist id="dlWorkers"></datalist><datalist id="dlEquip"></datalist><datalist id="dlWorks"></datalist><datalist id="dlSubs"></datalist>
      <h3>תמונות מהיום</h3>
      <div class="photos" id="logPhotos"></div>
      <div class="row">
        <label class="btn" for="logPhotoIn" id="logPhotoLabel">+ הוסף תמונות</label>
        <input type="file" id="logPhotoIn" accept="image/*" multiple hidden>
      </div>
      <div class="row spread">
        <span class="status-line" id="logStatus"></span>
        <button class="primary" id="saveLog" type="button">שמור יומן</button>
      </div>
    </div>
    <div class="panel" style="margin-top:20px">
      <h2>יומנים קודמים</h2>
      <div id="logList" class="tasklist"></div>
    </div>
  </section>

  <!-- BUDGET -->
  <section data-panel="budget" class="view" hidden>
    <div class="kpis" id="kpis"></div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread"><h2>סעיפי תקציב</h2><span class="small muted">בפועל = סכום החשבוניות המשויכות לסעיף, לפני מע"מ</span></div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>סעיף</th><th class="n">תקציב ₪</th><th class="n">בפועל ₪</th><th>ניצול</th><th class="n">יתרה ₪</th></tr></thead>
          <tbody id="budgetBody"></tbody>
        </table>
      </div>
      <div class="small muted" id="laborNote"></div>
      <form id="lineForm" class="row">
        <input id="newLine" placeholder="סעיף חדש" style="flex:1 1 180px" required>
        <input id="newLineAmt" class="num" inputmode="numeric" placeholder="סכום" style="flex:0 1 140px">
        <button type="submit">הוסף סעיף</button>
      </form>
    </div>
  </section>

  <!-- DOCS -->
  <section data-panel="docs" class="view" hidden>
    <div class="panel">
      <h2>קליטת מסמך</h2>
      <div class="drop" id="drop">
        <div><b>צלם או העלה תעודת משלוח, חשבונית או חשבון חלקי</b></div>
        <div class="small muted" id="scanHint">המערכת קוראת את המסמך וממלאת ספק, תאריך, סכומים וסעיף תקציב. אתה רק מאשר.</div>
        <label class="btn" for="docIn" style="background:var(--ink);color:var(--bg);border-color:var(--ink)">צלם / בחר קובץ</label>
        <input type="file" id="docIn" accept="image/*" hidden>
      </div>
      <div id="reviewBox" hidden></div>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread">
        <h2>מסמכים</h2>
        <div class="filters" id="docFilters">
          <button aria-pressed="true" data-f="all">הכל</button>
          <button aria-pressed="false" data-f="pending">ממתין לאישור</button>
          <button aria-pressed="false" data-f="delivery">תעודות משלוח</button>
          <button aria-pressed="false" data-f="invoice">חשבוניות</button>
          <button aria-pressed="false" data-f="unbilled">תעודות שלא חויבו</button>
        </div>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th></th><th>סוג</th><th>ספק / קבלן</th><th>מס׳</th><th class="n">תאריך</th><th class="n admin-only">לפני מע"מ ₪</th><th>סעיף</th><th>סטטוס</th><th></th></tr></thead>
          <tbody id="docBody"></tbody>
        </table>
      </div>
    </div>
  </section>
  <!-- ORDERS -->
  <section data-panel="orders" class="view" hidden>
    <div class="panel">
      <div class="row spread"><h2>הזמנה חדשה לרכש</h2><span class="small muted">נשלחת לקבוצה "רכש י.ג ביננפלד"</span></div>
      <form id="oForm" class="grid2">
        <label class="f" style="grid-column:1/-1">מה להזמין<textarea id="oItems" required placeholder="3 פחים של DTM שחור חלק נגד חלודה"></textarea></label>
        <label class="f">הובלה ל<select id="oDest"><option value="factory">קבוצת יבנה (מפעל)</option><option value="site">האתר</option><option value="other">אחר</option></select></label>
        <label class="f" id="oDestOtherL" hidden>כתובת אחרת<input id="oDestOther"></label>
        <label class="f">נדרש עד (לא חובה)<input type="date" id="oNeed"></label>
        <label class="f">ספק מועדף (לא חובה)<input id="oSupplier" list="dlSubs"></label>
        <label class="f">משימה בגאנט (לא חובה)<select id="oGantt"></select></label>
        <div class="f" style="grid-column:1/-1">
          <div class="small muted">תצוגה מקדימה של ההודעה:</div>
          <pre class="opreview" id="oPreview"></pre>
        </div>
        <div class="row" style="grid-column:1/-1">
          <button class="primary" type="submit">שמור והעתק לוואטסאפ</button>
          <span class="small muted">אחרי ההעתקה פותחים את קבוצת הרכש ומדביקים</span>
        </div>
      </form>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="row spread">
        <h2>הזמנות</h2>
        <div class="filters" id="oFilters">
          <button aria-pressed="true" data-f="open">פתוחות</button>
          <button aria-pressed="false" data-f="late">מתעכבות</button>
          <button aria-pressed="false" data-f="done">סופקו</button>
          <button aria-pressed="false" data-f="all">הכל</button>
        </div>
      </div>
      <div class="tasklist" id="oList"></div>
    </div>
    <details class="panel" style="margin-top:20px">
      <summary><b>קליטת הזמנות מקבוצת הרכש בוואטסאפ</b></summary>
      <div class="small muted">העתק הודעות מהקבוצה "רכש י.ג ביננפלד" (או ייצוא צ'אט) והדבק כאן. נקלטות רק הודעות שמתחילות ב-*עבור פרויקט* עם שם הפרויקט הפתוח. הזמנות שכבר קיימות לא ייכנסו פעמיים.</div>
      <textarea id="oImportText" style="min-height:140px" placeholder="[14/09/2026, 15:18] Gilad Kimchi: *עבור פרויקט כרם בן זמרה* …"></textarea>
      <div class="row"><button type="button" class="primary" id="oImportBtn">קלוט הזמנות</button><span class="status-line" id="oImportSt"></span></div>
    </details>
  </section>
  <!-- PLANS -->
  <section data-panel="plans" class="view" hidden>
    <div class="panel">
      <div class="row spread"><h2>תוכניות הפרויקט</h2><span class="small muted" id="plCount"></span></div>
      <div class="drop" id="plDrop">
        <div><b>העלה תוכניות (PDF או תמונה)</b></div>
        <div class="small muted">אפשר כמה קבצים ביחד. הסוג נקבע לפי שם הקובץ ואפשר לשנות אחרי ההעלאה. עד 20MB לקובץ.</div>
        <label class="btn" for="plIn" style="background:var(--ink);color:var(--bg);border-color:var(--ink)">בחר קבצים</label>
        <input type="file" id="plIn" accept="application/pdf,image/*" multiple hidden>
        <div class="status-line" id="plStatus"></div>
      </div>
      <div class="row spread">
        <input id="plSearch" placeholder="חיפוש תוכנית" aria-label="חיפוש תוכנית" style="flex:1 1 200px">
        <label class="row small" style="gap:6px"><input type="checkbox" id="plOld" style="width:auto"> הצג גרסאות קודמות</label>
      </div>
    </div>
    <div id="plGroups" style="display:flex;flex-direction:column;gap:20px;margin-top:20px"></div>
  </section>
  <!-- WORKERS -->
  <section data-panel="workers" class="view" hidden>
    <div class="panel">
      <div class="row spread"><h2>מאגר פועלים</h2><span class="small muted" id="wCount"></span></div>
      <div class="row">
        <input id="wSearch" placeholder="חיפוש לפי כינוי, שם או מקצוע" style="flex:1 1 200px" aria-label="חיפוש פועל">
        <label class="row small" style="gap:6px"><input type="checkbox" id="wShowOff" style="width:auto"> הצג גם לא פעילים</label>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>כינוי</th><th>שם מלא</th><th>מקצוע</th><th class="admin-only">תעריף לשעה ₪</th><th>טלפון</th><th>מיקום קבוע</th><th>פעיל</th><th></th></tr></thead>
          <tbody id="wBody"></tbody>
        </table>
      </div>
    </div>
    <div class="panel admin-only" style="margin-top:20px">
      <div class="row spread">
        <h2>דוח שעות חודשי</h2>
        <div class="row">
          <input type="month" id="rMonth" aria-label="חודש" style="width:auto">
          <button type="button" class="primary" id="rRun">הצג</button>
          <button type="button" id="rCopy">העתק טקסט</button>
          <button type="button" id="rCsv">הורד לאקסל</button>
        </div>
      </div>
      <div class="small muted" id="rSettings"></div>
      <div id="rOut"><div class="empty">בחר חודש ולחץ "הצג". הדוח כולל את כל הפרויקטים.</div></div>
    </div>
    <div class="panel admin-only" style="margin-top:20px">
      <div class="row spread"><h2>חשבונית שכר מהתאגיד</h2><span class="small muted">לפרויקט הפתוח · מתחלקת בין הפועלים לפי השעות ביומנים</span></div>
      <div class="drop" id="payDrop">
        <div><b>צלם או העלה את החשבונית החודשית של תאגיד כוח האדם</b></div>
        <div class="small muted">המערכת קוראת חודש, שעות וסכומים. אתה מאשר לפני השמירה.</div>
        <label class="btn" for="payIn" style="background:var(--ink);color:var(--bg);border-color:var(--ink)">צלם / בחר קובץ</label>
        <input type="file" id="payIn" accept="image/*,application/pdf" hidden>
      </div>
      <div id="payReview" hidden></div>
      <div id="payList" class="tasklist"></div>
    </div>
    <div class="grid2" style="margin-top:20px">
      <form class="panel" id="wForm">
        <h2>הוספת פועל</h2>
        <label class="f">כינוי (כך יופיע ביומן)<input id="wName" required></label>
        <label class="f">שם מלא<input id="wFull"></label>
        <label class="f">מקצוע<input id="wRole" placeholder="למשל: רתך, גבסן, צבעי"></label>
        <label class="f">טלפון<input id="wPhone" class="num" inputmode="tel"></label>
        <label class="f">מיקום קבוע<select id="wLoc"><option value="">—</option><option value="factory">מפעל</option><option value="site">אתר</option></select></label>
        <div><button class="primary" type="submit">הוסף פועל</button></div>
      </form>
      <form class="panel" id="wBulk">
        <h2>הוספה מרשימה</h2>
        <div class="small muted">הדבק שורה לכל פועל: שם-מקצוע, או העתק עמודות מאקסל (שם, מקצוע, טלפון). שמות שכבר קיימים במאגר לא ייכנסו פעמיים.</div>
        <textarea id="wBulkText" placeholder="גודו-אגדים&#10;בלה-אגדים&#10;סטיש-עבודות גבס" style="min-height:150px"></textarea>
        <div class="row"><button class="primary" type="submit">הוסף את כולם</button><span class="status-line" id="wBulkStatus"></span></div>
      </form>
    </div>
  </section>
</div>
</main>

<div class="pv" id="pv" hidden role="dialog" aria-modal="true" aria-label="צפייה בתוכנית">
  <div class="pv-bar">
    <button type="button" id="pvClose" aria-label="סגור">✕</button>
    <div class="pv-title" id="pvTitle"></div>
    <div class="row" style="gap:6px">
      <button type="button" id="pvOut" aria-label="הקטן">−</button>
      <span class="num small" id="pvZoom">100%</span>
      <button type="button" id="pvIn" aria-label="הגדל">+</button>
      <button type="button" id="pvFit">התאם לרוחב</button>
      <button type="button" id="pvSave">הורד PDF</button>
    </div>
  </div>
  <div class="pv-body" id="pvBody"><div class="pv-pages" id="pvPages"></div></div>
</div>
<dialog id="docDlg"><div id="docDlgBody"></div></dialog>
<div class="toast" id="toast" hidden></div>
`;
