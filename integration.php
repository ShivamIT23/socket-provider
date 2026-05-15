<?php include 'check.php';
$sessionid = date("ymdHis") . rand(10, 99);
$tbl_name = "25_settings";
$pageurl = "integration";
$pagename = "Lead Integration";
if ($admin == "1" || in_array($urlid, $checkpermission)) {

  $branchid = isset($_GET['branchid']) && $_GET['branchid'] !== "" ? $_GET['branchid'] : "0";
  $category = isset($_GET['category']) && $_GET['category'] !== "" ? $_GET['category'] : "0";
  $assignid = isset($_GET['assignid']) && $_GET['assignid'] !== "" ? $_GET['assignid'] : "0";


  if (isset($_GET['mode']) && $_GET['mode'] === "metaad" && !empty($_POST['fbuser_token'])) {

    // ✅ Sanitize inputs
    $fbuser_token = mysqli_real_escape_string($con, $_POST['fbuser_token']);
    $fbaccess_token = mysqli_real_escape_string($con, $_POST['fbaccess_token']);
    $facebookpageid = mysqli_real_escape_string($con, $_POST['facebookpageid']);
    $instapageid = mysqli_real_escape_string($con, $_POST['instapageid']);

    $check_url = "https://graph.facebook.com/v25.0/me?access_token=$fbuser_token";
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $check_url,
    CURLOPT_RETURNTRANSFER => true
]);
$check = curl_exec($ch);
curl_close($ch);
$check_data = json_decode($check, true);

if (isset($check_data['error'])) {
    die("Invalid Facebook token");
}


    // ✅ Update DB (same structure)
    $sql = "UPDATE `$tbl_name` 
            SET fbuser_token='$fbuser_token',
                fbaccess_token='$fbaccess_token',
                facebookpageid='$facebookpageid',
                instapageid='$instapageid'
            WHERE adminid='$adminid'";

    if (!mysqli_query($con, $sql)) {
      die('DB Error: ' . mysqli_error($con));
    }

    /**
     * ✅ Convert to long-lived token (if requested)
     */
    if (isset($_POST['upaccess_token']) && $_POST['upaccess_token'] == "1") {

      $app_id = '706252045523219';
      $app_secret = 'dfd26c88113e7715e0a32a949ab031ce';

      $url = "https://graph.facebook.com/v25.0/oauth/access_token?" . http_build_query([
        'grant_type' => 'fb_exchange_token',
        'client_id' => $app_id,
        'client_secret' => $app_secret,
        'fb_exchange_token' => $fbuser_token
      ]);

      // ✅ Use cURL instead of file_get_contents
      $ch = curl_init();
      curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true
      ]);

      $response = curl_exec($ch);
      curl_close($ch);
      if (!$response) {
        file_put_contents("fb_error.log", "cURL failed\n", FILE_APPEND);
      }

      $data = json_decode($response, true);

      if (isset($data['access_token'])) {

        $new_token = mysqli_real_escape_string($con, $data['access_token']);

        $final_token = isset($new_token) ? $new_token : $fbaccess_token;

$subscribe_url = "https://graph.facebook.com/v25.0/$facebookpageid/subscribed_apps?access_token=$final_token";
file_get_contents($subscribe_url);

        $sqlt = "UPDATE `$tbl_name`
                     SET fbaccess_token='$new_token'
                     WHERE adminid='$adminid'";

        if (!mysqli_query($con, $sqlt)) {
          die('Token Update Error: ' . mysqli_error($con));
        }

      } else {
        file_put_contents("fb_error.log", "Token exchange failed: " . json_encode($data) . "\n", FILE_APPEND);
      }
    }

    mysqli_close($con);

    // ✅ Clean redirect
    header("Location: $pageurl?message=Data updated");
    exit;
  } else if (isset($_GET['mode']) && $_GET['mode'] === "bio") {
    $metatitle = $con->real_escape_string($_POST['metatitle']);
    $metadescription = $con->real_escape_string($_POST['metadescription']);
    $metakeywords = $con->real_escape_string($_POST['metakeywords']);
    $bio = $con->real_escape_string($_POST['bio']);
    $lead_get_message = isset($_POST['lead_get_message']) ? "1" : "0";
    $lead_get_message_i = isset($_POST['lead_get_message_i']) ? "1" : "0";
    $sql = "UPDATE `$tbl_name` SET `metatitle` = '$metatitle', `metadescription` = '$metadescription', `metakeywords` = '$metakeywords', `bio`='$bio', `lead_get_message` = '$lead_get_message', `lead_get_message_i` = '$lead_get_message_i' WHERE adminid='$adminid'";
    if (!mysqli_query($con, $sql)) {
      die('Error: ' . mysqli_error($con));
    }
    mysqli_close($con);
    echo "<META HTTP-EQUIV='REFRESH' CONTENT='0; URL=$pageurl?message=Data updated..'>";
    exit(0);

  } else if (isset($_GET['mode']) && $_GET['mode'] === "removemetapic") {
    $sql = "UPDATE `$tbl_name` SET  metapic='' WHERE adminid='$adminid'";
    if (!mysqli_query($con, $sql)) {
      die('Error: ' . mysqli_error($con));
    }
    mysqli_close($con);
    echo "<META HTTP-EQUIV='REFRESH' CONTENT='0; URL=$pageurl?message=Meta pic removed..'>";
    exit(0);


  } else { ?>
        <!DOCTYPE html>
        <html>

        <head>
          <meta charset="utf8mb4">
          <title><?php echo $pagename ?></title>
      <?php include 'bootstrap.php'; ?>
          <style>
            pre {
              background-color: #f4f4f4;
              padding: 15px;
              border: 1px solid #ddd;
              overflow-x: auto;
            }

            button {
              margin: 10px 0;
              padding: 8px 12px;
              background-color: #007bff;
              color: white;
              border: none;
              cursor: pointer;
            }
          </style>
          <script>
            // Its for copy of all textarea content..
            function copyCode(idx) {
              const codeBlock = document.getElementById(idx);
              const textArea = document.createElement("textarea");
              textArea.value = codeBlock.textContent;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand("copy");
              document.body.removeChild(textArea);
              alert("Code copied to clipboard!");
            }


            //Its for copy link of url only..
            function copyCodex() {
              // Create a temporary textarea to copy the link
              var tempInput = document.createElement("textarea");
              tempInput.value = document.getElementById("curlCodex").href;
              document.body.appendChild(tempInput);
              tempInput.select();
              document.execCommand("copy");
              document.body.removeChild(tempInput);
              alert("Link copied to clipboard!");
            }

            function toggleCode(id, btn) {
              const codeElement = document.getElementById(id);
              if (codeElement.style.display === "none") {
                codeElement.style.display = "block";
                btn.textContent = "Hide Code";
              } else {
                codeElement.style.display = "none";
                btn.textContent = "Show Code";
              }
            }
          </script>
          <script type="text/javascript">
            function confirmSubmit() {
              var agree = confirm("Are you sure to remove metapic..");
              if (agree)
                return true;
              else
                return false;
            }
          </script>
          <script type="text/javascript" src="ckeditor/ckeditor.js"></script>
          <link rel="stylesheet" href="croper/css/slim.min.css">
        </head>

        <body class="<?php echo $skincolor ?>">
      <?php $result1 = mysqli_query($con, "SELECT * FROM `$tbl_name` WHERE adminid='$adminid'");
      if ($row1 = mysqli_fetch_array($result1)) { ?>

            <div class="wrapper">
          <?php include 'header.php'; ?>
          <?php include 'leftmenu.php'; ?>

              <div class="content-wrapper">
                <section class="content-header">

                  <ol class="breadcrumb">
                    <li style="color:#EC0000;"><i class="fa fa-list"></i> <?php echo $headertext ?></li>
                    <li class="active"><a href="<?php echo $pageurl ?>"
                        style="color:#0000FF; text-transform:uppercase;"><?php echo $pagename ?></a></li>
                  </ol>
                </section><br />

                <section class="content">
                  <div class='row'>
                    <div class='col-xs-12'>
                      <div class="nav-tabs-custom">
                        <ul class="nav nav-tabs">
                      <?php //include 'operationnavbar.php'; ?>
                        </ul>
                        <div class="tab-content">
                      <?php include 'messagedisplay.php'; ?>

                          <div class="box-header with-border" style="background-color: #E6E6E6; text-transform:uppercase;">
                            <font size="3"><b>
                            <?php echo $pagename ?></b> </font>
                        <?php /*?><a href="api_curlcode" style="font-size:12px; color:#0000FF;" target="_blank">View Website API</a><?php */ ?>
                          </div>
                          <div style="height:10px;">&nbsp;</div>

                          <form action="" method="get" name="form2">
                            <div class="row">
                              <div class="box-body">
                                <div class="box-header with-border" style="background-color: #E6E6E6;">
                                  <icon class="btn bg-white margin">
                                    <select class="form-control" name="branchid" style="width:200px">
                                      <option value="0">Main Branch</option>
                                  <?php $resultb = mysqli_query($con, "SELECT * FROM `branches` WHERE adminid='$adminid' AND hide='0' AND status='1' ORDER BY ID DESC");
                                  while ($rowb = mysqli_fetch_array($resultb)) { ?>
                                        <option value="<?php echo $rowb['ID'] ?>" <?php if ($sbranchid == $rowb['ID']) { ?>
                                            selected="selected" <?php } ?>><?php echo $rowb['branchname'] ?></option><?php } ?>
                                    </select>
                                  </icon>


                                  <icon class="btn bg-white margin"><select name="category" class="form-control boxw"
                                      style="width:200px;">
                                      <option value="0">General Category</option>
                                  <?php $resultc = mysqli_query($con, "SELECT * FROM `ok_databasex` WHERE hide='0' AND status='1' AND adminid='$adminid' ORDER BY ID DESC");
                                  while ($rowc = mysqli_fetch_array($resultc)) { ?>
                                        <option value="<?php echo $rowc['ID'] ?>" <?php if (isset($_GET['category']) && $_GET['category'] == $rowc['ID']) { ?>
                                            selected="selected" <?php } ?>><?php echo $rowc['name'] ?></option><?php } ?>
                                    </select> </icon>


                                  <icon class="btn bg-white margin">
                                    <select class="form-control" name="assignid" style="width:200px">
                                      <option value="0">Self Assigned</option>
                                    <?php
                                    $resultbs = mysqli_query($con, "SELECT * FROM `25_admin_sr` WHERE hide ='0' and adminid = '$adminid' AND status='1' AND type='Staff' ORDER BY ID DESC");
                                    while ($rowbs = mysqli_fetch_array($resultbs)) { ?>
                                        <option value="<?php echo $rowbs['ID'] ?>" <?php if (isset($_GET['assignid']) && $_GET['assignid'] == $rowbs['ID']) { ?>
                                            selected="selected" <?php } ?>><?php echo $rowbs['name'] ?></option>
                                  <?php } ?>
                                    </select>
                                  </icon>

                                  <icon class="btn bg-white margin"><button type="submit" class="btn btn-primary"><i
                                        class="fa fa-fw fa-search-plus"></i>&nbsp; View API & Link</button></icon>

                                </div>
                              </div><!-- /.box-body -->
                            </div><!-- /.row -->
                          </form>

                          <div class="row">
                            <div class='col-xs-12'>

        <?php if($userid == $adminid && $userid!="6"){ // Hide for demo account.. ?>
                              <h3>1. Lead Page URL For Social Media <img src="images/yes.png" /></h3>
                              <!-- Tracking Templates : https://lead.technologyxtend.com/tracking?url={lpurl}&id=5&adminid=1 -->
                              <div
                                style="font-size:12px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                align="justify">If you are running a campaign through Facebook, Instagram, or any other social
                                media platform, make sure to attach the following link in your campaign.
                                When a user clicks the link, a lead query form will open. Once the form is submitted, the lead
                                will be automatically recorded in your Lead Management System under the selected Branch, Category,
                                and Assigned Staff.</div><br />

                              <div class="wrapword">
                                <b>LEAD PAGE URL :</b> <a
                                  href="https://technologyxtend.com/lead/<?php echo $thissessionid ?>/<?php echo $branchid ?>/<?php echo $category ?>/<?php echo $assignid ?>?utm_source=TX_Lead_Link&utm_campaign=Lead_Management_Link&utm_content=&utm_medium=&utm_term="
                                  style="color:#0000FF;" target="_blank"
                                  id="curlCodex">https://technologyxtend.com/lead/<?php echo $thissessionid ?>/<?php echo $branchid ?>/<?php echo $category ?>/<?php echo $assignid ?></a>
                              </div> &nbsp; &nbsp; <button onClick="copyCodex()">Copy Link</button>

                              <br /><br /><b style="font-size:16px;">Write below details for the visitor which you want to display
                                at the lead form link and update all utm perameter in link for tracking the lead.</b>
                              <div class='row'>
                                <div class='col-xs-12'>
                                  <form name="form5" action="<?php echo $pageurl ?>?mode=bio" method="post">
                                    <table class="table table-hover table-bordered table-striped" style="font-size:15px;">
                                      <tr>
                                        <td width="150">Meta Title</td>
                                        <td><input type="text" class="form-control" name="metatitle" style="width:96%;"
                                            value="<?php echo $row1['metatitle'] ?>" /></td>
                                      </tr>
                                      <tr>
                                        <td>Meta Description</td>
                                        <td><input type="text" class="form-control" name="metadescription" style="width:96%;"
                                            value="<?php echo $row1['metadescription'] ?>" /></td>
                                      </tr>
                                      <tr>
                                        <td>Meta Keywords</td>
                                        <td><input type="text" class="form-control" name="metakeywords" style="width:96%;"
                                            value="<?php echo $row1['metakeywords'] ?>" /></td>
                                      </tr>
                                      <tr>
                                        <td>Bio</td>
                                        <td><textarea name="bio" id="bio"
                                            style="width:96%; height:100px; border:1px solid #CCC;"><?php echo $row1['bio'] ?></textarea>
                                        </td>
                                      </tr>
                                  <?php if ($row1['whatsappurl'] != "" && $row1['wapiinstanceid'] != "" && $row1['wapitoken'] != "") { ?>
                                        <tr>
                                          <td><b>Lead Updation</b></td>
                                          <td><input type="checkbox" name="lead_get_message_i" value="1" <?php if ($row1['lead_get_message_i'] == "1") { ?> checked="checked" <?php } ?> /> Send WhatsApp
                                            Message at Lead <?php if ($row1['whatsapp_groupid'] != "") { ?>&nbsp; &nbsp; &nbsp;
                                              &nbsp;
                                              <input type="checkbox" name="lead_get_message" value="1" <?php if ($row1['lead_get_message'] == "1") { ?> checked="checked" <?php } ?> /> Send Lead
                                              Details at WhatsApp Group<?php } ?>
                                          </td>
                                        </tr><?php } ?>
                                    </table>
                                    <div align="center"><button type="submit" class="btn btn-success"><i
                                          class="fa fa-fw fa-pencil"></i> Update Bio</button></div>
                                  </form>

                                  <div style="height:25px;"></div>
                                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                    <tr>
                                      <td align="left">
                                        <div style="width:100%; max-width:400px;" align="center">
                                          <label>Meta Pic & Lead Page Banner (800 x 500px) <i
                                              class="fa fa-arrow-down"></i></label> <?php if ($row1['metapic'] != "") { ?>
                                            <div style="display:inline; float:right;"><a onClick="return confirmSubmit();"
                                                href="<?php echo $pageurl ?>?mode=removemetapic"><i class='fa fa-trash'
                                                  style='font-size:20px; color:#FF0000; cursor:pointer;'
                                                  title="Remove Profile"></i></a></div><?php } ?><br /> </label>
                                          <div class="slim" data-ratio="8:5" data-size="800,500"
                                            data-service="croper/projectimage.php?mode=metapic&folder=profile&userid=<?php echo $adminid ?>"
                                            style="background-image: url('<?php echo $row1['metapic'] ?>'); background-size: contain; background-position: center; background-repeat: no-repeat; width: 100%; cursor:pointer; border:2px solid #F4F5F6;">
                                            <input type="file" />
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  </table>

                                  <hr />

                                  <h3>2. PHP cURL Integration Code for Website <img src="images/yes.png" /></h3>
                                  <div
                                    style="font-size:12px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                    align="justify">To automatically save all leads submitted through your website forms into your
                                    Lead Management System, simply attach the following cURL code right after the form submission
                                    action.<br />
                                    This will ensure each lead is recorded under the specified Branch, Category, and Assigned
                                    Staff:</div><br />

                              <?php if ($admin == "1" || $codeview == "1") { ?>
                                    <button onClick="copyCode('curlCode1')">Copy Code</button> &nbsp; &nbsp; <button
                                      onClick="toggleCode('curlCode1', this)" style="background:#3A9A74;">Show Code</button>

                                    <pre id="curlCode1" style="display: none;"><code>
                                                $api_url = "https://lead.technologyxtend.com/webapi.php";
                                                $api_token = "<?php echo $thissessionid ?>";

                                                $cookieExpiry = time() + (365 * 24 * 60 * 60);
                                                $name = '$_POST[name]'; // name variable from form data
                                                $phone = '$_POST[phone]'; // phone variable from form data
                                                $email = '$_POST[email]'; // email variable from form data
                                                setcookie('trackname', $name, $cookieExpiry, "/", "", true, true); // save cookie for live tracking
                                                setcookie('trackcontact', $phone, $cookieExpiry, "/", "", true, true);  // save cookie for live tracking
                                                setcookie('trackemail', $email, $cookieExpiry, "/", "", true, true); // save cookie for live tracking
 
     
                                                $data = [
                                                    "name" => "$name",
                                                    "email" => "$email",
                                                    "phone" => "$phone",
                                                  "branchId" => "<?php echo $branchid ?>",
                                                  "categoryId" => "<?php echo $category ?>",
                                                  "staffId" => "<?php echo $assignid ?>",	
                                                  "remarks" => "Its an Enquiry Form Lead",
                                                  "source" => "Website Lead"
                                                ];

                                                $payload = json_encode($data);

                                                $curl = curl_init();
                                                curl_setopt_array($curl, [
                                                    CURLOPT_URL => $api_url,
                                                    CURLOPT_RETURNTRANSFER => true,
                                                    CURLOPT_CUSTOMREQUEST => 'POST',
                                                    CURLOPT_POSTFIELDS => $payload,
                                                    CURLOPT_HTTPHEADER => [
                                                        "Authorization: Bearer $api_token",
                                                        "Content-Type: application/json"
                                                    ],
                                                ]);

                                                $response = curl_exec($curl);
                                                curl_close($curl);

                                                echo $response;
                                                </code></pre>
                              <?php } else { ?><button onClick="alert('Sorry!, You have no permission yet')"
                                      style="background: #FF0000">Show Code</button><?php } ?>

                                  <hr />
                                  <h3>3. Google Sheet Integration <img src="images/yes.png" /></h3>
                                  <div
                                    style="font-size:12px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                    align="justify"><b>To automatically save all leads entered in your Google Sheet into your Lead
                                      Management System, simply integrate the following Google Apps Script into your
                                      Sheet.</b><br />
                                    This script will trigger each time a new lead is added, ensuring the details are recorded
                                    under the specified Branch, Category, and Assigned Staff in your CRM:</div><br />
                                  For implement Google sheet, follow the steps<br />
                                  1. Create a Google Sheet<br />
                                  2. Click at Extensions >> App Scripts and Paste below code in editor and save it.<br />
                                  3. Select setupSheetHeaders at top and Run the script. Column will be generate in Google
                                  Sheet.<br />
                                  4. Click at Triggers and Add 3 New trigger as (Function > Event Source > Event Type) <br />

                                  1) onEdit > From spreadsheet > On edit<br />
                                  2) onFormSubmit > From form > On form submit<br />
                                  3) onChange > From spreadsheet >On change<br />
                                  Now your sheet is ready and lead will save as Add entry, Insert Lead and Form Submitted.<br />

                              <?php if ($admin == "1" || $codeview == "1") { ?>
                                    <button onClick="copyCode('curlCode2')">Copy Code</button> &nbsp; &nbsp; <button
                                      onClick="toggleCode('curlCode2', this)" style="background:#3A9A74;">Show Code</button>

                                    <pre id="curlCode2" style="display: none;"><code>
                                                // 📌 1. Run this once to set up headers
                                                function setupSheetHeaders() {
                                                  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
                                                  const headers = ['name', 'contact', 'email', 'remarks', 'status', 'sent_at', 'source'];
                                                  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
                                                  Logger.log("Headers set successfully");
                                                }

                                                // 📌 2. Main function to process & send lead
                                                function processLead(row, source) {
                                                  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

                                                  const name = sheet.getRange(row, 1).getValue();
                                                  const phone = sheet.getRange(row, 2).getValue();
                                                  const email = sheet.getRange(row, 3).getValue();
                                                  const remarks = sheet.getRange(row, 4).getValue();
                                                  const status = sheet.getRange(row, 5).getValue();

                                                  if (!(name && phone && email && remarks)) return;
                                                  if (status === "Sent") return;

                                                  const apiUrl = "https://lead.technologyxtend.com/webapi.php";
                                                  const apiToken = "<?php echo $thissessionid ?>";

                                                  const data = {
                                                    name: name,
                                                    email: email,
                                                    phone: phone,
                                                    branchId: "<?php echo $branchid ?>",
                                                    categoryId: "<?php echo $category ?>",
                                                    staffId: "<?php echo $assignid ?>",
                                                    remarks: remarks,
                                                    source: source
                                                  };

                                                  const options = {
                                                    method: 'POST',
                                                    contentType: 'application/json',
                                                    payload: JSON.stringify(data),
                                                    headers: {
                                                      Authorization: `Bearer ${apiToken}`
                                                    },
                                                    muteHttpExceptions: true
                                                  };

                                                  try {
                                                    UrlFetchApp.fetch(apiUrl, options);
                                                    sheet.getRange(row, 5).setValue("Sent");
                                                    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy, hh:mm a");
                                                    sheet.getRange(row, 6).setValue(timestamp);
                                                    sheet.getRange(row, 7).setValue(source);
                                                  } catch (err) {
                                                    Logger.log("Error: " + err.message);
                                                  }
                                                }

                                                // 📌 3. Trigger function for manual typing/edit
                                                function onEdit(e) {
                                                  const row = e.range.getRow();
                                                  if (row === 1) return; // Skip header
                                                  processLead(row, "Google Sheet Manual");
                                                }

                                                // 📌 4. Trigger function for Google Form
                                                function onFormSubmit(e) {
                                                  const sheet = e.source.getActiveSheet();
                                                  const row = sheet.getLastRow();
                                                  processLead(row, "Google Form");
                                                }

                                                // 📌 5. Trigger function for external row insertions
                                                function onChange(e) {
                                                  if (e.changeType !== 'INSERT_ROW') return;
                                                  const sheet = e.source.getActiveSheet();
                                                  const row = sheet.getLastRow();
                                                  processLead(row, "Google Sheet Campaign");
                                                }

                                                </code></pre>
                              <?php } else { ?><button onClick="alert('Sorry!, You have no permission yet')"
                                      style="background: #FF0000">Show Code</button><?php } ?>

                                  <h3>4. Live Tracking for Website <img src="images/yes.png" /></h3>
                                  <div
                                    style="font-size:13px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                    align="justify"><b>If you want to see live tracking of every visitor coming to your website
                                      directly inside your Lead Management System then follow below steps.</b><br />
                                    1. Please paste the following code inside the head tag of every page on your website<br />
                                    2. Download tracking_lms.php and upload it in your root directory. <a
                                      href="downloads/tracking_lms.php" style="color:#0000FF;" download>Click here to download
                                      tracking_lms.php</a></div><br />

                              <?php if ($admin == "1" || $codeview == "1") { ?>
                                    <button onClick="copyCode('curlCode3')">Copy Code</button> &nbsp; &nbsp; <button
                                      onClick="toggleCode('curlCode3', this)" style="background:#3A9A74;">Show Code</button>

                                    <pre id="curlCode3" style="display: none;"><code>
                                                &lt;script&gt;
                                                    var img = new Image(1, 1);
                                                    img.style.display = 'none';
                                                    img.src = "https://yourdomain.com/tracking_lms.php?id=<?php echo $thissessionid ?>"
                                                        + "&event=page_view"
                                                        + "&refer_url=" + encodeURIComponent(document.referrer)
                                                        + "&page_title=" + encodeURIComponent(document.title)
                                                        + "&page_url=" + encodeURIComponent(window.location.href)
                                                        + "&ts=" + new Date().getTime(); // to prevent caching
                                                    document.body.appendChild(img);
                                                &lt;/script&gt;

                                                </code></pre>
                              <?php } else { ?><button onClick="alert('Sorry!, You have no permission yet')"
                                      style="background: #FF0000">Show Code</button><?php } ?>

                                  <hr />
                                  <h3>5. Display popUp at website to getting lead Generation <img src="images/yes.png" /></h3>
                                  <div
                                    style="font-size:13px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                    align="justify"><b>If you want to display PopUp form for getting visitor query and track
                                      always in your Lead Management System, then follow below steps.</b><br />
                                    1. Please paste the following code inside the footer tag of every page (or any where where you
                                    want) on your website<br />
                                    2. Download send_message.php and upload it in your root directory. <a
                                      href="downloads/send_message.php" style="color:#0000FF;" download>Click here to download
                                      send_message.php</a></div><br />

                              <?php if ($admin == "1" || $codeview == "1") { ?>
                                    <button onClick="copyCode('curlCode4')">Copy Code</button> &nbsp; &nbsp; <button
                                      onClick="toggleCode('curlCode4', this)" style="background:#3A9A74;">Show Code</button>

                                    <pre id="curlCode4" style="display: none;"><code>
                                                &lt;?php if(!isset($_COOKIE['trackcontact'])){?&gt;  
                                                &lt;div id="popupOverlay" class="popup-overlay"&gt;&lt;/div&gt;
                                                &lt;div id="popupForm" class="popup-form"&gt;
                                                  &lt;div class="popup-header"&gt;
                                                    &lt;b&gt;Hey! I am your Assistant!&lt;/b&gt;
                                                  &lt;/div&gt;

                                                  &lt;div class="popup-content"&gt;
                                                    &lt;!-- Step 1 --&gt;
                                                    &lt;div class="form-step active" id="step1"&gt;
                                                      Let me know your name, please?&lt;br /&gt;&lt;div style="height:6px;"&gt;&lt;/div&gt;
                                                      &lt;input type="text" id="name_p" placeholder="Enter your name" style="width:100%; height:30px; border:1px solid #CCC;" required&gt;
                                                    &lt;/div&gt;

                                                    &lt;!-- Step 2 --&gt;
                                                    &lt;div class="form-step" id="step2" style="display:none;"&gt;
                                                      Your contact number, please?&lt;br /&gt;&lt;div style="height:6px;"&gt;&lt;/div&gt;
                                                      &lt;input type="text" id="contact_p" placeholder="Enter your contact number" style="width:100%; height:30px; border:1px solid #CCC;" required&gt;
                                                    &lt;/div&gt;
                                                  &lt;/div&gt;

                                                  &lt;div class="popup-footer"&gt;
                                                    &lt;div id="footer-message" align="left" style="font-size: 11px; margin-bottom: 6px;"&gt;&lt;/div&gt;
                                                    &lt;button id="nextBtn"&gt;Next&lt;/button&gt;
                                                  &lt;/div&gt;
                                                &lt;/div&gt;

                                                &lt;script&gt;
                                                  // Show popup after 10 seconds
                                                  setTimeout(() =&gt; {
                                                    document.getElementById("popupOverlay").classList.add("active");
                                                    document.getElementById("popupForm").classList.add("active");
                                                  }, 10000);

                                                  let currentStep = 1;

                                                  const nextBtn = document.getElementById("nextBtn");
                                                  const popupForm = document.getElementById("popupForm");
                                                  const popupOverlay = document.getElementById("popupOverlay");
                                                  const steps = document.querySelectorAll(".form-step");
                                                  const footerMessage = document.getElementById("footer-message");

                                                  nextBtn.addEventListener("click", () =&gt; {
                                                    footerMessage.innerText = "";
                                                    footerMessage.style.color = "";

                                                    if (currentStep === 1) {
                                                      steps[0].style.display = "none";
                                                      steps[1].style.display = "block";
                                                      currentStep++;
                                                      nextBtn.textContent = "Submit";
                                                      return;
                                                    }

                                                    const name = document.getElementById("name_p").value.trim();
                                                    const contactInput = document.getElementById("contact_p");
                                                    const contact = contactInput.value.trim();

                                                    // Validate contact
                                                    if (!/^\d{10}$/.test(contact)) {
                                                      footerMessage.innerText = "Please enter a valid 10-digit mobile number.";
                                                      footerMessage.style.color = "red";
                                                      contactInput.style.display = "block";
                                                      return;
                                                    }

                                                  const apiToken = "<?php echo $thissessionid ?>";
                                                  const branchId = "<?php echo $branchid ?>";
                                                  const categoryId = "<?php echo $category ?>";
                                                  const staffId = "<?php echo $assignid ?>";

                                                    fetch("send_message.php", {
                                                      method: "POST",
                                                      headers: { "Content-Type": "application/json" },
                                                      body: JSON.stringify({ name, contact, apiToken, branchId, categoryId, staffId }),
                                                    })
                                                      .then((response) =&gt; response.json())
                                                      .then((data) =&gt; {
                                                        if (data.status === "success") {
                                                          popupForm.querySelector(".popup-content").innerHTML = `
                                                            &lt;div style="text-align: center; font-size: 14px; color: #007E59;"&gt;
                                                              ${data.message || "Thank you for providing your details!"}
                                                            &lt;/div&gt;`;
                                                          nextBtn.style.display = "none";
                                                          footerMessage.innerText = "";
                                                          setTimeout(closePopup, 1500);
                                                        } else {
                                                          footerMessage.innerText = data.message || "Something went wrong.";
                                                          footerMessage.style.color = "red";
                                                          contactInput.style.display = "block";
                                                        }
                                                      })
                                                      .catch(() =&gt; {
                                                        footerMessage.innerText = "Network error. Please try again.";
                                                        footerMessage.style.color = "red";
                                                        contactInput.style.display = "block";
                                                      });
                                                  });

                                                  popupOverlay.addEventListener("click", closePopup);

                                                  function closePopup() {
                                                    popupForm.classList.remove("active");
                                                    popupOverlay.classList.remove("active");
                                                  }
                                                &lt;/script&gt;
                                                &lt;?php } ?&gt;
                                                </code></pre>
                              <?php } else { ?><button onClick="alert('Sorry!, You have no permission yet')"
                                      style="background: #FF0000">Show Code</button><?php } ?>

                              <?php }  ?>
							  <?php //if($admin=="1"){ ?>
                                  <hr />
                                  <h3>6. Meta Advertisement Settings – Campaign Integration </h3> <span class="label label-danger"
                                    style="float:right">Work on Progress..</span>

                                  <div
                                    style="font-size:12px; padding:10px; border-left:3px solid #006CD9; font-family:Helvetica, sans-serif;"
                                    align="justify">If you want Facebook or Instagram leads to appear directly in your Lead
                                    Management System, please follow the steps below:<br /><br />

                                    <b>Step 1 :</b><br />
                                    <a onClick="popupCenter('https://www.facebook.com/v25.0/dialog/oauth?client_id=706252045523219&redirect_uri=https://lead.technologyxtend.com/fb_callback.php&scope=pages_show_list,leads_retrieval,pages_read_engagement,pages_manage_ads,pages_manage_metadata&auth_type=rerequest', 'myPop1',600,600);"
                                      href="javascript:void(0);" style="text-decoration:none;color:#00F; cursor:pointer;">Click
                                      here</a> to save your Facebook Token and Facebook Page ID in the system.<br />

                                    <i>If you face any errors, you can manually find your Auth Token and Page ID in your Facebook
                                      Page Settings.</i><br />
                                    <b>👉 How to Get Facebook Page ID :</b> Open the following link in your browser, replacing
                                    <pagename> with your actual Facebook page name:<br />
                                      <a href="https://www.facebook.com/your_fb_pagename/about_profile_transparency"
                                        target="_blank"
                                        style="color:#0000FF">https://www.facebook.com/{your_fb_pagename}/about_profile_transparency</a><br />

                                      <b>👉 How to Get Instagram Page ID :</b> Replace access user token and get the Instagram
                                      Page Id in below link<br /> <a
                                        href="https://graph.facebook.com/v25.0/facebook-page-id?fields=instagram_business_account&access_token={long-lived-user-access-token}"
                                        target="_blank"
                                        style="color:#0000FF">https://graph.facebook.com/v25.0/facebook-page-id?fields=instagram_business_account&access_token={long-lived-user-access-token}
                                      </a><br /><br />

                                      <b>👉 How to get Access token</b> : <br />
                                      1. Create an Developer App and set a Webhook URL with verify Token.<br />
                                      2. Click at <a href="https://developers.facebook.com/tools/explorer/" target="_blank"
                                        style="color:#0000FF">https://developers.facebook.com/tools/explorer/</a> and generate
                                      User Token with required permissions.<br />
                                      3. Get access token from on click <a
                                        href="https://graph.facebook.com/me/accounts?access_token={user_token}" target="_blank"
                                        style="color:#0000FF">https://graph.facebook.com/me/accounts?access_token={user_token}</a>
                                      and save all FB User Token, FB Access Token and Page Id's.<br />



                                      <div class='row'>
                                        <div class='col-xs-12'>
                                          <form name="form5" action="<?php echo $pageurl ?>?mode=metaad" method="post">
                                            <table class="table table-hover table-bordered table-striped" style="font-size:15px;">
                                              <tr>
                                                <td width="150">FB User Token<br /><a style="font-size:10px; color:#0000CC;"
                                                    href="https://developers.facebook.com/tools/explorer/" target="_blank">View
                                                    Token</a></td>
                                                <td><input type="text" class="form-control" name="fbuser_token" style="width:96%;"
                                                    value="<?php echo $row1['fbuser_token'] ?>" /></td>
                                              </tr>
                                              <tr>
                                                <td width="150">FB Access Token<br /><input type="checkbox" name="upaccess_token"
                                                    value="1" /> <span style="font-size:10px; color:#CA0000;">Update Access
                                                    Token</span></td>
                                                <td><input type="text" class="form-control" name="fbaccess_token"
                                                    style="width:96%;" value="<?php echo $row1['fbaccess_token'] ?>" /></td>
                                              </tr>
                                              <tr>
                                                <td>FB Page Id</td>
                                                <td><input type="text" class="form-control" name="facebookpageid"
                                                    style="width:96%;" value="<?php echo $row1['facebookpageid'] ?>" /></td>
                                              </tr>
                                              <tr>
                                                <td>Insta Page Id</td>
                                                <td><input type="text" class="form-control" name="instapageid" style="width:96%;"
                                                    value="<?php echo $row1['instapageid'] ?>" /></td>
                                              </tr>

                                            </table>
                                            <div align="center"><button type="submit" class="btn btn-success"><i
                                                  class="fa fa-fw fa-pencil"></i> Update Token & Page ID</button></div>
                                          </form>



                                        </div>
                                      </div>



                                      <br />
                                      <b>Step 2 :</b><br />
                                      After updating the Token and Page ID, click on the link below to proceed with
                                      integration.<br />
                                      <a href="https://graph.facebook.com/v25.0/<?php echo $row1['facebookpageid'] ?>/subscribed_apps?access_token=<?php echo $row1['fbaccess_token'] ?>"
                                        style="color:#0000FF" target="_blank">Click here to Subscribed App</a><br />
                                      Now all steps are completed and its ready to get all Meta Lead to save via
                                      Webhook.<br /><br />

                                      <b>Step 3 :</b><br />
                                      Set the Facebook Form Type to Lead.<br />
                                      All lead details (name, contact, email, etc.) submitted through your Facebook or Instagram
                                      campaign will now be automatically saved in your Lead Management Software.
                                  </div><br />

                              <?php // } ?>
                                </div>




                              </div><!-- /.row -->
                </section><!-- /.content -->
              </div><!-- /.content-wrapper -->

          <?php include 'footer.php'; ?>
            </div><!-- ./wrapper -->
            </div>

        <?php include 'plugin.php'; ?>

            <script type='text/javascript'>
              ['bio'].forEach(id => {
                CKEDITOR.replace(id, {
                  height: 100,
                  toolbar: [['Source', '-', 'Bold', 'Italic', 'Underline', 'Link', 'Unlink', 'Strike', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock', 'BulletedList', 'NumberedList', '-', 'Image', 'Table', 'PasteFromWord', '-', 'TextColor', 'BGColor', 'Maximize', 'Font', 'FontSize']],
                  filebrowserUploadUrl: "uploadimage.php",
                  filebrowserUploadMethod: 'form'
                });
              });
            </script>
            <script src="croper/js/slim.kickstart.min.js"></script>
      <?php } ?>
        </body>

        </html>
    <?php mysqli_close($con);
  }
} else {
  mysqli_close($con);
  echo "<META HTTP-EQUIV='REFRESH' CONTENT='0; URL=error'>";
  exit(0);
} ?>