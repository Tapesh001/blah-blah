import { startGame } from './game/runtime';
import './ui/style.css';
startGame().catch((error) => {
  const node = document.createElement('section');
  node.className = 'error';
  node.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.textContent = 'Unable to launch';
  const text = document.createElement('p');
  text.textContent = 'A WebGL 2 browser is required. ' + String(error);
  node.append(heading, text);
  document.querySelector('#app')?.append(node);
});
