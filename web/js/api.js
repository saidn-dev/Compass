// Talks to the server. The only file that calls fetch().
//
// YOUR TASK (Tasks 10-11): write small functions that call the server and return its JSON.
// The server is the same place the page came from, so just use paths like "/api/settings".
//
// 1. request(method, path, body)
//    The one helper everything else uses.
//    - Call fetch(path, { method, headers, body }).
//    - If there is a body, send it as JSON: header "Content-Type: application/json"
//      and body JSON.stringify(body). (The server refuses writes without this header.)
//    - If the response is not ok, read the JSON. It looks like
//      { error: { code, message } }. Throw an ApiError with that code and message.
//    - Otherwise return the JSON.
//
// 2. class ApiError extends Error, with a .code field. app.js shows .message to the user.
//
// 3. The functions app.js will call (each is one line using request):
//    getSettings()          GET    /api/settings
//    putSettings(settings)  PUT    /api/settings
//    postOnboarding(ids)    POST   /api/onboarding   body { modules: ids }
//    getDashboard(date)     GET    /api/dashboard?date=YYYY-MM-DD
//    getDay(date)           GET    /api/days/YYYY-MM-DD
//    putDay(date, day)      PUT    /api/days/YYYY-MM-DD   body = the whole day
//    exportData()           GET    /api/export
//    importData(backup)     POST   /api/import       body = the backup object
//    deleteAll()            DELETE /api/data   with header "X-Confirm: delete-all"
//
// Tip: "today" must be the user's LOCAL date, not UTC. Build it from
// getFullYear(), getMonth() + 1, getDate(), not toISOString().
export {};
