/**
 * Helpers de criptografia AES-256-GCM para tokens OAuth.
 *
 * Por que AES-256-GCM?
 *  - 256 bits = mesma força do AES padrão da indústria.
 *  - GCM é modo AEAD (Authenticated Encryption with Associated Data): além de
 *    cifrar, gera um tag de autenticação que detecta tampering. Se um atacante
 *    modificar o ciphertext, o decrypt falha com `Unsupported state or unable
 *    to authenticate data`.
 *  - 12 bytes de IV aleatório por encrypt = seguro contra colisões até ~2^32
 *    mensagens (NIST SP 800-38D §8.3).
 *
 * Formato armazenado (base64):
 *   [12 bytes IV][N bytes ciphertext][16 bytes auth tag]
 *
 * Tokens OAuth do Mercado Livre têm ~1500 bytes — compactar em uma única
 * coluna BYTEA ou TEXT (base64) simplifica queries.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recomendação NIST para GCM.
const KEY_LENGTH = 32; // 256 bits.

/** Erros tipados para distinguir falhas de configuração vs. tampering. */
export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_key' | 'invalid_payload' | 'tampering_detected',
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}

/**
 * Recupera e valida a chave de criptografia a partir de ENCRYPTION_KEY (env).
 * A chave DEVE ter 32 bytes (256 bits) em base64 ou hex.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoError(
      'ENCRYPTION_KEY não definida no ambiente',
      'invalid_key',
    );
  }

  // Aceita base64 ou hex.
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_LENGTH) {
      // Tenta hex como fallback.
      key = Buffer.from(raw, 'hex');
    }
  } catch {
    key = Buffer.from(raw, 'hex');
  }

  if (key.length !== KEY_LENGTH) {
    throw new CryptoError(
      `ENCRYPTION_KEY deve ter ${KEY_LENGTH} bytes (256 bits) — recebido ${key.length}`,
      'invalid_key',
    );
  }

  return key;
}

/**
 * Cifra um plaintext e retorna base64(IV || ciphertext || tag).
 *
 * @throws {CryptoError} se ENCRYPTION_KEY for inválida.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

/**
 * Decifra um payload base64(IV || ciphertext || tag).
 *
 * @throws {CryptoError} 'tampering_detected' se auth tag falhar.
 * @throws {CryptoError} 'invalid_payload' se o payload estiver corrompido.
 */
export function decrypt(payload: string): string {
  const key = getKey();
  const buffer = Buffer.from(payload, 'base64');

  if (buffer.length < IV_LENGTH + 16) {
    throw new CryptoError(
      'Payload muito curto — esperado IV(12) + ciphertext + tag(16)',
      'invalid_payload',
    );
  }

  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(buffer.length - 16);
  const ciphertext = buffer.subarray(IV_LENGTH, buffer.length - 16);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch (error) {
    throw new CryptoError(
      'Falha ao decifrar — possível tampering ou chave incorreta',
      'tampering_detected',
    );
  }
}

/**
 * Gera uma nova chave AES-256 aleatória em base64.
 * Útil para setup inicial: `node -e "import('./lib/crypto/tokens.ts').then(m => console.log(m.generateKey()))"`.
 */
export function generateKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}