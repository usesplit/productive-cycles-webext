'use strict';

// Dev mode and debug messages
// Debug function is defined in background-manager.js

const Notifications = new NotificationInterface();

class Timer {
  constructor(defaultValues) {
    const {
      cycleMinutes,
      breakMinutes,
      totalCycles,
      autoStart,
    } = defaultValues;

    this.state = {
      period: 0,
      time: 0,
      status: 'initial',
    };

    this.timeline = [];
    this.subtractor = 0;

    this.comms = {
      port: null,
      portOpen: false,
    };

    this.dev = {
      cycleOffset: 0,
      breakOffset: 0,
    };

    this.settings = {
      cycleTime: cycleMinutes * 60000 - this.dev.cycleOffset,
      breakTime: breakMinutes * 60000 - this.dev.breakOffset,
      totalCycles: totalCycles,
      totalBreaks: totalCycles - 1,
      autoStart: autoStart,
    };
  }

  getSettings() {
    return {
      cycleTime: this.settings.cycleTime,
      breakTime: this.settings.breakTime,
      totalPeriods: this.settings.totalCycles + this.settings.totalBreaks,
      autoStart: this.settings.autoStart,
    };
  }

  getState() {
    return {
      period: this.state.period,
      time: this.state.time,
      status: this.state.status,
    };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  formatState() {
    return {
      time: Utilities.parseMs(this.state.time),
      state: this.state.status,
      cycle: Utilities.mapCycle(this.state.period),
      period: this.state.period,
      totalCycles: this.settings.totalCycles,
    };
  }

  init() {
    // Check stored settings and reconfigure the timer
    chrome.storage.local.get(
      ['minutes', 'break', 'totalCycles', 'autoStart'],
      (storage) => {
        // Timer settings
        if (storage.minutes !== undefined) {
          this.settings.cycleTime =
            storage.minutes * 60000 - this.dev.cycleOffset;
        }
        if (storage.break !== undefined) {
          this.settings.breakTime =
            storage.break * 60000 - this.dev.breakOffset;
        }
        if (storage.totalCycles !== undefined) {
          this.settings.totalCycles = storage.totalCycles;
          this.settings.totalBreaks = storage.totalCycles - 1;
        }
        if (storage.autoStart !== undefined) {
          this.settings.autoStart = storage.autoStart;
        }

        // Initial time value
        this.state.time = this.settings.cycleTime;

        debug('Init - Timer Initialized');
        debug(`Init - Cycle time: ${this.settings.cycleTime}`);
        debug(`Init - Break time: ${this.settings.breakTime}`);
        debug(`Init - Total cycles: ${this.settings.totalCycles}`);
        debug(`Init - Auto-start: ${this.settings.autoStart}`);
      }
    );
  }

  updatePort(port, portOpen) {
    debug(`portOpen: ${portOpen}`);
    this.comms.port = port;
    this.comms.portOpen = portOpen;
  }

  buildTimeline() {
    const { period, time, status } = this.getState();
    const { cycleTime, breakTime, totalPeriods } = this.getSettings();

    // Note that checking if autoStart is enabled / disabled could be important in the future
    if (status !== 'initial' && status !== 'paused') {
      debug('Timeline - Skipping build');
      return;
    }

    debug('Timeline - Building timeline');
    let newTimeline = [...this.timeline];

    const reference = Date.now();

    for (let i = period; i < totalPeriods; i += 1) {
      if (i === period) {
        newTimeline[i] = reference + time;
      } else if (i % 2 === 0) {
        newTimeline[i] = newTimeline[i - 1] + cycleTime;
      } else if (i % 2 !== 0) {
        newTimeline[i] = newTimeline[i - 1] + breakTime;
      }
    }

    this.timeline = [...newTimeline];
  }

  runSubtractor() {
    let { time } = this.getState();
    const newTime = time - 1000;
    this.setState({ time: newTime });

    this.postState();

    this.subtractor = setInterval(() => {
      let { time } = this.getState();
      const newTime = time - 1000;
      this.setState({ time: newTime });

      if (newTime < 0) {
        this.stopSubtractor();
        this.next();
        return;
      } else {
        this.postState();
      }
    }, 1000);
  }

  stopSubtractor() {
    clearInterval(this.subtractor);
  }

  next() {
    const { period, status } = this.getState();
    const { totalPeriods } = this.getSettings();

    debug('Next');

    // Timer is on 'break'
    if (status === 'break') {
      this.endBreak();
      return;
    }

    // Timer is 'running'
    if (status === 'running') {
      if (period === totalPeriods - 1) {
        this.endTimer();
        return;
      } else if (period < totalPeriods - 1) {
        this.endCycle();
        return;
      }
    }
  }

  startCycle() {
    debug('Start Cycle');

    this.buildTimeline();

    this.setState({ status: 'running' });

    this.runSubtractor();
  }

  endCycle() {
    const { period } = this.getState();
    const { breakTime } = this.getSettings();

    debug('End Cycle');

    Diagnostics.compareTargets(period, this.timeline);

    Notifications.notify(this.getState(), this.getSettings());

    this.setState({ period: period + 1, time: breakTime });

    this.startBreak();
  }

  endTimer() {
    const { period } = this.getState();

    debug('End Timer');

    Diagnostics.compareTargets(period, this.timeline);

    this.setState({ status: 'complete' });

    this.postState();

    Notifications.notify(this.getState(), this.getSettings());
  }

  startBreak() {
    debug('Start Break');

    this.setState({ status: 'break' });

    this.runSubtractor();
  }

  endBreak() {
    const { period } = this.getState();
    const { cycleTime, autoStart } = this.getSettings();
    debug('End Break');

    Diagnostics.compareTargets(period, this.timeline);

    Notifications.notify(this.getState(), this.getSettings());

    this.setState({ period: period + 1, time: cycleTime });

    setTimeout(() => {
      if (autoStart) {
        this.startCycle();
      } else {
        this.setState({ status: 'initial' });
        this.postState();
      }
    }, 1000);
  }

  pauseCycle() {
    this.stopSubtractor();

    this.setState({ status: 'paused' });

    // Understand whether Timer View can be tweaked to fully depend on background messaging
    // If so ... this function should post the new 'paused' state
    // this.postState();
  }

  skipBreak() {
    this.stopSubtractor();

    this.endBreak();
  }

  resetCycle() {
    const { period, status } = this.getState();
    const { cycleTime } = this.getSettings();

    debug('Reset Cycle');

    this.stopSubtractor();

    if (status === 'initial' && period > 0) {
      this.setState({ period: period - 2 });

      Notifications.clear(period + 1);
      Notifications.clear(period);
    }

    this.setState({ status: 'initial', time: cycleTime });

    this.postState();
  }

  resetAll() {
    const { cycleTime, totalPeriods } = this.getSettings();

    debug('Reset All');

    this.stopSubtractor();

    this.timeline = [];

    this.setState({ period: 0, time: cycleTime, status: 'initial' });

    this.postState();

    Notifications.clearAll(totalPeriods);
  }

  postState() {
    if (this.comms.portOpen) {
      this.comms.port.postMessage(this.formatState());
    }
  }

  sync() {
    const { period, status } = this.getState();
    const { totalPeriods, autoStart } = this.getSettings();

    debug('Sync');

    if (!(status === 'running' || status === 'break')) {
      debug(`Sync - Timer is ${status}. No corrections made.`);
      return;
    }

    debug('Sync - Correcting timer');
    if (autoStart) {
      // Stop the subtractor
      this.stopSubtractor();

      // Get reference
      const reference = Date.now();

      // Determine the correct period
      let correctedPeriod = period;
      for (let i = period; i < totalPeriods; i += 1) {
        const target = this.timeline[i];
        if (reference > target) {
          correctedPeriod = i + 1;
        } else {
          break;
        }
      }

      // Handle 'complete' case
      if (correctedPeriod === totalPeriods) {
        Diagnostics.checkRange(correctedPeriod, this.timeline);

        this.setState({
          period: correctedPeriod,
          time: 0,
          status: 'complete',
        });
        this.postState();
        return;
      }

      Diagnostics.checkRange(correctedPeriod, this.timeline);

      // Handle other cases
      const correctedState = correctedPeriod % 2 === 0 ? 'running' : 'break';
      // Determine the correct time
      const correctedTime = this.timeline[correctedPeriod] - reference;

      // Set the timer to the corrected values
      this.setState({
        period: correctedPeriod,
        time: correctedTime,
        status: correctedState,
      });

      this.postState();
      this.runSubtractor();
      return;
    } else {
      const correctedTime = this.timeline[period] - Date.now();
      if (correctedTime < 0) {
        this.stopSubtractor();
        this.next();
      } else {
        this.setState({
          time: correctedTime,
        });
      }
    }
  }
}
