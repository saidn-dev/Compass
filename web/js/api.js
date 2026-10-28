// Talks to the server. The only file that calls fetch().
// Every function returns the JSON the server sent back, or throws an ApiError.

// An error from the server, e.g. { code: "invalid", message: "Choose up to 5 modules." }
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
export const getDashboard = (date) => request("GET", `/api/dashboard?date=${date}`);
export const getDay = (date) => request("GET", `/api/days/${date}`);
export const putDay = (date, day) => request("PUT", `/api/days/${date}`, day);
export const exportData = () => request("GET", "/api/export");
export const importData = (backup) => request("POST", "/api/import", backup);
export const deleteAll = () => request("DELETE", "/api/data", undefined, { "X-Confirm": "delete-all" });
