(function () {
  'use strict';

  var DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz8pQv5oekeeTT35zyE22mPqczBBeWI6facsR9vs62jUCzv-kC4eiDxKyYf43nvx9Faew/exec';

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

  if (!window.CMX_L5M_LOCATOR) {
    window.CMX_L5M_LOCATOR = {};
  }

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

  function extractMonthInfo(loc) {
    if (!loc) return null;
    if (loc._monthMeta !== undefined) return loc._monthMeta;
    var meta = parseMonthYearFromDateStr(loc.date) || parseMonthYearFromText(loc.tabName) || null;
    loc._monthMeta = meta;
    return meta;
  }

  function isWithinLastNMonths(monthIndex, monthsWindow, refDate) {
    if (monthIndex === null || monthIndex === undefined) return false;
    var d = refDate || new Date();
    var n = monthsWindow || 5;
    var currentMonthIndex = (d.getFullYear() * 12) + d.getMonth();
    var minMonthIndex = currentMonthIndex - (n - 1);
    return monthIndex >= minMonthIndex && monthIndex <= currentMonthIndex;
  }

  function filterLocationsByPeriod(locations, period, monthsWindow, refDate) {
    if (!Array.isArray(locations)) return [];
    var mode = period || 'last_5_months';
    if (mode === 'all') return locations.slice();
    return locations.filter(function (loc) {
      var meta = extractMonthInfo(loc);
      if (!meta) return false;
      if (mode === 'last_5_months') {
        return isWithinLastNMonths(meta.index, monthsWindow || 5, refDate);
      }
      return meta.key === mode;
    });
  }

  window.CMX_L5M_LOCATOR.extractMonthInfo = extractMonthInfo;
  window.CMX_L5M_LOCATOR.isWithinLastNMonths = isWithinLastNMonths;
  window.CMX_L5M_LOCATOR.filterLocationsByPeriod = filterLocationsByPeriod;

  function parseAndEmit(payload) {
    if (!payload || !Array.isArray(payload.locations)) {
      throw new Error('Locator feed has an invalid shape.');
    }
    var monthsWindow = window.CMX_L5M_LOCATOR.monthsWindow || 5;
    var defaultPeriod = window.CMX_L5M_LOCATOR.defaultPeriod || 'last_5_months';
    var filtered = filterLocationsByPeriod(payload.locations, defaultPeriod, monthsWindow);

    window.CMX_L5M_LOCATOR.allLocations = payload.locations;
    window.CMX_L5M_LOCATOR.locations = filtered;

    var detail = {
      schemaVersion: payload.schemaVersion,
      generatedAt: payload.generatedAt,
      spreadsheetId: payload.spreadsheetId,
      periodFilter: defaultPeriod,
      count: filtered.length,
      fullCount: payload.locations.length,
      locations: filtered,
      allLocations: payload.locations
    };

    window.dispatchEvent(new CustomEvent('cmx-l5m:locations-ready', { detail: detail }));
    return detail;
  }

  window.CMX_L5M_LOCATOR.load = function () {
    var fetchUrl = window.CMX_L5M_LOCATOR.url || '';
    if (fetchUrl && fetchUrl.indexOf('_t=') === -1) {
      fetchUrl += (fetchUrl.indexOf('?') === -1 ? '?' : '&') + '_t=' + new Date().getTime();
    }
    var fetchOptions = {
      credentials: 'same-origin',
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    };

    var directUrl = window.CMX_L5M_LOCATOR.directEndpoint || DEFAULT_ENDPOINT;
    if (directUrl && directUrl.indexOf('nocache=') === -1) {
      directUrl += (directUrl.indexOf('?') === -1 ? '?' : '&') + 'nocache=1';
    }

    function fetchDirectFallback() {
      return fetch(directUrl)
        .then(function (res) {
          if (!res.ok) throw new Error('Direct endpoint HTTP ' + res.status);
          return res.json();
        });
    }

    if (!fetchUrl) {
      return fetchDirectFallback().then(parseAndEmit);
    }

    return fetch(fetchUrl, fetchOptions)
      .then(function (response) {
        if (!response.ok) {
          if (window.CMX_L5M_LOCATOR.restUrl) {
            var restUrl = window.CMX_L5M_LOCATOR.restUrl;
            if (restUrl.indexOf('_t=') === -1) {
              restUrl += (restUrl.indexOf('?') === -1 ? '?' : '&') + '_t=' + new Date().getTime();
            }
            return fetch(restUrl, fetchOptions)
              .then(function (restResp) {
                if (!restResp.ok) return fetchDirectFallback();
                return restResp.json();
              })
              .catch(function () {
                return fetchDirectFallback();
              });
          }
          return fetchDirectFallback();
        }
        return response.json();
      })
      .then(parseAndEmit)
      .catch(function () {
        return fetchDirectFallback().then(parseAndEmit);
      });
  };

  window.CMX_L5M_LOCATOR.load().catch(function (error) {
    window.dispatchEvent(new CustomEvent('cmx-l5m:locations-error', { detail: error }));
    if (window.console) console.error('Casa Mexico Last 5 Months locator:', error);
  });
}());
