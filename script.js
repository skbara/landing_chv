(function () {
  'use strict';

  // Hamburger: открытие/закрытие мобильного меню
  var headerEl = document.getElementById('header');
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  function syncMobileMenuHeader(isOpen) {
    if (!headerEl) return;
    headerEl.classList.toggle('header--menu-open', isOpen);
  }

  if (nav && navToggle) {
    navToggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen);
      navToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
      syncMobileMenuHeader(isOpen);
    });

    var links = nav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          nav.classList.remove('is-open');
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.setAttribute('aria-label', 'Открыть меню');
          syncMobileMenuHeader(false);
        }
      });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Открыть меню');
        syncMobileMenuHeader(false);
      }
    });
  }

  // Плавное появление при скролле (IntersectionObserver + --i для задержек)
  var animated = document.querySelectorAll('.animate-on-scroll');

  function setStaggerIndex() {
    var skillsGroups = document.querySelectorAll('.skills__group');
    skillsGroups.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    var faqItems = document.querySelectorAll('#faq .faq-item');
    faqItems.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    var serviceCards = document.querySelectorAll('#services .service-card');
    serviceCards.forEach(function (el, i) {
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
  var sectionIds = ['hero', 'services', 'experience', 'projects', 'skills', 'trusted', 'faq', 'contacts'];

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

  // Lightbox для скриншотов кейсов
  var lightbox = document.getElementById('imageLightbox');
  var lightboxImage = document.getElementById('lightboxImage');
  var lightboxCaption = document.getElementById('lightboxCaption');
  var lightboxClose = document.getElementById('lightboxClose');
  var lightboxDialog = lightbox ? lightbox.querySelector('.lightbox__dialog') : null;
  var lightboxTriggers = document.querySelectorAll('.card__shot-button');
  var lastLightboxTrigger = null;
  var lastLightboxOpenAt = 0;

  function syncLightboxLayout() {
    if (!lightboxDialog || !lightboxImage) return;

    lightboxDialog.classList.remove(
      'lightbox__dialog--landscape',
      'lightbox__dialog--portrait'
    );

    if (!lightboxImage.naturalWidth || !lightboxImage.naturalHeight) return;

    if (lightboxImage.naturalWidth / lightboxImage.naturalHeight > 1.35) {
      lightboxDialog.classList.add('lightbox__dialog--landscape');
    } else if (lightboxImage.naturalHeight / lightboxImage.naturalWidth > 1.15) {
      lightboxDialog.classList.add('lightbox__dialog--portrait');
    }
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.style.overflow = '';
    if (lightboxImage) {
      lightboxImage.setAttribute('src', '');
      lightboxImage.setAttribute('alt', '');
    }
    if (lightboxCaption) {
      lightboxCaption.textContent = '';
    }
    if (lightboxDialog) {
      lightboxDialog.classList.remove(
        'lightbox__dialog--landscape',
        'lightbox__dialog--portrait'
      );
    }
    if (lastLightboxTrigger) {
      lastLightboxTrigger.focus();
    }
  }

  function openLightbox(trigger) {
    if (!lightbox || !lightboxImage || !lightboxCaption || !trigger) return;

    var src = trigger.getAttribute('data-lightbox-src') || '';
    var alt = trigger.getAttribute('data-lightbox-alt') || '';
    var caption = trigger.getAttribute('data-lightbox-caption') || '';

    if (!src) return;

    lastLightboxTrigger = trigger;
    lightboxImage.setAttribute('src', src);
    lightboxImage.setAttribute('alt', alt);
    lightboxCaption.textContent = caption;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    syncLightboxLayout();

    if (lightboxClose) {
      lightboxClose.focus();
    }
  }

  function openLightboxOnce(trigger) {
    var now = Date.now();

    if (now - lastLightboxOpenAt < 350) {
      return;
    }

    lastLightboxOpenAt = now;
    openLightbox(trigger);
  }

  if (lightbox && lightboxTriggers.length) {
    if (lightboxImage) {
      lightboxImage.addEventListener('load', syncLightboxLayout);
      window.addEventListener('resize', syncLightboxLayout);
    }

    lightboxTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        openLightboxOnce(trigger);
      });

      trigger.addEventListener(
        'touchend',
        function (e) {
          e.preventDefault();
          openLightboxOnce(trigger);
        },
        { passive: false }
      );
    });

    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    var lightboxDismiss = lightbox.querySelectorAll('[data-lightbox-close]');
    lightboxDismiss.forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    });
  }

  // Форма обратной связи: при YOUR_FORM_ID в action — демо; после подстановки ID — отправка на Formspree
  var form = document.getElementById('contactForm');
  if (form) {
    var action = form.getAttribute('action') || '';
    var isDemo = action.indexOf('YOUR_FORM_ID') !== -1;
    form.addEventListener('submit', function (e) {
      if (isDemo) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        var hint = form.querySelector('.form__hint');
        if (btn && hint) {
          btn.textContent = 'Отправлено (демо)';
          btn.disabled = true;
          hint.textContent = 'Это демо: подставьте ваш Formspree ID в action формы, чтобы получать заявки на email.';
          hint.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb';
        }
      }
    });
  }
})();
