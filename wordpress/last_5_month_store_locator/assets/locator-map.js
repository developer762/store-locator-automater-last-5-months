(function () {
  'use strict';

  var map = null;
  var markersGroup = null;
  var allLocations = [];
  var locationMarkers = [];
  var currentViewMode = 'map'; // 'map', 'sales', or 'table'
  var currentPage = 1;
  var itemsPerPage = 25;
  var selectedTypeFilter = '';
  var selectedMonthFilter = 'last_5_months';
  var userLocation = null;

  var MONTH_FULL_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  var MONTH_TOKEN_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function buildMonthMeta(year, month1To12) {
    if (!year || !month1To12 || month1To12 < 1 || month1To12 > 12 || year < 2000 || year > 2100) {
      return null;
    }
    return {
      year: year,
      month: month1To12,
      key: year + '-' + pad2(month1To12),
      label: MONTH_FULL_NAMES[month1To12 - 1] + ' ' + year,
      index: (year * 12) + (month1To12 - 1)
    };
  }

  function parseMonthYearFromText(text) {
    if (!text) return null;
    var str = String(text);

    var mFirst = str.match(/(?:^|[^a-z])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=[^a-z]|$)[\s\-_.,]*(20\d{2})(?!\d)/i);
    if (mFirst) {
      var mon1 = MONTH_TOKEN_MAP[mFirst[1].toLowerCase()];
      var yr1 = parseInt(mFirst[2], 10);
      if (mon1 && yr1) return buildMonthMeta(yr1, mon1);
    }

    var yFirst = str.match(/(?:^|[^0-9])(20\d{2})[\s\-_.,]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=[^a-z]|$)/i);
    if (yFirst) {
      var yr2 = parseInt(yFirst[1], 10);
      var mon2 = MONTH_TOKEN_MAP[yFirst[2].toLowerCase()];
      if (mon2 && yr2) return buildMonthMeta(yr2, mon2);
    }

    return null;
  }

  function parseMonthYearFromDateStr(dateStr) {
    if (!dateStr) return null;
    var s = String(dateStr).trim();
    if (!s) return null;

    var isoMatch = s.match(/^(20\d{2})[\/\-\.](\d{1,2})(?:[\/\-\.]\d{1,2})?(?:\b|$)/);
    if (isoMatch) {
      return buildMonthMeta(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10));
    }

    var slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (slashMatch) {
      var p1 = parseInt(slashMatch[1], 10);
      var p2 = parseInt(slashMatch[2], 10);
      var yr = parseInt(slashMatch[3], 10);
      if (yr < 100) yr += 2000;
      var mon = p1;
      if (mon > 12 && p2 >= 1 && p2 <= 12) mon = p2;
      return buildMonthMeta(yr, mon);
    }

    var textMeta = parseMonthYearFromText(s);
    if (textMeta) return textMeta;

    if (/[a-zA-Z]{3,}/.test(s) || s.indexOf('T') !== -1) {
      var dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        return buildMonthMeta(dt.getFullYear(), dt.getMonth() + 1);
      }
    }

    return null;
  }

  function extractLocationMonthInfo(loc) {
    if (window.CMX_L5M_LOCATOR && typeof window.CMX_L5M_LOCATOR.extractMonthInfo === 'function') {
      return window.CMX_L5M_LOCATOR.extractMonthInfo(loc);
    }
    if (!loc) return null;
    if (loc._monthMeta !== undefined) return loc._monthMeta;
    var meta = parseMonthYearFromDateStr(loc.date) || parseMonthYearFromText(loc.tabName) || null;
    loc._monthMeta = meta;
    return meta;
  }

  function isWithinLastNMonths(monthIndex, n) {
    if (window.CMX_L5M_LOCATOR && typeof window.CMX_L5M_LOCATOR.isWithinLastNMonths === 'function') {
      return window.CMX_L5M_LOCATOR.isWithinLastNMonths(monthIndex, n);
    }
    if (monthIndex === null || monthIndex === undefined) return false;
    var now = new Date();
    var currentMonthIndex = (now.getFullYear() * 12) + now.getMonth();
    var minMonthIndex = currentMonthIndex - ((n || 5) - 1);
    return monthIndex >= minMonthIndex && monthIndex <= currentMonthIndex;
  }

  function getPeriodLocations() {
    var monthsWindow = (window.CMX_L5M_LOCATOR && window.CMX_L5M_LOCATOR.monthsWindow) || 5;
    if (selectedMonthFilter === 'all') {
      return allLocations;
    }
    return allLocations.filter(function (loc) {
      var meta = extractLocationMonthInfo(loc);
      if (!meta) return false;
      if (selectedMonthFilter === 'last_5_months') {
        return isWithinLastNMonths(meta.index, monthsWindow);
      }
      return meta.key === selectedMonthFilter;
    });
  }

  function initLocatorMap() {
    // Hide Astra / WP default theme page title header so title + view tabs flex side-by-side cleanly
    var wrap = document.querySelector('.cmx-l5m-locator-wrap');
    if (wrap) {
      var articleHeader = wrap.closest('article') ? wrap.closest('article').querySelector('.entry-header, header.entry-header') : null;
      var outerHeader = articleHeader || document.querySelector('.entry-header, header.entry-header');
      if (outerHeader) {
        outerHeader.style.display = 'none';
      }
    }

    var canvas = document.getElementById('cmx-l5m-map-canvas');
    if (canvas && window.L) {
      map = L.map('cmx-l5m-map-canvas', {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([39.8283, -98.5795], 4);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      markersGroup = L.featureGroup().addTo(map);
    }

    // Bind event listeners for search, filters, sort, and view toggles
    var monthSelect = document.getElementById('cmx-l5m-month-select');
    var searchInput = document.getElementById('cmx-l5m-search-input');
    var tabSelect = document.getElementById('cmx-l5m-tab-select');
    var stateSelect = document.getElementById('cmx-l5m-state-select');
    var typeSelect = document.getElementById('cmx-l5m-type-select');
    var sortSelect = document.getElementById('cmx-l5m-sort-select');
    var viewMapBtn = document.getElementById('cmx-l5m-view-map-btn');
    var viewSalesBtn = document.getElementById('cmx-l5m-view-sales-btn');
    var viewTableBtn = document.getElementById('cmx-l5m-view-table-btn');
    var useLocBtn = document.getElementById('cmx-l5m-use-location-btn');

    function resetAndRender() {
      currentPage = 1;
      renderMapAndSidebar();
    }

    if (monthSelect) {
      monthSelect.addEventListener('change', function () {
        selectedMonthFilter = this.value || 'last_5_months';
        currentPage = 1;
        var periodLocations = getPeriodLocations();
        populateTabSelect(periodLocations);
        populateStateSelect(periodLocations);
        renderMapAndSidebar();
      });
    }

    if (searchInput) searchInput.addEventListener('input', resetAndRender);
    if (tabSelect) tabSelect.addEventListener('change', resetAndRender);
    if (stateSelect) stateSelect.addEventListener('change', resetAndRender);
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        selectedTypeFilter = this.value;
        syncTypePills(this.value);
        resetAndRender();
      });
    }
    if (sortSelect) sortSelect.addEventListener('change', resetAndRender);

    // Bind Premise Type Pills (ALL, RETAIL, BAR & RESTAURANT)
    var typePills = document.querySelectorAll('.cmx-l5m-type-pill');
    typePills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        typePills.forEach(function (p) { p.classList.remove('active'); });
        this.classList.add('active');
        selectedTypeFilter = this.getAttribute('data-type') || '';
        if (typeSelect) typeSelect.value = selectedTypeFilter;
        resetAndRender();
      });
    });

    function syncTypePills(val) {
      typePills.forEach(function (p) {
        if ((p.getAttribute('data-type') || '') === (val || '')) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    }

    // Geolocation USE MY LOCATION handler
    if (useLocBtn) {
      useLocBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser.');
          return;
        }
        useLocBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> LOCATING...';
        navigator.geolocation.getCurrentPosition(function (pos) {
          useLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> USE MY LOCATION';
          userLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          renderMapAndSidebar(true);
        }, function () {
          useLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> USE MY LOCATION';
          alert('Unable to retrieve your location. Please ensure location services are enabled.');
        }, { timeout: 10000 });
      });
    }

    if (viewMapBtn) {
      viewMapBtn.addEventListener('click', function () {
        currentViewMode = 'map';
        setActiveViewBtn(viewMapBtn);
        showViewContainer('cmx-l5m-split-view');
        if (map) setTimeout(function () { map.invalidateSize(); }, 100);
        renderMapAndSidebar();
      });
    }

    if (viewSalesBtn) {
      viewSalesBtn.addEventListener('click', function () {
        currentViewMode = 'sales';
        setActiveViewBtn(viewSalesBtn);
        showViewContainer('cmx-l5m-sales-view');
        renderMapAndSidebar();
      });
    }

    if (viewTableBtn) {
      viewTableBtn.addEventListener('click', function () {
        currentViewMode = 'table';
        setActiveViewBtn(viewTableBtn);
        showViewContainer('cmx-l5m-table-view');
        renderMapAndSidebar();
      });
    }

    function setActiveViewBtn(activeBtn) {
      [viewMapBtn, viewSalesBtn, viewTableBtn].forEach(function (btn) {
        if (btn) btn.classList.remove('cmx-l5m-active');
      });
      if (activeBtn) activeBtn.classList.add('cmx-l5m-active');
    }

    function showViewContainer(containerId) {
      ['cmx-l5m-split-view', 'cmx-l5m-sales-view', 'cmx-l5m-table-view'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = (id === containerId) ? (id === 'cmx-l5m-split-view' ? 'flex' : 'block') : 'none';
      });
    }

    // Load locations feed with bulletproof fallback
    var fallbackEndpoint = (window.CMX_L5M_LOCATOR && window.CMX_L5M_LOCATOR.directEndpoint) || 'https://script.google.com/macros/s/AKfycbz8pQv5oekeeTT35zyE22mPqczBBeWI6facsR9vs62jUCzv-kC4eiDxKyYf43nvx9Faew/exec';

    function tryDirectEndpoint() {
      if (allLocations && allLocations.length > 0) return;
      var directUrl = fallbackEndpoint + (fallbackEndpoint.indexOf('?') === -1 ? '?' : '&') + 'nocache=1';
      fetch(directUrl)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.locations && data.locations.length > 0) {
            setLocationsData(data.locations);
          }
        })
        .catch(function (err) {
          console.warn('Direct fallback load attempt:', err);
        });
    }

    if (window.CMX_L5M_LOCATOR && window.CMX_L5M_LOCATOR.allLocations && window.CMX_L5M_LOCATOR.allLocations.length > 0) {
      setLocationsData(window.CMX_L5M_LOCATOR.allLocations);
    } else if (window.CMX_L5M_LOCATOR && window.CMX_L5M_LOCATOR.locations && window.CMX_L5M_LOCATOR.locations.length > 0) {
      setLocationsData(window.CMX_L5M_LOCATOR.locations);
    } else if (window.CMX_L5M_LOCATOR && typeof window.CMX_L5M_LOCATOR.load === 'function') {
      window.CMX_L5M_LOCATOR.load().then(function (payload) {
        var sourceList = (payload && (payload.allLocations || payload.locations)) || null;
        if (sourceList) setLocationsData(sourceList);
      }).catch(function (err) {
        console.warn('Casa Mexico Last 5 Months map feed error, trying direct endpoint:', err);
        tryDirectEndpoint();
      });
    } else {
      tryDirectEndpoint();
    }

    // Safety timeout to ensure data is never stuck on "Loading..."
    setTimeout(function () {
      if (!allLocations || allLocations.length === 0) {
        tryDirectEndpoint();
      }
    }, 1500);

    window.addEventListener('cmx-l5m:locations-ready', function (e) {
      var sourceList = e.detail && (e.detail.allLocations || e.detail.locations);
      if (sourceList) {
        setLocationsData(sourceList);
      }
    });

    function triggerMapResize() {
      if (map && currentViewMode === 'map') {
        map.invalidateSize();
      }
    }

    [100, 300, 600, 1000, 2000].forEach(function (ms) {
      setTimeout(triggerMapResize, ms);
    });

    window.addEventListener('load', triggerMapResize);
    window.addEventListener('resize', triggerMapResize);
    window.addEventListener('orientationchange', triggerMapResize);
  }

  function getDistanceMiles(lat1, lon1, lat2, lon2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function getTabName(loc) {
    if (loc.tabName) return loc.tabName;
    if (loc.territory) {
      var terr = String(loc.territory).toUpperCase();
      if (terr.indexOf('NY') !== -1 || terr.indexOf('NJ') !== -1) return 'July 2026 NY-NJ';
      if (terr.indexOf('FL') !== -1) return 'Depletions FL';
      if (terr.indexOf('TX') !== -1) return 'Depletions TX July 2026';
      if (terr.indexOf('KY') !== -1) return 'Casa Mexico Rolling 12 KY';
      if (terr.indexOf('MA') !== -1 || terr.indexOf('RI') !== -1) return 'MA-RI Summary';
      if (terr.indexOf('AZ') !== -1) return 'AZ Accounts';
      if (terr.indexOf('CA') !== -1) return 'CA Accounts';
      if (terr.indexOf('IL') !== -1) return 'IL Espiritus';
      return loc.territory + ' Tab';
    }
    if (loc.id && loc.id.indexOf('CMT-') === 0) {
      var match = loc.id.match(/^CMT-([A-Za-z0-9]+)-/);
      if (match && match[1]) return match[1] + ' Tab';
    }
    return 'Store Locator';
  }

  function setLocationsData(locations) {
    if (!Array.isArray(locations)) return;

    locations.forEach(function (loc) {
      loc._cleanTabName = getTabName(loc);
      extractLocationMonthInfo(loc);
    });

    allLocations = locations;
    populateMonthSelect(locations);
    var periodLocations = getPeriodLocations();
    populateTabSelect(periodLocations);
    populateStateSelect(periodLocations);
    renderMapAndSidebar();
  }

  function populateMonthSelect(locations) {
    var monthSelect = document.getElementById('cmx-l5m-month-select');
    if (!monthSelect) return;

    var monthsWindow = (window.CMX_L5M_LOCATOR && window.CMX_L5M_LOCATOR.monthsWindow) || 5;
    var monthsMap = {};
    var last5Count = 0;

    locations.forEach(function (loc) {
      var meta = extractLocationMonthInfo(loc);
      if (meta) {
        if (!monthsMap[meta.key]) {
          monthsMap[meta.key] = { key: meta.key, label: meta.label, index: meta.index, count: 0 };
        }
        monthsMap[meta.key].count++;
        if (isWithinLastNMonths(meta.index, monthsWindow)) {
          last5Count++;
        }
      }
    });

    var sortedMonths = Object.keys(monthsMap)
      .map(function (k) { return monthsMap[k]; })
      .sort(function (a, b) { return b.index - a.index; });

    var html = '<option value="last_5_months">Last 5 Months (' + last5Count + ')</option>';
    html += '<option value="all">All Months (' + locations.length + ')</option>';
    sortedMonths.forEach(function (m) {
      html += '<option value="' + escapeHtml(m.key) + '">' + escapeHtml(m.label) + ' (' + m.count + ')</option>';
    });

    monthSelect.innerHTML = html;
    if (selectedMonthFilter === 'last_5_months' || selectedMonthFilter === 'all' || monthsMap[selectedMonthFilter]) {
      monthSelect.value = selectedMonthFilter;
    } else {
      selectedMonthFilter = 'last_5_months';
      monthSelect.value = 'last_5_months';
    }
  }

  function populateTabSelect(locations) {
    var tabSelect = document.getElementById('cmx-l5m-tab-select');
    if (!tabSelect) return;

    var currentVal = tabSelect.value;
    var tabsMap = {};

    locations.forEach(function (loc) {
      var tName = loc._cleanTabName || getTabName(loc);
      tabsMap[tName] = (tabsMap[tName] || 0) + 1;
    });

    var tabs = Object.keys(tabsMap).sort();
    var html = '<option value="">All Sheet Tabs (' + tabs.length + ' Tabs • ' + locations.length + ' Stores)</option>';
    tabs.forEach(function (t) {
      html += '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + ' (' + tabsMap[t] + ')</option>';
    });
    tabSelect.innerHTML = html;
    if (currentVal && tabsMap[currentVal]) tabSelect.value = currentVal;
  }

  function populateStateSelect(locations) {
    var stateSelect = document.getElementById('cmx-l5m-state-select');
    if (!stateSelect) return;

    var currentVal = stateSelect.value;
    var statesSet = {};

    locations.forEach(function (loc) {
      var st = loc.state ? String(loc.state).trim().toUpperCase() : '';
      if (st && st.length <= 3 && /^[A-Z]{2,3}$/.test(st)) {
        statesSet[st] = true;
      }
    });

    var states = Object.keys(statesSet).sort();
    var html = '<option value="">All States (' + states.length + ' States)</option>';
    states.forEach(function (st) {
      html += '<option value="' + escapeHtml(st) + '">' + escapeHtml(st) + '</option>';
    });
    stateSelect.innerHTML = html;
    if (currentVal && statesSet[currentVal]) stateSelect.value = currentVal;
  }

  function renderMapAndSidebar(isGeolocationTriggered) {
    var searchVal = (document.getElementById('cmx-l5m-search-input') ? document.getElementById('cmx-l5m-search-input').value : '').toLowerCase().trim();
    var tabVal = document.getElementById('cmx-l5m-tab-select') ? document.getElementById('cmx-l5m-tab-select').value : '';
    var stateVal = document.getElementById('cmx-l5m-state-select') ? document.getElementById('cmx-l5m-state-select').value.toUpperCase() : '';
    var typeVal = selectedTypeFilter || (document.getElementById('cmx-l5m-type-select') ? document.getElementById('cmx-l5m-type-select').value : '');
    var sortVal = document.getElementById('cmx-l5m-sort-select') ? document.getElementById('cmx-l5m-sort-select').value : 'name-asc';

    var periodLocations = getPeriodLocations();
    var tokens = searchVal.split(/\s+/).filter(Boolean);

    function isTotalSummaryRow(str) {
      if (!str) return false;
      var s = String(str).trim().toLowerCase();
      if (s === 'total' || s === 'grand total' || s === 'subtotal' || s === 'total sales' || s === 'total volume') return true;
      if (/^(total|subtotal|grand total)\s*[:\-\_]/i.test(s)) return true;
      if (/^(total|subtotal|grand total)\s+for\b/i.test(s)) return true;
      if (/^(total|subtotal|grand total)\s+with\b/i.test(s)) return true;
      return false;
    }

    var filtered = periodLocations.filter(function (loc) {
      var rawName = String(loc.name || '').trim();
      if (isTotalSummaryRow(rawName)) {
        return false;
      }

      var tabNameResolved = loc._cleanTabName || getTabName(loc);
      var fullText = [
        loc.name,
        loc.address,
        loc.city,
        loc.state,
        loc.postalCode,
        loc.bottlings,
        loc.type,
        loc.distributor,
        loc.territory,
        tabNameResolved
      ].join(' ').toLowerCase();

      var matchesSearch = tokens.length === 0 || tokens.every(function (t) {
        return fullText.indexOf(t) !== -1;
      });

      var matchesTab = !tabVal || tabNameResolved === tabVal;
      var matchesState = !stateVal || (loc.state && String(loc.state).toUpperCase() === stateVal);
      var matchesType = !typeVal || loc.type === typeVal;

      return matchesSearch && matchesTab && matchesState && matchesType;
    });

    // Handle user location distances
    if (userLocation) {
      filtered.forEach(function (loc) {
        var lat = parseFloat(loc.latitude);
        var lng = parseFloat(loc.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          loc._distance = getDistanceMiles(userLocation.lat, userLocation.lng, lat, lng);
        } else {
          loc._distance = 999999;
        }
      });
      filtered.sort(function (a, b) {
        return (a._distance || 0) - (b._distance || 0);
      });
    } else {
      filtered.sort(function (a, b) {
        if (sortVal === 'name-desc') {
          return String(b.name || '').localeCompare(String(a.name || ''));
        } else if (sortVal === 'cases-desc') {
          var cA = Number(a.cases) || 0;
          var cB = Number(b.cases) || 0;
          return cB - cA;
        } else if (sortVal === 'city-asc') {
          return String(a.city || '').localeCompare(String(b.city || ''));
        } else {
          return String(a.name || '').localeCompare(String(b.name || ''));
        }
      });
    }

    // Update count badge
    var countBadge = document.getElementById('cmx-l5m-count-badge');
    if (countBadge) {
      countBadge.textContent = 'SHOWING ' + filtered.length + ' OF ' + periodLocations.length + ' STORES';
    }

    // Geolocation Nearest Banner logic
    var nearestBanner = document.getElementById('cmx-l5m-nearest-banner');
    if (nearestBanner) {
      if (userLocation && filtered.length > 0) {
        var closest = filtered[0];
        var distMi = Math.round(closest._distance || 0);
        var distKm = Math.round(distMi * 1.60934);
        var formattedDistMi = distMi.toLocaleString('en-US');
        var formattedDistKm = distKm.toLocaleString('en-US');

        var isNear = distMi < 50;
        var bannerMsg = isNear
          ? 'Nearest Casa México is <strong>' + formattedDistMi + ' mi</strong> away.'
          : 'No stores found near you<br><span style="font-size:0.85rem; color:#6E6762; font-weight:400;">Nearest Casa México is <strong>' + formattedDistMi + ' mi (' + formattedDistKm + ' km)</strong> away.</span>';

        var cleanName = escapeHtml(closest.name || 'Store Location');
        var cityStateStr = [closest.city, closest.state].filter(function (x) { return x && x !== 'N/A' && x !== 'US'; }).join(', ') + (closest.postalCode ? ' ' + escapeHtml(closest.postalCode) : '');
        var directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(cleanName + ' ' + (closest.address || cityStateStr || ''));

        nearestBanner.style.display = 'block';
        nearestBanner.innerHTML =
          '<div class="cmx-l5m-nearest-title">' + bannerMsg + '</div>' +
          '<div class="cmx-l5m-nearest-card">' +
            '<div class="cmx-l5m-nearest-name">' + cleanName + '</div>' +
            '<div class="cmx-l5m-nearest-addr">' + (cityStateStr || escapeHtml(closest.address || '')) + '</div>' +
            '<div class="cmx-l5m-nearest-actions">' +
              '<button type="button" class="cmx-l5m-nearest-btn-map" id="cmx-l5m-btn-view-nearest"><i class="fa-solid fa-location-dot"></i> VIEW ON MAP</button>' +
              '<a href="' + directionsUrl + '" target="_blank" rel="noopener" class="cmx-l5m-nearest-btn-dir"><i class="fa-solid fa-diamond-turn-right"></i> GET DIRECTIONS</a>' +
            '</div>' +
          '</div>';

        var viewNearestBtn = document.getElementById('cmx-l5m-btn-view-nearest');
        if (viewNearestBtn && map) {
          viewNearestBtn.addEventListener('click', function () {
            var lat = parseFloat(closest.latitude);
            var lng = parseFloat(closest.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              map.setView([lat, lng], 14, { animate: true });
              var found = locationMarkers.find(function (m) { return m.id === (closest.id || 0); });
              if (found && found.marker) found.marker.openPopup();
            }
          });
        }
      } else {
        nearestBanner.style.display = 'none';
        nearestBanner.innerHTML = '';
      }
    }

    if (currentViewMode === 'table') {
      renderTable(filtered);
    } else if (currentViewMode === 'sales') {
      renderSalesMetrics(filtered);
    } else {
      renderMapAndCards(filtered);
    }
  }

  function renderSalesMetrics(filtered) {
    var volEl = document.getElementById('cmx-l5m-sales-vol');
    var topEl = document.getElementById('cmx-l5m-sales-top-prod');
    var marketsEl = document.getElementById('cmx-l5m-sales-markets');
    var container = document.getElementById('cmx-l5m-sales-breakdown');

    var totalVol = 0;
    var productMap = {};
    var territoryMap = {};

    filtered.forEach(function (loc) {
      if (loc.cases) totalVol += Number(loc.cases);
      var prod = loc.bottlings || 'Casa Mexico Tequila';
      productMap[prod] = (productMap[prod] || 0) + (Number(loc.cases) || 1);
      var terr = loc.territory || loc.state || 'US';
      territoryMap[terr] = (territoryMap[terr] || 0) + (Number(loc.cases) || 1);
    });

    var topProd = 'Casa Mexico Reposado';
    var maxCases = 0;
    Object.keys(productMap).forEach(function (p) {
      if (productMap[p] > maxCases) {
        maxCases = productMap[p];
        topProd = p;
      }
    });

    var roundedVol = Math.round(totalVol * 100) / 100;
    if (volEl) volEl.textContent = roundedVol ? roundedVol.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' Cases' : filtered.length + ' Stores';
    if (topEl) topEl.textContent = topProd;
    if (marketsEl) marketsEl.textContent = Object.keys(territoryMap).length + ' Markets';

    if (container) {
      if (filtered.length === 0) {
        container.innerHTML = '<div class="cmx-l5m-no-results">No sales records matching search criteria.</div>';
        return;
      }

      var html = '';
      Object.keys(territoryMap).sort().forEach(function (terr) {
        var terrVol = Math.round(territoryMap[terr] * 100) / 100;
        html += '<div class="cmx-l5m-sales-card">' +
          '<div class="cmx-l5m-sales-card-title"><i class="fa-solid fa-location-dot"></i> Territory: ' + escapeHtml(terr) + '</div>' +
          '<div class="cmx-l5m-sales-card-vol"><i class="fa-solid fa-box"></i> Volume: <strong>' + terrVol + '</strong> units / cases</div>' +
          '</div>';
      });
      container.innerHTML = html;
    }
  }

  function createWarmPinMarkerIcon() {
    if (!window.L) return null;
    return L.divIcon({
      className: 'cmx-l5m-custom-pin-marker',
      html: '<div class="cmx-l5m-marker-pin"><svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.163 0 0 7.163 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.163 24.837 0 16 0Z" fill="#B37A4C"/><circle cx="16" cy="15" r="5" fill="#FFFFFF"/></svg></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -38]
    });
  }

  function renderMapAndCards(filtered) {
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    locationMarkers = [];

    var sidebarContainer = document.getElementById('cmx-l5m-sidebar-list');
    if (sidebarContainer) sidebarContainer.innerHTML = '';

    if (filtered.length === 0) {
      if (sidebarContainer) {
        sidebarContainer.innerHTML = '<div class="cmx-l5m-no-results">No stores found matching your search or selected month.</div>';
      }
      return;
    }

    var bounds = L.latLngBounds();
    var pinIcon = createWarmPinMarkerIcon();

    function formatLocationAddress(loc) {
      var addr = loc.address ? escapeHtml(loc.address) : '';
      var cityStateParts = [];
      if (loc.city && loc.city !== 'N/A' && loc.city !== loc.address) cityStateParts.push(escapeHtml(loc.city));
      if (loc.state && loc.state !== 'US') cityStateParts.push(escapeHtml(loc.state));
      var cityState = cityStateParts.join(', ') + (loc.postalCode ? ' ' + escapeHtml(loc.postalCode) : '');

      if (addr && cityState && addr !== cityState) {
        return addr + ' (' + cityState + ')';
      } else if (addr) {
        return addr;
      } else if (cityState) {
        return cityState;
      } else {
        return escapeHtml(loc.territory || loc.tabName || 'Available in Market');
      }
    }

    function buildDirectionsUrl(loc, fallbackName) {
      var nameToUse = fallbackName || loc.name;
      var parts = [nameToUse];
      if (loc.address && loc.address !== 'N/A') parts.push(loc.address);
      else if (loc.city && loc.city !== 'N/A') parts.push(loc.city);
      if (loc.state && loc.state !== 'US') parts.push(loc.state);
      return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(parts.join(', '));
    }

    function isTotalSummaryRow(str) {
      if (!str) return false;
      var s = String(str).trim().toLowerCase();
      if (s === 'total' || s === 'grand total' || s === 'subtotal' || s === 'total sales' || s === 'total volume') return true;
      if (/^(total|subtotal|grand total)\s*[:\-\_]/i.test(s)) return true;
      if (/^(total|subtotal|grand total)\s+for\b/i.test(s)) return true;
      if (/^(total|subtotal|grand total)\s+with\b/i.test(s)) return true;
      return false;
    }

    filtered.forEach(function (loc, index) {
      var lat = parseFloat(loc.latitude);
      var lng = parseFloat(loc.longitude);
      var latLng = (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
      var addressHtml = formatLocationAddress(loc);

      var cleanName = escapeHtml(loc.name || '').replace(/\s*#\d+/g, '').trim();
      if (!cleanName || /^\d+(\.\d+)?$/.test(cleanName) || isTotalSummaryRow(cleanName)) {
        if (loc.bottlings && loc.bottlings !== 'Casa Mexico Tequila') {
          cleanName = escapeHtml(loc.bottlings);
        } else if (loc.territory || loc.tabName) {
          cleanName = escapeHtml(loc.territory || loc.tabName);
        } else {
          cleanName = 'Casa Mexico Location';
        }
      }

      var directionsUrl = buildDirectionsUrl(loc, cleanName);
      var typeLabel = loc.type === 'retail' ? 'RETAIL' : 'BAR & RESTAURANT';

      if (latLng) {
        bounds.extend(latLng);

        var markerOptions = { title: cleanName };
        if (pinIcon) markerOptions.icon = pinIcon;

        var marker = L.marker(latLng, markerOptions);
        var popupHtml = '<div class="cmx-l5m-leaflet-popup">' +
          '<div class="cmx-l5m-popup-title">' + cleanName + '</div>' +
          '<div class="cmx-l5m-popup-address">' + addressHtml + '</div>' +
          (loc.bottlings ? '<div class="cmx-l5m-bottlings-tag"><i class="fa-solid fa-glass-martini-alt"></i> <strong>Product:</strong> ' + escapeHtml(loc.bottlings) + '</div>' : '') +
          (loc.cases ? '<div class="cmx-l5m-cases-badge"><i class="fa-solid fa-box"></i> <strong>Sales Volume:</strong> ' + loc.cases + ' Cases</div>' : '') +
          '<a href="' + directionsUrl + '" target="_blank" rel="noopener" class="cmx-l5m-popup-btn"><i class="fa-solid fa-diamond-turn-right"></i> GET DIRECTIONS</a>' +
          '</div>';

        marker.bindPopup(popupHtml);
        markersGroup.addLayer(marker);
        locationMarkers.push({ id: loc.id || index, marker: marker, location: loc });
      }

      if (sidebarContainer) {
        var card = document.createElement('div');
        card.className = 'cmx-l5m-store-card';
        card.setAttribute('data-index', index);

        var typeIconHtml = loc.type === 'retail'
          ? '<i class="fa-regular fa-bookmark"></i> '
          : '<i class="fa-solid fa-utensils"></i> ';

        card.innerHTML =
          '<div class="cmx-l5m-card-main">' +
            '<div class="cmx-l5m-card-title">' + cleanName + '</div>' +
            '<div class="cmx-l5m-card-address">' + addressHtml + '</div>' +
          '</div>' +
          '<div class="cmx-l5m-card-footer">' +
            '<span class="cmx-l5m-card-type">' + typeIconHtml + typeLabel + '</span>' +
            '<a href="' + directionsUrl + '" target="_blank" rel="noopener" class="cmx-l5m-card-dir"><i class="fa-solid fa-diamond-turn-right"></i> GET DIRECTIONS</a>' +
          '</div>';

        if (latLng) {
          card.addEventListener('click', function () {
            document.querySelectorAll('.cmx-l5m-store-card').forEach(function (c) { c.classList.remove('cmx-l5m-active'); });
            card.classList.add('cmx-l5m-active');
            map.setView(latLng, 15, { animate: true });
            var found = locationMarkers.find(function (m) { return m.id === (loc.id || index); });
            if (found && found.marker) found.marker.openPopup();
          });
        }

        sidebarContainer.appendChild(card);
      }
    });

    setTimeout(function () {
      if (map) {
        map.invalidateSize();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 });
        }
      }
    }, 150);
  }

  function renderTable(filtered) {
    var tableBody = document.getElementById('cmx-l5m-table-body');
    var tableWrap = document.getElementById('cmx-l5m-table-view');
    if (!tableBody) return;

    var existingPagination = document.getElementById('cmx-l5m-table-pagination');
    if (existingPagination) existingPagination.remove();

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="cmx-l5m-no-results">No store records matching search criteria.</td></tr>';
      return;
    }

    var totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var startIndex = (currentPage - 1) * itemsPerPage;
    var endIndex = startIndex + itemsPerPage;
    var pageItems = filtered.slice(startIndex, endIndex);

    var html = '';
    pageItems.forEach(function (loc) {
      var typeBadgeClass = loc.type === 'retail' ? 'cmx-l5m-badge-retail' : 'cmx-l5m-badge-bar-restaurant';
      var typeBadgeLabel = loc.type === 'retail' ? 'RETAIL' : 'BAR & RESTAURANT';
      var parts = [loc.name];
      if (loc.address && loc.address !== 'N/A') parts.push(loc.address);
      else if (loc.city && loc.city !== 'N/A') parts.push(loc.city);
      if (loc.state && loc.state !== 'US') parts.push(loc.state);
      var directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(parts.join(', '));
      var tName = loc._cleanTabName || getTabName(loc);
      var cityStateStr = [loc.city, loc.state].filter(function (x) { return x && x !== 'N/A' && x !== 'US'; }).join(', ') + (loc.postalCode ? ' ' + escapeHtml(loc.postalCode) : '');

      html += '<tr>' +
        '<td><strong>' + escapeHtml(loc.name) + '</strong></td>' +
        '<td>' + escapeHtml(loc.address || '—') + '</td>' +
        '<td>' + (cityStateStr ? escapeHtml(cityStateStr) : '—') + '</td>' +
        '<td><span class="cmx-l5m-badge ' + typeBadgeClass + '">' + typeBadgeLabel + '</span></td>' +
        '<td><span class="cmx-l5m-bottlings-tag">' + escapeHtml(loc.bottlings || 'N/A') + '</span></td>' +
        '<td>' + (loc.cases ? '<strong><i class="fa-solid fa-box"></i> ' + loc.cases + '</strong>' : '-') + '</td>' +
        '<td><span class="cmx-l5m-tab-pill">' + escapeHtml(tName) + '</span></td>' +
        '<td><a href="' + directionsUrl + '" target="_blank" rel="noopener" class="cmx-l5m-table-btn"><i class="fa-solid fa-diamond-turn-right"></i> Directions</a></td>' +
        '</tr>';
    });

    tableBody.innerHTML = html;

    if (tableWrap) {
      var pagBar = document.createElement('div');
      pagBar.id = 'cmx-l5m-table-pagination';
      pagBar.className = 'cmx-l5m-pagination-bar';
      pagBar.innerHTML =
        '<div class="cmx-l5m-pagination-info">Showing Page <strong>' + currentPage + '</strong> of <strong>' + totalPages + '</strong> (' + filtered.length + ' stores)</div>' +
        '<div class="cmx-l5m-pagination-controls">' +
          '<div class="cmx-l5m-per-page-wrap"><label for="cmx-l5m-per-page-select">Per Page:</label>' +
          '<select id="cmx-l5m-per-page-select" class="cmx-l5m-page-size-select">' +
            '<option value="15"' + (itemsPerPage === 15 ? ' selected' : '') + '>15</option>' +
            '<option value="25"' + (itemsPerPage === 25 ? ' selected' : '') + '>25</option>' +
            '<option value="50"' + (itemsPerPage === 50 ? ' selected' : '') + '>50</option>' +
            '<option value="100"' + (itemsPerPage === 100 ? ' selected' : '') + '>100</option>' +
          '</select></div>' +
          '<div class="cmx-l5m-page-btns">' +
            '<button type="button" id="cmx-l5m-prev-btn" class="cmx-l5m-page-btn"' + (currentPage <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i> Previous</button>' +
            '<button type="button" id="cmx-l5m-next-btn" class="cmx-l5m-page-btn"' + (currentPage >= totalPages ? ' disabled' : '') + '>Next <i class="fa-solid fa-chevron-right"></i></button>' +
          '</div>' +
        '</div>';
      tableWrap.appendChild(pagBar);

      var prevBtn = document.getElementById('cmx-l5m-prev-btn');
      var nextBtn = document.getElementById('cmx-l5m-next-btn');
      var perPageSelect = document.getElementById('cmx-l5m-per-page-select');

      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          if (currentPage > 1) {
            currentPage--;
            renderMapAndSidebar();
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (currentPage < totalPages) {
            currentPage++;
            renderMapAndSidebar();
          }
        });
      }

      if (perPageSelect) {
        perPageSelect.addEventListener('change', function () {
          itemsPerPage = parseInt(this.value, 10) || 25;
          currentPage = 1;
          renderMapAndSidebar();
        });
      }
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLocatorMap);
  } else {
    initLocatorMap();
  }
}());
