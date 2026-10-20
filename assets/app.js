'use strict';

const dialog = document.querySelector('.workspace-dialog');
const workspaceButtons = document.querySelectorAll('[data-workspace]');
const menuToggle = document.querySelector('.menu-toggle');
const mobileNavigation = document.querySelector('#mobile-nav');

workspaceButtons.forEach((button) => {
  button.addEventListener('click', () => dialog.showModal());
});

document.querySelectorAll('.dialog-close, .dialog-done').forEach((button) => {
  button.addEventListener('click', () => dialog.close());
});

dialog.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dialog.close();
  }
});

menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  mobileNavigation.hidden = expanded;
});

mobileNavigation.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileNavigation.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    mobileNavigation.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  }
});

document.querySelector('#year').textContent = String(new Date().getFullYear());
