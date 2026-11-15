/** Synthesized ratchet clicks. Audio is acquired only after a player gesture. */
export class WinchAudio {
  private context: AudioContext | null = null;
  private tooth = 0;

  update(drum: number, active: boolean) {
    const tooth = Math.floor((drum * 24) / (Math.PI * 2));
    const changed = tooth !== this.tooth;
    this.tooth = tooth;
    if (!active || !changed || typeof window === 'undefined') return;
    if (!navigator.userActivation?.hasBeenActive) return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => {});
      return;
    }
    if (this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1100, now);
    oscillator.frequency.exponentialRampToValueAtTime(240, now + 0.025);
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.04);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  dispose() {
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
