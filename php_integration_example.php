<?php
/**
 * CountryState API - PHP Integration Example
 * 
 * This file demonstrates how to securely use your new API in a PHP project
 * (like your FS project) to populate Country and State dropdowns without 
 * exposing your API key to the frontend JavaScript.
 */

// ==========================================
// 1. Configuration
// ==========================================
$api_base_url = 'http://localhost:3000/api/v1';
$api_key      = 'cs_f67210466181ac4e5e3b1dd9231fa6f942428af547e4acde1d6346e9'; // Replace with an API key from your dashboard

// ==========================================
// 2. Helper Function: Make API Request
// ==========================================
function fetchFromApi($endpoint) {
    global $api_base_url, $api_key;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $api_base_url . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // Add the API Key in the Authorization header!
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $api_key,
        'Accept: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpcode !== 200) {
        return ['error' => 'API Request Failed', 'details' => json_decode($response, true)];
    }
    
    return json_decode($response, true);
}

// ==========================================
// 3. Handle AJAX Request for States
// ==========================================
// When the user selects a country, the frontend JS will call this same PHP file 
// to fetch the states securely via PHP, keeping your API key hidden!
if (isset($_GET['action']) && $_GET['action'] === 'get_states') {
    header('Content-Type: application/json');
    $country_iso2 = $_GET['country'] ?? '';
    
    if (empty($country_iso2)) {
        echo json_encode([]);
        exit;
    }

    $api_response = fetchFromApi('/countries/' . $country_iso2 . '/states');
    echo json_encode($api_response['data'] ?? []);
    exit;
}

// Handle AJAX Request for Cities
if (isset($_GET['action']) && $_GET['action'] === 'get_cities') {
    header('Content-Type: application/json');
    $country_iso2 = $_GET['country'] ?? '';
    $state_code = $_GET['state'] ?? '';
    
    if (empty($country_iso2) || empty($state_code)) {
        echo json_encode([]);
        exit;
    }

    $api_response = fetchFromApi('/countries/' . $country_iso2 . '/states/' . $state_code . '/cities');
    echo json_encode($api_response['data'] ?? []);
    exit;
}

// ==========================================
// 4. Initial Page Load: Fetch Countries
// ==========================================
$countries_response = fetchFromApi('/countries');
$countries = $countries_response['data'] ?? [];

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PHP API Integration Demo</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; background: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .form-group { margin-bottom: 1.5rem; }
        label { display: block; margin-bottom: 0.5rem; font-weight: 600; color: #334155; }
        select { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 1rem; }
        select:disabled { background: #f1f5f9; cursor: not-allowed; }
        .alert { padding: 1rem; background: #fef2f2; color: #991b1b; border-radius: 4px; margin-bottom: 1rem; border: 1px solid #fecaca; }
    </style>
</head>
<body>

<div class="container">
    <h2>Select Your Location</h2>
    <p style="color: #64748b; margin-bottom: 2rem;">This dropdown is powered securely by PHP cURL and your new API.</p>

    <?php if (empty($api_key) || $api_key === 'YOUR_API_KEY_HERE'): ?>
        <div class="alert">
            <strong>Action Required:</strong> Please edit this PHP file and replace <code>YOUR_API_KEY_HERE</code> with a real API key from your dashboard!
        </div>
    <?php endif; ?>

    <!-- Country Dropdown -->
    <div class="form-group">
        <label for="country">Country</label>
        <select id="country" name="country" <?php echo isset($countries_response['error']) ? 'disabled' : ''; ?>>
            <?php if (isset($countries_response['error'])): ?>
                <?php 
                    $errorMsg = $countries_response['details']['message'] ?? 'API Request Failed. Please check your API key.'; 
                ?>
                <option value=""><?php echo htmlspecialchars($errorMsg); ?></option>
            <?php else: ?>
                <option value="">-- Select a Country --</option>
                <?php foreach ($countries as $country): ?>
                    <option value="<?php echo htmlspecialchars($country['iso2']); ?>">
                        <?php echo htmlspecialchars($country['emoji'] . ' ' . $country['name']); ?>
                    </option>
                <?php endforeach; ?>
            <?php endif; ?>
        </select>
    </div>

    <!-- State Dropdown -->
    <div class="form-group">
        <label for="state">State / Province</label>
        <select id="state" name="state" disabled>
            <option value="">-- Select a Country First --</option>
        </select>
    </div>

    <!-- City Dropdown -->
    <div class="form-group">
        <label for="city">City</label>
        <select id="city" name="city" disabled>
            <option value="">-- Select a State First --</option>
        </select>
    </div>
</div>

<script>
    const countrySelect = document.getElementById('country');
    const stateSelect = document.getElementById('state');
    const citySelect = document.getElementById('city');

    countrySelect.addEventListener('change', async function() {
        const iso2 = this.value;
        
        // Reset state dropdown
        stateSelect.innerHTML = '<option value="">-- Loading States... --</option>';
        stateSelect.disabled = true;

        if (!iso2) {
            stateSelect.innerHTML = '<option value="">-- Select a Country First --</option>';
            return;
        }

        try {
            // Call our OWN PHP file to fetch states securely
            const response = await fetch(`?action=get_states&country=${iso2}`);
            const states = await response.json();

            // Check if our PHP proxy returned an error object (like rate limit exceeded)
            if (states.error) {
                const errorMsg = states.details && states.details.message ? states.details.message : 'Error Loading States';
                stateSelect.innerHTML = `<option value="">-- ${errorMsg} --</option>`;
                return;
            }

            stateSelect.innerHTML = '<option value="">-- Select a State --</option>';
            
            if (states.length > 0) {
                states.forEach(state => {
                    const option = document.createElement('option');
                    // We must use state.id because state_code is null for some regions
                    option.value = state.id; 
                    option.textContent = state.name;
                    stateSelect.appendChild(option);
                });
                stateSelect.disabled = false;
            } else {
                stateSelect.innerHTML = '<option value="">-- No States Found --</option>';
            }
        } catch (error) {
            console.error('Error fetching states:', error);
            stateSelect.innerHTML = '<option value="">-- Error Loading States --</option>';
        }
    });

    // When State changes -> Fetch Cities
    stateSelect.addEventListener('change', async function() {
        const countryIso2 = countrySelect.value;
        const stateCode = this.value;
        
        // Reset city dropdown
        citySelect.innerHTML = '<option value="">-- Loading Cities... --</option>';
        citySelect.disabled = true;

        if (!stateCode || !countryIso2) {
            citySelect.innerHTML = '<option value="">-- Select a State First --</option>';
            return;
        }

        try {
            const response = await fetch(`?action=get_cities&country=${countryIso2}&state=${stateCode}`);
            const cities = await response.json();

            if (cities.error) {
                const errorMsg = cities.details && cities.details.message ? cities.details.message : 'Error Loading Cities';
                citySelect.innerHTML = `<option value="">-- ${errorMsg} --</option>`;
                return;
            }

            citySelect.innerHTML = '<option value="">-- Select a City --</option>';
            
            if (cities.length > 0) {
                cities.forEach(city => {
                    const option = document.createElement('option');
                    option.value = city.id; 
                    option.textContent = city.name;
                    citySelect.appendChild(option);
                });
                citySelect.disabled = false;
            } else {
                citySelect.innerHTML = '<option value="">-- No Cities Found --</option>';
            }
        } catch (error) {
            console.error('Error fetching cities:', error);
            citySelect.innerHTML = '<option value="">-- Error Loading Cities --</option>';
        }
    });
</script>

</body>
</html>
