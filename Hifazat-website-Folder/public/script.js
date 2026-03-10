(function () {
  const form = document.getElementById('inquiryForm');
  const statusBox = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const menuToggle = document.getElementById('menuToggle');
  const siteNav = document.getElementById('siteNav');

  const adminPanel = document.getElementById('adminPanel');
  const adminToggle = document.getElementById('adminToggle');
  const closeAdmin = document.getElementById('closeAdmin');
  const refreshDashboardBtn = document.getElementById('refreshDashboard');
  const resendBtn = document.getElementById('resendFailedLeadsBtn');
  const latestWhatsappBtn = document.getElementById('latestWhatsappBtn');
  const resendStatus = document.getElementById('resendStatus');

  const statTotal = document.getElementById('statTotal');
  const statSynced = document.getElementById('statSynced');
  const statPending = document.getElementById('statPending');
  const statRetries = document.getElementById('statRetries');
  const adminMeta = document.getElementById('adminMeta');
  const latestLeadsList = document.getElementById('latestLeadsList');

  function normalizeWhatsappPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('92')) return digits;
    if (digits.startsWith('0')) return `92${digits.slice(1)}`;
    return digits;
  }

  function buildWhatsappLink(phone, message) {
    const normalized = normalizeWhatsappPhone(phone);
    if (!normalized) return '#';
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message || '')}`;
  }

  function buildBusinessWhatsappMessage(serviceText) {
    const service = serviceText || 'fire safety support';
    return `Assalam o Alaikum. I want to discuss ${service} for my building.`;
  }

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'status show ' + (ok ? 'ok' : 'bad');
  }

  function clearStatus(el) {
    if (!el) return;
    el.textContent = '';
    el.className = 'status';
  }

  async function submitInquiry(event) {
    event.preventDefault();
    clearStatus(statusBox);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      buildingType: document.getElementById('buildingType').value,
      serviceNeed: document.getElementById('serviceNeed').value,
      address: document.getElementById('address').value.trim(),
      message: document.getElementById('message').value.trim()
    };

    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Submission failed.');
      }

      form.reset();

      if (result.queuedForAutoRetry) {
        setStatus(statusBox, 'Inquiry saved. Google Sheet sync will retry automatically in the background.', true);
      } else {
        setStatus(statusBox, 'Inquiry submitted successfully.', true);
      }

      if (isAdminMode()) {
  setTimeout(refreshAdminDashboard, 300);
}
    } catch (err) {
      setStatus(statusBox, err.message || 'Could not submit inquiry.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Inquiry';
    }
  }

  function isAdminMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "HIFAZAT2026";
}

  function setupAdminVisibility() {
    const admin = isAdminMode();
    adminPanel.hidden = !admin;
    adminToggle.hidden = admin;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function syncStatusText(item) {
    const status = item?.googleSheetsSync?.status || 'pending';
    if (status === 'success' || status === 'synced') return 'Synced';
    if (status === 'failed') return 'Pending Retry';
    return 'Pending';
  }

  function syncStatusClass(item) {
    const status = item?.googleSheetsSync?.status || 'pending';
    if (status === 'success' || status === 'synced') return 'ok';
    if (status === 'failed') return 'bad';
    return '';
  }

  function normalizeBuildingType(value) {
    const raw = String(value || '').trim().toLowerCase();
    const map = {
      'office': 'Office',
      'commercial': 'Commercial Plaza',
      'commercial plaza': 'Commercial Plaza',
      'restaurant': 'Restaurant / Cafe',
      'restaurant / cafe': 'Restaurant / Cafe',
      'cafe': 'Restaurant / Cafe',
      'school': 'School / Academy',
      'school / academy': 'School / Academy',
      'academy': 'School / Academy',
      'residential': 'Residential',
      'residential building': 'Residential',
      'factory': 'Factory / Industry',
      'factory / industry': 'Factory / Industry',
      'industry': 'Factory / Industry',
      'hospital': 'Hospital',
      'warehouse': 'Warehouse',
      'other': 'Other'
    };
    return map[raw] || String(value || '').trim();
  }

  function renderLatestLeads(inquiries) {
  if (!latestLeadsList) return;

  const searchInput = document.getElementById("leadSearch");
  const buildingFilter = document.getElementById("buildingFilter");

  let filtered = [...(inquiries || [])];

  // SEARCH BY NAME OR PHONE
  if (searchInput && searchInput.value.trim() !== "") {
    const term = searchInput.value.trim().toLowerCase();

    filtered = filtered.filter(item =>
      (item.fullName || "").toLowerCase().includes(term) ||
      (item.phone || "").includes(term)
    );
  }

  // FILTER BY BUILDING TYPE
  if (buildingFilter && buildingFilter.value !== '') {
    const building = normalizeBuildingType(buildingFilter.value);

    filtered = filtered.filter(item =>
      normalizeBuildingType(item.buildingType) === building
    );
  }

  const latestThirty = filtered
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 30);

  if (latestThirty.length === 0) {
    latestLeadsList.innerHTML =
      '<div class="lead-row"><div class="lead-main"><strong>No matching leads</strong><div class="lead-meta">Try different search or filter.</div></div></div>';
    return;
  }

  latestLeadsList.innerHTML = latestThirty.map((item) => {
    const service = item.serviceNeed || 'fire safety support';
    const name = item.fullName || 'Unnamed lead';
    const phone = item.phone || '';
    const buildingType = normalizeBuildingType(item.buildingType) || '—';

    const link = buildWhatsappLink(
      phone,
      `Assalam o Alaikum ${name}. Thank you for contacting HIFAZAT Fire Safety Solutions regarding ${service}. Our team will contact you shortly.`
    );

    const statusText = syncStatusText(item);
    const statusClass = syncStatusClass(item);

    return `
      <div class="lead-row">
        <div class="lead-main">
          <strong>${name}</strong>
          <div class="lead-meta">${buildingType} • ${service} • ${phone || 'No phone'} • ${formatDateTime(item.createdAt)}</div>
          <div class="lead-status ${statusClass}">${statusText}</div>
        </div>
        <div class="lead-actions">
          <a class="lead-action" href="${link}" target="_blank">WhatsApp</a>
        </div>
      </div>
    `;
  }).join("");
}

  async function refreshAdminDashboard() {
    try {
      const [dashboardRes, inquiriesRes] = await Promise.all([
        fetch('/api/admin-dashboard'),
        fetch('/api/inquiries')
      ]);

      const dashboardJson = await dashboardRes.json();
      const inquiriesJson = await inquiriesRes.json();

      const dashboard = dashboardJson.dashboard || {};
      const inquiries = Array.isArray(inquiriesJson) ? inquiriesJson : [];

      statTotal.textContent = dashboard.totalInquiries ?? 0;
      statSynced.textContent = dashboard.synced ?? 0;
      statPending.textContent = dashboard.pendingRetry ?? 0;
      statRetries.textContent = dashboard.totalAutoRetryAttempts ?? 0;

      adminMeta.innerHTML = `
        Latest lead: <strong>${dashboard.latestInquiryName || '—'}</strong><br>
        Latest lead time: <strong>${formatDateTime(dashboard.latestInquiryAt)}</strong><br>
        Last retry run: <strong>${formatDateTime(dashboard.lastRetryRunAt)}</strong><br>
        Auto worker busy: <strong>${dashboard.autoRetryWorkerRunning ? 'Yes' : 'No'}</strong>
      `;

      if (dashboard.latestInquiryWhatsappLink) {
        latestWhatsappBtn.href = dashboard.latestInquiryWhatsappLink;
        latestWhatsappBtn.style.display = 'inline-flex';
      } else {
        latestWhatsappBtn.href = '#';
        latestWhatsappBtn.style.display = 'none';
      }

      renderLatestLeads(inquiries);
    } catch (err) {
      adminMeta.textContent = 'Could not load dashboard data.';
    }
  }

  async function resendFailedLeads() {
    try {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Resending...';
      clearStatus(resendStatus);

      const response = await fetch('/api/resend-failed-leads', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to resend leads.');
      }

      setStatus(resendStatus, result.message || 'Failed lead resend completed.', true);
      await refreshAdminDashboard();
    } catch (err) {
      setStatus(resendStatus, err.message || 'Could not resend failed leads.', false);
    } finally {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Failed';
    }
  }

  function initWhatsappLinks() {
    document.querySelectorAll('.whatsapp-link').forEach((link) => {
      const phone = link.dataset.phone || '03091666636';
      const message = link.dataset.message || buildBusinessWhatsappMessage('fire safety support');
      link.href = buildWhatsappLink(phone, message);
      link.target = '_blank';
      link.rel = 'noopener';
    });
  }

  function initMenu() {
    if (!menuToggle || !siteNav) return;

    menuToggle.addEventListener('click', () => {
      const isOpen = siteNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    siteNav.querySelectorAll('a').forEach((anchor) => {
      anchor.addEventListener('click', () => {
        siteNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /* Smooth scroll-reveal for sections */
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;

    const sections = document.querySelectorAll('.section, .trust-strip');
    sections.forEach(s => {
      s.style.opacity = '0';
      s.style.transform = 'translateY(24px)';
      s.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    sections.forEach(s => observer.observe(s));
  }

  /* Header shadow on scroll */
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)';
      } else {
        header.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  function initAdmin() {
    setupAdminVisibility();

    if (isAdminMode()) {
      refreshAdminDashboard();
    }

    adminToggle?.addEventListener('click', () => {
  window.location.href = `${window.location.pathname}?admin=HIFAZAT2026`;
});

    closeAdmin?.addEventListener('click', () => {
      window.location.href = window.location.pathname;
    });

    refreshDashboardBtn?.addEventListener('click', refreshAdminDashboard);
    resendBtn?.addEventListener('click', resendFailedLeads);
  }

  form?.addEventListener('submit', submitInquiry);
  initWhatsappLinks();
  initMenu();
  initAdmin();
  initScrollReveal();
  initHeaderScroll();
document.getElementById("leadSearch")?.addEventListener("input", refreshAdminDashboard);
document.getElementById("buildingFilter")?.addEventListener("change", refreshAdminDashboard);
})();
