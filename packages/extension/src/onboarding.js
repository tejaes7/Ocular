import { eyeMark } from './ui/icons.js';

document.getElementById('wordmark').insertAdjacentHTML('afterbegin', eyeMark);

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('close').addEventListener('click', () => {
  window.close();
});
