/**
 * CookieCloud Fixed IV Decryption - Java Simple Implementation
 * 
 * A minimal Java implementation without external dependencies.
 * Uses only standard JDK libraries for maximum compatibility.
 * 
 * Compile: javac DecryptSimple.java
 * Run: java DecryptSimple
 */

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
import java.security.MessageDigest;
import java.util.Base64;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;

public class DecryptSimple {
    
    /**
     * Decrypt CookieCloud data using standard Java crypto
     */
    public static String decrypt(String uuid, String encrypted, String password) throws Exception {
        // 1. Generate key: MD5(uuid + "-" + password) first 16 chars
        String keyInput = uuid + "-" + password;
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] hashBytes = md.digest(keyInput.getBytes(StandardCharsets.UTF_8));
        
        // Convert to hex string
        StringBuilder hexString = new StringBuilder();
        for (byte b : hashBytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }
        String key = hexString.toString().substring(0, 16);
        
        // 2. Fixed IV: 16 bytes of zeros
        byte[] iv = new byte[16];
        
        // 3. Decode base64 encrypted data
        byte[] encryptedData = Base64.getDecoder().decode(encrypted);
        
        // 4. Create AES-128-CBC cipher
        SecretKeySpec keySpec = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);
        
        // 5. Decrypt
        byte[] decrypted = cipher.doFinal(encryptedData);
        
        return new String(decrypted, StandardCharsets.UTF_8);
    }
    
    /**
     * Simple JSON value extractor (without external libraries)
     */
    public static String extractJsonValue(String json, String key) {
        String searchKey = "\"" + key + "\":";
        int startIndex = json.indexOf(searchKey);
        if (startIndex == -1) return null;
        
        startIndex += searchKey.length();
        // Skip whitespace
        while (startIndex < json.length() && Character.isWhitespace(json.charAt(startIndex))) {
            startIndex++;
        }
        
        if (startIndex >= json.length()) return null;
        
        char firstChar = json.charAt(startIndex);
        if (firstChar == '"') {
            // String value
            startIndex++; // Skip opening quote
            int endIndex = json.indexOf('"', startIndex);
            while (endIndex != -1 && json.charAt(endIndex - 1) == '\\') {
                endIndex = json.indexOf('"', endIndex + 1);
            }
            if (endIndex == -1) return null;
            return json.substring(startIndex, endIndex);
        } else if (firstChar == '{' || firstChar == '[') {
            // Object or array - find matching closing bracket
            char openChar = firstChar;
            char closeChar = (openChar == '{') ? '}' : ']';
            int depth = 1;
            int pos = startIndex + 1;
            
            while (pos < json.length() && depth > 0) {
                char c = json.charAt(pos);
                if (c == openChar) depth++;
                else if (c == closeChar) depth--;
                pos++;
            }
            
            if (depth == 0) {
                return json.substring(startIndex, pos);
            }
        } else {
            // Number, boolean, or null
            int endIndex = startIndex;
            while (endIndex < json.length() && 
                   !Character.isWhitespace(json.charAt(endIndex)) &&
                   json.charAt(endIndex) != ',' && 
                   json.charAt(endIndex) != '}' && 
                   json.charAt(endIndex) != ']') {
                endIndex++;
            }
            return json.substring(startIndex, endIndex);
        }
        
        return null;
    }
    
    /**
     * Count JSON object keys
     */
    public static int countJsonKeys(String jsonObject) {
        if (jsonObject == null || !jsonObject.trim().startsWith("{")) return 0;
        
        int count = 0;
        int pos = 1; // Skip opening brace
        boolean inString = false;
        boolean escaped = false;
        
        while (pos < jsonObject.length()) {
            char c = jsonObject.charAt(pos);
            
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                inString = !inString;
            } else if (!inString && c == ':') {
                count++;
            }
            
            pos++;
        }
        
        return count;
    }
    
    public static void main(String[] args) {
        System.out.println("=== CookieCloud Fixed IV Decryption - Java Simple ===\n");
        
        // Test parameters
        String uuid = "jNp1T2qZ6shwVW9VmjLvp1";
        String password = "iZ4PCqzfJcHyiwAQcCuupD";
        String dataFile = "../jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json";
        
        System.out.println("📋 Test Parameters:");
        System.out.println("UUID: " + uuid);
        System.out.println("Password: " + password);
        System.out.println("Data File: " + dataFile.substring(dataFile.lastIndexOf('/') + 1));
        
        try {
            // Read encrypted data
            String rawData = Files.readString(Paths.get(dataFile), StandardCharsets.UTF_8);
            String encryptedData = extractJsonValue(rawData, "encrypted");
            
            if (encryptedData == null) {
                throw new Exception("Could not extract encrypted data from JSON");
            }
            
            System.out.println("\n🔐 Encrypted Data Length: " + encryptedData.length() + " characters");
            System.out.println("Encrypted Data (first 50 chars): " + 
                encryptedData.substring(0, Math.min(50, encryptedData.length())) + "...");
            
            // Decrypt
            System.out.println("\n🔓 Decrypting...");
            String decryptedJson = decrypt(uuid, encryptedData, password);
            
            System.out.println("✅ Decryption successful!");
            System.out.println("\n📊 Decrypted Data Summary:");
            
            // Extract and analyze data without external JSON library
            String cookieData = extractJsonValue(decryptedJson, "cookie_data");
            String localStorageData = extractJsonValue(decryptedJson, "local_storage_data");
            String updateTime = extractJsonValue(decryptedJson, "update_time");
            
            int cookieDomains = countJsonKeys(cookieData);
            int localStorageDomains = countJsonKeys(localStorageData);
            
            System.out.println("- Cookie domains: " + cookieDomains);
            System.out.println("- Local storage domains: " + localStorageDomains);
            System.out.println("- Update time: " + updateTime);
            
            // Show first 200 characters of decrypted data
            System.out.println("\n📄 Decrypted Data Preview:");
            String preview = decryptedJson.length() > 200 ? 
                decryptedJson.substring(0, 200) + "..." : decryptedJson;
            System.out.println(preview);
            
            System.out.println("\n🎉 Java Simple decryption completed successfully!");
            System.out.println("\n💡 This implementation uses only standard JDK libraries!");
            System.out.println("   No external dependencies like Jackson required.");
            
        } catch (Exception e) {
            System.err.println("❌ Decryption failed: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
