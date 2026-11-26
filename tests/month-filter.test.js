const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'wordpress', 'last_5_month_store_locator');

function loadFeedHelperContext() {
  const events = [];
  const windowObj = {
    CMX_L5M_LOCATOR: {
      url: '',
      directEndpoint: 'https://example.com/exec',
      defaultPeriod: 'last_5_months',
      monthsWindow: 5,
    },
    dispatchEvent: (evt) => events.push(evt),
  };

  function CustomEvent(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }

  const context = {
    window: windowObj,
    CustomEvent,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ locations: [] }) }),
    console,
  };
  vm.createContext(context);
  const src = fs.readFileSync(path.join(PLUGIN_DIR, 'assets', 'locator-feed.js'), 'utf8');
  vm.runInContext(src, context, { filename: 'locator-feed.js' });
  return { locator: windowObj.CMX_L5M_LOCATOR, events };
}

test('Dashboard and plugin JS scripts have valid syntax', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(scriptMatch, 'Dashboard inline script must exist');
  new Function(scriptMatch[1]);

  for (const jsFile of ['locator-feed.js', 'locator-map.js']) {
    const jsSrc = fs.readFileSync(path.join(PLUGIN_DIR, 'assets', jsFile), 'utf8');
    new Function(jsSrc);
  }
});

test('Month/Year extraction handles tab names and multiple date formats without false positives', () => {
  const { locator } = loadFeedHelperContext();

  assert.equal(locator.extractMonthInfo({ tabName: 'October 2026', date: '' }).key, '2026-10');
  assert.equal(locator.extractMonthInfo({ tabName: 'October 2026', date: '' }).label, 'October 2026');
  assert.equal(locator.extractMonthInfo({ tabName: 'KS September 2026', date: '' }).key, '2026-09');
  assert.equal(locator.extractMonthInfo({ tabName: 'July 2026 NY-NJ', date: '' }).key, '2026-07');
  assert.equal(locator.extractMonthInfo({ tabName: 'TN Chattanooga', date: '07/31/26' }).key, '2026-07');
  assert.equal(locator.extractMonthInfo({ tabName: 'Blanco August 2026', date: 'Tue Aug 04 2026 12:30:00 GMT+0530' }).key, '2026-08');
  assert.equal(locator.extractMonthInfo({ tabName: 'Store Locator', date: '2026-11-05' }).key, '2026-11');

  // Ensure words like "Summary" or "Market 2026" do not falsely match "Mar"
  assert.equal(locator.extractMonthInfo({ tabName: 'MA-RI Summary 2026', date: '' }), null);
  assert.equal(locator.extractMonthInfo({ tabName: 'Market 2026 Overview', date: '' }), null);
  assert.equal(locator.extractMonthInfo({ tabName: 'Store Locator', date: '' }), null);
});

test('Last 5 Months filter keeps recent 5 months and excludes older or undated records', () => {
  const { locator } = loadFeedHelperContext();
  const refNov2026 = new Date(2026, 10, 26); // Nov 26, 2026 -> window: Jul 2026 .. Nov 2026

  const sampleLocations = [
    { id: '1', name: 'Nov Store', tabName: 'TX November 2026', date: '' },
    { id: '2', name: 'Oct Store', tabName: 'NY October 2026', date: '' },
    { id: '3', name: 'Sep Store', tabName: 'KS September 2026', date: '' },
    { id: '4', name: 'Aug Store', tabName: 'CA August 2026', date: '' },
    { id: '5', name: 'Jul Store', tabName: 'TN Chattanooga', date: '07/31/26' },
    { id: '6', name: 'Jun Store (Old)', tabName: 'TX June 2026', date: '' },
    { id: '7', name: 'May Store (Old)', tabName: 'FL May 2026', date: '' },
    { id: '8', name: 'Undated Summary', tabName: 'Store Locator', date: '' },
  ];

  const last5 = locator.filterLocationsByPeriod(sampleLocations, 'last_5_months', 5, refNov2026);
  assert.deepEqual(last5.map((l) => l.id), ['1', '2', '3', '4', '5']);

  const octOnly = locator.filterLocationsByPeriod(sampleLocations, '2026-10', 5, refNov2026);
  assert.deepEqual(octOnly.map((l) => l.id), ['2']);

  const all = locator.filterLocationsByPeriod(sampleLocations, 'all', 5, refNov2026);
  assert.equal(all.length, 8);
});

test('WordPress plugin files use isolated last_5_month identifiers with no conflicting symbols', () => {
  const phpPath = path.join(PLUGIN_DIR, 'last_5_month_store_locator.php');
  const feedPath = path.join(PLUGIN_DIR, 'assets', 'locator-feed.js');
  const mapPath = path.join(PLUGIN_DIR, 'assets', 'locator-map.js');
  const cssPath = path.join(PLUGIN_DIR, 'assets', 'locator-map.css');

  const combined = [phpPath, feedPath, mapPath, cssPath]
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');

  assert.ok(!/casa-mexico-locator-sync/.test(combined), 'Must not contain old plugin slug');
  assert.ok(!/\bCMX_LOCATOR\b/.test(combined), 'Must not contain conflicting global CMX_LOCATOR');
  assert.ok(!/\bcmx_locator_/.test(combined), 'Must not contain conflicting PHP function prefix cmx_locator_');
  assert.ok(!/\[casa_mexico_locator\]/.test(combined), 'Must not contain conflicting shortcode [casa_mexico_locator]');
  assert.ok(!/'cmx:locations-ready'/.test(combined), 'Must not emit conflicting event cmx:locations-ready');

  assert.ok(combined.includes('casa_mexico_locator_last_5_month'), 'Must register new shortcode');
  assert.ok(combined.includes('CMX_L5M_LOCATOR'), 'Must use isolated CMX_L5M_LOCATOR global');
  assert.ok(combined.includes('cmx-l5m:locations-ready'), 'Must emit isolated event cmx-l5m:locations-ready');
});
