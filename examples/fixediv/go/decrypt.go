package main

/*
CookieCloud Fixed IV Decryption - Go Implementation

Algorithm: AES-128-CBC
Key: MD5(uuid + "-" + password).substring(0, 16)
IV: Fixed 16 bytes of zeros (0x00000000000000000000000000000000)
Padding: PKCS7
Encoding: Base64
*/

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
)

// CookieData represents a cookie
type CookieData struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Domain   string `json:"domain"`
	Path     string `json:"path"`
	Secure   bool   `json:"secure"`
	HttpOnly bool   `json:"httpOnly"`
}

// DecryptedData represents the decrypted structure
type DecryptedData struct {
	CookieData       map[string][]CookieData      `json:"cookie_data"`
	LocalStorageData map[string]map[string]string `json:"local_storage_data"`
	UpdateTime       string                       `json:"update_time"`
}

// EncryptedFile represents the input file structure
type EncryptedFile struct {
	Encrypted string `json:"encrypted"`
}

// pkcs7Unpad removes PKCS7 padding
func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("data is empty")
	}

	padLen := int(data[len(data)-1])
	if padLen > len(data) || padLen == 0 {
		return nil, fmt.Errorf("invalid padding")
	}

	// Verify padding
	for i := len(data) - padLen; i < len(data); i++ {
		if data[i] != byte(padLen) {
			return nil, fmt.Errorf("invalid padding")
		}
	}

	return data[:len(data)-padLen], nil
}

// Decrypt decrypts CookieCloud data using standard Go crypto
func Decrypt(uuid, encrypted, password string) (*DecryptedData, error) {
	// 1. Generate key: first 16 characters of MD5(uuid + "-" + password)
	keyInput := uuid + "-" + password
	hash := md5.Sum([]byte(keyInput))

	// Convert hash to hex string and take first 16 characters
	hexStr := fmt.Sprintf("%x", hash)
	key := []byte(hexStr[:16])

	// 2. Fixed IV: 16 bytes of zeros
	iv := make([]byte, 16)

	// 3. Decode base64 encrypted data
	encryptedData, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return nil, fmt.Errorf("base64 decode error: %v", err)
	}

	// 4. Create AES-128-CBC cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cipher creation error: %v", err)
	}

	if len(encryptedData)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("encrypted data is not a multiple of block size")
	}

	// 5. Decrypt
	mode := cipher.NewCBCDecrypter(block, iv)
	decrypted := make([]byte, len(encryptedData))
	mode.CryptBlocks(decrypted, encryptedData)

	// 6. Remove padding
	unpadded, err := pkcs7Unpad(decrypted)
	if err != nil {
		return nil, fmt.Errorf("unpadding error: %v", err)
	}

	// 7. Parse JSON
	var result DecryptedData
	err = json.Unmarshal(unpadded, &result)
	if err != nil {
		return nil, fmt.Errorf("JSON parsing error: %v", err)
	}

	return &result, nil
}

// printCookies pretty prints cookie data
func printCookies(cookieData map[string][]CookieData) {
	fmt.Println("\n🍪 Cookie Data:")

	for domain, cookies := range cookieData {
		fmt.Printf("\n📍 %s:\n", domain)

		for i, cookie := range cookies {
			fmt.Printf("  %d. %s = %s\n", i+1, cookie.Name, cookie.Value)

			if cookie.Path != "" {
				fmt.Printf("     Path: %s\n", cookie.Path)
			}
			if cookie.Secure {
				fmt.Printf("     Secure: %t\n", cookie.Secure)
			}
			if cookie.HttpOnly {
				fmt.Printf("     HttpOnly: %t\n", cookie.HttpOnly)
			}
		}
	}
}

// printLocalStorage pretty prints local storage data
func printLocalStorage(localStorageData map[string]map[string]string) {
	fmt.Println("\n💾 Local Storage Data:")

	for domain, storage := range localStorageData {
		fmt.Printf("\n📍 %s:\n", domain)

		for key, value := range storage {
			displayValue := value
			if len(value) > 50 {
				displayValue = value[:50] + "..."
			}
			fmt.Printf("  %s = %s\n", key, displayValue)
		}
	}
}

func main() {
	fmt.Println("=== CookieCloud Fixed IV Decryption - Go ===\n")

	// Test parameters
	uuid := "jNp1T2qZ6shwVW9VmjLvp1"
	password := "iZ4PCqzfJcHyiwAQcCuupD"

	// Get the data file path (one directory up)
	currentDir, err := os.Getwd()
	if err != nil {
		fmt.Printf("❌ Error getting current directory: %v\n", err)
		os.Exit(1)
	}
	dataFile := filepath.Join(filepath.Dir(currentDir), "jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json")

	fmt.Println("📋 Test Parameters:")
	fmt.Printf("UUID: %s\n", uuid)
	fmt.Printf("Password: %s\n", password)
	fmt.Printf("Data File: %s\n", filepath.Base(dataFile))

	// Read encrypted data
	rawData, err := ioutil.ReadFile(dataFile)
	if err != nil {
		fmt.Printf("❌ Error reading file: %v\n", err)
		os.Exit(1)
	}

	var data EncryptedFile
	err = json.Unmarshal(rawData, &data)
	if err != nil {
		fmt.Printf("❌ Error parsing JSON: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n🔐 Encrypted Data Length: %d characters\n", len(data.Encrypted))

	encryptedPreview := data.Encrypted
	if len(encryptedPreview) > 50 {
		encryptedPreview = encryptedPreview[:50] + "..."
	}
	fmt.Printf("Encrypted Data (first 50 chars): %s\n", encryptedPreview)

	// Decrypt
	fmt.Println("\n🔓 Decrypting...")
	decrypted, err := Decrypt(uuid, data.Encrypted, password)
	if err != nil {
		fmt.Printf("❌ Decryption failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Decryption successful!")
	fmt.Println("\n📊 Decrypted Data Summary:")
	fmt.Printf("- Cookie domains: %d\n", len(decrypted.CookieData))
	fmt.Printf("- Local storage domains: %d\n", len(decrypted.LocalStorageData))
	fmt.Printf("- Update time: %s\n", decrypted.UpdateTime)

	// Print detailed data
	if len(decrypted.CookieData) > 0 {
		printCookies(decrypted.CookieData)
	}

	if len(decrypted.LocalStorageData) > 0 {
		printLocalStorage(decrypted.LocalStorageData)
	}

	fmt.Println("\n🎉 Go decryption completed successfully!")
}
