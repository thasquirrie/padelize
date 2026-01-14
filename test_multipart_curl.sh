#!/bin/bash

# Multipart Upload Test Script using cURL
# Usage: ./test_multipart_curl.sh <file-path> <jwt-token>

set -e

FILE_PATH=$1
JWT_TOKEN=$2
API_URL=${API_URL:-"http://localhost:3000/api/v1"}
CHUNK_SIZE=$((10 * 1024 * 1024)) # 10MB

if [ -z "$FILE_PATH" ] || [ -z "$JWT_TOKEN" ]; then
    echo "❌ Usage: ./test_multipart_curl.sh <file-path> <jwt-token>"
    echo "Example: ./test_multipart_curl.sh ./video.mp4 'eyJhbGci...'"
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "❌ File not found: $FILE_PATH"
    exit 1
fi

echo ""
echo "🎾 Padelize Multipart Upload Test (cURL)"
echo ""

FILE_NAME=$(basename "$FILE_PATH")
FILE_SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH")
FILE_TYPE="video/mp4"

echo "📁 File: $FILE_NAME"
echo "📏 Size: $(echo "scale=2; $FILE_SIZE / 1048576" | bc) MB"
echo "🌐 API: $API_URL"
echo ""

# Step 1: Initialize upload
echo "Step 1: Initializing upload..."
INIT_RESPONSE=$(curl -s -X POST "$API_URL/multipart-upload/initialize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"fileName\": \"$FILE_NAME\",
    \"fileType\": \"$FILE_TYPE\",
    \"fileSize\": $FILE_SIZE
  }")

UPLOAD_ID=$(echo "$INIT_RESPONSE" | grep -o '"uploadId":"[^"]*"' | cut -d'"' -f4)
KEY=$(echo "$INIT_RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UPLOAD_ID" ]; then
    echo "❌ Initialize failed"
    echo "$INIT_RESPONSE"
    exit 1
fi

echo "✅ Upload initialized"
echo "   Upload ID: $UPLOAD_ID"
echo "   S3 Key: $KEY"
echo ""

# Step 2: Calculate chunks
TOTAL_CHUNKS=$(( ($FILE_SIZE + $CHUNK_SIZE - 1) / $CHUNK_SIZE ))
echo "Step 2: File will be split into $TOTAL_CHUNKS chunks"
echo ""

# Step 3: Get presigned URL for part 1 (example)
echo "Step 3: Getting presigned URL for part 1..."
URL_RESPONSE=$(curl -s -X POST "$API_URL/multipart-upload/presigned-url" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"uploadId\": \"$UPLOAD_ID\",
    \"key\": \"$KEY\",
    \"partNumber\": 1
  }")

PRESIGNED_URL=$(echo "$URL_RESPONSE" | grep -o '"presignedUrl":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PRESIGNED_URL" ]; then
    echo "❌ Failed to get presigned URL"
    echo "$URL_RESPONSE"
    exit 1
fi

echo "✅ Presigned URL received"
echo ""

# Step 4: Upload first chunk (example)
echo "Step 4: Uploading part 1..."
head -c $CHUNK_SIZE "$FILE_PATH" > /tmp/chunk_1.bin

UPLOAD_RESULT=$(curl -s -X PUT "$PRESIGNED_URL" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/tmp/chunk_1.bin" \
  -D /tmp/headers.txt \
  -o /dev/null \
  -w "%{http_code}")

if [ "$UPLOAD_RESULT" != "200" ]; then
    echo "❌ Upload failed with status: $UPLOAD_RESULT"
    exit 1
fi

ETAG=$(grep -i "etag:" /tmp/headers.txt | cut -d' ' -f2 | tr -d '\r\n')
echo "✅ Part 1 uploaded"
echo "   ETag: $ETAG"
echo ""

# Note: For a complete upload, you would:
# 1. Loop through all chunks
# 2. Upload each chunk to its presigned URL
# 3. Collect all ETags
# 4. Call the complete endpoint with all parts

echo "⚠️  This is a simplified test showing the first chunk only"
echo "   For full implementation, use the HTML or Node.js test tools"
echo ""
echo "To abort this test upload, run:"
echo "curl -X POST '$API_URL/multipart-upload/abort' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer $JWT_TOKEN' \\"
echo "  -d '{\"uploadId\": \"$UPLOAD_ID\", \"key\": \"$KEY\"}'"
echo ""

# Cleanup
rm -f /tmp/chunk_1.bin /tmp/headers.txt
