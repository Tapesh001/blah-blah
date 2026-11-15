import type { HudModel, Ui } from '@contracts';
export class FoundationUi implements Ui {
  private root: HTMLElement;
  private title: HTMLElement;
  private objective: HTMLElement;
  private prompt: HTMLButtonElement;
  private status: HTMLElement;
  private toastNode: HTMLElement;
  constructor(
    container: HTMLElement,
    onInteract: () => void,
    onPause: () => void,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'interface';
    this.root.innerHTML =
      '<header><a href="/">COG &amp; GALE</a><span>A journey through wind &amp; water</span><button type="button" data-pause>Pause · Esc</button></header><main><p class="eyebrow">THE JOURNEY / <span data-status></span></p><h1></h1><p data-objective></p><button class="continue" type="button" data-interact></button></main><p class="toast" role="status" aria-live="polite"></p><footer><span>WASD · MOVE &nbsp; E · INTERACT &nbsp; ESC · PAUSE</span><a href="/sandbox/">Explore sandboxes ↗</a></footer>';
    container.append(this.root);
    this.title = this.root.querySelector('h1')!;
    this.objective = this.root.querySelector('[data-objective]')!;
    this.prompt = this.root.querySelector('[data-interact]')!;
    this.status = this.root.querySelector('[data-status]')!;
    this.toastNode = this.root.querySelector('.toast')!;
    this.prompt.addEventListener('click', onInteract);
    this.root.querySelector('[data-pause]')!.addEventListener('click', onPause);
  }
  update(model: HudModel): void {
    const names = {
      title: 'Follow the wind.',
      ride: 'The road to the sea.',
      sail: 'Across open water.',
      isle: 'An island ahead.',
      ending: 'A journey begins.',
    };
    this.title.textContent = model.paused
      ? 'Take a breath.'
      : names[model.chapter];
    this.status.textContent = model.loading
      ? 'Loading'
      : model.paused
        ? 'Paused'
        : model.chapter;
    this.objective.textContent = model.paused
      ? 'Your journey is paused. Press Escape to return.'
      : model.objective;
    this.prompt.textContent = model.prompt;
    this.prompt.disabled = model.loading || model.paused;
    this.root.dataset.chapter = model.chapter;
    this.root.dataset.loading = String(model.loading);
    this.root.dataset.paused = String(model.paused);
  }
  toast(text: string): void {
    this.toastNode.textContent = text;
  }
  dispose(): void {
    this.root.remove();
  }
}
