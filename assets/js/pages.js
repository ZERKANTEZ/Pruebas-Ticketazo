/**
 * pages.js
 * Renderiza la página de artista y el detalle de evento.
 */

const Pages = (() => {
  // Estado de reseñas en memoria (en producción vendría de la BD)
  const reviewsCache = {};
  let pendingRating  = 0;

  // ─────────────────────────────────────────
  //  ARTIST PAGE
  // ─────────────────────────────────────────
  function openArtist(id) {
    const artist = ARTISTS.find(a => a.id === id);
    if (!artist) return;

    document.getElementById('artist-hero-img').src = artist.image;
    document.getElementById('artist-hero-img').alt = artist.name;
    document.getElementById('artist-avatar').innerHTML = Icons._icon('mic', 32, '#fff');
    document.getElementById('artist-name').textContent   = artist.name;
    document.getElementById('artist-genre').textContent  = artist.genre;
    document.getElementById('artist-bio').textContent    = artist.bio;

    const badge = document.getElementById('artist-tour-badge');
    badge.classList.toggle('hidden', !artist.isOnTour);

    renderArtistTours(id);
    App.navigate('artist');
  }

  function renderArtistTours(artistId) {
    const all     = EVENTS.filter(e => e.artistId === artistId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const active  = all.filter(e => e.status !== 'expired');
    const expired = all.filter(e => e.status === 'expired');

    // Group by tourName
    const tours = {};
    active.forEach(e => {
      const key = e.tourName || '__single__';
      if (!tours[key]) tours[key] = [];
      tours[key].push(e);
    });

    let html = '';

    Object.entries(tours).forEach(([tourName, events]) => {
      const label = tourName === '__single__' ? 'Próximas fechas' : tourName;
      html += `
        <div class="tour-group">
          <div class="tour-group-header">
            <div class="tour-group-accent"></div>
            <h2 class="tour-group-title">${label}</h2>
            <span class="tour-group-count">${events.length} fecha${events.length !== 1 ? 's' : ''}</span>
          </div>
          ${events.map(e => tourDateCard(e)).join('')}
        </div>`;
    });

    if (expired.length) {
      html += `
        <div class="tour-group past">
          <div class="tour-group-header">
            <div class="tour-group-accent"></div>
            <h2 class="tour-group-title">Fechas pasadas</h2>
          </div>
          ${expired.map(e => `
            <div class="tour-date-card" style="pointer-events:none">
              ${dateBadge(e.date)}
              <div class="date-info">
                <div class="date-city">${e.city}</div>
                <div class="date-venue">${e.venue || ''}</div>
              </div>
              <span class="badge" style="background:rgba(255,255,255,.08);color:var(--text-muted)">Pasado</span>
            </div>`).join('')}
        </div>`;
    }

    document.getElementById('artist-tours').innerHTML =
      html || '<p style="color:var(--text-muted);font-size:.85rem">Sin fechas disponibles.</p>';
  }

  function tourDateCard(e) {
    const d = new Date(e.date);
    const daysUntil = Math.ceil((d - Date.now()) / 86400000);
    const soon = daysUntil > 0 && daysUntil <= 7
      ? `<span class="soon-badge">¡${daysUntil === 1 ? 'Mañana' : daysUntil + ' días'}!</span>` : '';
    const weekday = d.toLocaleDateString('es-ES', { weekday: 'long' });

    return `
      <div class="tour-date-card" onclick="Pages.openEvent('${e.id}')" role="button" tabindex="0"
        onkeydown="if(event.key==='Enter') Pages.openEvent('${e.id}')">
        ${dateBadge(e.date)}
        <div class="date-info">
          <div class="date-city">${e.city} ${soon}</div>
          <div class="date-venue">${e.venue || ''}</div>
          <div class="date-weekday">${weekday} · 20:00 hrs</div>
        </div>
        <div class="date-right">
          <div>
            <div class="date-price-label">Desde</div>
            <div class="date-price">$${e.prices.plata.toLocaleString()}</div>
          </div>
          <button class="btn btn-secondary btn-sm"
            onclick="event.stopPropagation(); Pages.handleBuy('${e.id}')">
            Boletos
          </button>
        </div>
      </div>`;
  }

  function dateBadge(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDate();
    const mon = d.toLocaleString('es-ES', { month: 'short' }).replace('.', '');
    return `
      <div class="date-box">
        <div class="date-day">${day}</div>
        <div class="date-mon">${mon}</div>
      </div>`;
  }

  // ─────────────────────────────────────────
  //  EVENT DETAIL
  // ─────────────────────────────────────────
  function openEvent(id) {
    const ev = EVENTS.find(e => e.id === id);
    if (!ev) return;

    // Seed cache from static data on first visit
    if (!reviewsCache[id]) reviewsCache[id] = [...(ev.reviews || [])];

    // Hero
    document.getElementById('event-hero-img').src = ev.image;
    document.getElementById('event-hero-img').alt = ev.title;

    // Meta
    document.getElementById('event-cat').textContent    = ev.category;
    document.getElementById('event-title').textContent  = ev.title;
    document.getElementById('event-artist').textContent = ev.artist;
    document.getElementById('event-about').textContent  = ev.about || '';

    // Meta row
    const d = new Date(ev.date);
    document.getElementById('event-meta').innerHTML = `
      <div class="event-meta-item"><span class="meta-icon"></span>
        ${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <div class="event-meta-item"><span class="meta-icon"></span>20:00 hrs</div>
      <div class="event-meta-item"><span class="meta-icon"></span>${ev.venue ? ev.venue + ', ' : ''}${ev.city}</div>
      <div class="event-meta-item"><span class="meta-icon"></span>${ev.category}</div>`;

    // Rating summary
    renderRatingBox(id);

    // Tour dates
    renderTourDatesInline(ev);

    // Reviews
    renderReviews(id);

    // Also seen
    renderAlsoSeen(ev);

    // Sidebar
    renderSidebar(ev, id);

    App.navigate('event');
  }

  function renderRatingBox(id) {
    const reviews = reviewsCache[id] || [];
    const box     = document.getElementById('event-rating-box');
    if (!reviews.length) { box.innerHTML = ''; return; }

    const avg = (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1);
    box.innerHTML = `
      <div class="event-rating-box">
        <div class="rating-number">${avg}</div>
        <div>
          <div class="rating-stars">${starRow(Math.round(avg), '0.9rem')}</div>
          <div class="rating-count">${reviews.length} reseña${reviews.length !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
  }

  function renderTourDatesInline(ev) {
    const section = document.getElementById('event-tour-section');
    if (!ev.tourName) { section.classList.add('hidden'); return; }

    const others = EVENTS.filter(e =>
      e.id !== ev.id &&
      e.artistId === ev.artistId &&
      e.tourName === ev.tourName &&
      e.status !== 'expired'
    ).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!others.length) { section.classList.add('hidden'); return; }

    document.getElementById('event-tour-name').textContent = ev.tourName;
    document.getElementById('event-tour-dates').innerHTML = others.map(td => {
      const d = new Date(td.date);
      return `
        <div class="tour-date-mini" onclick="Pages.openEvent('${td.id}')" role="button" tabindex="0">
          <div class="tour-date-mini-left">
            <div class="mini-cal">
              <div class="mini-cal-day">${d.getDate()}</div>
              <div class="mini-cal-mon">${d.toLocaleString('es-ES', { month: 'short' }).replace('.', '')}</div>
            </div>
            <div>
              <div style="font-size:.88rem;font-weight:600">${td.city}</div>
              <div style="font-size:.75rem;color:var(--text-muted)">${td.venue || ''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            <div style="text-align:right">
              <div style="font-size:.65rem;color:var(--text-muted)">Desde</div>
              <div style="font-size:.88rem;font-weight:700">$${td.prices.plata.toLocaleString()}</div>
            </div>
            <button class="btn btn-outline btn-sm"
              onclick="event.stopPropagation(); Pages.handleBuy('${td.id}')">
              Boletos
            </button>
          </div>
        </div>`;
    }).join('');

    section.classList.remove('hidden');
  }

  function renderReviews(id) {
    const reviews = reviewsCache[id] || [];
    document.getElementById('review-count-label').textContent = `(${reviews.length})`;

    // Form
    const formSection = document.getElementById('review-form-section');
    if (Auth.isLoggedIn()) {
      pendingRating = 0;
      formSection.innerHTML = `
        <div class="review-form-wrap">
          <div class="review-form-label">Escribe tu reseña</div>
          <div class="star-picker" id="star-picker">
            ${[1,2,3,4,5].map(i =>
              `<span class="star-pick" data-r="${i}"
                onclick="Pages.setRating(${i})"
                onmouseenter="Pages.hoverRating(${i})"
                onmouseleave="Pages.resetHover()">${Icons.star}</span>`
            ).join('')}
          </div>
          <textarea class="review-textarea" id="review-text"
            placeholder="Comparte tu experiencia..." rows="3"></textarea>
          <button class="btn btn-secondary btn-sm" style="margin-top:10px"
            onclick="Pages.submitReview('${id}')">
            Publicar reseña
          </button>
        </div>`;
    } else {
      formSection.innerHTML = `
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-subtle);
          border-radius:10px;padding:12px;margin-bottom:14px;font-size:.82rem;color:var(--text-muted)">
          <a onclick="Auth.openModal()" style="color:var(--color-pink);cursor:pointer;font-weight:600">
            Inicia sesión</a> para dejar tu reseña.
        </div>`;
    }

    // List
    document.getElementById('reviews-list').innerHTML = reviews.length
      ? reviews.map(r => `
          <div class="review-card">
            <div class="review-header">
              <div class="reviewer-info">
                <div class="reviewer-avatar"><span class="material-symbols-outlined" style="font-size:18px;color:#fff;">person</span></div>
                <div>
                  <div class="reviewer-name">${r.user}</div>
                  <div class="reviewer-date">${r.date}</div>
                </div>
              </div>
              <div class="review-stars">${starRow(r.rating, '0.8rem')}</div>
            </div>
            <div class="review-text">${r.comment}</div>
          </div>`).join('')
      : '<p style="font-size:.85rem;color:var(--text-muted)">Sé el primero en dejar una reseña.</p>';
  }

  function renderAlsoSeen(ev) {
    const related = EVENTS.filter(e => e.id !== ev.id && e.category === ev.category && e.status !== 'expired').slice(0, 3);
    const items   = related.length >= 2 ? related : EVENTS.filter(e => e.id !== ev.id && e.status !== 'expired').slice(0, 3);

    document.getElementById('also-grid').innerHTML = items.map(e => `
      <div class="also-card" onclick="Pages.openEvent('${e.id}')">
        <div class="also-img"><img src="${e.image}" alt="${e.title}" loading="lazy"/></div>
        <div class="also-body">
          <div class="also-cat">${e.category}</div>
          <div class="also-title">${e.title}</div>
          <div class="also-sub">${e.city} · $${e.prices.plata.toLocaleString()}</div>
        </div>
      </div>`).join('');
  }

  function renderSidebar(ev, id) {
    const reviews  = reviewsCache[id] || [];
    const zones    = Zones.getZones(ev.id);
    const minPrice = Zones.getMinPrice(ev.id);
    const zStatus  = Zones.getStatus(ev.id);

    document.getElementById('buy-price').textContent = '$' + (minPrice || 0).toLocaleString();

    const avg = reviews.length
      ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)
      : null;
    document.getElementById('buy-rating-pill').innerHTML = avg
      ? `<div class="rating-pill"><span style="font-size:.8rem;display:inline-flex;margin-right:2px">${Icons.star}</span><span class="rating-pill-num">${avg}</span></div>`
      : '';

    // Zones — only show if approved or no zones yet (fallback)
    const zonesEl = document.getElementById('buy-zones');
    if (!zones.length) {
      zonesEl.innerHTML = `<div style="font-size:.78rem;color:var(--text-muted);padding:8px 0">Sin zonas configuradas.</div>`;
    } else if (zStatus !== 'approved') {
      zonesEl.innerHTML = `<div style="font-size:.78rem;color:#fbbf24;padding:8px 0">⏳ Zonas pendientes de aprobación por el tesorero.</div>`;
    } else {
      let selectedZone = null;
      zonesEl.innerHTML = zones.map((z, i) => `
        <div class="zone-row-dynamic" id="zrd-${ev.id}-${i}" onclick="Pages.selectZone('${ev.id}',${i})">
          <div class="zone-row-dynamic-left">
            <div class="zone-dot-sm" style="background:${z.color}"></div>
            <span class="zone-row-name">${z.name}</span>
            <span style="font-size:.68rem;color:var(--text-muted)">${z.capacity.toLocaleString()} boletos</span>
          </div>
          <div style="display:flex;align-items:center;gap:7px">
            <span class="zone-row-price">$${z.price.toLocaleString()}</span>
            <span class="zone-check hidden" id="zcheck-${ev.id}-${i}"></span>
          </div>
        </div>`).join('');
    }

    const buyBtn = document.getElementById('buy-main-btn');
    if (ev.status === 'expired') {
      buyBtn.disabled    = true;
      buyBtn.textContent = 'Evento Caducado';
    } else if (zStatus !== 'approved' && zones.length > 0) {
      buyBtn.disabled    = true;
      buyBtn.textContent = 'Zonas en revisión';
    } else {
      buyBtn.disabled    = false;
      buyBtn.textContent = 'Selecciona una zona';
      buyBtn.dataset.id  = ev.id;
    }
  }

  let _selectedZone = null;

  function selectZone(eventId, index) {
    const zones = Zones.getZones(eventId);
    if (!zones[index]) return;
    _selectedZone = index;

    // Visually select
    zones.forEach((_, i) => {
      document.getElementById(`zrd-${eventId}-${i}`)?.classList.toggle('selected', i === index);
      document.getElementById(`zcheck-${eventId}-${i}`)?.classList.toggle('hidden', i !== index);
    });

    // Enable buy button
    const buyBtn = document.getElementById('buy-main-btn');
    if (buyBtn) {
      buyBtn.disabled    = false;
      buyBtn.textContent = `Comprar — $${zones[index].price.toLocaleString()} MXN`;
      buyBtn.dataset.id  = eventId;
    }
  }

  // ─────────────────────────────────────────
  //  REVIEWS INTERACTION
  // ─────────────────────────────────────────
  function setRating(n) {
    pendingRating = n;
    document.querySelectorAll('.star-pick').forEach((s, i) =>
      s.classList.toggle('active', i < n)
    );
  }

  function hoverRating(n) {
    document.querySelectorAll('.star-pick').forEach((s, i) =>
      s.style.opacity = i < n ? '1' : '0.3'
    );
  }

  function resetHover() {
    document.querySelectorAll('.star-pick').forEach((s, i) =>
      s.style.opacity = i < pendingRating ? '1' : '0.3'
    );
  }

  function submitReview(id) {
    const comment = document.getElementById('review-text')?.value.trim();
    if (!pendingRating || !comment) return;

    if (!reviewsCache[id]) reviewsCache[id] = [];
    reviewsCache[id].unshift({
      user:    Auth.session().name || 'Anónimo',
      rating:  pendingRating,
      comment,
      date:    new Date().toISOString().split('T')[0],
    });

    renderReviews(id);
    renderRatingBox(id);

    // Update sidebar
    const ev = EVENTS.find(e => e.id === id);
    if (ev) renderSidebar(ev, id);
  }

  // ─────────────────────────────────────────
  //  BUY
  // ─────────────────────────────────────────
  function handleBuy(id) {
    if (!Auth.isLoggedIn()) { Auth.openModal(); return; }
    const ev = EVENTS.find(e => e.id === id);
    Checkout.open(id);
  }

  function handleBuyClick() {
    const id = document.getElementById('buy-main-btn')?.dataset.id;
    if (id) handleBuy(id);
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function starRow(avg, size = '0.8rem') {
    return [1,2,3,4,5].map(i =>
      `<span style="font-size:${size};color:${i <= avg ? '#facc15' : '#374151'};display:inline-flex">${Icons.star}</span>`
    ).join('');
  }

  // Re-render review form after login (called by auth.js)
  function onAuthChange(id) {
    if (id) renderReviews(id);
  }

  return {
    getReviewsCache: (id) => reviewsCache[id] || null,
    selectZone,
    openArtist, openEvent,
    handleBuy, handleBuyClick,
    setRating, hoverRating, resetHover, submitReview,
    onAuthChange,
  };
})();
