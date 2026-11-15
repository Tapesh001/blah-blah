import type { MountModule } from '@contracts';
import { createSandbox } from './sandbox';
// Modules remain optional until their owners land them. Restrict to public entries.
const modules = import.meta.glob<MountModule>(
  '../{land,mech,sea,isle,gfx}/index.ts',
);
const name = document.body.dataset.sandbox ?? 'bike';
const owner: Record<string, string> = {
  bike: 'land',
  bench: 'mech',
  sail: 'sea',
  cloth: 'sea',
  isle: 'isle',
  'gfx-ocean': 'gfx',
  'gfx-sky': 'gfx',
  'gfx-terrain': 'gfx',
};
const importer = modules['../' + owner[name] + '/index.ts'];
try {
  const module = await importer?.();
  const ctx = await createSandbox({
    chapter:
      name === 'isle'
        ? 'isle'
        : name === 'sail' || name === 'cloth'
          ? 'sail'
          : 'ride',
    mount: module?.mount,
  });
  ctx.ui.toast(
    module?.mount
      ? name + ' sandbox'
      : name + ' sandbox · owner module pending',
  );
} catch (error) {
  const node = document.createElement('p');
  node.className = 'error';
  node.textContent = 'Sandbox could not start: ' + String(error);
  document.body.append(node);
}
