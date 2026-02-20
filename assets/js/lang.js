// assets/js/lang.js
const langFiles = {
  fr: 'assets/lang/fr.json',
  en: 'assets/lang/en.json',
  es: 'assets/lang/es.json',
  it: 'assets/lang/it.json'
};

let translations = {};
let currentLang = localStorage.getItem('lang') || 'fr';

function setLang(lang) {
  if (!langFiles[lang]) lang = 'fr';
  fetch(langFiles[lang])
    .then(res => res.json())
    .then(data => {
      translations = data;
      currentLang = lang;
      localStorage.setItem('lang', lang);
      applyTranslations();
      updateTyped();
      updateFlag();
    });
}

function applyTranslations() {
  // Simple text nodes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) el.innerHTML = translations[key];
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[key]) el.setAttribute('placeholder', translations[key]);
  });
}

function updateTyped() {
  // Typed.js (hero)
  const el = document.getElementById('typed-text');
  if (el && translations['typed-items']) {
    // Destroy previous if exists
    if (window.typedInstance) window.typedInstance.destroy();
    el.setAttribute('data-typed-items', translations['typed-items']);
    window.typedInstance = new Typed('#typed-text', {
      strings: translations['typed-items'].split(',').map(s => s.trim()),
      typeSpeed: 60,
      backSpeed: 40,
      backDelay: 1000,
      loop: true
    });
  }
}

function updateFlag() {
  const img = document.querySelector('#current-lang img');
  if (!img) return;
  img.src = 'assets/img/' + currentLang + '-flag.png';
}

document.addEventListener('DOMContentLoaded', () => {
  // Detect click on lang menu
  document.querySelectorAll('.lang-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      setLang(item.getAttribute('data-lang'));
    });
  });
  // Init
  setLang(currentLang);
});
