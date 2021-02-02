'use strict';

import { Utilities } from './Utilities.js';

const idTemplate = 'notification-for-period';

class Notifications {
  static async send(period, breakTime, type) {
    const { enabled, sound } = await this.checkSettings();

    if (enabled) {
      if (sound) this.playSound();

      const notification = this.build(period, breakTime, type);
      this.publish(notification);
    }
  }

  static build(period, breakTime, type) {
    let id = `${idTemplate}-${period}`;
    let title;
    let message;

    switch (type) {
      case 'cycle':
        title = `Cycle ${Utilities.mapCycle(period)} complete!`;
        message = `Great job. Take ${Utilities.msToMin(breakTime)}.`;
        break;
      case 'break':
        title = `Break ${Utilities.mapBreak(period)} is over.`;
        message = `Time to grind!`;
        break;
      case 'complete':
        title = `You did it! All cycles are complete.`;
        message = `Take a long break 🧘`;
        break;
    }

    return { id, title, message };
  }

  static checkSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['notificationsEnabled', 'notificationsSound'],
        (storage) =>
          resolve({
            enabled: storage.notificationsEnabled,
            sound: storage.notificationsSound,
          })
      );
    });
  }

  static playSound() {
    const sound = document.querySelector('#notifications');

    sound
      .play()
      .then(() => {})
      .catch((e) => console.log(e));
  }

  static publish(notification) {
    chrome.notifications.create(notification.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('../manifest-icons/icon-128.png'),
      title: notification.title,
      message: notification.message,
    });
  }

  static clear(period) {
    chrome.notifications.clear(`${idTemplate}-${period}`);
  }

  static clearAll(total) {
    for (let i = 0; i < total; i += 1) {
      this.clear(i);
    }
  }
}

export { Notifications };
