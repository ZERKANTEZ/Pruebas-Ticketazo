/**
 * profile.js
 * Módulo de perfil de usuario: favoritos, boletos con QR,
 * reseñas recientes y gestión de tarjeta (organizador).
 */

window.Profile = (() => {

  // ─── State ────────────────────────────────────────────────
  const STORAGE_KEYS = {
    tickets: 'ticketazo.profile.tickets.v2',
    refunds: 'ticketazo.profile.refunds.v3',
    organizerCard: 'ticketazo.profile.card.v2',
  };

  const LEGACY_STORAGE_KEYS = {
    tickets: 'ticketazo.profile.tickets.v1',
    refunds: 'ticketazo.profile.refunds.v1',
    scopedRefunds: 'ticketazo.profile.refunds.v2',
    organizerCard: 'ticketazo.profile.card.v1',
  };

  const SCOPED_STORAGE_NAMES = ['tickets', 'organizerCard'];

  const INITIAL_TICKETS = [
    { id: 'T-8821', eventId: 'e1', zone: 'vip',   purchaseDate: '2026-04-01', qrCode: 'TKZ-E1-VIP-8821-X9K2' },
    { id: 'T-8822', eventId: 'e3', zone: 'plata', purchaseDate: '2026-04-03', qrCode: 'TKZ-E3-PLT-8822-M7R4' },
    { id: 'T-8823', eventId: 'e4', zone: 'oro',   purchaseDate: '2026-04-10', qrCode: 'TKZ-E4-ORO-8823-P2W6' },
  ];

  const state = {
    liked: new Set(),       // IDs de eventos/tours con "me gusta"
    tickets: [],            // Boletos comprados
    refunds: [],            // Solicitudes de reembolso del usuario
    registeredCard: null,   // { last4, brand, holder } | null
    scope: '',
  };

  function _loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function _saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_err) {
      // Ignorar errores de almacenamiento en este demo
    }
  }

  function _currentUserScope() {
    const session = typeof Auth !== 'undefined' && Auth.session ? Auth.session() : null;
    if (session?.id) return `user:${session.id}`;
    if (session?.email) return `email:${String(session.email).trim().toLowerCase()}`;
    return 'guest';
  }

  function _scopedKey(baseKey, scope = _currentUserScope()) {
    return `${baseKey}:${scope}`;
  }

  function _migrateLegacyData(scope) {
    if (!scope || scope === 'guest') return;

    SCOPED_STORAGE_NAMES.forEach(name => {
      const baseKey = STORAGE_KEYS[name];
      const scopedKey = _scopedKey(baseKey, scope);
      const legacyKey = LEGACY_STORAGE_KEYS[name];
      if (!legacyKey) return;

      const hasScoped = localStorage.getItem(scopedKey);
      const legacyRaw = localStorage.getItem(legacyKey);
      if (hasScoped || !legacyRaw) return;

      localStorage.setItem(scopedKey, legacyRaw);
      localStorage.removeItem(legacyKey);
    });

    _migrateLegacyRefunds(scope);
  }

  function _persistTickets() { _saveJSON(_scopedKey(STORAGE_KEYS.tickets, state.scope), state.tickets); }
  function _persistCard()    { _saveJSON(_scopedKey(STORAGE_KEYS.organizerCard, state.scope), state.registeredCard); }

  function _loadRefundQueue() {
    return _loadJSON(STORAGE_KEYS.refunds, []);
  }

  function _saveRefundQueue(queue) {
    _saveJSON(STORAGE_KEYS.refunds, queue);
  }

  function _refundBelongsToScope(refund, scope) {
    return (refund?.userScope || '') === scope;
  }

  function _normalizeRefund(refund, scope) {
    return {
      ...refund,
      userScope: refund?.userScope || scope,
    };
  }

  function _migrateLegacyRefunds(scope) {
    const sources = [
      LEGACY_STORAGE_KEYS.refunds,
      _scopedKey(LEGACY_STORAGE_KEYS.scopedRefunds, scope),
    ];

    const queue = _loadRefundQueue();
    const knownIds = new Set(queue.map(refund => refund.id));
    let dirty = false;

    sources.forEach(key => {
      const items = _loadJSON(key, null);
      if (!Array.isArray(items) || !items.length) return;

      items.forEach(item => {
        const normalized = _normalizeRefund(item, scope);
        if (knownIds.has(normalized.id)) return;
        knownIds.add(normalized.id);
        queue.push(normalized);
        dirty = true;
      });

      localStorage.removeItem(key);
    });

    if (dirty) _saveRefundQueue(queue);
  }

  function _persistRefunds() {
    const keep = _loadRefundQueue().filter(refund => !_refundBelongsToScope(refund, state.scope));
    const currentScopeRefunds = state.refunds.map(refund => _normalizeRefund(refund, state.scope));
    _saveRefundQueue([...currentScopeRefunds, ...keep]);
  }

  function _hydrateState(force = false) {
    const scope = _currentUserScope();
    if (!force && state.scope === scope) return;

    _migrateLegacyData(scope);
    state.scope = scope;
    state.tickets = _loadJSON(_scopedKey(STORAGE_KEYS.tickets, scope), INITIAL_TICKETS.map(ticket => ({ ...ticket })));
    state.refunds = _loadRefundQueue()
      .filter(refund => _refundBelongsToScope(refund, scope))
      .map(refund => ({ ...refund }));
    state.registeredCard = _loadJSON(_scopedKey(STORAGE_KEYS.organizerCard, scope), null);
  }

  function _findEvent(eventId) {
    return EVENTS.find(ev => ev.id === eventId) || null;
  }

  function _getTicketPrice(ticket) {
    if (!ticket) return 0;
    const event = _findEvent(ticket.eventId);
    if (!event) return 0;

    const normalizedZone = String(ticket.zone || '').trim().toLowerCase();
    const zoneMap = typeof Zones !== 'undefined' && Zones.getZones
      ? Zones.getZones(ticket.eventId).find(z => String(z.name || '').trim().toLowerCase() === normalizedZone)
      : null;

    if (zoneMap?.price) return zoneMap.price;
    return event.prices?.[normalizedZone] || 0;
  }

  function _getRefundRequest(ticketId) {
    return state.refunds.find(refund => refund.ticketId === ticketId) || null;
  }

  _hydrateState(true);

  function addTickets(eventId, zone, qty) {
    _hydrateState();
    for (let i = 0; i < qty; i++) {
      const id = 'T-' + Math.floor(1000 + Math.random() * 9000);
      state.tickets.unshift({
        id,
        eventId,
        zone,
        purchaseDate: new Date().toISOString(),
        qrCode: `TKZ-${eventId.toUpperCase()}-${zone.toUpperCase().replace(/\\s+/g,'').substring(0,3)}-${id}-${Math.random().toString(36).substring(2,6).toUpperCase()}`
      });
    }
    _persistTickets();
  }

  // ─── Likes ────────────────────────────────────────────────
  function toggleLike(id, el) {
    const isLiked = state.liked.has(id);
    const newState = !isLiked; // el estado DESPUÉS del toggle

    if (isLiked) {
      state.liked.delete(id);
    } else {
      state.liked.add(id);
    }

    // Update all like buttons with the NEW state
    document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(btn => {
      btn.classList.toggle('liked', newState);
      btn.setAttribute('aria-label', newState ? 'Quitar de favoritos' : 'Agregar a favoritos');
      btn.innerHTML = newState ? Icons.heart : Icons.heartOutline;
    });

    // Notify if not logged in
    if (!Auth.isLoggedIn()) {
      state.liked.delete(id);
      document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(btn => {
        btn.classList.remove('liked');
        btn.innerHTML = Icons.heartOutline;
      });
      Auth.openModal();
    }
  }

  function isLiked(id) { return state.liked.has(id); }

  // ─── Navigation ───────────────────────────────────────────
  function open() {
    if (!Auth.isLoggedIn()) { Auth.openModal(); return; }
    _hydrateState();
    render();
    App.navigate('profile');
  }

  // ─── Main Render ──────────────────────────────────────────
  function render() {
    _hydrateState();
    const sess = Auth.session();
    const el   = document.getElementById('page-profile');
    if (!el) return;

    const isOrganizer = sess.role === 'organizer';
    const avatarIcon  = Icons._icon('person', 36, '#fff');

    const roleLabels = {
      user:      { label: `<span style="display:inline-flex;vertical-align:text-bottom;margin-right:4px">${Icons.ticket}</span> Cliente`,            cls: 'user'      },
      organizer: { label: `<span style="display:inline-flex;vertical-align:text-bottom;margin-right:4px">${Icons.star}</span> Organizador`,         cls: 'organizer' },
      admin:     { label: `<span style="display:inline-flex;vertical-align:text-bottom;margin-right:4px">${Icons.filter}</span> Administrador`,        cls: 'admin'     },
      treasurer: { label: `<span style="display:inline-flex;vertical-align:text-bottom;margin-right:4px">${Icons.lock}</span> Tesorero`,            cls: 'admin'     },
    };
    const roleInfo = roleLabels[sess.role] || roleLabels.user;

    el.innerHTML = `
      <div class="profile-wrap">

        <!-- Header -->
        <div class="profile-header">
          <div class="profile-avatar">${avatarIcon}</div>
          <div class="profile-info">
            <div class="profile-name">${sess.name}</div>
            <div id="profile-email-display" style="display:flex;align-items:center;gap:8px;margin-top:2px">
              <span class="profile-email" id="profile-email-text">${sess.email}</span>
              <button style="font-size:.68rem;color:var(--color-blue);background:none;border:none;cursor:pointer;font-weight:600;padding:0;font-family:var(--font-body)"
                onclick="Profile.toggleEmailEdit()">Cambiar</button>
            </div>
            <div id="profile-email-edit" style="display:none;margin-top:6px">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input type="email" id="new-email-input"
                  style="background:rgba(0,0,0,.35);border:1px solid rgba(135,206,235,.3);border-radius:8px;padding:6px 10px;color:#fff;font-size:.8rem;outline:none;font-family:var(--font-body);width:220px;max-width:100%"
                  placeholder="${sess.email}"/>
                <button style="font-size:.75rem;font-weight:600;padding:6px 14px;border-radius:50px;background:linear-gradient(90deg,var(--color-blue),var(--color-purple));color:#fff;border:none;cursor:pointer;font-family:var(--font-body)"
                  onclick="Profile.saveEmail()">Guardar</button>
                <button style="font-size:.75rem;color:var(--text-muted);background:none;border:none;cursor:pointer;font-family:var(--font-body)"
                  onclick="Profile.toggleEmailEdit()">Cancelar</button>
              </div>
            </div>
            <div class="profile-role-badge profile-role-badge--${roleInfo.cls}" style="margin-top:8px">
              ${roleInfo.label}
            </div>
          </div>
        </div>

        ${isOrganizer ? renderCardSection() : ''}
        ${renderFavorites()}
        ${renderTickets(sess)}
        ${renderRecentReviews(sess.name)}
      </div>`;

    // Generate QR codes after DOM is ready
    setTimeout(() => generateQRCodes(), 100);
  }

  // ─── Card Section (organizer) ─────────────────────────────
  function renderCardSection() {
    const card = state.registeredCard;

    const warningHtml = !card ? `
      <div class="no-card-warning">
        <span><strong>Necesitas una cuenta registrada</strong> para poder recibir los depósitos de tus ventas.</span>
      </div>` : '';

    const cardContent = card ? `
      <div class="registered-card">
        <div class="registered-card-left">
          <div class="card-chip"></div>
          <div>
            <div class="card-number">${card.last4}</div>
            <div class="card-brand">${card.brand} · ${card.holder}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="card-status-badge">Activa para Depósitos</span>
          <button class="remove-card-btn" onclick="Profile.removeCard()">Eliminar</button>
        </div>
      </div>` : `
      <div class="add-card-form">
        <div class="add-card-title"><span style="display:inline-flex;vertical-align:middle;margin-right:6px"><span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">account_balance</span></span> Cuenta Bancaria de Depósito</div>
        <div class="add-card-grid">
          <div class="add-card-full">
            <label class="profile-input-label">Clave CLABE Interbancaria (18 dígitos)</label>
            <input class="profile-input" id="pc-num" type="text" placeholder="000 000 0000000000 0" maxlength="22" oninput="Profile.fmtCard(this)"/>
          </div>
          <div class="add-card-full">
            <label class="profile-input-label">Nombre del Titular de la Cuenta</label>
            <input class="profile-input" id="pc-name" type="text" placeholder="Como aparece en el banco"/>
          </div>
          <div class="add-card-full">
            <label class="profile-input-label">Banco</label>
            <input class="profile-input" id="pc-bank" type="text" placeholder="Ej. BBVA, Santander, Banorte"/>
          </div>
        </div>
        <button class="save-card-btn" onclick="Profile.saveCard()">
          <span style="display:inline-flex;vertical-align:bottom;margin-right:6px">${Icons.lock}</span> Guardar Cuenta Bancaria
        </button>
        <p style="font-size:.7rem;color:var(--text-muted);margin-top:8px;text-align:center">
          Tus datos están encriptados. Los usaremos únicamente para transferir las ganancias de tus eventos.
        </p>
      </div>`;

    return `
      <div class="profile-section">
        <div class="profile-section-header">
          <div class="profile-section-title">
            <div class="profile-section-icon icon--amber"><span class="material-symbols-outlined" style="font-size: 18px; color: inherit; vertical-align: middle;">account_balance</span></div>
            Datos para Depósitos
          </div>
        </div>
        <div class="card-reg-wrap">
          ${warningHtml}
          ${cardContent}
        </div>
      </div>`;
  }

  function saveCard() {
    _hydrateState();
    const num  = document.getElementById('pc-num')?.value.replace(/\s/g, '');
    const name = document.getElementById('pc-name')?.value.trim();
    const bank = document.getElementById('pc-bank')?.value.trim();

    if (num.length < 18 || !name || !bank) {
      alert('Por favor completa todos los campos de la cuenta interbancaria (CLABE de 18 dígitos).');
      return;
    }

    state.registeredCard = {
      last4: 'CLABE terminada en ' + num.slice(-4),
      brand: bank,
      holder: name,
    };

    _persistCard();
    render(); // Re-render profile with card registered
  }

  function removeCard() {
    _hydrateState();
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarjeta?')) return;
    state.registeredCard = null;
    _persistCard();
    render();
  }

  function hasCard() { _hydrateState(); return !!state.registeredCard; }

  function fmtCard(el) {
    el.value = el.value.replace(/\D/g, '').slice(0, 18).replace(/(.{4})(?=\d)/g, '$1 ').trim();
  }
  function fmtExp(el) {
    const c = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = c.length >= 3 ? c.slice(0, 2) + '/' + c.slice(2) : c;
  }

  // ─── Favorites ────────────────────────────────────────────
  function renderFavorites() {
    const likedIds    = [...state.liked];
    const likedEvents = EVENTS.filter(e => likedIds.includes(e.id));

    const content = likedEvents.length
      ? `<div class="favorites-grid">
          ${likedEvents.map(ev => `
            <div class="fav-card" onclick="Pages.openEvent('${ev.id}')">
              <div class="fav-img"><img src="${ev.image}" alt="${ev.title}" loading="lazy"/></div>
              <div class="fav-info">
                <div class="fav-title">${ev.title}</div>
                <div class="fav-artist">${ev.artist}</div>
                <div class="fav-date">${new Date(ev.date).toLocaleDateString('es-ES', {day:'numeric',month:'short',year:'numeric'})}</div>
              </div>
              <button class="fav-remove" onclick="event.stopPropagation(); Profile.toggleLike('${ev.id}', this); Profile.render();"
                title="Quitar de favoritos">${Icons.close}</button>
            </div>`).join('')}
        </div>`
      : `<div class="profile-empty">
          <div class="profile-empty-icon">${Icons.heart}</div>
          <div>Aún no tienes eventos favoritos.</div>
          <div style="font-size:.78rem;margin-top:4px">Dale con el botón de corazón a los eventos que te gusten.</div>
        </div>`;

    return `
      <div class="profile-section">
        <div class="profile-section-header">
          <div class="profile-section-title">
            <div class="profile-section-icon icon--pink">${Icons.heart}</div>
            Mis Favoritos
          </div>
          <span style="font-size:.82rem;color:var(--text-muted)">${likedEvents.length} evento${likedEvents.length !== 1 ? 's' : ''}</span>
        </div>
        ${content}
      </div>`;
  }

  // ─── Tickets ──────────────────────────────────────────────
  function renderTickets(sess) {
    _hydrateState();
    const tickets = Auth.session() ? state.tickets : [];

    const content = tickets.length
      ? `<div class="tickets-list">
          ${tickets.map(t => {
            const ev = _findEvent(t.eventId);
            if (!ev) return '';
            const d = new Date(ev.date);
            const refund = _getRefundRequest(t.id);
            const refundStatus = refund?.status || 'none';
            const refundTone = refundStatus === 'approved' ? 'approved' : refundStatus === 'rejected' ? 'rejected' : 'pending';
            const refundLabel = refundStatus === 'approved'
              ? 'Reembolso aprobado'
              : refundStatus === 'rejected'
                ? 'Solicitud rechazada'
                : 'Solicitud enviada al tesorero';
            const refundMessage = refundStatus === 'approved'
              ? 'El tesorero aprobó tu solicitud. Este boleto ya quedó marcado para devolución.'
              : refundStatus === 'rejected'
                ? 'La solicitud fue rechazada. Puedes volver a enviarla si deseas corregir el motivo.'
                : 'Si no puedes asistir, puedes enviar la solicitud de reembolso al tesorero desde aquí.';
            return `
              <div class="ticket-card" id="tc-${t.id}">
                <div class="ticket-top">
                  <div class="ticket-event-img">
                    <img src="${ev.image}" alt="${ev.title}" loading="lazy"/>
                  </div>
                  <div class="ticket-info">
                    <div class="ticket-event-name">${ev.title}</div>
                    <div class="ticket-meta">
                      ${ev.venue}, ${ev.city}<br>
                      ${d.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short', year:'numeric' })}
                    </div>
                    <span class="ticket-zone-badge zone--${t.zone.toLowerCase()}">${t.zone.toUpperCase()}</span>
                  </div>
                  <button class="ticket-qr-toggle" onclick="Profile.toggleQR('${t.id}')">
                    Ver QR
                  </button>
                </div>
                <div class="ticket-qr-section" id="qr-${t.id}">
                  <div class="qr-canvas-wrap">
                    <canvas id="qrc-${t.id}" width="120" height="120"></canvas>
                  </div>
                  <div class="ticket-qr-info">
                    <div class="ticket-qr-code">${t.qrCode}</div>
                    <div class="ticket-qr-hint">Muestra este código en la entrada</div>
                    <div style="font-size:.7rem;color:var(--text-muted);margin-top:6px">
                      Comprado el ${new Date(t.purchaseDate).toLocaleDateString('es-ES')}
                    </div>
                  </div>
                  <div class="ticket-refund-panel">
                    <div class="ticket-refund-title">Reembolso</div>
                    <div class="ticket-refund-copy">${refundMessage}</div>
                    ${refund
                      ? `<div class="ticket-refund-status ticket-refund-status--${refundTone}">${refundLabel}</div>
                         <div class="ticket-refund-meta">Motivo: ${refund.reason}</div>
                         <div class="ticket-refund-meta">Registrado el ${new Date(refund.requestedAt).toLocaleDateString('es-ES')}</div>
                         ${refundStatus === 'rejected'
                           ? `<button class="ticket-refund-btn" onclick="event.stopPropagation(); Profile.requestRefund('${t.id}')">
                                Solicitar de nuevo
                              </button>`
                           : ''}`
                      : `<button class="ticket-refund-btn" onclick="event.stopPropagation(); Profile.requestRefund('${t.id}')">
                           Solicitar reembolso
                         </button>`}
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`
      : `<div class="profile-empty">
          <div class="profile-empty-icon">${Icons.ticket}</div>
          <div>Aún no tienes boletos.</div>
          <div style="font-size:.78rem;margin-top:4px">Tus compras aparecerán aquí con su código QR.</div>
        </div>`;

    return `
      <div class="profile-section">
        <div class="profile-section-header">
          <div class="profile-section-title">
            <div class="profile-section-icon icon--blue">${Icons.ticket}</div>
            Mis Boletos
          </div>
          <span style="font-size:.82rem;color:var(--text-muted)">${tickets.length} boleto${tickets.length !== 1 ? 's' : ''}</span>
        </div>
        ${content}
      </div>`;
  }

  function requestRefund(ticketId) {
    _hydrateState();
    if (!Auth.isLoggedIn()) {
      Auth.openModal();
      return;
    }

    const ticket = state.tickets.find(item => item.id === ticketId);
    if (!ticket) return;

    const current = _getRefundRequest(ticketId);
    if (current?.status === 'pending') {
      alert('Esta solicitud ya fue enviada al tesorero.');
      return;
    }

    if (current?.status === 'approved') {
      alert('Este boleto ya tiene un reembolso aprobado.');
      return;
    }

    const reason = window.prompt('Escribe brevemente el motivo del reembolso.', current?.reason || '');
    if (reason === null) return;

    const cleanReason = reason.trim();
    if (!cleanReason) {
      alert('Necesitamos el motivo del reembolso para registrarlo.');
      return;
    }

    const event = _findEvent(ticket.eventId);
    const now = new Date().toISOString();
    const session = Auth.session() || {};
    const payload = {
      id: current?.id || `RF-${Date.now()}`,
      ticketId,
      eventId: ticket.eventId,
      eventTitle: event?.title || 'Evento',
      zone: ticket.zone,
      amount: _getTicketPrice(ticket),
      userName: session.name || 'Cliente',
      userEmail: session.email || 'cliente@ticketazo.mx',
      userScope: state.scope,
      reason: cleanReason,
      requestedAt: now,
      updatedAt: now,
      status: 'pending',
    };

    if (current) {
      Object.assign(current, payload);
    } else {
      state.refunds.unshift(payload);
    }

    _persistRefunds();
    render();
  }

  function resolveRefund(refundId, status) {
    _hydrateState();
    const queue = _loadRefundQueue();
    const refund = queue.find(item => item.id === refundId);
    if (!refund) return;

    refund.status = status;
    refund.updatedAt = new Date().toISOString();
    _saveRefundQueue(queue);
    state.refunds = queue
      .filter(item => _refundBelongsToScope(item, state.scope))
      .map(item => ({ ...item }));

    if (document.getElementById('page-profile')?.classList.contains('active')) {
      render();
    }
  }

  function toggleQR(ticketId) {
    _hydrateState();
    const section = document.getElementById(`qr-${ticketId}`);
    const btn     = section?.previousElementSibling?.querySelector('.ticket-qr-toggle');
    if (!section) return;

    const isOpen = section.classList.toggle('open');
    if (btn) btn.textContent = isOpen ? 'Ocultar QR' : 'Ver QR';

    if (isOpen) {
      const canvas = document.getElementById(`qrc-${ticketId}`);
      if (canvas && !canvas.dataset.generated) {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (ticket) drawQR(canvas, ticket.qrCode);
        canvas.dataset.generated = 'true';
      }
    }
  }

  // ─── Recent Reviews ───────────────────────────────────────
  function renderRecentReviews(userName) {
    // Collect reviews authored by this user across all events
    const myReviews = [];
    EVENTS.forEach(ev => {
      const all = (Pages.getReviewsCache(ev.id) || ev.reviews || []);
      all.forEach(r => {
        if (r.user === userName || r.user === 'Anónimo') {
          myReviews.push({ ...r, eventId: ev.id, eventTitle: ev.title, eventImage: ev.image });
        }
      });
    });

    const recent = myReviews.slice(0, 5);

    const content = recent.length
      ? recent.map(r => `
          <div class="profile-review-card" onclick="Pages.openEvent('${r.eventId}')">
            <div class="profile-review-event-img">
              <img src="${r.eventImage}" alt="${r.eventTitle}" loading="lazy"/>
            </div>
            <div class="profile-review-body">
              <div class="profile-review-event">${r.eventTitle}</div>
              <div class="profile-review-stars">
                ${[1,2,3,4,5].map(i => `<span style="font-size:.72rem;color:${i<=r.rating?'#facc15':'#374151'}">${Icons.star}</span>`).join('')}
              </div>
              <div class="profile-review-text">${r.comment}</div>
              <div class="profile-review-date">${r.date}</div>
            </div>
          </div>`).join('')
      : `<div class="profile-empty">
          <div class="profile-empty-icon">${Icons.message}</div>
          <div>Aún no has escrito reseñas.</div>
          <div style="font-size:.78rem;margin-top:4px">Tus reseñas aparecerán aquí.</div>
        </div>`;

    return `
      <div class="profile-section">
        <div class="profile-section-header">
          <div class="profile-section-title">
            <div class="profile-section-icon icon--purple">${Icons.message}</div>
            Mis Reseñas Recientes
          </div>
          <span style="font-size:.82rem;color:var(--text-muted)">${recent.length} reseña${recent.length !== 1 ? 's' : ''}</span>
        </div>
        ${content}
      </div>`;
  }

  // ─── QR Generator (canvas-based, no library needed) ──────
  function drawQR(canvas, code) {
    const ctx  = canvas.getContext('2d');
    const size = 120;
    const cell = 6;
    const cols = Math.floor(size / cell);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    // Deterministic pseudo-random pattern from code string
    const hash = (str) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    };

    for (let r = 0; r < cols; r++) {
      for (let c = 0; c < cols; c++) {
        const seed = hash(`${code}-${r}-${c}`);
        const draw = (seed % 3) !== 0; // ~66% filled
        if (draw) ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
      }
    }

    // Position detection squares (3 corners)
    const drawCorner = (x, y) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, 21, 21);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 3, y + 3, 15, 15);
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 6, y + 6, 9, 9);
    };
    drawCorner(0, 0);
    drawCorner(size - 21, 0);
    drawCorner(0, size - 21);
  }

  function generateQRCodes() {
    _hydrateState();
    state.tickets.forEach(t => {
      const canvas = document.getElementById(`qrc-${t.id}`);
      if (canvas && !canvas.dataset.generated && document.getElementById(`qr-${t.id}`)?.classList.contains('open')) {
        drawQR(canvas, t.qrCode);
        canvas.dataset.generated = 'true';
      }
    });
  }

  // ─── Email Change ────────────────────────────────────────
  function toggleEmailEdit() {
    const display = document.getElementById('profile-email-display');
    const edit    = document.getElementById('profile-email-edit');
    if (!display || !edit) return;
    const isShowing = edit.style.display !== 'none';
    edit.style.display    = isShowing ? 'none'  : 'block';
    display.style.display = isShowing ? 'flex'  : 'none';
  }

  function saveEmail() {
    const input    = document.getElementById('new-email-input');
    if (!input) return;
    const newEmail = input.value.trim().toLowerCase();
    if (!newEmail) { input.style.borderColor = 'rgba(248,113,113,.5)'; return; }
    const allowed = /\@(gmail|hotmail|outlook)\.com$/i.test(newEmail);
    if (!allowed) {
      input.style.borderColor = 'rgba(248,113,113,.5)';
      alert('Solo se permiten correos @gmail, @hotmail o @outlook.');
      return;
    }
    // Update session object in place
    const sess = Auth.session();
    sess.email = newEmail;
    render(); // Re-render profile with updated email
  }

    // ─── Public API ───────────────────────────────────────────
  function onSessionChanged() {
    _hydrateState(true);
  }

  return {
    open, render, onSessionChanged,
    toggleEmailEdit, saveEmail,
    toggleLike, isLiked,
    toggleQR, requestRefund, resolveRefund,
    saveCard, removeCard, hasCard,
    fmtCard, fmtExp, addTickets,
    getRefundRequests: () => {
      _hydrateState();
      return _loadRefundQueue().map(refund => ({ ...refund }));
    },
    getState: () => state,
  };
})();
