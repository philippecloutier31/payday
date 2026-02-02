import fs from 'fs/promises';

async function main() {
    const sessions = JSON.parse(await fs.readFile('./data/sessions.json', 'utf-8'));
    const matches = sessions.filter(s =>
        s.metadata && s.metadata.amountUSD == 5 &&
        (s.createdAt && s.createdAt.startsWith('2026-01-30'))
    );
    console.log(JSON.stringify(matches, null, 2));
}

main();
