'use strict';

// Defaults
const defaultTime = 25;
const defaultBreak = 5;
const defaultCycles = 4;
const defaultAutoStart = true;

const cycles = new Timer(
  defaultTime,
  defaultBreak,
  defaultCycles,
  defaultAutoStart
);

cycles.init();

let port = 0;
let popUpOpen = false;
let uiInterval = 0;

/*  
    Register all listeners

    - runtime.onInstalled
    - runtime.onConnect
    - idle.onStateChanged
    - storage.onChanged

*/

// Listen for "install" or "update" event
chrome.runtime.onInstalled.addListener(install);

// Listen for communications from PopUp
chrome.runtime.onConnect.addListener(connect);

// Listen for the system changing states, and update time
chrome.idle.onStateChanged.addListener(cycles.sync());

// Listen for changes in the options, report and reload
chrome.storage.onChanged.addListener(newSettings);

/* 
    Function definitions

    - install
    - connect
    - disconnect
    - handleMessage
    - notify
    - newSettings

*/

// Handle install and reload/update events for onInstalled
function install(details) {
  if (details.reason === 'install') {
  } else if (details.reason === 'update') {
    // Future release: Open new tab with changes for this version
    cycles.clearNotifications(true);
  }
}

function connect(portFromPopUp) {
  port = portFromPopUp;
  port.onDisconnect.addListener(disconnect);
  port.onMessage.addListener(handleMessage);

  popUpOpen = true;

  cycles.updatePort(port, popUpOpen);
}

function disconnect() {
  popUpOpen = false;
  cycles.updatePort(port, popUpOpen);
}

function handleMessage(message) {
  cycles.input(message.command);
}

// Identify changes in the user settings through storage.onChanged listener
function newSettings(changes, namespace) {
  let settingsChanged = false;
  for (let key in changes) {
    let storageChange = changes[key];
    console.debug(
      `Key '${key}' in '${namespace} changed\nOld value: '${storageChange.oldValue}', New value: '${storageChange.newValue}'`
    );

    // Update Settings
    switch (key) {
      case 'minutes':
        cycles.settings.cycleTime =
          storageChange.newValue * 60000 - cycles.settings.cycleDevOffset;
        settingsChanged = true;
        break;
      case 'break':
        cycles.settings.breakTime =
          storageChange.newValue * 60000 - cycles.settings.breakDevOffset;
        settingsChanged = true;
        break;
      case 'totalCycles':
        cycles.settings.totalCycles = storageChange.newValue;
        cycles.settings.totalBreaks = storageChange.newValue - 1;
        settingsChanged = true;
        break;
      case 'autoStart':
        cycles.settings.autoStart = storageChange.newValue;
        settingsChanged = true;
        break;
    }
  }
  if (settingsChanged) {
    // Clear all intervals and Timeouts
    clearTimeout(cycles.timeouts.cycle);
    clearTimeout(cycles.timeouts.break);
    clearTimeout(cycles.timeouts.count);

    // Clear all notifications
    cycles.clearNotifications(true);

    // Set runtime properties to defaults
    cycles.reset('all');
  }
}
