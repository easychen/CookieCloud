<?php

/**
 * CookieCloud Fixed IV Decryption - PHP Command Line Tool
 */

require_once __DIR__ . '/src/Decrypt.php';

use CookieCloud\Decrypt\Decrypt;

function main()
{
    echo "=== CookieCloud Fixed IV Decryption - PHP ===\n\n";

    // Test parameters
    $uuid = 'jNp1T2qZ6shwVW9VmjLvp1';
    $password = 'iZ4PCqzfJcHyiwAQcCuupD';
    $dataFile = __DIR__ . '/../jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json';

    echo "📋 Test Parameters:\n";
    echo "UUID: $uuid\n";
    echo "Password: $password\n";
    echo "Data File: " . basename($dataFile) . "\n";

    try {
        // Check if OpenSSL is available
        if (!extension_loaded('openssl')) {
            throw new Exception('OpenSSL extension is required');
        }

        // Check if AES-128-CBC is supported (try different variations)
        $ciphers = openssl_get_cipher_methods();
        $hasAes = false;
        foreach (['AES-128-CBC', 'aes-128-cbc', 'AES128-CBC'] as $cipher) {
            if (in_array($cipher, $ciphers)) {
                $hasAes = true;
                break;
            }
        }
        if (!$hasAes) {
            echo "Available ciphers: " . implode(', ', array_slice($ciphers, 0, 10)) . "...\n";
            throw new Exception('AES-128-CBC cipher is not supported');
        }

        // Read encrypted data
        if (!file_exists($dataFile)) {
            throw new Exception("Data file not found: $dataFile");
        }

        $rawData = file_get_contents($dataFile);
        if ($rawData === false) {
            throw new Exception('Failed to read data file');
        }

        $data = json_decode($rawData, true);
        if ($data === null) {
            throw new Exception('Failed to parse JSON: ' . json_last_error_msg());
        }

        $encryptedData = $data['encrypted'];
        echo "\n🔐 Encrypted Data Length: " . strlen($encryptedData) . " characters\n";
        echo "Encrypted Data (first 50 chars): " . substr($encryptedData, 0, 50) . "...\n";

        // Decrypt
        echo "\n🔓 Decrypting...\n";
        $decrypted = Decrypt::decrypt($uuid, $encryptedData, $password);

        echo "✅ Decryption successful!\n";
        echo "\n📊 Decrypted Data Summary:\n";
        echo "- Cookie domains: " . count($decrypted['cookie_data'] ?? []) . "\n";
        echo "- Local storage domains: " . count($decrypted['local_storage_data'] ?? []) . "\n";
        echo "- Update time: " . ($decrypted['update_time'] ?? 'N/A') . "\n";

        // Print detailed data
        if (!empty($decrypted['cookie_data'])) {
            Decrypt::printCookies($decrypted['cookie_data']);
        }

        if (!empty($decrypted['local_storage_data'])) {
            Decrypt::printLocalStorage($decrypted['local_storage_data']);
        }

        echo "\n🎉 PHP decryption completed successfully!\n";

    } catch (Exception $e) {
        echo "❌ Decryption failed: " . $e->getMessage() . "\n";
        exit(1);
    }
}

// Run if called directly
if (basename(__FILE__) == basename($_SERVER['SCRIPT_NAME'])) {
    main();
}
