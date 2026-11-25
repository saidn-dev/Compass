// The sign-in page for phones on the home Wi-Fi. The server sets a cookie on the right
// passcode; then Compass opens as usual.
const form = document.getElementById("login-form");
const field = document.getElementById("passcode");
const status = document.getElementById("login-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!field.value) {
    status.textContent = "Type your passcode.";
    field.focus();
    return;
  }
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "";
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: field.value }),
    });
    if (response.ok) {
      location.replace("/");
      return;
    }
    const data = await response.json().catch(() => null);
    status.textContent = data?.error?.message || `The server answered with error ${response.status}.`;
    field.select();
  } catch {
    status.textContent = "Can't reach Compass. Is the laptop on and Compass started with --lan?";
  } finally {
    button.disabled = false;
  }
});
