
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const apiKeyMatch = envContent.match(/EXPO_PUBLIC_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

const genAI = new GoogleGenAI({ apiKey });

async function listAllModels() {
  try {
    // Some versions of js-genai might have listModels on the root or models object
    console.log("Attempting to list models...");
    const models = await genAI.models.listModels();
    console.log("Models found:", JSON.stringify(models, null, 2));
  } catch (err) {
    console.log(`list-models error: ${err.message}`);
    
    // Try v1beta explicitly
    try {
        const genAI2 = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
        const models2 = await genAI2.models.listModels();
        console.log("Models found (v1beta):", JSON.stringify(models2, null, 2));
    } catch (err2) {
        console.log(`list-models (v1beta) error: ${err2.message}`);
    }
  }
}

listAllModels();
