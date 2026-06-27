import crypto from 'crypto';
import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';

// Helper: Post an ephemeral message via Slack Web API
export async function postEphemeral(token, channel, user, text, blocks) {
    if (!token || !channel || !user) return false;
    const body = { channel, user, text };
    if (blocks) body.blocks = blocks;
    try {
        const resp = await fetch('https://slack.com/api/chat.postEphemeral', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await resp.json();
        if (!json.ok) {
            console.error('chat.postEphemeral failed:', json.error);
            return false;
        }
        return true;
    } catch(e) {
        console.error('postEphemeral error:', e.message);
        return false;
    }
}

// 🌍 Helper: Batch resolve IPs to City/Country using ip-api.com
export async function resolveIpGeoLocations(logsArray) {
    const ipSet = new Set();
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

    for (const log of logsArray) {
        const text = typeof log === 'string' ? log : (log.text || '');
        const matches = text.match(ipRegex);
        if (matches) {
            for (const match of matches) {
                ipSet.add(match);
            }
        }
    }

    const uniqueIps = Array.from(ipSet);
    if (uniqueIps.length === 0) return {};

    const batches = [];
    for (let i = 0; i < uniqueIps.length; i += 100) {
        batches.push(uniqueIps.slice(i, i + 100));
    }

    const geoMap = {};
    for (const batch of batches) {
        try {
            const response = await fetch("http://ip-api.com/batch?fields=status,city,country,query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch)
            });

            if (response.ok) {
                const data = await response.json();
                for (const result of data) {
                    if (result.status === "success" && result.query) {
                        geoMap[result.query] = `${result.city || 'Unknown City'}, ${result.country || 'Unknown Country'}`;
                    }
                }
            }
        } catch (error) {
            console.error("IP Geo-resolution error:", error.message);
        }
    }
    return geoMap;
}

export async function sendDelayedSlackResponse(url, payload) {
    if (!url) return;
    try {
        const https = await import('https');
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    console.error(`Slack Response Error (${res.statusCode}):`, data);
                }
            });
        });
        req.on('error', (e) => console.error("Delayed Response Req Error:", e.message));
        req.write(JSON.stringify(payload));
        req.end();
    } catch (e) { console.error("Delayed Response Failed:", e.message); }
}

export function sanitizeMongoFilter(filter) {
    if (!filter || typeof filter !== 'object') return {};
    const f = JSON.parse(JSON.stringify(filter)); 

    if (f.action && f.action.$regex) {
        const r = f.action.$regex;
        if (/login/i.test(r) && !/unauthorized/i.test(r)) {
            f.action.$regex = `${r}|UNAUTHORIZED`;
        }
    }

    if (f.timestamp) {
        if (f.timestamp.$gte && typeof f.timestamp.$gte === 'string') f.timestamp.$gte = new Date(f.timestamp.$gte);
        if (f.timestamp.$lte && typeof f.timestamp.$lte === 'string') f.timestamp.$lte = new Date(f.timestamp.$lte);
    }

    if (f.details && (f.details.$regex || f.details.$options)) {
        const searchTerm = f.details.$regex || '';
        const opts = f.details.$options || 'i';
        delete f.details;
        const detailsOr = [
            { 'details.email': { $regex: searchTerm, $options: opts } },
            { 'details.name': { $regex: searchTerm, $options: opts } },
            { 'details.identifier': { $regex: searchTerm, $options: opts } },
            { 'details.role': { $regex: searchTerm, $options: opts } },
            { 'details.userId': { $regex: searchTerm, $options: opts } },
            { 'details.receivedIdentifier': { $regex: searchTerm, $options: opts } },
        ];
        if (f.$or) {
            f.$or.push(...detailsOr);
        } else {
            f.$or = detailsOr;
        }
    }
    return f;
}
