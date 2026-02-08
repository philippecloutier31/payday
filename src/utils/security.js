
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function decrypt(encryptedText, password) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 4) throw new Error('Invalid format');

        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];

        const key = crypto.scryptSync(password, salt, 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        return null;
    }
}
