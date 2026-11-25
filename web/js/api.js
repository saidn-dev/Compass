// Talks to the server. The only file that calls fetch().
// Every function returns the JSON the server sent back, or throws an ApiError.

// An error from the server, e.g. { code: "invalid", message: "Choose up to 3 modules." }
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// The one helper everything else uses.
// Sends JSON when there is a body (the server refuses writes without that header).
async function request(method, path, body, extraHeaders = {}) {
  const options = { method, headers: { ...extraHeaders } };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError("network", "Can't reach the Compass server. Is it still running?");
  }

  const data = await response.json().catch(() => null);
  // A phone whose sign-in ran out (or whose passcode was changed) goes back to sign in.
  if (response.status === 401 && data?.error?.code === "signed_out") {
    location.replace("/login.html");
  }
  if (!response.ok) {
    const error = data && data.error;
    throw new ApiError(
      error ? error.code : "http_" + response.status,
      error ? error.message : `The server answered with error ${response.status}.`,
    );
  }
  return data;
}

export const getAreas = () => request("GET", "/api/areas");
export const getSettings = () => request("GET", "/api/settings");
export const putSettings = (settings) => request("PUT", "/api/settings", settings);
export const postOnboarding = (ids) => request("POST", "/api/onboarding", { modules: ids });
export const getSleepSuggestion = (answers) => request("POST", "/api/sleep/suggestion", answers);
export const getDashboard = (date) => request("GET", `/api/dashboard?date=${date}`);
export const getInsights = (date) => request("GET", `/api/insights?date=${date}`);
export const getFocus = (date) => request("GET", `/api/focus?date=${date}`);
export const getDay = (date) => request("GET", `/api/days/${date}`);
export const putDay = (date, day) => request("PUT", `/api/days/${date}`, day);
// session: { area, task, minutes, ended_at }; both answer with the whole day.
export const postSession = (date, session) => request("POST", `/api/days/${date}/sessions`, session);
export const changeSession = (date, id, changes) => request("PATCH", `/api/days/${date}/sessions/${encodeURIComponent(id)}`, changes);
export const deleteSession = (date, id) => request("DELETE", `/api/days/${date}/sessions/${encodeURIComponent(id)}`);
export const exportData = () => request("GET", "/api/export");
export const importData = (backup) => request("POST", "/api/import", backup);
export const deleteAll = () => request("DELETE", "/api/data", undefined, { "X-Confirm": "delete-all" });
