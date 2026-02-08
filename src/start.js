
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { decrypt } from './utils/security.js';
import { fileURLToPath } from 'url';

// Load .env immediately
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env') });

const ENCRYPTED_SEED = process.env.MASTER_SEED_PHRASE_ENCRYPTED;
const PLAIN_SEED = process.env.MASTER_SEED_PHRASE;

// Helper for hidden input (password masking)
const questionHidden = (query) => new Promise((resolve) => {
    // TTY Mode: Manually handle keys for * masking
    if (process.stdin.isTTY) {
        process.stdout.write(query);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        let password = '';

        const keyHandler = (chunk, key) => {
            // Enter key
            if (key && (key.name === 'enter' || key.name === 'return')) {
                process.stdout.write('\n');
                process.stdin.setRawMode(false);
                process.stdin.removeListener('keypress', keyHandler);
                process.stdin.pause();
                resolve(password);
                return;
            }

            // Ctrl+C
            if (key && key.ctrl && key.name === 'c') {
                process.stdout.write('\n');
                process.stdin.setRawMode(false);
                process.exit();
            }

            // Backspace
            if (key && key.name === 'backspace') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    // Clear line from cursor
                    process.stdout.clearLine();
                    process.stdout.cursorTo(0);
                    // Write prompt + stars (minus one)
                    process.stdout.write(query + '*'.repeat(password.length));
                }
                return;
            }

            // Normal characters
            if (chunk) {
                const char = chunk.toString();
                // Filter control characters (ensure valid printable ASCII)
                if (char.length === 1 && char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
                    password += char;
                    process.stdout.write('*');
                }
            }
        };

        readline.emitKeypressEvents(process.stdin);
        process.stdin.on('keypress', keyHandler);
    }
    // Non-TTY: Standard fallback
    else {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    }
});

async function start() {
    console.log('=== Payment Gateway Startup ===');

    if (PLAIN_SEED) {
        console.warn('⚠️  WARNING: MASTER_SEED_PHRASE found in plain text!');
        console.warn('   For better security, please run "node tools/encrypt-seed.js" and update your .env file.');
        console.log('   Starting application with plain seed...\n');

        await import('./app.js');
        return;
    }

    if (!ENCRYPTED_SEED) {
        console.error('❌ ERROR: No seed phrase found (encrypted or plain).');
        console.error('   Please run setup or check .env configuration.');
        process.exit(1);
    }

    console.log('🔒 Encrypted seed detected.');

    // Prompt loop
    let attempts = 0;
    while (attempts < 3) {
        const password = await questionHidden('Enter encryption password: ');

        if (!password) {
            attempts++;
            console.log('\nPassword cannot be empty.');
            continue;
        }

        const seed = decrypt(ENCRYPTED_SEED, password);

        if (seed) {
            console.log('\n✅ Password correct. Decrypting wallet in memory...');

            // Set environment variable (in memory only)
            process.env.MASTER_SEED_PHRASE = seed;

            // Start the application
            console.log('🚀 Launching server...\n');
            await import('./app.js');
            return;
        } else {
            console.error('\n❌ Incorrect password. Please try again.');
            attempts++;
        }
    }

    console.error('\nToo many incorrect attempts. Exiting.');
    process.exit(1);
}

start();
