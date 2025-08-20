<?php

namespace CookieCloud\Decrypt;

/**
 * CookieCloud Fixed IV Decryption - PHP Implementation
 * 
 * Algorithm: AES-128-CBC
 * Key: MD5(uuid + "-" + password).substring(0, 16)
 * IV: Fixed 16 bytes of zeros (0x00000000000000000000000000000000)
 * Padding: PKCS7
 * Encoding: Base64
 */
class Decrypt
{
    /**
     * Decrypt CookieCloud data using standard PHP OpenSSL
     * 
     * @param string $uuid User UUID
     * @param string $encrypted Base64 encrypted data
     * @param string $password Password
     * @return array Decrypted data
     * @throws \Exception if decryption fails
     */
    public static function decrypt($uuid, $encrypted, $password)
    {
        // Check if OpenSSL is available
        if (!extension_loaded('openssl')) {
            throw new \Exception('OpenSSL extension is required');
        }

        // 1. Generate key: first 16 characters of MD5(uuid + "-" + password)
        $keyInput = $uuid . '-' . $password;
        $hash = md5($keyInput);
        $key = substr($hash, 0, 16);

        // 2. Fixed IV: 16 bytes of zeros
        $iv = str_repeat("\0", 16);

        // 3. Decode base64 encrypted data
        $encryptedData = base64_decode($encrypted);
        if ($encryptedData === false) {
            throw new \Exception('Base64 decode failed');
        }

        // 4. Decrypt using OpenSSL
        $decrypted = openssl_decrypt(
            $encryptedData,
            'AES-128-CBC',
            $key,
            OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING,
            $iv
        );

        if ($decrypted === false) {
            throw new \Exception('OpenSSL decryption failed: ' . openssl_error_string());
        }

        // 5. Remove PKCS7 padding manually (since we used OPENSSL_ZERO_PADDING)
        $padLength = ord($decrypted[strlen($decrypted) - 1]);
        $decrypted = substr($decrypted, 0, -$padLength);

        // 6. Parse JSON
        $result = json_decode($decrypted, true);
        if ($result === null) {
            throw new \Exception('JSON decode failed: ' . json_last_error_msg());
        }

        return $result;
    }

    /**
     * Pretty print cookie data
     * 
     * @param array $cookieData Cookie data array
     */
    public static function printCookies($cookieData)
    {
        echo "\n🍪 Cookie Data:\n";

        foreach ($cookieData as $domain => $cookies) {
            echo "\n📍 $domain:\n";

            foreach ($cookies as $index => $cookie) {
                $num = $index + 1;
                echo "  $num. {$cookie['name']} = {$cookie['value']}\n";

                if (!empty($cookie['path'])) {
                    echo "     Path: {$cookie['path']}\n";
                }
                if (!empty($cookie['secure'])) {
                    echo "     Secure: " . ($cookie['secure'] ? 'true' : 'false') . "\n";
                }
                if (!empty($cookie['httpOnly'])) {
                    echo "     HttpOnly: " . ($cookie['httpOnly'] ? 'true' : 'false') . "\n";
                }
            }
        }
    }

    /**
     * Pretty print local storage data
     * 
     * @param array $localStorageData Local storage data array
     */
    public static function printLocalStorage($localStorageData)
    {
        echo "\n💾 Local Storage Data:\n";

        foreach ($localStorageData as $domain => $storage) {
            echo "\n📍 $domain:\n";

            foreach ($storage as $key => $value) {
                $displayValue = strlen($value) > 50 ? substr($value, 0, 50) . '...' : $value;
                echo "  $key = $displayValue\n";
            }
        }
    }

    /**
     * Get supported OpenSSL ciphers
     * 
     * @return array List of supported ciphers
     */
    public static function getSupportedCiphers()
    {
        return openssl_get_cipher_methods();
    }

    /**
     * Validate if AES-128-CBC is supported
     * 
     * @return bool True if supported
     */
    public static function isAes128CbcSupported()
    {
        $ciphers = self::getSupportedCiphers();
        // Check for different possible cipher names
        return in_array('AES-128-CBC', $ciphers) || 
               in_array('aes-128-cbc', $ciphers) ||
               in_array('AES128-CBC', $ciphers);
    }
}
