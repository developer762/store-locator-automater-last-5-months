<?php
/**
 * Plugin Name: Casa Mexico Store Locator (Last 5 Months)
 * Description: Caches the Casa Mexico Google Sheets locator feed, defaults to Last 5 Months data with a Month/Year selector, and exposes it to the front end.
 * Version: 1.2.0
 * Author: Casa Mexico
 * License: GPL-2.0-or-later
 * Text Domain: last-5-month-store-locator
 */

if (!defined('ABSPATH')) {
    exit;
}

const CMX_L5M_LOCATOR_OPTION = 'last_5_month_locator_options';
const CMX_L5M_LOCATOR_CRON = 'last_5_month_locator_cron';
const CMX_L5M_LOCATOR_FILENAME = 'casa-mexico-last-5-month-locations.json';
const CMX_L5M_DEFAULT_MONTHS_WINDOW = 5;

register_activation_hook(__FILE__, 'cmx_l5m_locator_activate');
register_deactivation_hook(__FILE__, 'cmx_l5m_locator_deactivate');

add_filter('cron_schedules', 'cmx_l5m_locator_cron_schedules');
add_action(CMX_L5M_LOCATOR_CRON, 'cmx_l5m_locator_sync');
add_action('admin_menu', 'cmx_l5m_locator_admin_menu');
add_action('admin_init', 'cmx_l5m_locator_register_settings');
add_action('admin_init', 'cmx_l5m_locator_ensure_scheduled');
add_action('init', 'cmx_l5m_locator_ensure_scheduled');
add_action('rest_api_init', 'cmx_l5m_locator_register_rest_routes');
add_action('admin_post_cmx_l5m_locator_save_and_sync', 'cmx_l5m_locator_save_and_sync');
add_action('admin_post_cmx_l5m_locator_sync_now', 'cmx_l5m_locator_save_and_sync');
add_action('wp_enqueue_scripts', 'cmx_l5m_locator_enqueue_config');
add_shortcode('casa_mexico_locator_last_5_month', 'cmx_l5m_locator_shortcode');

function cmx_l5m_locator_defaults()
{
    return array(
        'endpoint' => 'https://script.google.com/macros/s/AKfycbz8pQv5oekeeTT35zyE22mPqczBBeWI6facsR9vs62jUCzv-kC4eiDxKyYf43nvx9Faew/exec',
        'minimum_locations' => 50,
        'last_sync_at' => '',
        'last_count' => 0,
        'last_5m_count' => 0,
        'last_error' => '',
    );
}

function cmx_l5m_locator_options()
{
    wp_cache_delete(CMX_L5M_LOCATOR_OPTION, 'options');
    return wp_parse_args(get_option(CMX_L5M_LOCATOR_OPTION, array()), cmx_l5m_locator_defaults());
}

function cmx_l5m_locator_ensure_scheduled()
{
    if (!wp_next_scheduled(CMX_L5M_LOCATOR_CRON)) {
        wp_schedule_event(time() + 60, 'cmx_l5m_fifteen_minutes', CMX_L5M_LOCATOR_CRON);
    }
}

function cmx_l5m_locator_activate()
{
    cmx_l5m_locator_ensure_scheduled();
    cmx_l5m_locator_sync();
}

function cmx_l5m_locator_deactivate()
{
    wp_clear_scheduled_hook(CMX_L5M_LOCATOR_CRON);
}

function cmx_l5m_locator_cron_schedules($schedules)
{
    $schedules['cmx_l5m_fifteen_minutes'] = array(
        'interval' => 15 * MINUTE_IN_SECONDS,
        'display' => __('Every 15 minutes (Last 5 Months Locator)', 'last-5-month-store-locator'),
    );
    return $schedules;
}

function cmx_l5m_locator_month_token_map()
{
    return array(
        'jan' => 1, 'january' => 1,
        'feb' => 2, 'february' => 2,
        'mar' => 3, 'march' => 3,
        'apr' => 4, 'april' => 4,
        'may' => 5,
        'jun' => 6, 'june' => 6,
        'jul' => 7, 'july' => 7,
        'aug' => 8, 'august' => 8,
        'sep' => 9, 'sept' => 9, 'september' => 9,
        'oct' => 10, 'october' => 10,
        'nov' => 11, 'november' => 11,
        'dec' => 12, 'december' => 12,
    );
}

function cmx_l5m_locator_build_month_meta($year, $month)
{
    $year = (int) $year;
    $month = (int) $month;
    if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
        return null;
    }
    $names = array(
        1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April',
        5 => 'May', 6 => 'June', 7 => 'July', 8 => 'August',
        9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
    );
    return array(
        'year' => $year,
        'month' => $month,
        'key' => sprintf('%04d-%02d', $year, $month),
        'label' => $names[$month] . ' ' . $year,
        'index' => ($year * 12) + ($month - 1),
    );
}

function cmx_l5m_locator_parse_month_text($text)
{
    if (!is_string($text) || trim($text) === '') {
        return null;
    }
    $map = cmx_l5m_locator_month_token_map();

    if (preg_match('/(?:^|[^a-z])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=[^a-z]|$)[\s\-_.,]*(20\d{2})(?!\d)/i', $text, $m)) {
        $mon = isset($map[strtolower($m[1])]) ? $map[strtolower($m[1])] : 0;
        return cmx_l5m_locator_build_month_meta((int) $m[2], $mon);
    }

    if (preg_match('/(?:^|[^0-9])(20\d{2})[\s\-_.,]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=[^a-z]|$)/i', $text, $m)) {
        $mon = isset($map[strtolower($m[2])]) ? $map[strtolower($m[2])] : 0;
        return cmx_l5m_locator_build_month_meta((int) $m[1], $mon);
    }

    return null;
}

function cmx_l5m_locator_parse_date_str($date_str)
{
    if (!is_string($date_str)) {
        return null;
    }
    $s = trim($date_str);
    if ($s === '') {
        return null;
    }

    if (preg_match('/^(20\d{2})[\/\-\.](\d{1,2})(?:[\/\-\.]\d{1,2})?(?:\b|$)/', $s, $m)) {
        return cmx_l5m_locator_build_month_meta((int) $m[1], (int) $m[2]);
    }

    if (preg_match('/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/', $s, $m)) {
        $p1 = (int) $m[1];
        $p2 = (int) $m[2];
        $yr = (int) $m[3];
        if ($yr < 100) {
            $yr += 2000;
        }
        $mon = $p1;
        if ($mon > 12 && $p2 >= 1 && $p2 <= 12) {
            $mon = $p2;
        }
        return cmx_l5m_locator_build_month_meta($yr, $mon);
    }

    $text_meta = cmx_l5m_locator_parse_month_text($s);
    if ($text_meta !== null) {
        return $text_meta;
    }

    if (preg_match('/[a-zA-Z]{3,}/', $s) || strpos($s, 'T') !== false) {
        $clean = preg_replace('/\s*\([^)]*\)\s*$/', '', $s);
        $ts = strtotime($clean);
        if ($ts !== false) {
            return cmx_l5m_locator_build_month_meta((int) gmdate('Y', $ts), (int) gmdate('n', $ts));
        }
    }

    return null;
}

function cmx_l5m_locator_extract_month_info($location)
{
    if (!is_array($location)) {
        return null;
    }
    if (!empty($location['date'])) {
        $from_date = cmx_l5m_locator_parse_date_str((string) $location['date']);
        if ($from_date !== null) {
            return $from_date;
        }
    }
    if (!empty($location['tabName'])) {
        return cmx_l5m_locator_parse_month_text((string) $location['tabName']);
    }
    return null;
}

function cmx_l5m_locator_is_within_last_n_months($month_index, $months_window = CMX_L5M_DEFAULT_MONTHS_WINDOW)
{
    if ($month_index === null) {
        return false;
    }
    $now_year = (int) current_time('Y');
    $now_month = (int) current_time('n');
    $current_month_index = ($now_year * 12) + ($now_month - 1);
    $min_month_index = $current_month_index - (max(1, (int) $months_window) - 1);
    return $month_index >= $min_month_index && $month_index <= $current_month_index;
}

function cmx_l5m_locator_filter_period($locations, $period = 'last_5_months', $months_window = CMX_L5M_DEFAULT_MONTHS_WINDOW)
{
    if (!is_array($locations)) {
        return array();
    }
    if ($period === 'all') {
        return $locations;
    }
    $filtered = array();
    foreach ($locations as $location) {
        $meta = cmx_l5m_locator_extract_month_info($location);
        if ($meta === null) {
            continue;
        }
        if ($period === 'last_5_months') {
            if (cmx_l5m_locator_is_within_last_n_months($meta['index'], $months_window)) {
                $filtered[] = $location;
            }
        } elseif ($meta['key'] === $period) {
            $filtered[] = $location;
        }
    }
    return $filtered;
}

function cmx_l5m_locator_sync()
{
    $options = cmx_l5m_locator_options();
    $endpoint = trim($options['endpoint']);
    if (!$endpoint) {
        return cmx_l5m_locator_record_error('The Apps Script endpoint is not configured.');
    }

    $sync_url = add_query_arg(array(
        'nocache' => '1',
        'fresh' => '1',
        '_t' => time(),
    ), $endpoint);

    $response = wp_remote_get($sync_url, array(
        'timeout' => 45,
        'redirection' => 10,
        'sslverify' => false,
        'user-agent' => 'WordPress/Last5MonthStoreLocator-1.2.0; ' . get_bloginfo('url'),
        'headers' => array(
            'Accept' => 'application/json',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
        ),
    ));
    if (is_wp_error($response)) {
        return cmx_l5m_locator_record_error($response->get_error_message());
    }

    $status = wp_remote_retrieve_response_code($response);
    if ($status !== 200) {
        return cmx_l5m_locator_record_error('Feed returned HTTP ' . $status . ' from Apps Script endpoint.');
    }

    $body = wp_remote_retrieve_body($response);
    $payload = json_decode($body, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)) {
        return cmx_l5m_locator_record_error('Feed response is not valid JSON.');
    }

    $validated = cmx_l5m_locator_validate_payload($payload, (int) $options['minimum_locations']);
    if (is_wp_error($validated)) {
        return cmx_l5m_locator_record_error($validated->get_error_message());
    }

    $upload = wp_upload_dir();
    if (!empty($upload['error'])) {
        return cmx_l5m_locator_record_error($upload['error']);
    }

    $path = trailingslashit($upload['basedir']) . CMX_L5M_LOCATOR_FILENAME;
    $backup = $path . '.bak';
    $temporary = $path . '.tmp';

    $last_5m = cmx_l5m_locator_filter_period($validated, 'last_5_months', CMX_L5M_DEFAULT_MONTHS_WINDOW);

    $payload['locations'] = $validated;
    $payload['count'] = count($validated);
    $payload['last5MonthsCount'] = count($last_5m);

    $json = wp_json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || file_put_contents($temporary, $json, LOCK_EX) === false) {
        return cmx_l5m_locator_record_error('Could not write the temporary locator feed.');
    }

    if (file_exists($path) && !copy($path, $backup)) {
        @unlink($temporary);
        return cmx_l5m_locator_record_error('Could not back up the previous locator feed.');
    }
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        return cmx_l5m_locator_record_error('Could not replace the cached locator feed.');
    }

    $options['last_sync_at'] = gmdate('c');
    $options['last_count'] = count($validated);
    $options['last_5m_count'] = count($last_5m);
    $options['last_error'] = '';
    update_option(CMX_L5M_LOCATOR_OPTION, $options);
    do_action('cmx_l5m_locator_sync_complete', $payload, $path);

    return count($validated);
}

function cmx_l5m_locator_validate_payload($payload, $minimum)
{
    if (!is_array($payload) || !empty($payload['error']) || !isset($payload['locations']) || !is_array($payload['locations'])) {
        return new WP_Error('invalid_payload', 'The endpoint did not return a valid locator payload.');
    }

    $valid_locations = array();
    foreach ($payload['locations'] as $location) {
        if (!is_array($location) || empty($location['name'])) {
            continue;
        }
        $lat_raw = isset($location['latitude']) ? $location['latitude'] : 0;
        $lng_raw = isset($location['longitude']) ? $location['longitude'] : 0;
        $latitude = filter_var($lat_raw, FILTER_VALIDATE_FLOAT);
        $longitude = filter_var($lng_raw, FILTER_VALIDATE_FLOAT);

        if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            continue;
        }
        $valid_locations[] = $location;
    }

    if (count($valid_locations) < max(1, $minimum)) {
        return new WP_Error('below_floor', sprintf('The feed contained only %d valid locations (fewer than required minimum of %d). Existing map preserved.', count($valid_locations), max(1, $minimum)));
    }

    return $valid_locations;
}

function cmx_l5m_locator_record_error($message)
{
    $options = cmx_l5m_locator_options();
    $options['last_error'] = sanitize_text_field($message);
    update_option(CMX_L5M_LOCATOR_OPTION, $options);
    error_log('Last 5 Month Store Locator sync: ' . $message);
    return new WP_Error('cmx_l5m_locator_sync_failed', $message);
}

function cmx_l5m_locator_feed_url()
{
    $upload = wp_upload_dir();
    return trailingslashit($upload['baseurl']) . CMX_L5M_LOCATOR_FILENAME;
}

function cmx_l5m_locator_feed_path()
{
    $upload = wp_upload_dir();
    return trailingslashit($upload['basedir']) . CMX_L5M_LOCATOR_FILENAME;
}

function cmx_l5m_locator_register_rest_routes()
{
    register_rest_route('last-5-month-locator/v1', '/feed', array(
        'methods' => 'GET',
        'callback' => 'cmx_l5m_locator_rest_get_feed',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('last-5-month-locator/v1', '/sync', array(
        'methods' => array('GET', 'POST'),
        'callback' => 'cmx_l5m_locator_rest_trigger_sync',
        'permission_callback' => 'cmx_l5m_locator_rest_sync_permissions',
    ));
}

function cmx_l5m_locator_rest_get_feed($request = null)
{
    $path = cmx_l5m_locator_feed_path();
    if (!file_exists($path)) {
        cmx_l5m_locator_sync();
    }
    if (file_exists($path)) {
        $content = file_get_contents($path);
        $data = json_decode($content, true);
        if ($data && isset($data['locations']) && is_array($data['locations'])) {
            $period = ($request instanceof WP_REST_Request) ? sanitize_text_field((string) $request->get_param('period')) : '';
            if ($period !== '' && $period !== 'all') {
                $filtered = cmx_l5m_locator_filter_period($data['locations'], $period, CMX_L5M_DEFAULT_MONTHS_WINDOW);
                $data['locations'] = array_values($filtered);
                $data['count'] = count($data['locations']);
                $data['periodFilter'] = $period;
            }
            return rest_ensure_response($data);
        }
    }
    return new WP_Error('no_feed', 'Locator feed JSON file not found.', array('status' => 404));
}

function cmx_l5m_locator_rest_sync_permissions($request)
{
    if (current_user_can('manage_options')) {
        return true;
    }
    $options = cmx_l5m_locator_options();
    $token_param = $request->get_param('token');
    if (!empty($token_param) && !empty($options['endpoint']) && strpos($options['endpoint'], $token_param) !== false) {
        return true;
    }
    return new WP_Error('rest_forbidden', 'Unauthorized sync request.', array('status' => 401));
}

function cmx_l5m_locator_rest_trigger_sync($request)
{
    $result = cmx_l5m_locator_sync();
    if (is_wp_error($result)) {
        return new WP_Error('sync_failed', $result->get_error_message(), array('status' => 500));
    }
    $options = cmx_l5m_locator_options();
    return rest_ensure_response(array(
        'success' => true,
        'message' => 'Last 5 Month locator feed synchronized successfully.',
        'count' => $result,
        'last5MonthsCount' => (int) $options['last_5m_count'],
    ));
}

function cmx_l5m_locator_enqueue_config()
{
    $options = cmx_l5m_locator_options();
    $path = cmx_l5m_locator_feed_path();
    if (!file_exists($path)) {
        cmx_l5m_locator_sync();
        $options = cmx_l5m_locator_options();
    }

    $default_endpoint = 'https://script.google.com/macros/s/AKfycbz8pQv5oekeeTT35zyE22mPqczBBeWI6facsR9vs62jUCzv-kC4eiDxKyYf43nvx9Faew/exec';
    $direct_endpoint = !empty($options['endpoint']) ? $options['endpoint'] : $default_endpoint;

    wp_enqueue_script(
        'cmx-l5m-locator-feed',
        plugins_url('assets/locator-feed.js', __FILE__),
        array(),
        filemtime(plugin_dir_path(__FILE__) . 'assets/locator-feed.js'),
        true
    );
    wp_localize_script('cmx-l5m-locator-feed', 'CMX_L5M_LOCATOR', array(
        'url' => add_query_arg('v', rawurlencode((string) $options['last_sync_at']), cmx_l5m_locator_feed_url()),
        'restUrl' => esc_url_raw(rest_url('last-5-month-locator/v1/feed')),
        'directEndpoint' => esc_url_raw($direct_endpoint),
        'updatedAt' => $options['last_sync_at'],
        'count' => (int) $options['last_count'],
        'last5MonthsCount' => (int) $options['last_5m_count'],
        'defaultPeriod' => 'last_5_months',
        'monthsWindow' => CMX_L5M_DEFAULT_MONTHS_WINDOW,
    ));
}

function cmx_l5m_locator_enqueue_shortcode_assets()
{
    cmx_l5m_locator_enqueue_config();

    wp_enqueue_style(
        'font-awesome-6',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
        array(),
        '6.5.1'
    );

    wp_enqueue_style(
        'leaflet',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        array(),
        '1.9.4'
    );

    wp_enqueue_script(
        'leaflet',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        array(),
        '1.9.4',
        true
    );

    wp_enqueue_style(
        'cmx-l5m-locator-map',
        plugins_url('assets/locator-map.css', __FILE__),
        array('leaflet', 'font-awesome-6'),
        filemtime(plugin_dir_path(__FILE__) . 'assets/locator-map.css')
    );

    wp_enqueue_script(
        'cmx-l5m-locator-map',
        plugins_url('assets/locator-map.js', __FILE__),
        array('leaflet', 'cmx-l5m-locator-feed'),
        filemtime(plugin_dir_path(__FILE__) . 'assets/locator-map.js'),
        true
    );
}

function cmx_l5m_locator_shortcode($atts = array())
{
    cmx_l5m_locator_enqueue_shortcode_assets();

    ob_start();
    ?>
    <div class="cmx-l5m-locator-wrap">
        <!-- Header Row with Title, Month/Period Selector and View Tabs -->
        <div class="cmx-l5m-header-row">
            <h2 class="cmx-l5m-page-title">Casa Mexico Store Locator</h2>
            <div class="cmx-l5m-header-controls">
                <div class="cmx-l5m-month-filter-wrap" title="Filter store locations by Last 5 Months or specific Month &amp; Year">
                    <i class="fa-regular fa-calendar cmx-l5m-month-icon" aria-hidden="true"></i>
                    <select id="cmx-l5m-month-select" class="cmx-l5m-select cmx-l5m-select-month" aria-label="Filter by month">
                        <option value="last_5_months" selected>Last 5 Months</option>
                    </select>
                </div>
                <div class="cmx-l5m-view-toggle">
                    <button type="button" id="cmx-l5m-view-map-btn" class="cmx-l5m-toggle-btn cmx-l5m-active" title="Map View"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Store Locator</button>
                    <button type="button" id="cmx-l5m-view-sales-btn" class="cmx-l5m-toggle-btn" title="Sales Data Analytics"><i class="fa-solid fa-chart-column" aria-hidden="true"></i> Sales Data</button>
                    <button type="button" id="cmx-l5m-view-table-btn" class="cmx-l5m-toggle-btn" title="Data Grid Table"><i class="fa-solid fa-table-list" aria-hidden="true"></i> Data Table</button>
                </div>
            </div>
        </div>

        <div id="cmx-l5m-split-view" class="cmx-l5m-locator-body">
            <!-- Left Sidebar Controls & Store Directory List -->
            <div class="cmx-l5m-sidebar">
                <div class="cmx-l5m-sidebar-header">
                    <div class="cmx-l5m-search-box">
                        <i class="fa-solid fa-magnifying-glass cmx-l5m-search-icon" aria-hidden="true"></i>
                        <input type="text" id="cmx-l5m-search-input" class="cmx-l5m-search-input" placeholder="Search by name, city, state or zip...">
                    </div>
                    
                    <button type="button" id="cmx-l5m-use-location-btn" class="cmx-l5m-btn-location"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i> USE MY LOCATION</button>
                    
                    <div class="cmx-l5m-type-pills" role="group" aria-label="Premise type filters">
                        <button type="button" class="cmx-l5m-type-pill active" data-type="">ALL</button>
                        <button type="button" class="cmx-l5m-type-pill" data-type="retail">RETAIL</button>
                        <button type="button" class="cmx-l5m-type-pill" data-type="bar-restaurant">BAR &amp; RESTAURANT</button>
                    </div>

                    <div class="cmx-l5m-filter-dropdowns">
                        <select id="cmx-l5m-tab-select" class="cmx-l5m-select cmx-l5m-select-tab">
                            <option value="">All Sheet Tabs</option>
                        </select>
                        <select id="cmx-l5m-state-select" class="cmx-l5m-select cmx-l5m-select-state">
                            <option value="">All States</option>
                        </select>
                        <select id="cmx-l5m-sort-select" class="cmx-l5m-select cmx-l5m-select-sort">
                            <option value="name-asc">Sort: Name (A-Z)</option>
                            <option value="name-desc">Sort: Name (Z-A)</option>
                            <option value="cases-desc">Sort: Cases (High to Low)</option>
                            <option value="city-asc">Sort: City (A-Z)</option>
                        </select>
                    </div>

                    <div id="cmx-l5m-nearest-banner" class="cmx-l5m-nearest-banner" style="display: none;"></div>

                    <div id="cmx-l5m-count-badge" class="cmx-l5m-count-badge">SHOWING 0 OF 0 STORES</div>
                </div>

                <div id="cmx-l5m-sidebar-list" class="cmx-l5m-sidebar-list">
                    <div class="cmx-l5m-no-results">Loading Casa Mexico locations...</div>
                </div>
            </div>

            <!-- Right Side Interactive Leaflet Map -->
            <div class="cmx-l5m-map-container">
                <div id="cmx-l5m-map-canvas"></div>
            </div>
        </div>

        <!-- Sales Metrics Analytical View -->
        <div id="cmx-l5m-sales-view" class="cmx-l5m-sales-wrap" style="display: none;">
            <div class="cmx-l5m-sales-metrics">
                <div class="cmx-l5m-metric-card">
                    <div class="cmx-l5m-metric-label">Total Volume</div>
                    <div class="cmx-l5m-metric-value" id="cmx-l5m-sales-vol">-</div>
                    <div class="cmx-l5m-metric-sub">Cases across active period</div>
                </div>
                <div class="cmx-l5m-metric-card">
                    <div class="cmx-l5m-metric-label">Top Product</div>
                    <div class="cmx-l5m-metric-value" id="cmx-l5m-sales-top-prod">-</div>
                    <div class="cmx-l5m-metric-sub">Highest volume bottling</div>
                </div>
                <div class="cmx-l5m-metric-card">
                    <div class="cmx-l5m-metric-label">Active Markets</div>
                    <div class="cmx-l5m-metric-value" id="cmx-l5m-sales-markets">-</div>
                    <div class="cmx-l5m-metric-sub">States &amp; regional territories</div>
                </div>
            </div>
            <div id="cmx-l5m-sales-breakdown" class="cmx-l5m-sales-grid"></div>
        </div>

        <!-- Tabular Data View -->
        <div id="cmx-l5m-table-view" class="cmx-l5m-table-wrap" style="display: none;">
            <table class="cmx-l5m-data-table">
                <thead>
                    <tr>
                        <th>Store / Retailer Name</th>
                        <th>Address</th>
                        <th>City / State</th>
                        <th>Type</th>
                        <th>Products Stocked</th>
                        <th>Cases</th>
                        <th>Sheet Tab</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="cmx-l5m-table-body">
                    <tr><td colspan="8" class="cmx-l5m-no-results">Loading data table...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

function cmx_l5m_locator_admin_menu()
{
    add_options_page(
        'Last 5 Month Store Locator',
        'Last 5 Month Locator',
        'manage_options',
        'last-5-month-locator',
        'cmx_l5m_locator_settings_page'
    );
}

function cmx_l5m_locator_register_settings()
{
    register_setting('cmx_l5m_locator_sync', CMX_L5M_LOCATOR_OPTION, array(
        'sanitize_callback' => 'cmx_l5m_locator_sanitize_options',
    ));
}

function cmx_l5m_locator_sanitize_options($input)
{
    $current = cmx_l5m_locator_options();
    $current['endpoint'] = isset($input['endpoint']) ? esc_url_raw(trim($input['endpoint'])) : '';
    $current['minimum_locations'] = isset($input['minimum_locations']) ? max(1, absint($input['minimum_locations'])) : 50;
    return $current;
}

function cmx_l5m_locator_save_and_sync()
{
    if (!current_user_can('manage_options')) {
        wp_die('You do not have permission to sync the locator.');
    }
    check_admin_referer('cmx_l5m_locator_save_and_sync');

    $options = cmx_l5m_locator_options();
    if (isset($_POST['endpoint'])) {
        $options['endpoint'] = esc_url_raw(trim($_POST['endpoint']));
    }
    if (isset($_POST['minimum_locations'])) {
        $options['minimum_locations'] = max(1, absint($_POST['minimum_locations']));
    }
    update_option(CMX_L5M_LOCATOR_OPTION, $options);
    wp_cache_delete(CMX_L5M_LOCATOR_OPTION, 'options');

    $result = cmx_l5m_locator_sync();
    $status = is_wp_error($result) ? 'error' : 'success';
    $count = is_wp_error($result) ? 0 : (int) $result;
    wp_safe_redirect(add_query_arg(array('cmx_l5m_sync' => $status, 'cmx_l5m_count' => $count), admin_url('options-general.php?page=last-5-month-locator')));
    exit;
}

function cmx_l5m_locator_settings_page()
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $options = cmx_l5m_locator_options();
    $next_cron = wp_next_scheduled(CMX_L5M_LOCATOR_CRON);
    $logo_url = plugins_url('assets/logo-casa-mexico.svg', __FILE__);
    $published_count = isset($_GET['cmx_l5m_count']) ? absint($_GET['cmx_l5m_count']) : (int) $options['last_count'];
    ?>
    <div class="wrap">
        <h1 style="display: flex; align-items: center; gap: 12px;">
            <div style="background: #ffffff; padding: 4px 8px; border-radius: 8px; display: inline-flex; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <img src="<?php echo esc_url($logo_url); ?>" alt="Casa Mexico" style="height: 32px; width: auto; vertical-align: middle;">
            </div>
            <span>Casa Mexico Store Locator (Last 5 Months)</span>
        </h1>
        <?php if (isset($_GET['cmx_l5m_sync'])) : ?>
            <div class="notice notice-<?php echo $_GET['cmx_l5m_sync'] === 'success' ? 'success' : 'error'; ?> is-dismissible"><p>
                <?php echo $_GET['cmx_l5m_sync'] === 'success' ? sprintf('Locator sync completed successfully! (%d total stores cached, %d in Last 5 Months)', $published_count, (int) $options['last_5m_count']) : 'Sync failed: ' . esc_html(!empty($options['last_error']) ? $options['last_error'] : 'Could not fetch Apps Script payload. Please ensure Web App deployment access is set to "Anyone".'); ?>
            </p></div>
        <?php endif; ?>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="cmx_l5m_locator_save_and_sync">
            <?php wp_nonce_field('cmx_l5m_locator_save_and_sync'); ?>
            
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="cmx-l5m-endpoint">Apps Script Web App Endpoint</label></th>
                    <td>
                        <input id="cmx-l5m-endpoint" class="large-text" type="url" name="endpoint" value="<?php echo esc_attr($options['endpoint']); ?>" placeholder="https://script.google.com/macros/s/.../exec" required>
                        <p class="description">URL generated when deploying Google Apps Script Web App (Must end with <code>/exec</code>).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="cmx-l5m-minimum">Minimum location count safety floor</label></th>
                    <td>
                        <input id="cmx-l5m-minimum" type="number" min="1" name="minimum_locations" value="<?php echo esc_attr($options['minimum_locations']); ?>">
                        <p class="description">A feed with fewer valid locations than this number will be rejected to protect the live map from accidental sheet wipes.</p>
                    </td>
                </tr>
            </table>

            <p class="submit">
                <input type="submit" name="submit" id="submit" class="button button-primary" value="Save &amp; Sync Now">
            </p>
        </form>

        <h2>Sync Status &amp; Health Diagnostics</h2>
        <table class="widefat striped" style="max-width: 800px; margin-bottom: 20px;">
            <tbody>
                <tr>
                    <td><strong>Shortcode:</strong></td>
                    <td><code>[casa_mexico_locator_last_5_month]</code></td>
                </tr>
                <tr>
                    <td><strong>Automatic Sync Cron:</strong></td>
                    <td>
                        <?php if ($next_cron) : ?>
                            <span style="color: green; font-weight: bold;">Active</span> (Next run in <?php echo human_time_diff($next_cron); ?>)
                        <?php else : ?>
                            <span style="color: orange; font-weight: bold;">Auto-Healing</span> (Will reschedule on next page request)
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <td><strong>Last Successful Sync:</strong></td>
                    <td><?php echo esc_html($options['last_sync_at'] ? date('Y-m-d H:i:s T', strtotime($options['last_sync_at'])) : 'Never'); ?></td>
                </tr>
                <tr>
                    <td><strong>Last 5 Months Active Count:</strong></td>
                    <td><strong style="color: #0a7d4f; font-size: 1.1em;"><?php echo esc_html((string) $options['last_5m_count']); ?> stores</strong> (default view)</td>
                </tr>
                <tr>
                    <td><strong>Total Cached Sheet Count:</strong></td>
                    <td><strong style="color: #2271b1; font-size: 1.1em;"><?php echo esc_html((string) $options['last_count']); ?> stores</strong> (across all months)</td>
                </tr>
                <?php if ($options['last_error']) : ?>
                <tr>
                    <td><strong style="color: #d63638;">Last Reported Error:</strong></td>
                    <td><code style="color: #d63638;"><?php echo esc_html($options['last_error']); ?></code></td>
                </tr>
                <?php endif; ?>
                <tr>
                    <td><strong>Cached JSON Feed URL:</strong></td>
                    <td><code><a href="<?php echo esc_url(cmx_l5m_locator_feed_url()); ?>" target="_blank"><?php echo esc_html(cmx_l5m_locator_feed_url()); ?></a></code></td>
                </tr>
                <tr>
                    <td><strong>REST API Feed Endpoint (Full / Last 5 Months):</strong></td>
                    <td>
                        <code><a href="<?php echo esc_url(rest_url('last-5-month-locator/v1/feed')); ?>" target="_blank"><?php echo esc_html(rest_url('last-5-month-locator/v1/feed')); ?></a></code><br>
                        <code><a href="<?php echo esc_url(add_query_arg('period', 'last_5_months', rest_url('last-5-month-locator/v1/feed'))); ?>" target="_blank"><?php echo esc_html(add_query_arg('period', 'last_5_months', rest_url('last-5-month-locator/v1/feed'))); ?></a></code>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <?php
}
