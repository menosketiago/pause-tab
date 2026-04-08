// Create the menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pause-this-tab",
    title: "Pause this tab",
    contexts: ["page"]
  });
});

// Listen for the click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pause-this-tab") {
    
    console.log("Action triggered on tab ID:", tab.id);
    // [YOUR PAUSE LOGIC GOES HERE]
    
    // Inject code into the webpage to show the alert
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        alert("The tab pause action ran successfully!");
      }
    });

  }
});