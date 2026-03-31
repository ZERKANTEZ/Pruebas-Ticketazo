/**
 * dashboard.js — Módulo del panel de administración.
 *
 * LÓGICA NUEVA:
 *   El shell (sidebar + main) vive en index.html como HTML estático.
 *   Este módulo SOLO llena:
 *     · #db-nav        → botones según rol
 *     · #db-user-block → nombre y acciones del usuario
 *     · #panel-*       → contenido de cada pestaña
 */

window.Zones = (() => {

  const COLORS = [
    '#FF69B4','#87CEEB','#8A2BE2','#facc15','#fb923c',
    '#34d399','#f87171','#a78bfa','#60a5fa','#e879f9',
    '#4ade80','#38bdf8','#fbbf24','#94a3b8','#f472b6',
  ];

  const FIXED_TICKET_TIERS = [
    { key:'vip',     label:'VIP',     color:COLORS[0], price:1500, capacity:200, note:'Acceso premium' },
    { key:'oro',     label:'Oro',     color:COLORS[3], price:1000, capacity:400, note:'Zona preferente' },
    { key:'general', label:'General', color:COLORS[1], price:500,  capacity:1000, note:'Acceso general' },
  ];

  const _state = {};

  /* ── Init ── */
  function init() {
    EVENTS.forEach(ev => {
      if (_state[ev.id]) return;
      _state[ev.id] = { zones: _legacyZones(ev.prices), status: 'approved', note: '' };
    });
  }

  function _legacyZones(prices) {
    const map = { plata: COLORS[1], oro: COLORS[3], vip: COLORS[0] };
    return Object.entries(prices || {}).map(([name, price], i) => ({
      id: `z${i}`, name: name.charAt(0).toUpperCase() + name.slice(1),
      price, color: map[name] || COLORS[i % COLORS.length], capacity: 500,
    }));
  }

  /* ── Getters ── */
  function getZones(id)    { return _state[id]?.zones  || []; }
  function getStatus(id)   { return _state[id]?.status || 'draft'; }
  function getMinPrice(id) { const z = getZones(id); return z.length ? Math.min(...z.map(z => z.price)) : 0; }
  function getPending()    { return EVENTS.filter(ev => _state[ev.id]?.status === 'pending'); }
  function _getRefundRequests() {
    return typeof Profile !== 'undefined' && Profile.getRefundRequests
      ? Profile.getRefundRequests()
      : [];
  }

  /* ══════════════════════════════════════════════════════════
     ABRIR DASHBOARD
     Solo actualiza nav + user block, luego navega.
     El shell HTML ya existe — no se toca.
  ══════════════════════════════════════════════════════════ */
  function openDashboard() {
    if (!Auth.isLoggedIn()) { Auth.openModal(); return; }
    const role = Auth.session().role;
    if (!['organizer','treasurer','admin'].includes(role)) {
      alert('No tienes acceso a este panel.'); return;
    }
    const tabs = _buildNav();
    _buildUser();
    closeSidebar();
    App.navigate('dashboard');
    requestAnimationFrame(() => _ensureActivePanel(tabs[0]?.key));
  }

  function _getTabs(role) {
    const pend = getPending().length;
    const refundPend = _getRefundRequests().filter(refund => refund.status === 'pending').length;
    if (role === 'admin') {
      return [
        { key:'overview',  icon:Icons.chart,                   label:'Resumen General',     badge:0    },
        { key:'events',    icon:Icons.ticket,                  label:'Todos los Eventos',   badge:0    },
        { key:'new',       icon:Icons._icon('add_circle', 18), label:'Crear Evento',        badge:0    },
        { key:'promote',   icon:Icons._icon('campaign', 18),   label:'Promocionar Evento',  badge:0    },
        { key:'review',    icon:Icons._icon('fact_check', 18), label:'Revisar Precios',     badge:pend },
        { key:'sales',     icon:Icons.chart,                   label:'Ventas por Evento',   badge:0    },
        { key:'refunds',   icon:Icons._icon('reply', 18),      label:'Reembolsos',          badge:0    },
      ];
    }

    if (role === 'treasurer') {
      return [
        { key:'review',  icon:Icons._icon('fact_check', 18), label:'Revisar Precios',        badge:pend },
        { key:'sales',   icon:Icons.chart,                   label:'Ventas por Evento',      badge:0    },
        { key:'payouts', icon:Icons.card,                    label:'Pagos a Organizadores',  badge:0    },
        { key:'refunds', icon:Icons._icon('reply', 18),      label:'Reembolsos',             badge:refundPend },
      ];
    }

    return [
      { key:'events', icon:Icons.ticket,                  label:'Mis Eventos',  badge:0 },
      { key:'new',    icon:Icons._icon('add_circle', 18), label:'Crear Evento', badge:0 }
    ];
  }

  function _buildNav() {
    const nav   = document.getElementById('db-nav');
    if (!nav) return [];
    const role  = Auth.session().role;
    const tabs = _getTabs(role);

    nav.innerHTML = tabs.map((t, i) => `
        <button class="db-nav-btn${i===0?' active':''}" id="tab-${t.key}"
          onclick="Zones.switchTab('${t.key}',this)">
          <span class="db-nav-icon">${t.icon}</span>
          <span class="db-nav-label">${t.label}</span>
          ${t.badge > 0 ? `<span class="db-nav-badge">${t.badge}</span>` : ''}
        </button>`).join('');

    // Vaciar todos los paneles (el usuario puede cambiar de rol entre sesiones)
    document.querySelectorAll('.db-panel').forEach(p => { p.classList.remove('active'); p.innerHTML = ''; });

    _activatePanel(tabs[0]?.key);
    return tabs;
  }

  function _buildUser() {
    const el = document.getElementById('db-user-block');
    if (!el) return;
    const sess     = Auth.session();
    const roleIcons= { organizer:'', treasurer:'', admin:'' };
    const roleNames= { organizer:'Organizador', treasurer:'Tesorero', admin:'Administrador' };
    el.innerHTML = `
      <div class="db-user-profile">
        <div class="db-user-avatar"><span class="material-symbols-outlined" style="font-size: 24px;">person</span></div>
        <div class="db-user-info">
          <div class="db-user-name">${sess.name}</div>
          <div class="db-user-role">${roleIcons[sess.role]||''} ${roleNames[sess.role]||sess.role}</div>
        </div>
      </div>
      <div class="db-user-actions">
        <button class="db-user-action-btn" onclick="Profile.open()"><span class="material-symbols-outlined" style="font-size: 18px;">manage_accounts</span> Mi Cuenta</button>
        <button class="db-user-action-btn" style="color: #f87171;" onclick="Auth.logout()"><span class="material-symbols-outlined" style="font-size: 18px;">logout</span> Cerrar Sesión</button>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     CAMBIO DE PESTAÑA
  ══════════════════════════════════════════════════════════ */
  function switchTab(key, btn) {
    // 1. Nav buttons
    document.querySelectorAll('.db-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    _activatePanel(key);

    if (window.innerWidth <= 900) {
      closeSidebar();
    }
  }

  function _panelTitle(key) {
    const titles = {
      events:'Todos los Eventos',
      new:'Crear Evento',
      review:'Revisión de Precios',
      sales:'Ventas por Evento',
      promote:'Promocionar Evento',
      overview:'Resumen General',
      refunds:'Reembolsos',
      payouts:'Pagos a Organizadores',
    };
    return titles[key] || 'Panel de Control';
  }

  function _activatePanel(key) {
    if (!key) return null;

    document.querySelectorAll('.db-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${key}`);
    if (!panel) return null;

    panel.classList.add('active');
    if (panel.innerHTML.trim() === '') {
      panel.innerHTML = _panelContent(key);
    }

    const titleEl = document.getElementById('db-topbar-title');
    if (titleEl) titleEl.textContent = _panelTitle(key);

    const content = document.querySelector('.db-content');
    if (content) content.scrollTo({ top: 0, behavior: 'auto' });

    return panel;
  }

  function _ensureActivePanel(fallbackKey) {
    const activePanel = document.querySelector('.db-panel.active');
    if (activePanel) {
      if (activePanel.innerHTML.trim() === '') {
        activePanel.innerHTML = _panelContent(activePanel.id.replace('panel-', ''));
      }
      return activePanel;
    }

    return _activatePanel(fallbackKey);
  }

  function _panelContent(key) {
    const map = {
      events: _renderMyEvents, new: _renderCreateForm,
      review: _renderReview,   sales: _renderSales,
      promote:_renderPromote,  overview:_renderOverview, 
      refunds:_renderRefunds, payouts:_renderPayouts,
    };
    return map[key] ? map[key]() : '';
  }

  /* ── Sidebar mobile ── */
  function openSidebar() {
    if (window.innerWidth > 900) return;
    document.getElementById('db-sidebar')?.classList.add('open');
    document.getElementById('db-overlay')?.classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('db-sidebar')?.classList.remove('open');
    document.getElementById('db-overlay')?.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════════════
     ORGANIZADOR — MIS EVENTOS
  ══════════════════════════════════════════════════════════ */
  function _renderPromote() {
    const activeEvents = EVENTS.filter(e => e.status !== 'expired');
    return `
      <div class="db-page-header">
        <div><h1>Promocionar Evento</h1><p>Elige un evento para destacarlo en el carrusel del inicio.</p></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
        ${activeEvents.map(ev => {
          const inCarousel = HERO_SLIDES.some(s => s.eventId === ev.id);
          return `
            <div style="background:#fff;border:1px solid ${inCarousel?'rgba(138,43,226,.4)':'#e2e8f0'};border-radius:14px;overflow:hidden;transition:box-shadow .2s;${inCarousel?'box-shadow:0 0 0 2px rgba(138,43,226,.2)':''}">
              <div style="position:relative;height:130px;overflow:hidden">
                <img src="${ev.image}" alt="${ev.title}" style="width:100%;height:100%;object-fit:cover"/>
                ${inCarousel ? '<div style="position:absolute;top:8px;right:8px;background:rgba(138,43,226,.9);color:#fff;font-size:.65rem;font-weight:700;padding:3px 9px;border-radius:999px">En carrusel</div>' : ''}
              </div>
              <div style="padding:12px">
                <div style="font-size:.8rem;font-weight:700;color:#0f172a;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev.title}</div>
                <div style="font-size:.7rem;color:#64748b;margin-bottom:10px">${ev.artist} · ${ev.city}</div>
                <button
                  class="db-btn ${inCarousel ? 'db-btn-secondary' : 'db-btn-primary'}"
                  style="width:100%;font-size:.75rem"
                  onclick="Zones.promoteToCarousel('${ev.id}')"
                  ${inCarousel ? 'disabled' : ''}>
                  <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">${inCarousel?'check_circle':'campaign'}</span>
                  ${inCarousel ? 'Ya en Carrusel' : 'Promocionar'}
                </button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function _renderMyEvents() {
    const isAdmin  = Auth.session().role === 'admin';
    const email    = Auth.session().email;
    const myEvents = isAdmin
      ? EVENTS
      : EVENTS.filter(e => e.organizerId === email || e.organizerId === 'eber.higuera@gmail.com');
    const approved = myEvents.filter(e => (_state[e.id]?.status||'draft') === 'approved').length;
    const pending  = myEvents.filter(e => (_state[e.id]?.status||'draft') === 'pending').length;
    return `
      <div class="db-page-header">
        <div><h1>${isAdmin ? 'Todos los Eventos' : 'Mis Eventos'}</h1><p>Gestiona los eventos y define los niveles de boletos.</p></div>
      </div>
      <div class="db-stats">
        <div class="db-stat blue"><div class="db-stat-icon">${Icons._icon('event', 24)}</div><div><div class="db-stat-label">Eventos Activos</div><div class="db-stat-value">${myEvents.length}</div></div></div>
        <div class="db-stat green"><div class="db-stat-icon">${Icons._icon('check_circle', 24)}</div><div><div class="db-stat-label">Eventos Aprobados</div><div class="db-stat-value">${approved}</div></div></div>
        <div class="db-stat purple"><div class="db-stat-icon">${Icons._icon('pending', 24)}</div><div><div class="db-stat-label">En Revisión</div><div class="db-stat-value">${pending}</div></div></div>
      </div>
      ${myEvents.length
        ? myEvents.map(ev => _eventCard(ev)).join('')
        : `<div class="db-empty"><div class="db-empty-icon"></div><div class="db-empty-text">Aún no tienes eventos creados.</div></div>`}`;
  }

  function _eventCard(ev) {
    const st     = _state[ev.id] || {};
    const status = st.status || 'draft';
    const canEdit= status === 'draft' || status === 'rejected';
    const labels = {approved:'Aprobado',pending:'⏳ En revisión',rejected:'Rechazado',draft:'Borrador'};
    const note   = st.note ? `<div class="db-rejection"><strong>Nota del tesorero:</strong> ${st.note}</div>` : '';
    return `
      <div class="db-event-card" id="evc-${ev.id}">
        <div class="db-event-card-head" onclick="Zones.toggleExpand('${ev.id}')">
          <div class="db-event-thumb"><img src="${ev.image}" alt="${ev.title}" loading="lazy"/></div>
          <div class="db-event-info">
            <div class="db-event-name">${ev.title}</div>
            <div class="db-event-meta">${ev.city} · ${_fmt(ev.date)}</div>
          </div>
          <span class="db-badge ${status}">${labels[status]}</span>
          <span class="db-expand" id="exp-${ev.id}">${Icons._icon('expand_more', 16)}</span>
        </div>
        ${status==='approved' && Auth.session().role==='admin' ? `
          <div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:0.75rem;color:#64748b;">Acciones de Administrador:</span>
            <button class="db-btn" style="background:linear-gradient(90deg,#f59e0b,#ef4444);color:#fff;font-size:0.75rem;padding:5px 12px;" onclick="event.stopPropagation();Zones.promoteToCarousel('${ev.id}')">
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">campaign</span>Promocionar en Inicio
            </button>
          </div>` : ''}
        <div class="db-zone-builder" id="zb-${ev.id}">
          ${note}
          ${canEdit ? _zoneEditor(ev.id, st.zones||[]) : _zoneReadonly(st.zones||[], status)}
        </div>
      </div>`;
  }

  function toggleExpand(id) {
    document.getElementById(`zb-${id}`)?.classList.toggle('open');
    document.getElementById(`exp-${id}`)?.classList.toggle('open');
  }

  function _zoneEditor(eventId, zones) {
    const rows = zones.map((z, i) => `
      <div class="db-zone-row" id="zrow-${eventId}-${i}">
        <div class="dz-dot" style="background:${z.color}" onclick="Zones.pickColor('${eventId}',${i},this)"></div>
        <input class="dz-input" type="text"   placeholder="Nombre"    value="${z.name}"     oninput="Zones.setField('${eventId}',${i},'name',this.value)"/>
        <input class="dz-input" type="number" placeholder="Precio"    value="${z.price}"    oninput="Zones.setField('${eventId}',${i},'price',+this.value)" min="0"/>
        <input class="dz-input" type="number" placeholder="Capacidad" value="${z.capacity}" oninput="Zones.setField('${eventId}',${i},'capacity',+this.value)" min="1"/>
        <button class="dz-del" onclick="Zones.deleteZone('${eventId}',${i})"></button>
      </div>`).join('');
    return `
      <div style="font-size:.82rem;font-weight:700;color:#374151;margin-bottom:10px"><span style="display:inline-flex;margin-right:6px;vertical-align:text-bottom">${Icons.ticket}</span> Niveles de Boletos</div>
      <div class="db-zone-rows" id="zrows-${eventId}">${rows}</div>
      <button class="db-add-zone" onclick="Zones.addZone('${eventId}')">＋ Agregar nivel</button>
      <div class="db-zone-actions">
        <button class="db-btn db-btn-secondary" onclick="Zones.toggleExpand('${eventId}')">Cancelar</button>
        <button class="db-btn db-btn-primary"   onclick="Zones.submitZones('${eventId}')">Guardar y enviar <span class="material-symbols-outlined" style="font-size: 14px; margin-left:6px; vertical-align: middle;">arrow_forward</span></button>
      </div>`;
  }

  function _zoneReadonly(zones, status) {
    const pill = {pending:'<span class="db-status-pill pending">⏳ Esperando aprobación</span>',approved:'<span class="db-status-pill approved">Precios aprobados</span>'}[status]||'';
    return `<div style="margin-bottom:10px">${pill}</div><div class="db-zone-preview">${zones.map(z=>`
      <div class="db-zone-preview-row">
        <div class="db-zone-preview-left"><div class="db-dot-sm" style="background:${z.color}"></div><span class="db-zone-preview-name">${z.name}</span><span class="db-zone-preview-cap">(${z.capacity.toLocaleString()})</span></div>
        <span class="db-zone-preview-price">$${z.price.toLocaleString()}</span>
      </div>`).join('')}</div>`;
  }

  function addZone(eventId) {
    if (!_state[eventId]) _state[eventId]={zones:[],status:'draft',note:''};
    _state[eventId].zones.push({id:`z${Date.now()}`,name:'',price:0,color:COLORS[_state[eventId].zones.length%COLORS.length],capacity:500});
    _refreshCard(eventId);
  }

  function promoteToCarousel(eventId) {
    const ev = EVENTS.find(e => e.id === eventId);
    if (!ev) return;
    // Comprobar si ya está en los slides del hero
    const already = HERO_SLIDES.some(s => s.eventId === eventId);
    if (already) {
      _toast('Este evento ya está en el carrusel del inicio', 'success');
      return;
    }
    // Agregar slide dinámico
    HERO_SLIDES.push({
      title:   ev.title,
      sub:     `${ev.artist} — ${ev.city}`,
      cta:     `Ver ${ev.title}`,
      eventId: ev.id,
      image:   ev.image,
    });
    // Reiniciar carrusel con nuevos slides
    Carousel.init();
    _toast(`"${ev.title}" ahora aparece en el carrusel`, 'success');
    // Refrescar el panel de promover para actualizar estado de botones
    const panel = document.getElementById('panel-promote');
    if (panel && panel.classList.contains('active')) {
      panel.innerHTML = _renderPromote();
    }
  }
  function deleteZone(eventId, idx) { _state[eventId]?.zones.splice(idx,1); _refreshCard(eventId); }
  function setField(eventId, idx, field, val) { if (_state[eventId]?.zones[idx]) _state[eventId].zones[idx][field]=val; }
  function submitZones(eventId) {
    const st=_state[eventId];
    if (!st) return;
    if (st.zones.some(z=>!z.name.trim()||z.price<=0||z.capacity<=0)){alert('Completa todos los niveles.');return;}
    if (!st.zones.length){alert('Agrega al menos un nivel.');return;}
    st.status='pending';st.note='';
    _refreshCard(eventId);
    _toast('Enviado al tesorero','success');
  }
  function _refreshCard(eventId) {
    const ev=EVENTS.find(e=>e.id===eventId);
    const card=document.getElementById(`evc-${eventId}`);
    if (!ev||!card) return;
    const open=document.getElementById(`zb-${eventId}`)?.classList.contains('open');
    card.outerHTML=_eventCard(ev);
    if (open){document.getElementById(`zb-${eventId}`)?.classList.add('open');document.getElementById(`exp-${eventId}`)?.classList.add('open');}
  }

  function pickColor(eventId, idx, dotEl) {
    _showColorPicker(dotEl, c=>{setField(eventId,idx,'color',c);dotEl.style.background=c;});
  }
  function pickColorNew(i, dotEl) { _showColorPicker(dotEl, c=>{dotEl.style.background=c;}); }
  function _showColorPicker(dotEl, onPick) {
    document.getElementById('_cp')?.remove();
    const pop=document.createElement('div');pop.className='dz-color-picker';pop.id='_cp';
    COLORS.forEach(c=>{
      const o=document.createElement('div');o.className='dz-color-opt';o.style.background=c;
      o.onmousedown=e=>{e.stopPropagation();onPick(c);pop.remove();};
      pop.appendChild(o);
    });
    document.body.appendChild(pop);
    const r=dotEl.getBoundingClientRect();
    pop.style.top=(r.bottom+5)+'px';
    pop.style.left=Math.min(r.left,window.innerWidth-180)+'px';
    setTimeout(()=>{document.addEventListener('click',function h(e){if(!pop.contains(e.target)){pop.remove();document.removeEventListener('click',h);}});},0);
  }

  function _fixedTierRow(tier) {
    return `
      <div class="db-tier-row" data-tier="${tier.key}">
        <div class="db-tier-badge">
          <span class="db-tier-dot" style="background:${tier.color}"></span>
          <div class="db-tier-copy">
            <div class="db-tier-name">${tier.label}</div>
            <div class="db-tier-note">${tier.note}</div>
          </div>
        </div>
        <div class="db-field db-field--compact">
          <label class="db-label">Precio</label>
          <input class="db-input" type="number" min="0" value="${tier.price}" />
        </div>
        <div class="db-field db-field--compact">
          <label class="db-label">Capacidad</label>
          <input class="db-input" type="number" min="1" value="${tier.capacity}" />
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     ORGANIZADOR — CREAR EVENTO
  ══════════════════════════════════════════════════════════ */
  function _renderCreateForm() {
    // Punto 3: verificar datos bancarios antes de permitir crear un evento
    const role = Auth.session().role;
    if ((role === 'organizer') && !Profile.hasCard()) {
      return `
        <div class="db-page-header"><div><h1>Crear Nuevo Evento</h1></div></div>
        <div class="db-card" style="text-align:center; padding: 40px 20px;">
          <div style="font-size:3rem; margin-bottom:16px;"><span class="material-symbols-outlined" style="font-size:48px; color:#ca8a04;">account_balance</span></div>
          <div style="font-weight:700; font-size:1.1rem; color:#1e293b; margin-bottom:8px;">Se requiere cuenta bancaria</div>
          <div style="font-size:0.88rem; color:#64748b; margin-bottom:20px; max-width:400px; margin-left:auto; margin-right:auto;">
            Para poder crear y publicar eventos, primero debes registrar tu cuenta bancaria (CLABE) en tu perfil. Los pagos de boletaje se depositarán ahí.
          </div>
          <button class="db-btn db-btn-primary" onclick="Profile.open()">
            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:6px">manage_accounts</span>
            Registrar Cuenta Bancaria
          </button>
        </div>`;
    }
    return `
      <div class="db-page-header"><div><h1>Crear Nuevo Evento</h1><p>Define información y niveles de boletos.</p></div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Información General</div></div>
        <div class="db-card-body"><div class="db-grid2">
          <div class="db-field"><label class="db-label">Nombre del Evento</label><input class="db-input" type="text" placeholder="Ej. Most Wanted Tour"/></div>
          <div class="db-field"><label class="db-label">Artista / Grupo</label><input class="db-input" type="text" placeholder="Nombre del artista"/></div>
          <div class="db-field"><label class="db-label">Nombre de Gira <span style="color:#9ca3af;font-weight:400">— opcional</span></label><input class="db-input" type="text" placeholder="Ej. Most Wanted Tour 2026"/></div>
          <div class="db-field"><label class="db-label">Categoría</label><select class="db-select"><option value="">Selecciona...</option>${CATEGORIES.filter(c=>c!=='Todos').map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="db-field"><label class="db-label">Fecha</label><input class="db-input" type="date"/></div>
          <div class="db-field"><label class="db-label">Hora</label><input class="db-input" type="time" value="20:00"/></div>
          <div class="db-field"><label class="db-label">Ciudad</label><input class="db-input" type="text" placeholder="Ciudad"/></div>
          <div class="db-field"><label class="db-label">Recinto</label><input class="db-input" type="text" placeholder="Ej. Foro Sol"/></div>
        </div><label class="db-checkbox" style="margin-top:6px"><input type="checkbox"/><span>Solo para adultos (+18)</span></label>
        </div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Imagen Promocional</div></div>
        <div class="db-card-body">
          <div class="db-upload" id="db-upload-area" onclick="document.getElementById('db-file-input').click()" ondragover="event.preventDefault(); this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="Zones.handleDrop(event, this)">
            <input type="file" id="db-file-input" style="display:none" accept="image/*" onchange="Zones.handleFileSelect(this, document.getElementById('db-upload-area'))"/>
            <div class="db-upload-icon">${Icons._icon('cloud_upload', 40)}</div>
            <div class="db-upload-text">Arrastra o haz clic para subir imagen</div>
            <div class="db-upload-hint">JPG, PNG, WEBP · Máx. 10 MB</div>
          </div>
        </div>
      </div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title"><span style="display:inline-flex;margin-right:6px;vertical-align:text-bottom">${Icons.ticket}</span> Niveles de Boletos</div><span style="font-size:.73rem;color:#64748b">El tesorero aprueba los precios.</span></div>
        <div class="db-card-body">
          <div class="db-zone-rows" id="new-zone-rows">${_newZoneRow(0,{name:'General',price:500,color:COLORS[1],capacity:1000})}</div>
          <button class="db-add-zone" onclick="Zones.addNewZone()">&#xff0b; Agregar nivel</button>
        </div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Descripción</div></div>
        <div class="db-card-body"><textarea class="db-textarea" rows="4" placeholder="Describe el evento..."></textarea></div></div>
      <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:4px">
        <button class="db-btn db-btn-secondary">Guardar borrador</button>
        <button class="db-btn db-btn-primary" onclick="alert('Enviado al tesorero para revisión.')">Crear y enviar <span class="material-symbols-outlined" style="font-size: 14px; margin-left:6px; vertical-align: middle;">arrow_forward</span></button>
      </div>`;
  }
  let _nzc=1;
  function _newZoneRow(i,d){d=d||{};const color=d.color||COLORS[i%COLORS.length];return`<div class="db-zone-row" id="nzr-${i}"><div class="dz-dot" style="background:${color}" onclick="Zones.pickColorNew('${i}',this)"></div><input class="db-input" type="text" placeholder="Nombre" value="${d.name||''}"/><input class="db-input" type="number" placeholder="Precio" value="${d.price||''}" min="0"/><input class="db-input" type="number" placeholder="Capacidad" value="${d.capacity||''}" min="1"/><button class="db-del" onclick="document.getElementById('nzr-${i}').remove()"></button></div>`;}
  function addNewZone(){const l=document.getElementById('new-zone-rows');if(!l)return;const d=document.createElement('div');d.innerHTML=_newZoneRow(_nzc++);l.appendChild(d.firstElementChild);}

  // Versión fija del formulario para organizadores: solo VIP, Oro y General.
  function _renderCreateForm() {
    const role = Auth.session().role;
    if ((role === 'organizer') && !Profile.hasCard()) {
      return `
        <div class="db-page-header"><div><h1>Crear Nuevo Evento</h1></div></div>
        <div class="db-card" style="text-align:center; padding: 40px 20px;">
          <div style="font-size:3rem; margin-bottom:16px;"><span class="material-symbols-outlined" style="font-size:48px; color:#ca8a04;">account_balance</span></div>
          <div style="font-weight:700; font-size:1.1rem; color:#1e293b; margin-bottom:8px;">Se requiere cuenta bancaria</div>
          <div style="font-size:0.88rem; color:#64748b; margin-bottom:20px; max-width:400px; margin-left:auto; margin-right:auto;">
            Para poder crear y publicar eventos, primero debes registrar tu cuenta bancaria (CLABE) en tu perfil. Los pagos de boletaje se depositarán ahí.
          </div>
          <button class="db-btn db-btn-primary" onclick="Profile.open()">
            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:6px">manage_accounts</span>
            Registrar Cuenta Bancaria
          </button>
        </div>`;
    }

    return `
      <div class="db-page-header"><div><h1>Crear Nuevo Evento</h1><p>Define información y niveles de boletos.</p></div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Información General</div></div>
        <div class="db-card-body"><div class="db-grid2">
          <div class="db-field"><label class="db-label">Nombre del Evento</label><input class="db-input" type="text" placeholder="Ej. Most Wanted Tour"/></div>
          <div class="db-field"><label class="db-label">Artista / Grupo</label><input class="db-input" type="text" placeholder="Nombre del artista"/></div>
          <div class="db-field"><label class="db-label">Nombre de Gira <span style="color:#9ca3af;font-weight:400">- opcional</span></label><input class="db-input" type="text" placeholder="Ej. Most Wanted Tour 2026"/></div>
          <div class="db-field"><label class="db-label">Categoría</label><select class="db-select"><option value="">Selecciona...</option>${CATEGORIES.filter(c=>c!=='Todos').map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="db-field"><label class="db-label">Fecha</label><input class="db-input" type="date"/></div>
          <div class="db-field"><label class="db-label">Hora</label><input class="db-input" type="time" value="20:00"/></div>
          <div class="db-field"><label class="db-label">Ciudad</label><input class="db-input" type="text" placeholder="Ciudad"/></div>
          <div class="db-field"><label class="db-label">Recinto</label><input class="db-input" type="text" placeholder="Ej. Foro Sol"/></div>
        </div><label class="db-checkbox" style="margin-top:6px"><input type="checkbox"/><span>Solo para adultos (+18)</span></label>
        </div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Imagen Promocional</div></div>
        <div class="db-card-body">
          <div class="db-upload" id="db-upload-area" onclick="document.getElementById('db-file-input').click()" ondragover="event.preventDefault(); this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="Zones.handleDrop(event, this)">
            <input type="file" id="db-file-input" style="display:none" accept="image/*" onchange="Zones.handleFileSelect(this, document.getElementById('db-upload-area'))"/>
            <div class="db-upload-icon">${Icons._icon('cloud_upload', 40)}</div>
            <div class="db-upload-text">Arrastra o haz clic para subir imagen</div>
            <div class="db-upload-hint">JPG, PNG, WEBP · Máx. 10 MB</div>
          </div>
        </div>
      </div>
      <div class="db-card"><div class="db-card-head db-create-ticket-head"><div class="db-card-title"><span style="display:inline-flex;margin-right:6px;vertical-align:text-bottom">${Icons.ticket}</span> Niveles de Boletos</div><span class="db-create-ticket-note">Solo se permiten VIP, Oro y General. El tesorero aprueba los precios.</span></div>
        <div class="db-card-body">
          <div class="db-tier-list" id="new-zone-rows">${FIXED_TICKET_TIERS.map(_fixedTierRow).join('')}</div>
        </div></div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Descripción</div></div>
        <div class="db-card-body"><textarea class="db-textarea" rows="4" placeholder="Describe el evento..."></textarea></div></div>
      <div class="db-create-actions">
        <button class="db-btn db-btn-secondary">Guardar borrador</button>
        <button class="db-btn db-btn-primary" onclick="alert('Enviado al tesorero para revisión.')">Crear y enviar <span class="material-symbols-outlined" style="font-size: 14px; margin-left:6px; vertical-align: middle;">arrow_forward</span></button>
      </div>`;
  }

  function handleDrop(e, el) {
    e.preventDefault(); el.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) _previewImage(e.dataTransfer.files[0], el);
  }
  function handleFileSelect(input, el) {
    if (input.files && input.files[0]) _previewImage(input.files[0], el);
  }
  function _previewImage(file, el) {
    if (!file.type.startsWith('image/')) { _toast('Sube una imagen válida', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      el.innerHTML = `<img src="${e.target.result}" style="max-height:200px; border-radius:8px; object-fit:contain; border:1px solid #e2e8f0;"/>
        <div style="margin-top:10px; font-size:0.85rem; color:#ef4444; font-weight:600; cursor:pointer;" onclick="event.stopPropagation(); this.parentElement.innerHTML = \`<input type='file' id='db-file-input' style='display:none' accept='image/*' onchange='Zones.handleFileSelect(this, document.getElementById(\\\"db-upload-area\\\"))'/><div class='db-upload-icon'>${Icons._icon('cloud_upload', 40)}</div><div class='db-upload-text'>Arrastra o haz clic para subir imagen</div><div class='db-upload-hint'>JPG, PNG, WEBP · Máx. 10 MB</div>\`">Eliminar imagen</div>`;
    };
    reader.readAsDataURL(file);
  }

  /* ══════════════════════════════════════════════════════════
     TESORERO — REVISAR PRECIOS
  ══════════════════════════════════════════════════════════ */
  function _renderReview() {
    const pending=getPending();
    return `
      <div class="db-page-header"><div><h1>Revisión de Precios</h1><p>Ajusta y aprueba los precios propuestos.</p></div>${pending.length?`<span style="background:#fefce8;color:#ca8a04;font-size:.72rem;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid #fde68a">${pending.length} pendiente${pending.length>1?'s':''}</span>`:''}</div>
      ${!pending.length?`<div class="db-empty"><div class="db-empty-icon"></div><div class="db-empty-text">No hay precios pendientes.</div></div>`:pending.map(ev=>{
        const zones=_state[ev.id]?.zones||[];
        return`<div class="db-review-card" id="rev-${ev.id}">
          <div class="db-review-head">
            <div class="db-review-thumb"><img src="${ev.image}" alt="${ev.title}" loading="lazy"/></div>
            <div><div class="db-review-title">${ev.title}</div><div class="db-review-meta">${ev.city} · ${_fmt(ev.date)}</div><div class="db-review-org">Organizado por: ${ev.organizerId||'eber.higuera@gmail.com'}</div></div>
          </div>
          <div class="db-review-zones"><div class="db-review-zones-label">Precios propuestos — puedes ajustarlos antes de aprobar</div>
            ${zones.map((z,i)=>`<div class="db-review-zone-row">
              <div class="db-review-zone-left"><div class="db-dot-sm" style="background:${z.color}"></div><span class="db-review-zone-name">${z.name}</span><span class="db-review-zone-cap">(${z.capacity.toLocaleString()})</span></div>
              <div class="db-review-price-wrap"><span class="db-review-price">$${z.price.toLocaleString()}</span><div><div class="db-override-label">Ajustar:</div><input class="db-override-input" type="number" min="0" placeholder="${z.price}" oninput="Zones.overridePrice('${ev.id}',${i},+this.value)"/></div></div>
            </div>`).join('')}
          </div>
          <div class="db-reject-note-row"><label class="db-reject-note-label">Nota de rechazo (opcional)</label><input class="db-reject-note-input" id="rnote-${ev.id}" type="text" placeholder="Motivo..."/></div>
          <div class="db-review-actions"><button class="db-btn db-btn-danger" onclick="Zones.rejectEvent('${ev.id}')">Rechazar</button><button class="db-btn db-btn-success" onclick="Zones.approveEvent('${ev.id}')">Aprobar zonas</button></div>
        </div>`;}).join('')}`;
  }
  function overridePrice(eventId,idx,val){if(_state[eventId]?.zones[idx]&&val>0)_state[eventId].zones[idx].price=val;}
  function approveEvent(eventId){if(!_state[eventId])return;_state[eventId].status='approved';_state[eventId].note='';document.getElementById(`rev-${eventId}`)?.remove();_toast('Precios aprobados','success');}
  function rejectEvent(eventId){const note=document.getElementById(`rnote-${eventId}`)?.value.trim()||'Sin motivo';if(!_state[eventId])return;_state[eventId].status='rejected';_state[eventId].note=note;document.getElementById(`rev-${eventId}`)?.remove();_toast('Rechazado','error');}

  /* ══════════════════════════════════════════════════════════
     TESORERO — VENTAS (columnas dinámicas)
  ══════════════════════════════════════════════════════════ */
  function _renderSales() {
    const data=EVENTS.filter(ev=>ev.status!=='expired'&&getZones(ev.id).length>0).map(ev=>{
      const zones=getZones(ev.id);
      const sold=zones.map(z=>({...z,sold:Math.floor(z.capacity*(0.35+Math.random()*0.45))}));
      const rev=sold.reduce((a,z)=>a+z.sold*z.price,0);
      const tot=sold.reduce((a,z)=>a+z.sold,0);
      return{ev,sold,rev,tot};
    });
    if(!data.length)return`<div class="db-page-header"><div><h1>Ventas por Evento</h1></div></div><div class="db-empty"><div class="db-empty-icon"></div><div class="db-empty-text">Sin datos aún.</div></div>`;
    const tRev=data.reduce((a,e)=>a+e.rev,0),tSold=data.reduce((a,e)=>a+e.tot,0),maxRev=Math.max(...data.map(e=>e.rev));
    return`
      <div class="db-page-header"><div><h1>Ventas por Evento</h1><p>Columnas según niveles reales de cada evento.</p></div></div>
      <div class="db-stats">
        <div class="db-stat blue"><div class="db-stat-icon">${Icons._icon('payments', 24)}</div><div><div class="db-stat-label">Ingresos</div><div class="db-stat-value">$${(tRev/1000).toFixed(0)}k</div></div></div>
        <div class="db-stat pink"><div class="db-stat-icon">${Icons.ticket}</div><div><div class="db-stat-label">Boletos</div><div class="db-stat-value">${tSold.toLocaleString()}</div></div></div>
        <div class="db-stat purple"><div class="db-stat-icon">${Icons._icon('event', 24)}</div><div><div class="db-stat-label">Eventos</div><div class="db-stat-value">${data.length}</div></div></div>
      </div>
      <div class="db-card" style="margin-bottom:20px"><div class="db-card-head"><div class="db-card-title">Ingresos por Evento</div></div><div class="db-card-body"><div class="sc-chart">
        ${data.map(e=>{const pct=maxRev>0?Math.round((e.rev/maxRev)*100):0;return`<div class="sc-row"><div><div class="sc-name">${e.ev.title}</div><div class="sc-org">‍${e.ev.organizerId||'eber.higuera@gmail.com'}</div></div><div class="sc-bar-wrap"><div class="sc-bar" style="width:${Math.max(pct,8)}%"><span class="sc-bar-label">$${(e.rev/1000).toFixed(0)}k</span></div></div><div class="sc-count">${e.tot.toLocaleString()}</div></div>`;}).join('')}
      </div></div></div>
      ${data.map(e=>{
        const cap=e.sold.reduce((a,z)=>a+z.capacity,0),fill=cap>0?Math.round((e.tot/cap)*100):0;
        return`<div class="db-card" style="margin-bottom:14px">
          <div class="db-card-head" style="flex-wrap:wrap;gap:8px"><div><div class="db-card-title">${e.ev.title}</div><div style="font-size:.7rem;color:#64748b;margin-top:1px">‍${e.ev.organizerId||'eber.higuera@gmail.com'}</div></div><div style="font-size:.74rem;display:flex;gap:10px"><span style="color:#64748b">${e.tot.toLocaleString()} boletos · ${fill}% ocup.</span><span style="color:#8A2BE2;font-weight:700">$${(e.rev/1000).toFixed(0)}k</span></div></div>
          <div class="db-table-wrap"><table class="db-table">
            <thead><tr>${e.sold.map(z=>`<th><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${z.color};margin-right:4px"></span>${z.name}</th>`).join('')}<th>Total</th><th>Ingresos</th></tr></thead>
            <tbody><tr>${e.sold.map(z=>`<td><div style="font-weight:600;font-size:.79rem">${z.sold.toLocaleString()}</div><div style="font-size:.65rem;color:#94a3b8">de ${z.capacity.toLocaleString()}</div><div style="font-size:.65rem;color:#8A2BE2">$${(z.sold*z.price/1000).toFixed(0)}k</div></td>`).join('')}<td style="font-weight:700">${e.tot.toLocaleString()}</td><td style="font-weight:700;color:#8A2BE2">$${(e.rev/1000).toFixed(0)}k</td></tr></tbody>
          </table></div></div>`;
      }).join('')}`;
  }

  /* ══════════════════════════════════════════════════════════
     TESORERO — PAGOS
  ══════════════════════════════════════════════════════════ */
  function _renderPayoutsLegacy() {
    const orgs=[
      {email:'eber.higuera@gmail.com',name:'Eber Higuera',events:['Bad Bunny CDMX','Synthwave','Neon Nights'],gross:5334000,paid:false, bank: 'BBVA — CLABE: 012 180 01534007821 9'},
      {email:'other.organizer@gmail.com',name:'Compañía Teatral Elite',events:['El Fantasma de la Ópera'],gross:1130000,paid:true, bank: 'Santander — CLABE: 014 180 00000000930 2'}
    ];
    return`<div class="db-page-header"><div><h1>Pagos a Organizadores</h1><p>Consulta la información bancaria y distribuye ingresos.</p></div></div>
      ${orgs.map(org=>{const fee=Math.round(org.gross*.05),payout=org.gross-fee;return`<div class="db-card" style="margin-bottom:14px">
        <div class="db-card-head" style="gap:12px; align-items:flex-start;">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <div class="db-avatar" style="width:40px;height:40px;background:#f1f5f9;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#64748b;flex-shrink:0;">
              ${Icons._icon('person',24)}
            </div>
            <div>
              <div class="db-card-title">${org.name}</div>
              <div style="font-size:.75rem;color:#64748b;margin-top:2px;">${org.email}</div>
              <div style="font-size:.75rem;color:#1e293b;margin-top:4px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:#8B5CF6;margin-right:4px;">account_balance</span>${org.bank}</div>
            </div>
          </div>
        </div>
        <div class="db-card-body">
          <div class="db-stats" style="margin-bottom:14px; grid-template-columns: repeat(3, 1fr);">
            <div class="db-stat blue"><div class="db-stat-icon" style="font-size:.85rem">${Icons._icon('account_balance', 22)}</div><div><div class="db-stat-label">Ingresos Brutos</div><div class="db-stat-value" style="font-size:1.1rem">$${org.gross.toLocaleString()}</div></div></div>
            <div class="db-stat pink"><div class="db-stat-icon" style="font-size:.85rem">%</div><div><div class="db-stat-label">Comisión 5%</div><div class="db-stat-value" style="font-size:1.1rem;color:#dc2626">−$${fee.toLocaleString()}</div></div></div>
            <div class="db-stat green"><div class="db-stat-icon" style="font-size:.85rem">${Icons._icon('wallet', 22)}</div><div><div class="db-stat-label">A Transferir</div><div class="db-stat-value" style="font-size:1.1rem;color:#16a34a">$${payout.toLocaleString()}</div></div></div>
          </div>
          <div style="font-size:0.75rem; color:#64748b; margin-bottom:6px;">Eventos generadores de saldo:</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px">${org.events.map(e=>`<span style="font-size:.72rem;padding:3px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:999px;color:#374151;display:inline-flex;align-items:center;gap:4px"><span>${Icons.ticket}</span> ${e}</span>`).join('')}</div>
        </div></div>`;}).join('')}`;
  }

  /* ══════════════════════════════════════════════════════════
     TESORERO — REEMBOLSOS
  ══════════════════════════════════════════════════════════ */
  function copyBankNumber(value) {
    const text = (value || '').trim();
    if (!text) return;

    const fallbackCopy = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      area.style.pointerEvents = 'none';
      document.body.appendChild(area);
      area.select();

      try {
        document.execCommand('copy');
        _toast('CLABE copiada', 'success');
      } catch (_err) {
        _toast('No se pudo copiar la CLABE', 'error');
      } finally {
        area.remove();
      }
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => _toast('CLABE copiada', 'success'))
        .catch(() => fallbackCopy());
      return;
    }

    fallbackCopy();
  }

  function _renderPayouts() {
    const orgs = [
      {
        email: 'eber.higuera@gmail.com',
        name: 'Eber Higuera',
        events: ['Bad Bunny CDMX', 'Synthwave', 'Neon Nights'],
        gross: 5334000,
        paid: false,
        bankName: 'BBVA',
        clabe: '012 180 01534007821 9'
      },
      {
        email: 'other.organizer@gmail.com',
        name: 'Compañía Teatral Elite',
        events: ['El Fantasma de la Ópera'],
        gross: 1130000,
        paid: true,
        bankName: 'Santander',
        clabe: '014 180 00000000930 2'
      }
    ];

    return `<div class="db-page-header">
        <div>
          <h1>Pagos a Organizadores</h1>
          <p>Consulta la información bancaria y distribuye ingresos.</p>
        </div>
      </div>
      ${orgs.map(org => {
        const fee = Math.round(org.gross * 0.05);
        const payout = org.gross - fee;
        return `<div class="db-card db-payout-card">
          <div class="db-card-head db-payout-head">
            <div class="db-payout-profile">
              <div class="db-payout-avatar">${Icons._icon('person', 24)}</div>
              <div class="db-payout-meta">
                <div class="db-card-title">${org.name}</div>
                <div class="db-payout-email">${org.email}</div>
              </div>
            </div>
          </div>
          <div class="db-card-body">
            <div class="db-payout-bank">
              <div class="db-payout-bank-copy">
                <div class="db-payout-bank-label">Cuenta bancaria registrada</div>
                <div class="db-payout-bank-name">
                  <span class="material-symbols-outlined" style="font-size:14px;color:#8B5CF6">account_balance</span>
                  ${org.bankName}
                </div>
                <div class="db-payout-clabe">${org.clabe}</div>
              </div>
              <button class="db-btn db-btn-secondary db-payout-copy" onclick="Zones.copyBankNumber('${org.clabe}')">
                <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                Copiar CLABE
              </button>
            </div>

            <div class="db-payout-stats">
              <div class="db-stat blue">
                <div class="db-stat-icon">${Icons._icon('account_balance', 22)}</div>
                <div>
                  <div class="db-stat-label">Ingresos Brutos</div>
                  <div class="db-stat-value">$${org.gross.toLocaleString()}</div>
                </div>
              </div>
              <div class="db-stat pink">
                <div class="db-stat-icon">%</div>
                <div>
                  <div class="db-stat-label">Comisión 5%</div>
                  <div class="db-stat-value db-payout-minus">-$${fee.toLocaleString()}</div>
                </div>
              </div>
              <div class="db-stat green">
                <div class="db-stat-icon">${Icons._icon('wallet', 22)}</div>
                <div>
                  <div class="db-stat-label">A Transferir</div>
                  <div class="db-stat-value db-payout-plus">$${payout.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div class="db-payout-events-label">Eventos generadores de saldo:</div>
            <div class="db-payout-events">
              ${org.events.map(e => `<span class="db-payout-event"><span>${Icons.ticket}</span>${e}</span>`).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}`;
  }

  function _renderRefundsLegacy() {
    const list=[{id:'R-1001',user:'juan.perez@gmail.com',event:'Bad Bunny CDMX',amount:1500,status:'pending'},{id:'R-1002',user:'maria.gomez@outlook.com',event:'Synthwave',amount:2000,status:'approved'},{id:'R-1003',user:'luis.rdz@hotmail.com',event:'Neon Nights',amount:800,status:'pending'}];
    return`<div class="db-page-header"><div><h1>Reembolsos</h1></div><button class="db-btn db-btn-primary" style="font-size:.78rem" onclick="alert('Pagos distribuidos')">Distribuir Pagos</button></div>
      <div class="db-card"><div class="db-table-wrap"><table class="db-table"><thead><tr><th>ID</th><th>Usuario</th><th>Evento</th><th>Monto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
        ${list.map(r=>`<tr><td><code style="font-size:.75rem;color:#8A2BE2">${r.id}</code></td><td style="font-size:.78rem">${r.user}</td><td style="font-size:.78rem">${r.event}</td><td style="font-weight:700">$${r.amount.toLocaleString()}</td><td><span class="db-badge ${r.status==='approved'?'approved':'pending'}">${r.status==='approved'?'Aprobado':'⏳ Pendiente'}</span></td><td>${r.status==='pending'?`<button class="db-btn db-btn-success" style="font-size:.71rem;padding:5px 10px" onclick="alert('${r.id} aprobado')">Aprobar</button>`:'—'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ══════════════════════════════════════════════════════════
     ADMIN — RESUMEN
  ══════════════════════════════════════════════════════════ */
  function _syncRefundBadge() {
    const btn = document.getElementById('tab-refunds');
    if (!btn) return;

    const pendingCount = _getRefundRequests().filter(refund => refund.status === 'pending').length;
    let badge = btn.querySelector('.db-nav-badge');

    if (pendingCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'db-nav-badge';
        btn.appendChild(badge);
      }
      badge.textContent = pendingCount;
      return;
    }

    badge?.remove();
  }

  function approveRefundRequest(refundId) {
    if (typeof Profile === 'undefined' || !Profile.resolveRefund) return;
    Profile.resolveRefund(refundId, 'approved');

    const panel = document.getElementById('panel-refunds');
    if (panel) panel.innerHTML = _renderRefunds();
    _syncRefundBadge();
    _toast('Reembolso aprobado', 'success');
  }

  function rejectRefundRequest(refundId) {
    if (typeof Profile === 'undefined' || !Profile.resolveRefund) return;
    Profile.resolveRefund(refundId, 'rejected');

    const panel = document.getElementById('panel-refunds');
    if (panel) panel.innerHTML = _renderRefunds();
    _syncRefundBadge();
    _toast('Solicitud rechazada', 'error');
  }

  function _renderRefunds() {
    const list = _getRefundRequests();
    const pending = list.filter(refund => refund.status === 'pending').length;
    const approved = list.filter(refund => refund.status === 'approved').length;
    const rejected = list.filter(refund => refund.status === 'rejected').length;

    if (!list.length) {
      return `<div class="db-page-header"><div><h1>Reembolsos</h1><p>Aquí aparecerán las solicitudes que envíen los clientes.</p></div></div>
        <div class="db-empty"><div class="db-empty-icon"></div><div class="db-empty-text">Aún no hay solicitudes de reembolso.</div></div>`;
    }

    return `<div class="db-page-header">
        <div>
          <h1>Reembolsos</h1>
          <p>Solicitudes enviadas por clientes para revisión del tesorero.</p>
        </div>
        <span class="db-badge pending">${pending} pendiente${pending === 1 ? '' : 's'}</span>
      </div>
      <div class="db-stats">
        <div class="db-stat pink"><div class="db-stat-icon">${Icons._icon('reply', 22)}</div><div><div class="db-stat-label">Pendientes</div><div class="db-stat-value">${pending}</div></div></div>
        <div class="db-stat green"><div class="db-stat-icon">${Icons._icon('check_circle', 22)}</div><div><div class="db-stat-label">Aprobados</div><div class="db-stat-value">${approved}</div></div></div>
        <div class="db-stat purple"><div class="db-stat-icon">${Icons._icon('cancel', 22)}</div><div><div class="db-stat-label">Rechazados</div><div class="db-stat-value">${rejected}</div></div></div>
      </div>
      <div class="db-card">
        <div class="db-table-wrap">
          <table class="db-table">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Cliente</th>
                <th>Evento</th>
                <th>Monto</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(refund => `
                <tr>
                  <td>
                    <code style="font-size:.75rem;color:#8A2BE2">${refund.id}</code>
                    <div style="font-size:.7rem;color:#94a3b8;margin-top:4px">${new Date(refund.requestedAt).toLocaleDateString('es-ES')}</div>
                  </td>
                  <td>
                    <div style="font-weight:700;color:#0f172a;font-size:.8rem">${refund.userName}</div>
                    <div style="font-size:.72rem;color:#64748b;margin-top:3px">${refund.userEmail}</div>
                  </td>
                  <td>
                    <div style="font-weight:700;color:#0f172a;font-size:.8rem">${refund.eventTitle}</div>
                    <div style="font-size:.72rem;color:#64748b;margin-top:3px">Zona: ${String(refund.zone || '').toUpperCase()}</div>
                  </td>
                  <td style="font-weight:700">$${Number(refund.amount || 0).toLocaleString()}</td>
                  <td style="min-width:220px">
                    <div style="font-size:.78rem;line-height:1.45;color:#334155">${refund.reason}</div>
                  </td>
                  <td><span class="db-badge ${refund.status === 'approved' ? 'approved' : refund.status === 'rejected' ? 'rejected' : 'pending'}">${refund.status === 'approved' ? 'Aprobado' : refund.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</span></td>
                  <td>
                    ${refund.status === 'pending'
                      ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                           <button class="db-btn db-btn-success" style="font-size:.72rem;padding:6px 10px" onclick="Zones.approveRefundRequest('${refund.id}')">Aprobar</button>
                           <button class="db-btn db-btn-danger" style="font-size:.72rem;padding:6px 10px" onclick="Zones.rejectRefundRequest('${refund.id}')">Rechazar</button>
                         </div>`
                      : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function _renderOverview() {
    const p=getPending();
    return`<div class="db-page-header"><div><h1>Centro de Control</h1><p>Supervisión global.</p></div><div style="background:rgba(138,43,226,.08);color:#8A2BE2;padding:6px 14px;border-radius:9px;font-size:.78rem;font-weight:700;border:1px solid rgba(138,43,226,.15)">Operativa</div></div>
      <div class="db-stats">
        <div class="db-stat blue"><div class="db-stat-icon">${Icons._icon('group', 24)}</div><div><div class="db-stat-label">Usuarios</div><div class="db-stat-value">45,231</div></div></div>
        <div class="db-stat pink"><div class="db-stat-icon">${Icons._icon('notifications', 24)}</div><div><div class="db-stat-label">Alertas</div><div class="db-stat-value">2</div></div></div>
        <div class="db-stat purple"><div class="db-stat-icon">${Icons._icon('pending_actions', 24)}</div><div><div class="db-stat-label">Eventos Pendientes</div><div class="db-stat-value">${p.length}</div></div></div>
      </div>
      <div class="db-card"><div class="db-card-head"><div class="db-card-title">Solicitudes Pendientes</div></div><div class="db-card-body">
        ${p.length?p.map(ev=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:11px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;margin-bottom:7px;flex-wrap:wrap;gap:7px"><div style="display:flex;align-items:center;gap:9px"><img src="${ev.image}" style="width:36px;height:36px;border-radius:7px;object-fit:cover"/><div><div style="font-size:.82rem;font-weight:600;color:#0f172a">${ev.title}</div><div style="font-size:.7rem;color:#64748b">${ev.organizerId||'eber.higuera@gmail.com'}</div></div></div><button class="db-btn db-btn-primary" style="font-size:.73rem;padding:6px 12px" onclick="Zones.switchTab('review',document.getElementById('tab-review'))">Revisar →</button></div>`).join(''):`<div class="db-empty"><div class="db-empty-icon"></div><div class="db-empty-text">Sin solicitudes</div></div>`}
      </div></div>`;
  }

  /* ── Utilidades ── */
  function _fmt(d){return new Date(d).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});}
  function _toast(msg,type){
    let t=document.getElementById('_tz');
    if(!t){t=document.createElement('div');t.id='_tz';t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(40px);padding:8px 20px;border-radius:999px;font-size:.8rem;font-weight:600;z-index:9999;transition:all .25s;opacity:0;white-space:nowrap;pointer-events:none';document.body.appendChild(t);}
    t.textContent=msg;t.style.background=type==='success'?'rgba(134,239,172,.15)':'rgba(248,113,113,.15)';t.style.border=`1px solid ${type==='success'?'rgba(134,239,172,.3)':'rgba(248,113,113,.3)'}`;t.style.color=type==='success'?'#86efac':'#f87171';
    requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';});
    setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(40px)';},3000);
  }

  return {
    init, openDashboard,
    getZones, getStatus, getMinPrice, getPending,
    openSidebar, closeSidebar, switchTab,
    toggleExpand, addZone, deleteZone, setField, submitZones,
    pickColor, pickColorNew, addNewZone,
    overridePrice, approveEvent, rejectEvent,
    handleDrop, handleFileSelect, promoteToCarousel, copyBankNumber,
    approveRefundRequest, rejectRefundRequest
  };
})();
