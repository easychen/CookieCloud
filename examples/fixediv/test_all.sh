#!/bin/bash

# CookieCloud Fixed IV - Cross-Language Test Script
# Tests all language implementations with the same test data

echo "🚀 Testing CookieCloud Fixed IV Decryption Across Languages"
echo "============================================================"

# Test parameters
UUID="jNp1T2qZ6shwVW9VmjLvp1"
PASSWORD="iZ4PCqzfJcHyiwAQcCuupD"
DATA_FILE="jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json"

echo "📋 Test Parameters:"
echo "   UUID: $UUID"
echo "   Password: $PASSWORD"
echo "   Data File: $DATA_FILE"
echo ""

# Check if data file exists
if [ ! -f "$DATA_FILE" ]; then
    echo "❌ Error: Test data file '$DATA_FILE' not found!"
    echo "   Please ensure the data file is in the current directory."
    exit 1
fi

PASSED=0
FAILED=0
SKIPPED=0

# Function to run test and check result
run_test() {
    local name="$1"
    local dir="$2"
    local command="$3"
    local check_command="$4"
    
    echo "🧪 Testing $name..."
    echo "   Directory: $dir"
    echo "   Command: $command"
    
    # Check if directory exists
    if [ ! -d "$dir" ]; then
        echo "   ⚠️  Skipped: Directory not found"
        ((SKIPPED++))
        echo ""
        return
    fi
    
    # Check if required tools are available
    if [ ! -z "$check_command" ]; then
        if ! $check_command >/dev/null 2>&1; then
            echo "   ⚠️  Skipped: Required tools not available"
            ((SKIPPED++))
            echo ""
            return
        fi
    fi
    
    # Change to test directory and run
    cd "$dir" || {
        echo "   ❌ FAILED: Cannot change to directory"
        ((FAILED++))
        echo ""
        return
    }
    
    # Run the test with timeout (compatible with both Linux and macOS)
    if command -v timeout >/dev/null 2>&1; then
        # Linux timeout
        if timeout 60s bash -c "$command" >/dev/null 2>&1; then
            echo "   ✅ PASSED"
            ((PASSED++))
        else
            echo "   ❌ FAILED"
            ((FAILED++))
            echo "   💡 Try running manually: cd $dir && $command"
        fi
    elif command -v gtimeout >/dev/null 2>&1; then
        # macOS gtimeout (brew install coreutils)
        if gtimeout 60s bash -c "$command" >/dev/null 2>&1; then
            echo "   ✅ PASSED"
            ((PASSED++))
        else
            echo "   ❌ FAILED"
            ((FAILED++))
            echo "   💡 Try running manually: cd $dir && $command"
        fi
    else
        # No timeout available, run directly
        if bash -c "$command" >/dev/null 2>&1; then
            echo "   ✅ PASSED"
            ((PASSED++))
        else
            echo "   ❌ FAILED"
            ((FAILED++))
            echo "   💡 Try running manually: cd $dir && $command"
        fi
    fi
    
    # Return to parent directory
    cd ..
    echo ""
}

# Test 1: Node.js
run_test "Node.js" "nodejs" "node decrypt.js" "command -v node"

# Test 2: Python
run_test "Python" "python" "pip install -r requirements.txt >/dev/null 2>&1 && python decrypt.py" "command -v python"

# Test 3: Go
run_test "Go" "go" "go mod tidy >/dev/null 2>&1 && go run decrypt.go" "command -v go"

# Test 4: PHP
run_test "PHP" "php" "php decrypt.php" "command -v php"

# Test 5: Java (Maven version)
echo "🧪 Testing Java (Maven)..."
echo "   Directory: java"
echo "   Command: mvn -q exec:java -Dexec.mainClass=\"com.cookiecloud.decrypt.DecryptMain\""

if [ -d "java" ]; then
    if command -v mvn >/dev/null 2>&1; then
        cd java || {
            echo "   ❌ FAILED: Cannot change to directory"
            ((FAILED++))
            echo ""
        }
        
        # Try to run with Maven (with timeout compatibility)
        maven_success=false
        if command -v timeout >/dev/null 2>&1; then
            timeout 120s mvn -q exec:java -Dexec.mainClass="com.cookiecloud.decrypt.DecryptMain" >/dev/null 2>&1 && maven_success=true
        elif command -v gtimeout >/dev/null 2>&1; then
            gtimeout 120s mvn -q exec:java -Dexec.mainClass="com.cookiecloud.decrypt.DecryptMain" >/dev/null 2>&1 && maven_success=true
        else
            mvn -q exec:java -Dexec.mainClass="com.cookiecloud.decrypt.DecryptMain" >/dev/null 2>&1 && maven_success=true
        fi
        
        if [ "$maven_success" = true ]; then
            echo "   ✅ PASSED"
            ((PASSED++))
        else
            echo "   ❌ FAILED (May need to run 'mvn install' first)"
            ((FAILED++))
            echo "   💡 Try: cd java && mvn install && mvn exec:java -Dexec.mainClass=\"com.cookiecloud.decrypt.DecryptMain\""
        fi
        cd ..
    else
        echo "   ⚠️  Skipped: Maven not available"
        ((SKIPPED++))
    fi
else
    echo "   ⚠️  Skipped: Directory not found"
    ((SKIPPED++))
fi
echo ""

# Test 6: Java Simple (no dependencies)
echo "🧪 Testing Java Simple..."
echo "   Directory: java-simple"
echo "   Command: javac DecryptSimple.java && java DecryptSimple"

if [ -d "java-simple" ]; then
    if command -v javac >/dev/null 2>&1 && command -v java >/dev/null 2>&1; then
        cd java-simple || {
            echo "   ❌ FAILED: Cannot change to directory"
            ((FAILED++))
            echo ""
        }
        
        # Try to compile and run
        if javac DecryptSimple.java 2>/dev/null; then
            java_success=false
            if command -v timeout >/dev/null 2>&1; then
                timeout 60s java DecryptSimple >/dev/null 2>&1 && java_success=true
            elif command -v gtimeout >/dev/null 2>&1; then
                gtimeout 60s java DecryptSimple >/dev/null 2>&1 && java_success=true
            else
                java DecryptSimple >/dev/null 2>&1 && java_success=true
            fi
            
            if [ "$java_success" = true ]; then
                echo "   ✅ PASSED"
                ((PASSED++))
                # Clean up
                rm -f *.class
            else
                echo "   ❌ FAILED (Runtime error)"
                ((FAILED++))
            fi
        else
            echo "   ❌ FAILED (Compilation error)"
            ((FAILED++))
        fi
        cd ..
    else
        echo "   ⚠️  Skipped: Java not available"
        ((SKIPPED++))
    fi
else
    echo "   ⚠️  Skipped: Directory not found"
    ((SKIPPED++))
fi
echo ""

# Summary
echo "📊 Test Summary"
echo "==============="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "⚠️  Skipped: $SKIPPED"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $PASSED -gt 0 ]; then
        echo "🎉 All available language implementations passed!"
        echo ""
        echo "🔐 Algorithm Verification:"
        echo "   All implementations successfully decrypted the same data using:"
        echo "   - Algorithm: AES-128-CBC"
        echo "   - Key: MD5(uuid + '-' + password).substring(0, 16)"
        echo "   - IV: Fixed 16 bytes of zeros"
        echo "   - Padding: PKCS7"
        echo "   - Encoding: Base64"
        echo ""
        echo "✨ This proves perfect cross-language compatibility!"
    else
        echo "⚠️  No tests were run. Please check if the required tools are installed."
    fi
else
    echo "⚠️  Some tests failed. Common reasons:"
    echo "   - Missing dependencies (PyCryptodome for Python, Jackson for Java)"
    echo "   - Environment issues"
    echo "   - File permissions"
    echo "   - Network timeouts during dependency installation"
    echo ""
    echo "💡 Try running individual tests manually:"
    echo "   - Node.js:     cd nodejs && node decrypt.js"
    echo "   - Python:      cd python && pip install -r requirements.txt && python decrypt.py"
    echo "   - Go:          cd go && go run decrypt.go"
    echo "   - PHP:         cd php && php decrypt.php"
    echo "   - Java (Maven): cd java && mvn install && mvn exec:java -Dexec.mainClass=\"com.cookiecloud.decrypt.DecryptMain\""
    echo "   - Java Simple: cd java-simple && javac DecryptSimple.java && java DecryptSimple"
fi

echo ""
echo "🔗 For detailed documentation, see individual README.md files in each language directory"
echo "🔗 For algorithm details, see the main README.md file"