export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  enabled = false;
  volume = 0.55;
  async toggle(enabled = !this.enabled) {
    if (!this.context && enabled) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.ambience();
    }
    this.enabled = enabled;
    this.setVolume(this.volume);
    if (enabled) await this.context?.resume();
  }
  setVolume(volume: number) {
    this.volume = volume;
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.enabled ? volume : 0, this.context.currentTime, 0.1);
  }
  private ambience() {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.035) / 1.025; samples[i] = previous * 0.45; }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 460;
    source.connect(filter); filter.connect(this.master!); source.start();
  }
  noise(duration: number, gain: number, frequency: number) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = frequency;
    const envelope = ctx.createGain(); envelope.gain.value = gain;
    source.connect(filter); filter.connect(envelope); envelope.connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }
  tone(frequency: number, duration: number, gain = 0.12) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator(); const envelope = ctx.createGain();
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, ctx.currentTime + duration);
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(envelope); envelope.connect(this.master); oscillator.start(); oscillator.stop(ctx.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  shoot() { this.noise(0.19, 0.65, 4000); this.tone(125, 0.1, 0.2); }
  step() { this.noise(0.075, 0.14, 550); }
  reload() { this.noise(0.15, 0.3, 1800); }
  hit() { this.tone(800, 0.1, 0.16); }
  explosion() { this.noise(0.55, 0.65, 750); this.tone(75, 0.4, 0.23); }
}
