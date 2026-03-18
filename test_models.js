
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const path = require('path');

// Extract API key from .env manually to avoid dotenv dependency issues in this environment
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const apiKeyMatch = envContent.match(/EXPO_PUBLIC_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!apiKey) {
  console.error("API Key not found in .env");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey, apiVersion: 'v1' });

const modelsToTest = [
  "gemini-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-001",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash"
];

async function testModels() {
  for (const model of modelsToTest) {
    console.log(`Testing model: ${model}...`);
    try {
      const response = await genAI.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
      });
      console.log(`SUCCESS: ${model} works!`);
      process.exit(0);
    } catch (err) {
      console.log(`FAILED: ${model} -> ${err.message}`);
      if (err.message.includes("429")) {
        console.log(`  (Quota issue, but model exists)`);
      }
    }
  }
}

testModels();
