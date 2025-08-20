#!/usr/bin/env node

/**
 * CookieCloud Fixed IV Decryption - Node.js Implementation
 * 
 * Algorithm: AES-128-CBC
 * Key: MD5(uuid + "-" + password).substring(0, 16)
 * IV: Fixed 16 bytes of zeros (0x00000000000000000000000000000000)
 * Padding: PKCS7
 * Encoding: Base64
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Decrypt CookieCloud data using standard Node.js crypto
 * @param {string} uuid - User UUID
 * @param {string} encrypted - Base64 encrypted data
 * @param {string} password - Password
 * @returns {object} Decrypted data
 */
function decrypt(uuid, encrypted, password) {
    // 1. Generate key: first 16 characters of MD5(uuid + "-" + password)
    const keyInput = `${uuid}-${password}`;
    const hash = crypto.createHash('md5').update(keyInput).digest('hex');
    const key = Buffer.from(hash.substring(0, 16), 'utf8');
    
    // 2. Fixed IV: 16 bytes of zeros
    const iv = Buffer.alloc(16, 0);
    
    // 3. Decode base64 encrypted data
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    
    // 4. Create AES-128-CBC decipher
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    
    // 5. Decrypt and remove padding
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 6. Parse JSON
    const result = JSON.parse(decrypted.toString('utf8'));
    
    return result;
}

/**
 * Pretty print cookie data
 */
function printCookies(cookieData) {
    console.log('\n🍪 Cookie Data:');
    for (const [domain, cookies] of Object.entries(cookieData)) {
        console.log(`\n📍 ${domain}:`);
        cookies.forEach((cookie, index) => {
            console.log(`  ${index + 1}. ${cookie.name} = ${cookie.value}`);
            if (cookie.path) console.log(`     Path: ${cookie.path}`);
            if (cookie.secure) console.log(`     Secure: ${cookie.secure}`);
            if (cookie.httpOnly) console.log(`     HttpOnly: ${cookie.httpOnly}`);
        });
    }
}

/**
 * Pretty print local storage data
 */
function printLocalStorage(localStorageData) {
    console.log('\n💾 Local Storage Data:');
    for (const [domain, storage] of Object.entries(localStorageData)) {
        console.log(`\n📍 ${domain}:`);
        for (const [key, value] of Object.entries(storage)) {
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`  ${key} = ${displayValue}`);
        }
    }
}

function main() {
    console.log('=== CookieCloud Fixed IV Decryption - Node.js ===\n');
    
    // Test parameters
    const uuid = 'jNp1T2qZ6shwVW9VmjLvp1';
    const password = 'iZ4PCqzfJcHyiwAQcCuupD';
    const dataFile = path.join(__dirname, '..', 'jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json');
    
    console.log('📋 Test Parameters:');
    console.log(`UUID: ${uuid}`);
    console.log(`Password: ${password}`);
    console.log(`Data File: ${path.basename(dataFile)}`);
    
    try {
        // Read encrypted data
        const rawData = fs.readFileSync(dataFile, 'utf8');
        const data = JSON.parse(rawData);
        
        console.log(`\n🔐 Encrypted Data Length: ${data.encrypted.length} characters`);
        console.log(`Encrypted Data (first 50 chars): ${data.encrypted.substring(0, 50)}...`);
        
        // Decrypt
        console.log('\n🔓 Decrypting...');
        const decrypted = decrypt(uuid, data.encrypted, password);
        
        console.log('✅ Decryption successful!');
        console.log(`\n📊 Decrypted Data Summary:`);
        console.log(`- Cookie domains: ${Object.keys(decrypted.cookie_data || {}).length}`);
        console.log(`- Local storage domains: ${Object.keys(decrypted.local_storage_data || {}).length}`);
        console.log(`- Update time: ${decrypted.update_time}`);
        
        // Print detailed data
        if (decrypted.cookie_data) {
            printCookies(decrypted.cookie_data);
        }
        
        if (decrypted.local_storage_data) {
            printLocalStorage(decrypted.local_storage_data);
        }
        
        console.log('\n🎉 Node.js decryption completed successfully!');
        
    } catch (error) {
        console.error('❌ Decryption failed:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = { decrypt };

// Run if called directly
if (require.main === module) {
    main();
}
