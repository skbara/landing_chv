(function () {
  'use strict';

  // Hamburger: открытие/закрытие мобильного меню
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  if (nav && navToggle) {
    navToggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen);
      navToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
    });

    var links = nav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          nav.classList.remove('is-open');
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.setAttribute('aria-label', 'Открыть меню');
        }
      });
    }
  }

  // Плавное появление при скролле (IntersectionObserver + --i для задержек)
  var animated = document.querySelectorAll('.animate-on-scroll');

  function setStaggerIndex() {
    var skillsGroups = document.querySelectorAll('.skills__group');
    skillsGroups.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    var timelineItems = document.querySelectorAll('.timeline__item');
    timelineItems.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    var cards = document.querySelectorAll('#projects .card');
    cards.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
  }

  setStaggerIndex();

  if (animated.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    animated.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    animated.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // Header: фон на весь экран при скролле вниз от Главной
  var headerEl = document.getElementById('header');
  var scrollThreshold = 80;

  function updateHeaderScroll() {
    if (headerEl) {
      if (window.pageYOffset > scrollThreshold) {
        headerEl.classList.add('header--scrolled');
      } else {
        headerEl.classList.remove('header--scrolled');
      }
    }
  }

  window.addEventListener('scroll', updateHeaderScroll, { passive: true });
  updateHeaderScroll();

  // Подсветка активного раздела в навигации (линия под пунктом)
  var sectionIds = ['hero', 'experience', 'projects', 'skills', 'trusted', 'contacts'];

  function setActiveNav() {
    if (!nav) return;
    var scrollY = window.pageYOffset;
    var activeId = 'hero';
    var offset = 120;

    for (var s = 0; s < sectionIds.length; s++) {
      var sect = document.getElementById(sectionIds[s]);
      if (sect && sect.offsetTop <= scrollY + offset) {
        activeId = sectionIds[s];
      }
    }

    var navLinks = nav.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < navLinks.length; i++) {
      var href = navLinks[i].getAttribute('href');
      var id = href === '#' ? 'hero' : href.slice(1);
      if (id === activeId) {
        navLinks[i].classList.add('is-active');
      } else {
        navLinks[i].classList.remove('is-active');
      }
    }
  }

  window.addEventListener('scroll', setActiveNav, { passive: true });
  setActiveNav();

  // Форма обратной связи — только фронтенд, без отправки
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var hint = form.querySelector('.form__hint');
      if (btn && hint) {
        btn.textContent = 'Отправлено (демо)';
        btn.disabled = true;
        hint.textContent = 'Это демо: данные никуда не отправляются. Для связи используйте Telegram, email или телефон выше.';
        hint.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb';
      }
    });
  }
})();
