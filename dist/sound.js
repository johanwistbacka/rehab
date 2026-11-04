const patterns = {
  up: [[760, 0, .12]],
  down: [[520, 0, .12]],
  tick: [[520, 0, .09]],
  start: [[660, 0, .14]],
  complete: [[660, 0, .12], [880, .18, .18]],
  restEnd: [[660, 0, .1], [660, .18, .14]],
  test: [[760, 0, .12], [520, .22, .12], [660, .5, .12], [880, .68, .18]]
};

export class SoundPlayer {
  constructor({createContext, onState = () => {}, timeoutMs = 1500} = {}) {
    this.createContext = createContext || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw Object.assign(new Error('Web Audio unavailable'), {name: 'NotSupportedError'});
      return new Context();
    });
    this.onState = onState;
    this.timeoutMs = timeoutMs;
    this.context = null;
    this.pending = null;
    this.voices = new Set();
  }

  get ready() { return this.context?.state === 'running'; }

  // Call synchronously from the click handler, before awaiting anything else.
  unlock() {
    if (this.pending) return this.pending;
    try {
      if (!this.context || ['closed', 'interrupted'].includes(this.context.state)) {
        this.dispose();
        const context = this.context = this.createContext();
        context.onstatechange = () => {
          if (this.context === context) this.onState(context.state === 'running' ? 'ready' : 'blocked');
        };
      }
      if (this.ready) { this.onState('ready'); return Promise.resolve(true); }
      this.onState('starting');
      const context = this.context;
      const resumed = context.resume();
      let timeout;
      const limit = new Promise(resolve => { timeout = setTimeout(() => resolve(false), this.timeoutMs); });
      const operation = Promise.race([
        Promise.resolve(resumed).then(() => this.context === context && this.ready, () => false), limit
      ]).then(ready => {
        this.onState(ready ? 'ready' : 'blocked');
        return ready;
      }).finally(() => {
        clearTimeout(timeout);
        if (this.pending === operation) this.pending = null;
      });
      this.pending = operation;
      return operation;
    } catch (error) {
      this.onState(error.name === 'NotSupportedError' ? 'unsupported' : 'blocked');
      return Promise.resolve(false);
    }
  }

  play(name = 'tick') {
    if (!this.ready) return false;
    const context = this.context;
    try {
      const now = context.currentTime + .01;
      for (const [frequency, offset, length] of patterns[name] || patterns.tick) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const voice = {oscillator, gain};
        this.voices.add(voice);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.linearRampToValueAtTime(.12, now + offset + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + length);
        oscillator.connect(gain);gain.connect(context.destination);
        oscillator.onended = () => this.disconnect(voice);
        oscillator.start(now + offset);oscillator.stop(now + offset + length + .01);
      }
      return true;
    } catch {
      this.stop();this.onState('blocked');return false;
    }
  }

  disconnect(voice) {
    this.voices.delete(voice);
    try { voice.oscillator.disconnect();voice.gain.disconnect(); } catch {}
  }

  stop() {
    for (const voice of [...this.voices]) {
      try { voice.oscillator.stop(); } catch {}
      this.disconnect(voice);
    }
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context) {
      context.onstatechange = null;
      try { Promise.resolve(context.close()).catch(() => {}); } catch {}
    }
  }
}
