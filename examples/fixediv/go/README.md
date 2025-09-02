# CookieCloud Fixed IV Decryption - Go

This is a Go implementation for decrypting CookieCloud's `aes-128-cbc-fixed` encrypted data using standard Go crypto libraries.

## Requirements

- Go 1.18 or higher
- No external dependencies (uses standard library only)

## Installation

```bash
cd go
go mod tidy
```

## Usage

### Command Line

```bash
go run decrypt.go
# or build first
go build -o decrypt decrypt.go
./decrypt
```

### As Package

```go
package main

import (
    "fmt"
    "log"
)

func main() {
    uuid := "your-uuid"
    encrypted := "base64-encrypted-data"
    password := "your-password"
    
    data, err := Decrypt(uuid, encrypted, password)
    if err != nil {
        log.Fatal("Decryption failed:", err)
    }
    
    fmt.Printf("Decrypted data: %+v\n", data)
}
```

### HTTP Server Example

```go
package main

import (
    "encoding/json"
    "net/http"
    "log"
)

type DecryptRequest struct {
    UUID      string `json:"uuid"`
    Encrypted string `json:"encrypted"`
    Password  string `json:"password"`
}

type DecryptResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data,omitempty"`
    Error   string      `json:"error,omitempty"`
}

func decryptHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    var req DecryptRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    
    data, err := Decrypt(req.UUID, req.Encrypted, req.Password)
    
    w.Header().Set("Content-Type", "application/json")
    
    if err != nil {
        resp := DecryptResponse{Success: false, Error: err.Error()}
        json.NewEncoder(w).Encode(resp)
        return
    }
    
    resp := DecryptResponse{Success: true, Data: data}
    json.NewEncoder(w).Encode(resp)
}

func main() {
    http.HandleFunc("/decrypt", decryptHandler)
    log.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

## Building

### Cross-Platform Builds

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o decrypt-linux decrypt.go

# Windows
GOOS=windows GOARCH=amd64 go build -o decrypt-windows.exe decrypt.go

# macOS
GOOS=darwin GOARCH=amd64 go build -o decrypt-macos decrypt.go

# ARM64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o decrypt-macos-arm64 decrypt.go
```

### Optimized Build

```bash
go build -ldflags="-s -w" -o decrypt decrypt.go
```

## Algorithm Details

- **Algorithm**: AES-128-CBC
- **Key**: MD5(uuid + "-" + password).substring(0, 16)
- **IV**: Fixed 16 bytes of zeros
- **Padding**: PKCS7
- **Encoding**: Base64

## Performance

- Decryption time: ~1ms for typical CookieCloud data
- Memory usage: ~3-5MB
- Binary size: ~2-3MB (static binary)
- Zero external dependencies

## Testing

```bash
go test -v
```

## Docker

Create a `Dockerfile`:

```dockerfile
FROM golang:1.20-alpine AS builder

WORKDIR /app
COPY . .
RUN go mod tidy && go build -ldflags="-s -w" -o decrypt decrypt.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/decrypt .
COPY --from=builder /app/*.json .

CMD ["./decrypt"]
```

Build and run:

```bash
docker build -t cookiecloud-decrypt-go .
docker run --rm cookiecloud-decrypt-go
```
