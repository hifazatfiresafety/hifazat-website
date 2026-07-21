(function () {
  const form = document.getElementById('inquiryForm');
  const statusBox = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const menuToggle = document.getElementById('menuToggle');
  const siteNav = document.getElementById('siteNav');

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

  function markFieldState(field, hasError) {
    if (!field) return;
    field.classList.toggle('field-error', !!hasError);
    field.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  }

  function clearFieldErrors() {
    form?.querySelectorAll('.field-error').forEach((field) => {
      field.classList.remove('field-error');
      field.removeAttribute('aria-invalid');
    });
  }

  function validateInquiryForm(payload) {
    const requiredFields = [
      { id: 'fullName', label: 'Full Name', value: payload.fullName },
      { id: 'phone', label: 'Phone Number', value: payload.phone },
      { id: 'buildingType', label: 'Building Type', value: payload.buildingType },
      { id: 'serviceNeed', label: 'Service Required', value: payload.serviceNeed }
    ];

    const missing = requiredFields.filter((field) => !String(field.value || '').trim());

    if (missing.length > 0) {
      missing.forEach((field) => markFieldState(document.getElementById(field.id), true));
      const firstMissing = document.getElementById(missing[0].id);
      firstMissing?.focus();
      return `Please fill these required fields: ${missing.map((field) => field.label).join(', ')}.`;
    }

    const phoneDigits = payload.phone.replace(/\D/g, '');
    if (phoneDigits.length < 11) {
      const phoneField = document.getElementById('phone');
      markFieldState(phoneField, true);
      phoneField?.focus();
      return 'Please enter a valid phone number.';
    }

    return '';
  }

  async function submitInquiry(event) {
    event.preventDefault();
    clearStatus(statusBox);
    clearFieldErrors();

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      buildingType: document.getElementById('buildingType').value.trim(),
      serviceNeed: document.getElementById('serviceNeed').value.trim(),
      address: document.getElementById('address').value.trim(),
      message: document.getElementById('message').value.trim()
    };

    const validationMessage = validateInquiryForm(payload);
    if (validationMessage) {
      setStatus(statusBox, validationMessage, false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

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
      clearFieldErrors();

      if (result.queuedForAutoRetry) {
        setStatus(statusBox, 'Inquiry saved. Google Sheet sync will retry automatically in the background.', true);
      } else {
        setStatus(statusBox, 'Inquiry submitted successfully.', true);
      }
    } catch (err) {
      setStatus(statusBox, err.message || 'Could not submit inquiry.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Inquiry';
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

  /* Nav dropdowns: tap to toggle (mobile), hover handled by CSS (desktop) */
  function initNavDropdowns() {
    document.querySelectorAll('.nav-drop-toggle').forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const drop = toggle.closest('.nav-drop');
        const wasOpen = drop.classList.contains('open');
        document.querySelectorAll('.nav-drop.open').forEach((d) => d.classList.remove('open'));
        if (!wasOpen) drop.classList.add('open');
      });
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.nav-drop.open').forEach((d) => d.classList.remove('open'));
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

  form?.addEventListener('submit', submitInquiry);
  form?.querySelectorAll('input, select, textarea').forEach((field) => {
    field.addEventListener('input', () => {
      if (field.classList.contains('field-error')) {
        markFieldState(field, false);
      }
      if (statusBox?.classList.contains('bad')) {
        clearStatus(statusBox);
      }
    });

    field.addEventListener('change', () => {
      if (field.classList.contains('field-error')) {
        markFieldState(field, false);
      }
    });
  });
  initWhatsappLinks();
  initMenu();
  initNavDropdowns();
  initScrollReveal();
  initHeaderScroll();
})();
