import fs from 'fs/promises';

async function main() {
    const sessions = JSON.parse(await fs.readFile('./data/sessions.json', 'utf-8'));
    const session = sessions.find(s => s.id === '8b511b83-2532-4c38-8ac2-97ec30044ded');
    await fs.writeFile('target_session.json', JSON.stringify(session, null, 2));
    console.log('Session saved to target_session.json');
}

main();
