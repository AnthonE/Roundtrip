// Scene switching and the state of the current run.
import { startRun, savedNick } from './api.js';

export const director = {
  scenes: {},
  scene: null,
  name: '',
  run: null,

  onSwitch: null, // set by main: snapshots the outgoing frame for the dissolve

  go(name, data = {}) {
    if (this.scene) this.onSwitch?.();
    this.scene?.exit?.();
    this.name = name;
    this.scene = this.scenes[name];
    this.scene.enter?.(data);
  },

  newRun() {
    const run = {
      id: null,
      level: 1,
      banked: 0,
      nick: savedNick(),
      named: false,
      ready: null, // resolves once the server has issued a run id
      pending: Promise.resolve(), // last level submission
    };
    run.ready = startRun().then((id) => (run.id = id));
    this.run = run;
    return run;
  },
};
