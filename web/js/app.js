// The page's brain: loads data, draws it, reacts to clicks and typing.
//
// YOUR TASK (Tasks 10-11). The HTML is already in index.html; most parts start
// with `hidden`. Your job is: get data from api.js, turn it into HTML with render.js,
// put it into the right element (by id), and react when the user does something.
// The numbers in brackets are line numbers in index.html, e.g. (html 32).
//
// --- Task 10 ---
// 1. Start up
//    Get settings. Hide #loading (html 32). If settings.onboarded is false,
//    show #onboarding-view (html 35), otherwise show #dashboard-view (html 49).
//    Put today's date in #today-label (html 16).
let settingsTheme = document.getElementById("settings-view")
let loading = document.getElementById("loading")
if (){
    loading.textContent=""
}

//
// 2. Onboarding
//    Fill #onboarding-options (html 40) with renderOnboarding(...).
//    On submit of #onboarding-form (html 38): collect the ticked checkbox values,
//    call postOnboarding(ids). If it fails, show the server's message in
//    #onboarding-error (html 41). If it works, go to the dashboard.
//
// 3. Dashboard
//    Call getDashboard(today). Put renderBrief into #brief (html 55),
//    and one renderAreaCard per area into #area-cards (html 61).
//
// 4. Daily log
//    Unhide the .field[data-area="..."] for each enabled module
//    (sleep html 70, steps 77, study 84, work 91, spending 98, fasting 105).
//    Fill the inputs with today's saved values (getDay).
//    On submit of #log-form (html 69): blank input -> send null (never 0), otherwise
//    the number. Call putDay, show "Saved" in #log-status (html 114), then redraw
//    the dashboard.
//
// 5. Errors
//    Any failed API call: put the message in #error-message (html 26) and unhide
//    #error-banner (html 25). #error-dismiss (html 27) hides it again.
//
// --- Task 11 ---
// 6. Focus tasks
//    renderTasks into #tasks (html 122). #task-form (html 123) adds one, text from
//    #task-text (html 125) (max 3, no blank text; show problems in #task-error, html 128).
//    Ticking a checkbox flips done. Save with putDay.
//
// 7. Habits
//    renderHabitGrid into #habit-grid (html 137), completion % into
//    #habit-completion (html 134).
//    Clicking a .habit-cell flips that habit for that date, saves, and redraws.
//    Tip: use ONE click listener on #habit-grid and check event.target.
//
// 8. Goals
//    renderGoals into #goals (html 143) (edited in Settings, just shown here).
//
// 9. Quick capture
//    Typing in #note (html 152) saves the note 500 ms after the user stops typing,
//    and also when the box loses focus. Show "Saving..." / "Saved" in #note-status (html 149).
//
// 10. Settings (#nav-settings, html 19, shows #settings-view, html 158;
//     #nav-home, html 18, goes back)
//    - Modules: same picker in #settings-modules (html 166), form #modules-form (html 164),
//      errors in #modules-error (html 167). Save with putSettings.
//    - Targets: one .target-row per module into #settings-targets (html 179)
//      (number + "More is better"/"Stay under"). Form #targets-form (html 177),
//      errors in #targets-error (html 180).
//    - Habits: list into #settings-habits (html 190) with Remove buttons.
//      Add with #habit-form (html 191), name from #habit-name (html 193),
//      errors in #habit-error (html 196).
//    - Goals: list into #settings-goals (html 203). Add with #goal-form (html 204):
//      #goal-name (html 207), #goal-percent (html 212), #goal-detail (html 218),
//      errors in #goal-error (html 220).
//    - Export: #export-button (html 231). Get exportData(), download it as
//      compass-YYYY-MM-DD.json.
//    - Import: read the file from #import-file (html 233), send with importData.
//      On failure show the message in #import-error (html 235) (old data stays).
//      Success message in #data-status (html 236).
//    - Delete: #delete-button (html 241) opens #delete-dialog (html 249) with showModal().
//      If the user clicked "Delete" (dialog.returnValue === "confirm"),
//      call deleteAll() and go back to onboarding.
