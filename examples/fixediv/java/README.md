# CookieCloud Fixed IV Decryption - Java

This is a Java implementation for decrypting CookieCloud's `aes-128-cbc-fixed` encrypted data using standard Java cryptography libraries.

## Requirements

- Java 8 or higher
- Maven 3.6+ (for building)
- Jackson library (for JSON parsing)

## Installation

### Using Maven

```bash
cd java
mvn clean install
```

### Using Gradle (alternative)

Create `build.gradle`:

```gradle
plugins {
    id 'java'
    id 'application'
}

java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.15.2'
    testImplementation 'junit:junit:4.13.2'
}

application {
    mainClass = 'com.cookiecloud.decrypt.DecryptMain'
}

jar {
    manifest {
        attributes 'Main-Class': 'com.cookiecloud.decrypt.DecryptMain'
    }
    from {
        configurations.runtimeClasspath.collect { it.isDirectory() ? it : zipTree(it) }
    }
}
```

## Usage

### Command Line (Maven)

```bash
mvn exec:java -Dexec.mainClass="com.cookiecloud.decrypt.DecryptMain"
```

### Command Line (JAR)

```bash
# Build fat JAR
mvn clean package

# Run
java -jar target/decrypt-java-1.0.0.jar
```

### As Library

```java
import com.cookiecloud.decrypt.DecryptMain;

public class Example {
    public static void main(String[] args) {
        String uuid = "your-uuid";
        String encrypted = "base64-encrypted-data";
        String password = "your-password";
        
        try {
            String decryptedJson = DecryptMain.decrypt(uuid, encrypted, password);
            System.out.println("Decrypted: " + decryptedJson);
        } catch (Exception e) {
            System.err.println("Decryption failed: " + e.getMessage());
        }
    }
}
```

### Spring Boot Integration

```java
@RestController
@RequestMapping("/api")
public class DecryptController {
    
    @PostMapping("/decrypt")
    public ResponseEntity<?> decrypt(@RequestBody DecryptRequest request) {
        try {
            String result = DecryptMain.decrypt(
                request.getUuid(), 
                request.getEncrypted(), 
                request.getPassword()
            );
            
            ObjectMapper mapper = new ObjectMapper();
            JsonNode data = mapper.readTree(result);
            
            return ResponseEntity.ok(new DecryptResponse(true, data, null));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(new DecryptResponse(false, null, e.getMessage()));
        }
    }
}

// Request/Response classes
public class DecryptRequest {
    private String uuid;
    private String encrypted;
    private String password;
    
    // getters and setters
}

public class DecryptResponse {
    private boolean success;
    private JsonNode data;
    private String error;
    
    // constructors, getters and setters
}
```

### Servlet Integration

```java
@WebServlet("/decrypt")
public class DecryptServlet extends HttpServlet {
    private ObjectMapper mapper = new ObjectMapper();
    
    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        
        try {
            // Parse request
            JsonNode requestData = mapper.readTree(request.getInputStream());
            String uuid = requestData.get("uuid").asText();
            String encrypted = requestData.get("encrypted").asText();
            String password = requestData.get("password").asText();
            
            // Decrypt
            String decryptedJson = DecryptMain.decrypt(uuid, encrypted, password);
            JsonNode decrypted = mapper.readTree(decryptedJson);
            
            // Response
            ObjectNode responseObj = mapper.createObjectNode();
            responseObj.put("success", true);
            responseObj.set("data", decrypted);
            
            response.getWriter().write(responseObj.toString());
            
        } catch (Exception e) {
            ObjectNode errorResponse = mapper.createObjectNode();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.getWriter().write(errorResponse.toString());
        }
    }
}
```

## Building

### Maven Commands

```bash
# Compile
mvn compile

# Test
mvn test

# Package (creates fat JAR)
mvn package

# Install to local repository
mvn install

# Clean
mvn clean
```

### IDE Setup

**IntelliJ IDEA:**
1. Import as Maven project
2. Set Project SDK to Java 8+
3. Run `DecryptMain.main()`

**Eclipse:**
1. Import → Existing Maven Projects
2. Select the java directory
3. Run as Java Application

**VS Code:**
1. Install Java Extension Pack
2. Open java directory
3. Run via CodeLens or Command Palette

## Algorithm Details

- **Algorithm**: AES-128-CBC
- **Key**: MD5(uuid + "-" + password).substring(0, 16)
- **IV**: Fixed 16 bytes of zeros
- **Padding**: PKCS5/PKCS7 (Java uses PKCS5Padding which is equivalent to PKCS7)
- **Encoding**: Base64

## Performance

- Decryption time: ~5-10ms for typical CookieCloud data
- Memory usage: ~20-30MB (including JVM overhead)
- JAR size: ~1MB (with dependencies)

## Dependencies

- **Jackson Databind**: JSON parsing and generation
  - Core library for JSON operations
  - Handles complex nested structures
  - Thread-safe for concurrent operations

## Testing

Create `src/test/java/com/cookiecloud/decrypt/DecryptTest.java`:

```java
import org.junit.Test;
import static org.junit.Assert.*;

public class DecryptTest {
    
    @Test
    public void testDecrypt() throws Exception {
        String uuid = "test-uuid";
        String password = "test-password";
        // Add test encrypted data here
        String encrypted = "...";
        
        String result = DecryptMain.decrypt(uuid, encrypted, password);
        assertNotNull(result);
        assertTrue(result.contains("cookie_data"));
    }
}
```

Run tests:
```bash
mvn test
```

## Docker

Create `Dockerfile`:

```dockerfile
FROM openjdk:8-jre-alpine

WORKDIR /app

# Copy JAR file
COPY target/decrypt-java-1.0.0.jar app.jar

# Copy test data
COPY ../jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json .

# Run
CMD ["java", "-jar", "app.jar"]
```

Build and run:
```bash
mvn clean package
docker build -t cookiecloud-decrypt-java .
docker run --rm cookiecloud-decrypt-java
```

## Troubleshooting

### Common Issues

1. **ClassNotFoundException**: Make sure Jackson is in classpath
2. **NoSuchAlgorithmException**: Ensure JVM supports AES/CBC/PKCS5Padding
3. **OutOfMemoryError**: Increase heap size with `-Xmx512m`

### Debug Mode

Add JVM arguments:
```bash
java -Djavax.crypto.debug=all -jar target/decrypt-java-1.0.0.jar
```
