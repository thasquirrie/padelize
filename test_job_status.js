/**
 * Test script for Job Status API
 * Tests GET /api/v1/jobs/:jobId endpoint
 */

import fetch from 'node-fetch';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

async function testJobStatus() {
  console.log('🧪 Testing Job Status API\n');
  console.log('Base URL:', API_BASE_URL);
  console.log('API Key:', API_KEY ? '✓ Set' : '✗ Not set');
  console.log('─'.repeat(60));

  // Test 1: Missing API Key (should return 401)
  console.log('\n📌 Test 1: Missing API Key');
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/jobs/test-job-123`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log(
      response.status === 401 ? '✅ Correctly returned 401' : '❌ Expected 401'
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Invalid API Key (should return 403)
  console.log('\n📌 Test 2: Invalid API Key');
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/jobs/test-job-123`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key',
        },
      }
    );
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log(
      response.status === 403 ? '✅ Correctly returned 403' : '❌ Expected 403'
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Valid API Key but Non-existent Job (should return 404)
  console.log('\n📌 Test 3: Valid API Key but Non-existent Job');
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/jobs/non-existent-job-id`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
      }
    );
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log(
      response.status === 404 ? '✅ Correctly returned 404' : '❌ Expected 404'
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 4: Valid API Key and Existing Job (requires actual jobId)
  console.log('\n📌 Test 4: Valid API Key and Existing Job');
  console.log(
    '⚠️  Skipped - requires actual jobId from database. Test manually with:'
  );
  console.log(
    `   curl -H "X-API-Key: ${API_KEY}" ${API_BASE_URL}/api/v1/jobs/{actualJobId}`
  );

  console.log('\n' + '─'.repeat(60));
  console.log('✅ Test suite completed!\n');
}

testJobStatus().catch(console.error);
