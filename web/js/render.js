// Turns data into HTML text. No network, no clicks. All user text goes through escapeHtml.
//
// YOUR TASK (Task 9): write these 7 functions and export them.
// Each one takes data and RETURNS A STRING of HTML. It does not touch the page.
// app.js will take the string and put it into the page.
// Look at web/preview.html to see the exact HTML each one should produce.
// (preview 33) = line 33 in preview.html, (css 532) = line 532 in styles.css.
//
// 1. escapeHtml(s)
//    Makes text safe to show. Replace & < > " ' with &amp; &lt; &gt; &quot; &#39;
//    (do & first). Use it on EVERY bit of text the user typed (task, habit, goal, note),
//    so "<script>" shows as text instead of running.
//
// 2. renderBrief(brief)
//    brief looks like { sentences: ["...", "..."], facts: [{ area_id, value, target, mode }] }
//    Make one <p class="brief-text"> per sentence.
//    Then a <details class="brief-facts"> with <summary>Numbers used</summary>
//    and a <ul> with one <li> per fact (e.g. "sleep: 6.4 (target 7.5)").
//    If facts is empty, skip the <details>.
//    Example: preview 33. Styles: css 531-558.
//
// 3. renderAreaCard(area)
//    area looks like { id, label, unit, value, target, mode, status, progress, trend }
//    status is already words: "On track", "Behind" or "No data".
//    Make an <article class="card area-card"> with:
//      - data-status="on_track" / "behind" / "no_data" (turn the words into this)
//      - an aria-label with the value and target, e.g. "Sleep: 6.4 h, target 7.5 h, Behind"
//      - the label, the status words, the value + unit (show "-" if value is null),
//        the target, a progress bar with style="--progress: 85%", and the trend
//        (data-trend="up|down|flat|none" plus words like "Trending up").
//    Example: preview 51-85 (one card per status). Styles: css 560-711.
//
// 4. renderOnboarding(areas, selectedIds)
//    areas = list of all modules, selectedIds = ids that are ticked.
//    Make a <fieldset class="module-picker"> with the hint text "Choose up to 5",
//    then one <label class="module-option"> per area with a checkbox
//    (name="modules", value=area id, "checked" if its id is in selectedIds).
//    Example: preview 197. Styles: css 713-774.
//
// 5. renderHabitGrid(grid, habits)
//    grid = [{ id, name, days: [{ date, done }] }]  (7 days, oldest first)
//    done is true, false, or null (null = nothing logged that day = a gap, not a miss).
//    Make a <table class="habit-grid">: top row = day names, then one row per habit.
//    Each cell is a <button class="habit-cell"> with aria-pressed="true/false",
//    data-habit and data-date (so app.js knows what was clicked),
//    and add data-gap when done is null.
//    If there are no habits, return <p class="empty">No habits yet. Add one in Settings.</p>
//    Example: preview 154. Styles: css 810-872.
//
// 6. renderGoals(goals)
//    goals = [{ name, percent, detail }]
//    Make a <ul class="goal-list"> with one <li class="goal"> each:
//    name, percent, a progress bar, and the detail line.
//    If empty, return <p class="empty">No goals yet.</p>
//    Example: preview 134. Styles: css 874-905.
//
// 7. renderTasks(tasks)
//    tasks = [{ text, done }]  (max 3)
//    Make a <ul class="task-list"> with one <li class="task"> each,
//    a checkbox (checked if done, data-index = its position), and the text.
//    Add class "is-done" to finished tasks so they look muted.
//    If empty, return <p class="empty">Nothing planned yet.</p>
//    Example: preview 119. Styles: css 776-808.
//
// Empty-state text (p.empty): example preview 245, styles css 151.
export {};
