package com.cookiecloud.decrypt;

/**
 * CookieCloud Fixed IV Decryption - Java Implementation
 * 
 * Algorithm: AES-128-CBC
 * Key: MD5(uuid + "-" + password).substring(0, 16)
 * IV: Fixed 16 bytes of zeros (0x00000000000000000000000000000000)
 * Padding: PKCS7
 * Encoding: Base64
 */

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
import java.security.MessageDigest;
import java.util.Base64;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.Map;
import java.io.File;

public class DecryptMain {
    
    /**
     * Decrypt CookieCloud data using standard Java crypto
     * 
     * @param uuid User UUID
     * @param encrypted Base64 encrypted data
     * @param password Password
     * @return Decrypted JSON string
     * @throws Exception if decryption fails
     */
    public static String decrypt(String uuid, String encrypted, String password) throws Exception {
        // 1. Generate key: first 16 characters of MD5(uuid + "-" + password)
        String keyInput = uuid + "-" + password;
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] hashBytes = md.digest(keyInput.getBytes(StandardCharsets.UTF_8));
        
        // Convert to hex string
        StringBuilder hexString = new StringBuilder();
        for (byte b : hashBytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        
        String key = hexString.toString().substring(0, 16);
        
        // 2. Fixed IV: 16 bytes of zeros
        byte[] iv = new byte[16]; // Default to all zeros
        
        // 3. Decode base64 encrypted data
        byte[] encryptedData = Base64.getDecoder().decode(encrypted);
        
        // 4. Create AES-128-CBC cipher
        SecretKeySpec keySpec = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);
        
        // 5. Decrypt
        byte[] decrypted = cipher.doFinal(encryptedData);
        
        // 6. Convert to string
        return new String(decrypted, StandardCharsets.UTF_8);
    }
    
    /**
     * Pretty print cookie data
     */
    public static void printCookies(JsonNode cookieData) {
        System.out.println("\n🍪 Cookie Data:");
        
        Iterator<Map.Entry<String, JsonNode>> domains = cookieData.fields();
        while (domains.hasNext()) {
            Map.Entry<String, JsonNode> domain = domains.next();
            System.out.println("\n📍 " + domain.getKey() + ":");
            
            JsonNode cookies = domain.getValue();
            for (int i = 0; i < cookies.size(); i++) {
                JsonNode cookie = cookies.get(i);
                System.out.println("  " + (i + 1) + ". " + 
                    cookie.get("name").asText() + " = " + cookie.get("value").asText());
                
                if (cookie.has("path") && !cookie.get("path").isNull()) {
                    System.out.println("     Path: " + cookie.get("path").asText());
                }
                if (cookie.has("secure") && cookie.get("secure").asBoolean()) {
                    System.out.println("     Secure: " + cookie.get("secure").asBoolean());
                }
                if (cookie.has("httpOnly") && cookie.get("httpOnly").asBoolean()) {
                    System.out.println("     HttpOnly: " + cookie.get("httpOnly").asBoolean());
                }
            }
        }
    }
    
    /**
     * Pretty print local storage data
     */
    public static void printLocalStorage(JsonNode localStorageData) {
        System.out.println("\n💾 Local Storage Data:");
        
        Iterator<Map.Entry<String, JsonNode>> domains = localStorageData.fields();
        while (domains.hasNext()) {
            Map.Entry<String, JsonNode> domain = domains.next();
            System.out.println("\n📍 " + domain.getKey() + ":");
            
            JsonNode storage = domain.getValue();
            Iterator<Map.Entry<String, JsonNode>> entries = storage.fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                String value = entry.getValue().asText();
                String displayValue = value.length() > 50 ? value.substring(0, 50) + "..." : value;
                System.out.println("  " + entry.getKey() + " = " + displayValue);
            }
        }
    }
    
    public static void main(String[] args) {
        System.out.println("=== CookieCloud Fixed IV Decryption - Java ===\n");
        
        // Test parameters
        String uuid = "jNp1T2qZ6shwVW9VmjLvp1";
        String password = "iZ4PCqzfJcHyiwAQcCuupD";
        
        // Get data file path (two directories up from src/main/java)
        File currentDir = new File(System.getProperty("user.dir"));
        File dataFile = new File(currentDir.getParentFile(), "jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json");
        
        System.out.println("📋 Test Parameters:");
        System.out.println("UUID: " + uuid);
        System.out.println("Password: " + password);
        System.out.println("Data File: " + dataFile.getName());
        
        try {
            // Read encrypted data
            String rawData = Files.readString(dataFile.toPath(), StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            JsonNode data = mapper.readTree(rawData);
            
            String encryptedData = data.get("encrypted").asText();
            System.out.println("\n🔐 Encrypted Data Length: " + encryptedData.length() + " characters");
            System.out.println("Encrypted Data (first 50 chars): " + encryptedData.substring(0, 50) + "...");
            
            // Decrypt
            System.out.println("\n🔓 Decrypting...");
            String decryptedJson = decrypt(uuid, encryptedData, password);
            JsonNode decrypted = mapper.readTree(decryptedJson);
            
            System.out.println("✅ Decryption successful!");
            System.out.println("\n📊 Decrypted Data Summary:");
            
            JsonNode cookieData = decrypted.get("cookie_data");
            JsonNode localStorageData = decrypted.get("local_storage_data");
            
            System.out.println("- Cookie domains: " + (cookieData != null ? cookieData.size() : 0));
            System.out.println("- Local storage domains: " + (localStorageData != null ? localStorageData.size() : 0));
            System.out.println("- Update time: " + decrypted.get("update_time").asText());
            
            // Print detailed data
            if (cookieData != null && cookieData.size() > 0) {
                printCookies(cookieData);
            }
            
            if (localStorageData != null && localStorageData.size() > 0) {
                printLocalStorage(localStorageData);
            }
            
            System.out.println("\n🎉 Java decryption completed successfully!");
            
        } catch (Exception e) {
            System.err.println("❌ Decryption failed: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
