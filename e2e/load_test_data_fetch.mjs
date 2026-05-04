import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3005';
const CONCURRENT_REQUESTS = 100;
const ACE_API_KEY = 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';

async function runLoadTest() {
  console.log(`🚀 Starting Load Test: ${CONCURRENT_REQUESTS} concurrent requests to /api/data...`);
  const startTime = Date.now();

  const requests = Array.from({ length: CONCURRENT_REQUESTS }).map(async (_, i) => {
    try {
      const response = await fetch(`${BASE_URL}/api/data`, {
        headers: {
          'x-ace-api-key': ACE_API_KEY,
          'x-user-id': 'load_test_user_' + i
        }
      });
      const data = await response.json();
      return { status: response.status, size: JSON.stringify(data).length };
    } catch (err) {
      return { error: err.message };
    }
  });

  const results = await Promise.all(requests);
  const endTime = Date.now();
  const totalTime = endTime - startTime;

  const successCount = results.filter(r => r.status === 200).length;
  const errorCount = results.filter(r => r.error).length;
  const avgSize = results.filter(r => r.size).reduce((acc, r) => acc + r.size, 0) / successCount;

  console.log('\n📊 Load Test Results:');
  console.log(`- Total Time: ${totalTime}ms`);
  console.log(`- Success Rate: ${successCount}/${CONCURRENT_REQUESTS}`);
  console.log(`- Errors: ${errorCount}`);
  console.log(`- Average Payload Size: ${(avgSize / 1024).toFixed(2)} KB`);
  console.log(`- Requests/sec: ${(CONCURRENT_REQUESTS / (totalTime / 1000)).toFixed(2)}`);

  if (successCount === CONCURRENT_REQUESTS) {
    console.log('\n✅ Stability Verified: Server handled high concurrency without OOM or crashes.');
  } else {
    console.log('\n❌ Stability Check Failed: Some requests did not complete successfully.');
  }
}

runLoadTest();
