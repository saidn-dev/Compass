// A clock for the focus timer, run as a worker by app.js. A worker keeps ticking once a
// second when the tab is in the background, where the page's own timers slow to once a minute.
setInterval(() => postMessage(Date.now()), 1000);
