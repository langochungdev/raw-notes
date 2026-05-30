const openManager = document.getElementById("open-manager");
const openSidepanel = document.getElementById("open-sidepanel");

openManager.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openSidepanel.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
