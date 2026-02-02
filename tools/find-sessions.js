import fs from 'fs/promises';

async function main() {
    const sessions = JSON.parse(await fs.readFile('./data/sessions.json', 'utf-8'));
    const sessions0130 = sessions.filter(s =>
        (s.createdAt && s.createdAt.startsWith('2026-01-30')) ||
        (s.completedAt && s.completedAt.startsWith('2026-01-30')) ||
        (s.detectedAt && s.detectedAt.startsWith('2026-01-30'))
    );
    await fs.writeFile('sessions_0130.json', JSON.stringify(sessions0130, null, 2), 'utf-8');
}

main();
