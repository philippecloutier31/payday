import fs from 'fs/promises';

async function main() {
    const logFile = './logs/combined-2026-01-30_full.log';
    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.split('\n');
    const matches = lines.filter(line => line.includes('8b511b83-2532-4c38-8ac2-97ec30044ded'));

    console.log(`Found ${matches.length} lines for session 8b511b83...`);
    for (const line of matches) {
        try {
            const parsed = JSON.parse(line);
            console.log(`[${parsed.timestamp}] ${parsed.level}: ${parsed.message}`);
            if (parsed.status) console.log(`  Status: ${parsed.status}`);
            if (parsed.error) console.log(`  Error: ${parsed.error}`);
        } catch (e) {
            console.log(line);
        }
    }
}

main();
