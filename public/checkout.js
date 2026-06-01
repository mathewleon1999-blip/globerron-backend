(function(){
  const itemsEl = document.getElementById('items');
  const totalEl = document.getElementById('total');
  const errorEl = document.getElementById('error');
  const confirmSummaryEl = document.getElementById('confirmSummary');

  const f = id => document.getElementById(id);

  // Step UI
  const personalCard = document.getElementById('cardPersonal');
  const addressCard = document.getElementById('cardAddress');
  const locationCard = document.getElementById('cardLocation');
  const stepActions = document.getElementById('stepActions');
  const stepBackBtn = document.getElementById('stepBack');
  const stepNextBtn = document.getElementById('stepNext');
  const confirmBtn = document.getElementById('confirmOrder');
  const stepsIndicator = document.getElementById('stepsIndicator');

  const STEP = { PERSONAL: 1, ADDRESS: 2, LOCATION: 3, CONFIRM: 4 };
  let currentStep = STEP.PERSONAL;

  // Delivery calculator (emirates -> fee + ETA)
  // NOTE: values are configurable and can be replaced by real courier rates later.
  const emirateSelect = document.getElementById('deliveryEmirate');
  const deliveryQuoteEl = document.getElementById('deliveryQuote');
  const shippingFeeEl = document.getElementById('shippingFee');
  const deliveryEtaEl = document.getElementById('deliveryEta');
  const subtotalEl = document.getElementById('subtotal');
  const shippingTotalEl = document.getElementById('shippingTotal');

  const DELIVERY_RULES = {
    'dubai': { fee: 20, etaLabel: '1 day', etaDays: 1 },
    'abu-dhabi': { fee: 30, etaLabel: '2 days', etaDays: 2 },
    'sharjah': { fee: 15, etaLabel: 'Same day', etaDays: 0 },
    'ajman': { fee: 25, etaLabel: '1–2 days', etaDays: 2 },
    'ras-al-khaimah': { fee: 35, etaLabel: '2–3 days', etaDays: 3 },
    'fujairah': { fee: 40, etaLabel: '2–3 days', etaDays: 3 },
    'umm-al-quwain': { fee: 35, etaLabel: '2–3 days', etaDays: 3 },
  };

  function computeShipping(){
    const key = (emirateSelect?.value || '').trim();
    return DELIVERY_RULES[key] ? { ...DELIVERY_RULES[key], key } : { fee: 0, etaLabel: '—', etaDays: null, key: '' };
  }

  function renderDeliveryQuote(){
    if (!deliveryQuoteEl) return;
    const key = (emirateSelect?.value || '').trim();
    if (!key || !DELIVERY_RULES[key]) {
      deliveryQuoteEl.style.display = 'none';
      return;
    }
    const rule = DELIVERY_RULES[key];
    deliveryQuoteEl.style.display = '';
    if (shippingFeeEl) shippingFeeEl.textContent = `${Number(rule.fee).toFixed(2)}`;

    // Human ETA label + approximate date
    let datePart = '';
    if (typeof rule.etaDays === 'number') {
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() + rule.etaDays);
      datePart = ` (by ${d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })})`;
    }
    if (deliveryEtaEl) deliveryEtaEl.textContent = `${rule.etaLabel}${datePart}`;
  }

  // Load cart from localStorage (assumes your site stores cart there)
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');

  function renderCartSummary(){
    if (!itemsEl || !totalEl) return;

    if (!Array.isArray(cart) || cart.length === 0) {
      itemsEl.innerHTML = '<p>Your cart is empty.</p>';
      if (subtotalEl) subtotalEl.textContent = '0.00';
      if (shippingTotalEl) shippingTotalEl.textContent = '0.00';
      totalEl.textContent = '0.00';
      return;
    }

    let subtotal = 0;
    itemsEl.innerHTML = cart.map(i => {
      const line = Number(i.price || 0) * Number(i.quantity || 1);
      subtotal += line;
      return `<div class="item"><span>${i.name || i.productName || ''} (${i.partNumber || ''}) x ${i.quantity || 1}</span><span>${line.toFixed(2)}</span></div>`;
    }).join('');

    const shipping = computeShipping();
    const shippingFee = Number(shipping.fee || 0);
    const total = subtotal + shippingFee;

    if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2);
    if (shippingTotalEl) shippingTotalEl.textContent = shippingFee.toFixed(2);
    totalEl.textContent = total.toFixed(2);
  }

  if (emirateSelect) {
    emirateSelect.addEventListener('change', () => {
      renderDeliveryQuote();
      renderCartSummary();
    });
  }

  // Initial render
  renderDeliveryQuote();
  renderCartSummary();

  function showStep(step){
    currentStep = step;
    if (errorEl) errorEl.textContent = '';

    // Ensure elements exist (in case page updated partially)
    if (personalCard) personalCard.style.display = (step === STEP.PERSONAL) ? '' : 'none';
    if (addressCard) addressCard.style.display = (step === STEP.ADDRESS) ? '' : 'none';
    if (locationCard) locationCard.style.display = (step === STEP.LOCATION) ? '' : 'none';

    if (stepActions) stepActions.style.display = (step === STEP.CONFIRM) ? 'none' : '';
    if (confirmBtn) confirmBtn.style.display = (step === STEP.CONFIRM) ? '' : 'none';

    if (stepBackBtn) stepBackBtn.style.display = (step === STEP.PERSONAL) ? 'none' : '';
    if (stepNextBtn) stepNextBtn.textContent = (step === STEP.LOCATION) ? 'Review & Pay' : 'Next';

    // If the actions container is inside the Personal card, it will disappear on later steps.
    // Keep the Next/Back buttons available by moving the container below the step cards.
    if (stepActions && personalCard && stepActions.parentElement === personalCard) {
      const parent = personalCard.parentElement; // left column wrapper
      if (parent) parent.appendChild(stepActions);
    }

    renderConfirmation();
    updateStepsIndicator();
  }

  function updateStepsIndicator(){
    if (!stepsIndicator) return;
    const map = {
      [STEP.PERSONAL]: 'Step 1/4: Personal',
      [STEP.ADDRESS]: 'Step 2/4: Address',
      [STEP.LOCATION]: 'Step 3/4: Exact Location',
      [STEP.CONFIRM]: 'Step 4/4: Review & Payment'
    };
    stepsIndicator.textContent = map[currentStep] || '';
  }

  function validateStep(step){
    if (!Array.isArray(cart) || cart.length === 0) return 'Cart is empty';

    const requiredByStep = {
      [STEP.PERSONAL]: ['fullName','phone'],
      [STEP.ADDRESS]: ['country','city','area','street','building','postalCode'],
      [STEP.LOCATION]: ['latitude','longitude'],
    };

    const required = requiredByStep[step] || [];
    const missing = required.filter(id => !String(f(id)?.value || '').trim());
    if (missing.length) {
      return `Please fill all required fields: ${missing.join(', ')}`;
    }

    if (step === STEP.LOCATION) {
      const lat = Number(f('latitude').value);
      const lng = Number(f('longitude').value);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return 'Latitude and Longitude must be numbers';
    }

    return '';
  }

  // Helper: update Google Maps link + embedded preview
  function updateMapsLink(){
    const lat = (f('latitude')?.value || '').trim();
    const lng = (f('longitude')?.value || '').trim();

    const hasCoords = lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
    const q = hasCoords ? `${lat},${lng}` : '';

    // Use Google Maps Search endpoint for consistent behavior
    const url = hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
      : 'https://www.google.com/maps';

    const a = document.getElementById('openMaps');
    if (a) a.href = url;

    // Update iframe preview in Step 3 (no API key needed)
    const preview = document.getElementById('mapPreview');
    if (preview) {
      if (!hasCoords) {
        preview.innerHTML = 'Map preview will appear here once latitude and longitude are filled.';
      } else {
        const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
        preview.innerHTML = `
          <iframe
            title="Map preview"
            src="${embedUrl}"
            width="100%"
            height="200"
            style="border:0;border-radius:10px"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
        `;
      }
    }
  }

  if (f('latitude')) f('latitude').addEventListener('input', updateMapsLink);
  if (f('longitude')) f('longitude').addEventListener('input', updateMapsLink);
  updateMapsLink();

  // Use browser geolocation to prefill lat/lng
  const useLocBtn = document.getElementById('useLocation');
  if (useLocBtn) {
    useLocBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return alert('Geolocation not supported');

      // Geolocation will fail on insecure origins.
      // Allow on https and localhost; for LAN IP usage require HTTPS.
      const isSecure = window.isSecureContext || location.protocol === 'https:';
      const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
      if (!isSecure && !isLocalhost) {
        return alert('Location requires HTTPS. Please open the site on https:// or use localhost.');
      }

      const onSuccess = (pos) => {
        const { latitude, longitude } = pos.coords;
        f('latitude').value = latitude;
        f('longitude').value = longitude;
        updateMapsLink();
      };

      const onError = (err) => {
        const msgByCode = {
          1: 'Location permission denied. Please allow location access in your browser settings.',
          2: 'Location unavailable. Please enable GPS/location services and try again.',
          3: 'Location request timed out. Please try again in an open area or with better signal.'
        };
        alert(msgByCode[err?.code] || 'Could not get location');
      };

      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
    });
  }

  function buildPayload(){
    const items = cart.map(i => ({
      productId: i.id || i.productId || null,
      productName: i.name || i.productName || '',
      partNumber: i.partNumber || '',
      quantity: Number(i.quantity || 1),
      price: Number(i.price || 0),
    }));

    const shipping = computeShipping();
    const subtotal = items.reduce((s,i)=> s + i.quantity * i.price, 0);
    const shippingFee = Number(shipping.fee || 0);

    return {
      customer: {
        fullName: f('fullName').value.trim(),
        phone: f('phone').value.trim(),
        // Keep email if present in UI, but do not require it
        email: (f('email')?.value || '').trim(),
      },
      address: {
        country: f('country').value.trim(),
        city: f('city').value.trim(),
        area: f('area').value.trim(),
        street: f('street').value.trim(),
        building: f('building').value.trim(),
        apartment: (f('apartment')?.value || '').trim(),
        postalCode: f('postalCode').value.trim(),
        latitude: Number(f('latitude').value),
        longitude: Number(f('longitude').value),
        emirate: shipping.key || '',
      },
      delivery: {
        shippingFee,
        etaLabel: shipping.etaLabel,
      },
      items,
      subtotalAmount: subtotal,
      totalAmount: subtotal + shippingFee,
    };
  }

  function renderConfirmation(){
    if (!confirmSummaryEl) return;
    try {
      const p = buildPayload();
      const addr = p.address;
      const latOk = !Number.isNaN(addr.latitude);
      const lngOk = !Number.isNaN(addr.longitude);
      const mapUrl = (latOk && lngOk)
        ? `https://www.google.com/maps?q=${encodeURIComponent(addr.latitude+','+addr.longitude)}`
        : 'https://www.google.com/maps';

      confirmSummaryEl.innerHTML = `
        <div><strong>Deliver to:</strong> ${addr.building || '-'}, ${addr.street || '-'}, ${addr.area || '-'}, ${addr.city || '-'}, ${addr.country || '-'} - ${addr.postalCode || '-'}</div>
        <div style="margin-top:6px"><strong>Contact:</strong> ${p.customer.fullName || '-'} | ${p.customer.phone || '-'}</div>
        <div style="margin-top:6px"><strong>Exact Location:</strong> <a href="${mapUrl}" target="_blank">View on Google Maps</a></div>
      `;
    } catch {
      // ignore
    }
  }

  ['fullName','phone','email','country','city','area','street','building','postalCode','latitude','longitude','apartment']
    .forEach(id => {
      const el = f(id);
      if (el) el.addEventListener('input', renderConfirmation);
    });
  renderConfirmation();

  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', () => {
      const err = validateStep(currentStep);
      if (err) { if (errorEl) errorEl.textContent = err; return; }

      if (currentStep === STEP.PERSONAL) return showStep(STEP.ADDRESS);
      if (currentStep === STEP.ADDRESS) return showStep(STEP.LOCATION);
      if (currentStep === STEP.LOCATION) return showStep(STEP.CONFIRM);
    });
  }

  if (stepBackBtn) {
    stepBackBtn.addEventListener('click', () => {
      if (errorEl) errorEl.textContent = '';
      if (currentStep === STEP.ADDRESS) return showStep(STEP.PERSONAL);
      if (currentStep === STEP.LOCATION) return showStep(STEP.ADDRESS);
      if (currentStep === STEP.CONFIRM) return showStep(STEP.LOCATION);
    });
  }

  // Confirm order -> create Stripe Checkout Session -> redirect to Stripe
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (errorEl) errorEl.textContent = '';

      // Validate all steps before proceeding
      const allErr = [STEP.PERSONAL, STEP.ADDRESS, STEP.LOCATION]
        .map(s => validateStep(s))
        .find(Boolean);
      if (allErr) { if (errorEl) errorEl.textContent = allErr; showStep(STEP.PERSONAL); return; }

      const payload = buildPayload();

      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Redirecting to payment...';

        // Store order payload temporarily so the server can save it after payment success
        // (success page calls /api/checkout/success which should create the order)
        localStorage.setItem('pendingOrder', JSON.stringify(payload));

        const res = await fetch('/api/checkout/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload.items })
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || j.message || 'Unable to start payment');
        if (!j.url) throw new Error('Stripe session URL missing');

        window.location.href = j.url;
      } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'CONFIRM ORDER';
      }
    });
  }

  // Start at personal step
  showStep(STEP.PERSONAL);
})();
