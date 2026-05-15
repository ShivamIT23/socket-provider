<?php
include 'check.php'; // session + $adminid + $con

if (!isset($_GET['code'])) {
    die("No code received");
}

$app_id = '706252045523219';
$app_secret = 'dfd26c88113e7715e0a32a949ab031ce';
$redirect_uri = 'https://lead.technologyxtend.com/fb_callback.php';
$code = $_GET['code'];


/**
 * STEP 1: Exchange code → user access token
 */
$token_url = "https://graph.facebook.com/v25.0/oauth/access_token?" . http_build_query([
    'client_id' => $app_id,
    'redirect_uri' => $redirect_uri,
    'client_secret' => $app_secret,
    'code' => $code
]);

$response = file_get_contents($token_url);
$data = json_decode($response, true);

if (!isset($data['access_token'])) {
    die("Error getting access token: " . json_encode($data));
}

$user_token = $data['access_token'];

/**
 * STEP 2: Convert to long-lived token
 */
$long_url = "https://graph.facebook.com/v25.0/oauth/access_token?" . http_build_query([
    'grant_type' => 'fb_exchange_token',
    'client_id' => $app_id,
    'client_secret' => $app_secret,
    'fb_exchange_token' => $user_token
]);

$long_response = file_get_contents($long_url);
$long_data = json_decode($long_response, true);

if (!isset($long_data['access_token'])) {
    die("Error getting long-lived token: " . json_encode($long_data));
}

$long_user_token = $long_data['access_token'];

/**
 * STEP 2.5: CHECK PERMISSIONS (CRITICAL)
 */
$perm_url = "https://graph.facebook.com/me/permissions?access_token=$long_user_token";
$perm_response = file_get_contents($perm_url);
$perm_data = json_decode($perm_response, true);

// Log permissions
file_put_contents("perm_log.txt", $perm_response);

$has_meta = false;

if (isset($perm_data['data'])) {
    foreach ($perm_data['data'] as $perm) {
        if ($perm['permission'] == 'pages_manage_metadata' && $perm['status'] == 'granted') {
            $has_meta = true;
        }
    }
}

if (!$has_meta) {
    die("❌ pages_manage_metadata NOT granted. Please re-login.");
}

/**
 * STEP 3: Get Pages
 */
$pages_url = "https://graph.facebook.com/v25.0/me/accounts?access_token=$long_user_token";
$pages_response = file_get_contents($pages_url);
$pages = json_decode($pages_response, true);

file_put_contents("pages_log.txt", json_encode($pages, JSON_PRETTY_PRINT));

if (!isset($pages['data']) || empty($pages['data'])) {
    die("No pages found");
}

/**
 * STEP 4: SELECT CORRECT PAGE
 */
$page = null;

foreach ($pages['data'] as $p) {
    if (isset($p['tasks']) && in_array('MANAGE', $p['tasks'])) {
        $page = $p;
        break;
    }
}

// fallback
if (!$page) {
    $page = $pages['data'][0];
}

$page_id = mysqli_real_escape_string($con, $page['id']);
$page_token = mysqli_real_escape_string($con, $page['access_token']);
$page_name = mysqli_real_escape_string($con, $page['name']);

/**
 * STEP 5: SAVE IN DB
 */
$sql = "UPDATE `25_settings`
        SET fbaccess_token='$page_token',
            facebookpageid='$page_id'
        WHERE adminid='$adminid'";

if (!mysqli_query($con, $sql)) {
    die('DB Error: ' . mysqli_error($con));
}

/**
 * STEP 6: SUBSCRIBE PAGE TO WEBHOOK
 */
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => "https://graph.facebook.com/v25.0/$page_id/subscribed_apps",
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query([
        'access_token' => $page_token
    ]),
    CURLOPT_RETURNTRANSFER => true
]);

$subscribe_response = curl_exec($ch);
curl_close($ch);

// Log response
file_put_contents("fb_subscribe_log.txt", $subscribe_response);

// Log response
file_put_contents("fb_subscribe_log.txt", $subscribe_response);

/**
 * STEP 7: SUCCESS REDIRECT
 */
header("Location: integration?msg=facebook_connected");
exit;
?>