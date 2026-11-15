export * from './sim';

/** Foundation sandbox keeps its lifecycle; the M0 lab owns an isolated loop. */
export function mount(): () => void {
  const link = document.createElement('a');
  link.href = './bench-lab.html';
  link.textContent = 'Open mechanism bench M0 lab ↗';
  link.style.cssText =
    'position:fixed;z-index:20;top:20px;left:20px;padding:14px 20px;background:#dfbd88;color:#15212b;border-radius:6px;font:600 16px system-ui';
  document.body.append(link);
  return () => link.remove();
}
