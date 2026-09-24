(function () {
  'use strict';

  var COOKIE_CONSENT_KEY = 'vch_cookie_consent';
  var YM_ID = 107146057;
  var MOBILE_MENU_MAX_WIDTH = 1100;
  var FORM_SUBMIT_TIMEOUT_MS = 3000;
  var cookieBannerResizeObserver = null;

  function syncCookieBannerSpace(banner) {
    if (!banner || banner.hidden) return;
    document.documentElement.style.setProperty(
      '--cookie-banner-space',
      Math.ceil(banner.getBoundingClientRect().height + 16) + 'px'
    );
  }

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

  function sendYmGoal(goalName, params) {
    if (getCookieConsent() !== 'all' || typeof window.ym !== 'function') {
      return;
    }

    try {
      window.ym(YM_ID, 'reachGoal', goalName, params || {});
    } catch (e) {
      /* Сбой аналитики не должен влиять на интерфейс сайта */
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
    document.documentElement.style.removeProperty('--cookie-banner-space');
    if (cookieBannerResizeObserver) {
      cookieBannerResizeObserver.disconnect();
      cookieBannerResizeObserver = null;
    }
  }

  function showCookieBanner(banner) {
    if (!banner) {
      return;
    }
    banner.hidden = false;
    document.body.classList.add('cookie-banner-visible');
    syncCookieBannerSpace(banner);
    if (typeof window.ResizeObserver === 'function') {
      cookieBannerResizeObserver = new window.ResizeObserver(function () {
        syncCookieBannerSpace(banner);
      });
      cookieBannerResizeObserver.observe(banner);
    } else {
      window.addEventListener('resize', function () {
        syncCookieBannerSpace(banner);
      }, { passive: true });
    }
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

  // Единая цель для ключевых CTA. При необходимости имя можно переопределить
  // атрибутом data-ym-goal на ссылке или кнопке.
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    var cta = target.closest('[data-ym-goal], a.btn');
    if (!cta) return;

    var href = cta.getAttribute('href') || '';
    var topic = '';
    if (href) {
      try {
        topic = new URL(href, window.location.href).searchParams.get('topic') || '';
      } catch (urlError) {
        topic = '';
      }
    }

    sendYmGoal(cta.getAttribute('data-ym-goal') || 'cta_click', {
      cta_text: (cta.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      cta_href: href.slice(0, 250),
      topic: topic
    });
  });

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
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-controls', 'nav');
    navToggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen);
      navToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
      syncMobileMenuHeader(isOpen);
      if (isOpen) {
        var firstNavLink = nav.querySelector('a');
        if (firstNavLink) {
          firstNavLink.focus();
        }
      }
    });

    var links = nav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        if (window.innerWidth <= MOBILE_MENU_MAX_WIDTH) {
          closeMobileMenu();
        }
      });
    }

    var headerToolLinks = document.querySelectorAll('.header__tools a');
    for (var t = 0; t < headerToolLinks.length; t++) {
      headerToolLinks[t].addEventListener('click', function () {
        if (window.innerWidth <= MOBILE_MENU_MAX_WIDTH) {
          closeMobileMenu();
        }
      });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > MOBILE_MENU_MAX_WIDTH) {
        closeMobileMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeMobileMenu();
        navToggle.focus();
      }
    });
  }

  // Плавное появление при скролле (IntersectionObserver + --i для задержек)
  var animated = document.querySelectorAll('.animate-on-scroll');

  function setStaggerIndex() {
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

  if (animated.length && 'IntersectionObserver' in window &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    animated.forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('will-animate');
      }
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
      if (
        document.body.classList.contains('case-page') ||
        document.body.classList.contains('legal-page') ||
        window.pageYOffset > scrollThreshold
      ) {
        headerEl.classList.add('header--scrolled');
      } else {
        headerEl.classList.remove('header--scrolled');
      }
    }
  }

  window.addEventListener('scroll', updateHeaderScroll, { passive: true });
  updateHeaderScroll();

  // Подсветка активного раздела в навигации (линия под пунктом)
  var sectionIds = ['hero', 'projects', 'pains', 'services', 'process', 'express-audit', 'team', 'faq', 'final-cta', 'contacts'];
  // Секции без пункта в меню привязываем к ближайшему якорю в header
  var navSectionAlias = {
    pains: 'services',
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
  var previousBodyOverflow = '';

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
    document.body.style.overflow = previousBodyOverflow;
    if (lightboxImage) {
      lightboxImage.removeAttribute('src');
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
    if (!lightbox || !lightboxImage || !trigger) return;

    var src = trigger.getAttribute('data-lightbox-src') || '';
    var alt = trigger.getAttribute('data-lightbox-alt') || '';
    var caption = trigger.getAttribute('data-lightbox-caption') || '';

    if (!src) return;

    lastLightboxTrigger = trigger;
    lightboxImage.setAttribute('src', src);
    lightboxImage.setAttribute('alt', alt);
    if (lightboxCaption) {
      lightboxCaption.textContent = caption;
    }
    lightbox.hidden = false;
    previousBodyOverflow = document.body.style.overflow;
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
      if (!lightbox.hidden && e.key === 'Tab' && lightboxClose) {
        e.preventDefault();
        lightboxClose.focus();
      }
      if (e.key === 'Escape') {
        closeLightbox();
      }
    });
  }

  // Кейсы: раскрытие остальных работ (скриншоты остаются в карточках)
  var projectsToggle = document.getElementById('projectsMoreToggle');
  var projectsPanel = document.getElementById('projectsMorePanel');
  if (projectsToggle && projectsPanel) {
    projectsPanel.hidden = true;
    projectsToggle.hidden = false;
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

  // Форма обратной связи: AJAX для Formspree с нативной отправкой как fallback.
  var form = document.getElementById('contactForm');
  if (form) {
    var topicSelect = form.querySelector('select[name="topic"]');
    var requestedTopic = new URLSearchParams(window.location.search).get('topic');
    if (topicSelect && requestedTopic && topicSelect.value === '') {
      for (var optionIndex = 0; optionIndex < topicSelect.options.length; optionIndex++) {
        if (topicSelect.options[optionIndex].value === requestedTopic) {
          topicSelect.value = requestedTopic;
          break;
        }
      }
    }

    if (topicSelect) {
      topicSelect.addEventListener('change', function () {
        if (!topicSelect.value) return;
        sendYmGoal('contact_topic_selected', {
          topic: topicSelect.value,
          source: 'select'
        });
      });

      document.querySelectorAll('.contact-option a[href*="topic="]').forEach(function (link) {
        link.addEventListener('click', function (e) {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          var targetUrl = new URL(link.href, window.location.href);
          var targetTopic = targetUrl.searchParams.get('topic');
          var hasTopic = Array.from(topicSelect.options).some(function (option) {
            return option.value === targetTopic;
          });
          var requestSection = document.getElementById('request');
          if (!hasTopic || !requestSection) return;

          e.preventDefault();
          topicSelect.value = targetTopic;
          sendYmGoal('contact_topic_selected', {
            topic: targetTopic,
            source: 'contact_option'
          });
          window.history.replaceState(null, '', targetUrl.pathname + targetUrl.search + targetUrl.hash);
          var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          requestSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        });
      });
    }

    var action = form.getAttribute('action') || '';
    var isDemo = action.indexOf('YOUR_FORM_ID') !== -1;
    var isFormspree = /^https:\/\/(?:www\.)?formspree\.io\/f\//i.test(action);
    var submitButton = form.querySelector('button[type="submit"]');
    var originalSubmitText = submitButton ? submitButton.textContent : '';
    var formStatus = form.querySelector('[data-form-status], .form__status');
    var isSubmitting = false;

    if (!formStatus) {
      formStatus = document.createElement('p');
      formStatus.className = 'form__status';
      formStatus.setAttribute('data-form-status', '');
      formStatus.hidden = true;
      if (submitButton) {
        submitButton.insertAdjacentElement('afterend', formStatus);
      } else {
        form.appendChild(formStatus);
      }
    }

    formStatus.setAttribute('role', 'status');
    formStatus.setAttribute('aria-live', 'polite');
    formStatus.setAttribute('aria-atomic', 'true');

    function setFormState(state, message) {
      form.classList.toggle('form--submitting', state === 'pending');
      form.classList.toggle('form--success', state === 'success');
      form.classList.toggle('form--error', state === 'error');
      form.setAttribute('aria-busy', state === 'pending' ? 'true' : 'false');

      if (submitButton) {
        submitButton.disabled = state === 'pending';
        submitButton.textContent = state === 'pending' ? 'Отправляем…' : originalSubmitText;
      }

      formStatus.hidden = !message;
      formStatus.textContent = message || '';
      formStatus.setAttribute('data-state', state || 'idle');
      formStatus.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    }

    function getFormspreeError(response) {
      return response.json().then(function (payload) {
        if (payload && Array.isArray(payload.errors) && payload.errors.length) {
          return payload.errors.map(function (error) {
            return error.message;
          }).filter(Boolean).join(' ');
        }
        return '';
      }).catch(function () {
        return '';
      });
    }

    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        form.reportValidity();
        return;
      }

      if (isDemo) {
        e.preventDefault();
        setFormState('error', 'Форма ещё не подключена. Укажите действующий Formspree ID в атрибуте action.');
        return;
      }

      // Без fetch/FormData остаётся штатная отправка HTML-формы на Formspree.
      if (!isFormspree || !window.fetch || !window.FormData) return;

      e.preventDefault();
      if (isSubmitting) return;

      isSubmitting = true;
      setFormState('pending', 'Отправляем заявку…');

      var submittedTopic = topicSelect ? topicSelect.value : 'general';
      var requestController = null;
      var requestTimeoutId = null;
      var requestTimedOut = false;
      var fetchOptions = {
        method: (form.getAttribute('method') || 'POST').toUpperCase(),
        body: new FormData(form),
        headers: {
          Accept: 'application/json'
        }
      };

      if (typeof window.AbortController === 'function') {
        requestController = new window.AbortController();
        fetchOptions.signal = requestController.signal;
        requestTimeoutId = window.setTimeout(function () {
          requestTimedOut = true;
          requestController.abort();
        }, FORM_SUBMIT_TIMEOUT_MS);
      }

      window.fetch(action, fetchOptions).then(function (response) {
        if (response.ok) {
          form.reset();
          setFormState('success', 'Спасибо! Заявка отправлена. Свяжемся с вами в ближайшее время.');
          sendYmGoal('lead_form_success', {
            topic: submittedTopic,
            source_path: window.location.pathname
          });
          return;
        }

        return getFormspreeError(response).then(function (details) {
          throw new Error(details || 'Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.');
        });
      }).catch(function (error) {
        setFormState(
          'error',
          requestTimedOut
            ? 'Сервер не ответил за 3 секунды. Попробуйте отправить заявку ещё раз.'
            : error && error.message
            ? error.message
            : 'Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами по телефону.'
        );
      }).finally(function () {
        if (requestTimeoutId !== null) {
          window.clearTimeout(requestTimeoutId);
        }
        isSubmitting = false;
        if (form.classList.contains('form--submitting')) {
          setFormState('idle', '');
        }
      });
    });
  }
})();
