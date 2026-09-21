  /* ── Hero slideshow ── */
  let cur = 0;
  const slides = document.querySelectorAll('.hero-slide');
  const dots   = document.querySelectorAll('.dot');
  function ensureSlideLoaded(index) {
    const slide = slides[index];
    if (!slide) return;
    const source = slide.querySelector('source[data-srcset]');
    const image = slide.querySelector('img[data-src]');
    if (source) {
      source.srcset = source.dataset.srcset;
      source.removeAttribute('data-srcset');
    }
    if (image) {
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    }
  }
  function goSlide(n) {
    ensureSlideLoaded(n);
    slides[cur].classList.remove('active');
    dots[cur].classList.remove('active');
    cur = n;
    slides[cur].classList.add('active');
    dots[cur].classList.add('active');
  }
  setInterval(() => goSlide((cur + 1) % slides.length), 5000);
  window.addEventListener('load', () => ensureSlideLoaded(1), { once:true });

  /* ── Gallery drag scroll ── */
  const gs = document.getElementById('galleryScroll');
  let isDragging = false, startX, scrollLeft;
  gs.addEventListener('mousedown', e => { isDragging=true; gs.classList.add('dragging'); startX=e.pageX-gs.offsetLeft; scrollLeft=gs.scrollLeft; });
  gs.addEventListener('mouseleave', () => { isDragging=false; gs.classList.remove('dragging'); });
  gs.addEventListener('mouseup', () => { isDragging=false; gs.classList.remove('dragging'); });
  gs.addEventListener('mousemove', e => { if(!isDragging) return; e.preventDefault(); const x=e.pageX-gs.offsetLeft; gs.scrollLeft=scrollLeft-(x-startX)*1.5; });

  /* ── Gallery dock magnification ── */
  const galleryItems = document.querySelectorAll('.gallery-item');
  const BASE_H = 280, BASE_W = 220;
  const MAX_H  = 420, MAX_W  = 330;
  const SPREAD = 2; // how many neighbours get partial magnification

  function getDist(itemEl, mouseX) {
    const rect = itemEl.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    return Math.abs(mouseX - center);
  }

  function applyDock(mouseX) {
    galleryItems.forEach(item => {
      const dist = getDist(item, mouseX);
      const maxDist = (BASE_W + 16) * (SPREAD + 1);
      const ratio = Math.max(0, 1 - dist / maxDist);
      const scale = 1 + (MAX_H / BASE_H - 1) * ratio;
      const h = Math.round(BASE_H * scale);
      const w = Math.round(BASE_W * scale);
      item.querySelector('img').style.height = h + 'px';
      item.querySelector('img').style.width  = w + 'px';
    });
  }

  function resetDock() {
    galleryItems.forEach(item => {
      item.querySelector('img').style.height = BASE_H + 'px';
      item.querySelector('img').style.width  = BASE_W + 'px';
    });
  }

  gs.addEventListener('mousemove', e => {
    if (!isDragging) applyDock(e.clientX);
  });
  gs.addEventListener('mouseleave', resetDock);

