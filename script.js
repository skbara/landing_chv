(function () {
  'use strict';

  var COOKIE_CONSENT_KEY = 'vch_cookie_consent';
  var YM_ID = 107146057;

  function getCookieConsent() {
    try {
      return localStorage.getItem(COOKIE_CONSENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function setCookieConsent(value) {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value);
    } catch (e) {
      /* localStorage недоступен */
    }
  }

  function loadYandexMetrika() {
    if (window.__vchYmLoaded) {
      return;
    }
    window.__vchYmLoaded = true;

    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () {
        (m[i].a = m[i].a || []).push(arguments);
      };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) {
          return;
        }
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_ID, 'ym');

    window.ym(YM_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true
    });
  }

  function hideCookieBanner(banner) {
    if (!banner) {
      return;
    }
    banner.hidden = true;
    document.body.classList.remove('cookie-banner-visible');
  }

  function showCookieBanner(banner) {
    if (!banner) {
      return;
    }
    banner.hidden = false;
    document.body.classList.add('cookie-banner-visible');
  }

  function initCookieConsent() {
    var banner = document.getElementById('cookieBanner');
    var acceptBtn = document.getElementById('cookieAccept');
    var essentialBtn = document.getElementById('cookieEssential');
    var consent = getCookieConsent();

    if (consent === 'all') {
      loadYandexMetrika();
      hideCookieBanner(banner);
      return;
    }

    if (consent === 'essential') {
      hideCookieBanner(banner);
      return;
    }

    showCookieBanner(banner);

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        setCookieConsent('all');
        loadYandexMetrika();
        hideCookieBanner(banner);
      });
    }

    if (essentialBtn) {
      essentialBtn.addEventListener('click', function () {
        setCookieConsent('essential');
        hideCookieBanner(banner);
      });
    }
  }

  initCookieConsent();

  // Hamburger: открытие/закрытие мобильного меню
  var headerEl = document.getElementById('header');
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  function syncMobileMenuHeader(isOpen) {
    if (!headerEl) return;
    headerEl.classList.toggle('header--menu-open', isOpen);
  }

  function closeMobileMenu() {
    if (!nav || !navToggle) return;
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Открыть меню');
    syncMobileMenuHeader(false);
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
          closeMobileMenu();
        }
      });
    }

    var headerToolLinks = document.querySelectorAll('.header__tools a');
    for (var t = 0; t < headerToolLinks.length; t++) {
      headerToolLinks[t].addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          closeMobileMenu();
        }
      });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        closeMobileMenu();
      }
    });
  }

  // Плавное появление при скролле (IntersectionObserver + --i для задержек)
  var animated = document.querySelectorAll('.animate-on-scroll');

  function setStaggerIndex() {
    var resultCards = document.querySelectorAll('#results .result-card');
    resultCards.forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    var teamRoles = document.querySelectorAll('#team .team-role');
    teamRoles.forEach(function (el, i) {
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
    var painCards = document.querySelectorAll('#pains .pain-card');
    painCards.forEach(function (el, i) {
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
  var sectionIds = ['hero', 'pains', 'results', 'process', 'express-audit', 'services', 'projects', 'team', 'faq', 'final-cta', 'contacts'];
  // Секции без пункта в меню привязываем к ближайшему якорю в header
  var navSectionAlias = {
    results: 'pains',
    services: 'express-audit',
    'final-cta': 'contacts'
  };

  function getNavHighlightId(sectionId) {
    return navSectionAlias[sectionId] || sectionId;
  }

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

    var highlightId = getNavHighlightId(activeId);
    var navLinks = nav.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < navLinks.length; i++) {
      var href = navLinks[i].getAttribute('href');
      var id = href === '#' ? 'hero' : href.slice(1);
      if (id === highlightId) {
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

  // Кейсы: раскрытие остальных работ (скриншоты остаются в карточках)
  var projectsToggle = document.getElementById('projectsMoreToggle');
  var projectsPanel = document.getElementById('projectsMorePanel');
  if (projectsToggle && projectsPanel) {
    var toggleText = projectsToggle.querySelector('.projects-more__toggle-text');
    var labelShow = projectsToggle.getAttribute('data-label-show') || 'Показать остальные работы';
    var labelHide = projectsToggle.getAttribute('data-label-hide') || 'Скрыть работы';
    var projectCount = projectsPanel.querySelectorAll('.card').length;

    function setProjectsToggleLabel(open) {
      if (!toggleText) {
        return;
      }
      toggleText.textContent = open
        ? labelHide
        : labelShow + ' (' + projectCount + ')';
    }

    function revealProjectsAnimations() {
      var cards = projectsPanel.querySelectorAll('.animate-on-scroll:not(.visible)');
      cards.forEach(function (el) {
        el.classList.add('visible');
      });
    }

    projectsToggle.addEventListener('click', function () {
      var willOpen = projectsPanel.hidden;
      projectsPanel.hidden = !willOpen;
      projectsToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      projectsToggle.closest('.projects-more').classList.toggle('projects-more--open', willOpen);
      setProjectsToggleLabel(willOpen);
      if (willOpen) {
        revealProjectsAnimations();
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
