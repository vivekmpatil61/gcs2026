/* Progressive enhancement layer for the public studio site. */

(() => {
  'use strict';

  const ready = callback => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  };

  ready(() => {
    enhanceArtworkViewer();
    enhanceNavigation();
    enhanceHeroDots();
    enhanceMotion();
  });

  function enhanceArtworkViewer() {
    const dialog = document.getElementById('artworkLightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const image = dialog.querySelector('.artwork-lightbox-image');
    const caption = dialog.querySelector('.artwork-lightbox-caption');
    const closeButton = dialog.querySelector('.artwork-lightbox-close');
    const previousButton = dialog.querySelector('.artwork-lightbox-prev');
    const nextButton = dialog.querySelector('.artwork-lightbox-next');
    const artwork = Array.from(document.querySelectorAll('.gallery-item, .student-work'));
    let activeIndex = 0;
    let returnFocus = null;
    let pointerStart = null;

    artwork.forEach((item, index) => {
      const itemImage = item.querySelector('img');
      if (!itemImage) return;
      const itemCaption = getArtworkCaption(item, itemImage);
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Open larger view: ${itemCaption}`);

      item.addEventListener('pointerdown', event => {
        pointerStart = { x: event.clientX, y: event.clientY };
      });

      item.addEventListener('click', event => {
        if (pointerStart) {
          const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
          pointerStart = null;
          if (moved > 8) return;
        }
        openArtwork(index, item);
      });

      item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openArtwork(index, item);
      });
    });

    closeButton.addEventListener('click', () => dialog.close());
    previousButton.addEventListener('click', () => showArtwork(activeIndex - 1));
    nextButton.addEventListener('click', () => showArtwork(activeIndex + 1));
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') showArtwork(activeIndex - 1);
      if (event.key === 'ArrowRight') showArtwork(activeIndex + 1);
    });
    dialog.addEventListener('close', () => {
      image.removeAttribute('src');
      if (returnFocus) returnFocus.focus({ preventScroll: true });
    });

    function openArtwork(index, trigger) {
      activeIndex = index;
      returnFocus = trigger;
      showArtwork(index);
      dialog.showModal();
      closeButton.focus();
    }

    function showArtwork(index) {
      activeIndex = (index + artwork.length) % artwork.length;
      const item = artwork[activeIndex];
      const itemImage = item.querySelector('img');
      image.src = itemImage.getAttribute('src');
      image.alt = itemImage.alt;
      caption.textContent = getArtworkCaption(item, itemImage);
    }
  }

  function getArtworkCaption(item, image) {
    const visibleCaption = item.querySelector('.caption, figcaption');
    return (visibleCaption?.textContent || image.alt || 'Artwork').replace(/\s+/g, ' ').trim();
  }

  function enhanceNavigation() {
    const links = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    const sections = links
      .map(link => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);
    if (!links.length || !sections.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach(link => {
        const current = link.getAttribute('href') === `#${visible.target.id}`;
        if (current) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.2, 0.5] });

    sections.forEach(section => observer.observe(section));
  }

  function enhanceHeroDots() {
    const dots = Array.from(document.querySelectorAll('.slide-dots .dot'));
    if (!dots.length) return;
    const sync = () => dots.forEach(dot => dot.setAttribute('aria-pressed', String(dot.classList.contains('active'))));
    sync();
    new MutationObserver(sync).observe(document.getElementById('dots'), {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    });
  }

  function enhanceMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll(
      '.cur-card, .programme-card, .student-work, .testimonial-card, .step, .faq-item'
    );
    document.documentElement.classList.add('js-enhanced');
    targets.forEach(target => target.classList.add('reveal-target'));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    targets.forEach(target => observer.observe(target));
  }
})();
