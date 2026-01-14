/**
 * Node.js Script to Test Multipart Upload
 *
 * Usage:
 *   node test_multipart_upload.js <file-path> <jwt-token>
 *
 * Example:
 *   node test_multipart_upload.js ./test-video.mp4 "eyJhbGciOiJIUzI1..."
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

// Get command line arguments
const filePath = process.argv[2];
const jwtToken = process.argv[3];

if (!filePath || !jwtToken) {
  console.error(
    '❌ Usage: node test_multipart_upload.js <file-path> <jwt-token>'
  );
  console.error(
    'Example: node test_multipart_upload.js ./video.mp4 "eyJhbGci..."'
  );
  process.exit(1);
}

// Validate file exists
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

async function testMultipartUpload() {
  try {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const fileSize = stats.size;

    // Detect file type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };
    const fileType = mimeTypes[ext] || 'application/octet-stream';

    console.log('\n🎾 Padelize Multipart Upload Test\n');
    console.log('📁 File:', fileName);
    console.log('📏 Size:', (fileSize / (1024 * 1024)).toFixed(2), 'MB');
    console.log('📝 Type:', fileType);
    console.log('🌐 API:', API_URL);
    console.log('');

    // Step 1: Initialize upload
    console.log('Step 1: Initializing upload...');
    const initResponse = await fetch(`${API_URL}/multipart-upload/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        fileName,
        fileType,
        fileSize,
      }),
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(
        `Initialize failed: ${initResponse.status} - ${errorText}`
      );
    }

    const initData = await initResponse.json();
    const { uploadId, key } = initData.data;

    console.log('✅ Upload initialized');
    console.log('   Upload ID:', uploadId);
    console.log('   S3 Key:', key);
    console.log('');

    // Step 2: Calculate chunks
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`Step 2: Splitting file into ${totalChunks} chunks...`);
    console.log('');

    // Step 3: Get presigned URLs (in batches of 100)
    console.log('Step 3: Getting presigned URLs...');
    let allUrls = [];

    for (let batch = 0; batch < Math.ceil(totalChunks / 100); batch++) {
      const startPart = batch * 100 + 1;
      const endPart = Math.min(startPart + 99, totalChunks);

      const urlsResponse = await fetch(
        `${API_URL}/multipart-upload/batch-presigned-urls`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            uploadId,
            key,
            startPart,
            endPart,
          }),
        }
      );

      if (!urlsResponse.ok) {
        throw new Error(`Get URLs failed: ${await urlsResponse.text()}`);
      }

      const urlsData = await urlsResponse.json();
      allUrls = allUrls.concat(urlsData.data.urls);
    }

    console.log(`✅ Received ${allUrls.length} presigned URLs`);
    console.log('');

    // Step 4: Upload chunks
    console.log('Step 4: Uploading chunks...');
    const uploadedParts = [];
    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: CHUNK_SIZE,
    });

    let partNumber = 1;
    let buffer = Buffer.alloc(0);

    for await (const chunk of fileStream) {
      buffer = Buffer.concat([buffer, chunk]);

      if (buffer.length >= CHUNK_SIZE || partNumber === totalChunks) {
        const urlInfo = allUrls[partNumber - 1];

        process.stdout.write(
          `   Uploading part ${partNumber}/${totalChunks}...`
        );

        const uploadResponse = await fetch(urlInfo.presignedUrl, {
          method: 'PUT',
          body: buffer.slice(0, CHUNK_SIZE),
          headers: {
            'Content-Length': buffer.slice(0, CHUNK_SIZE).length,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(
            `Upload part ${partNumber} failed: ${uploadResponse.status}`
          );
        }

        const etag = uploadResponse.headers.get('ETag');
        uploadedParts.push({
          PartNumber: partNumber,
          ETag: etag,
        });

        const progress = ((partNumber / totalChunks) * 100).toFixed(1);
        console.log(` ✅ ${progress}%`);

        buffer = buffer.slice(CHUNK_SIZE);
        partNumber++;
      }
    }

    console.log('');

    // Step 5: Complete upload
    console.log('Step 5: Completing upload...');
    const completeResponse = await fetch(
      `${API_URL}/multipart-upload/complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          uploadId,
          key,
          parts: uploadedParts,
        }),
      }
    );

    if (!completeResponse.ok) {
      throw new Error(`Complete failed: ${await completeResponse.text()}`);
    }

    const completeData = await completeResponse.json();
    console.log('✅ Upload completed successfully!');
    console.log('');
    console.log('📊 Upload Summary:');
    console.log('   Location:', completeData.data.location);
    console.log('   Total Parts:', completeData.data.totalParts);
    console.log(
      '   File Size:',
      (completeData.data.fileSize / (1024 * 1024)).toFixed(2),
      'MB'
    );
    console.log('   ETag:', completeData.data.etag);
    console.log('');
    console.log('🎉 Test completed successfully!');
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

// Run the test
testMultipartUpload();
