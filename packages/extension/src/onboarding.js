document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('close')?.addEventListener('click', () => {
  window.close();
});
