// Descriptografa uma cópia baixada do GitHub (arquivo .tar.gz.enc) e gera o .tar.gz, que o Windows abre normalmente.
// Uso: node scripts/backup/abrir.mjs estoque-backup-2026-11-26.tar.gz.enc
// A senha é a mesma do segredo BACKUP_SENHA (pedida na tela; ou na variável de ambiente BACKUP_SENHA).
// Equivale a: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in <arquivo> -out <arquivo sem .enc>
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

export const ITERACOES = 200000;

/** Formato do "openssl enc -pbkdf2": "Salted__" + sal (8 bytes) + dados; chave e IV via PBKDF2-SHA256. */
export function descriptografar(bytes, senha) {
  if (bytes.subarray(0, 8).toString('latin1') !== 'Salted__') throw new Error('Arquivo não é uma cópia criptografada do app');
  const sal = bytes.subarray(8, 16);
  const kiv = pbkdf2Sync(senha, sal, ITERACOES, 48, 'sha256');
  const d = createDecipheriv('aes-256-cbc', kiv.subarray(0, 32), kiv.subarray(32, 48));
  try { return Buffer.concat([d.update(bytes.subarray(16)), d.final()]); } catch { throw new Error('Senha errada ou arquivo corrompido'); }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('abrir.mjs')) {
  const arquivo = process.argv[2];
  if (!arquivo) { console.error('Uso: node scripts/backup/abrir.mjs <arquivo .tar.gz.enc>'); process.exit(1); }
  let senha = process.env.BACKUP_SENHA;
  if (!senha) { const rl = createInterface({ input: process.stdin, output: process.stdout }); senha = await rl.question('Senha da cópia: '); rl.close(); }
  const saida = arquivo.replace(/\.enc$/, '') === arquivo ? `${arquivo}.tar.gz` : arquivo.replace(/\.enc$/, '');
  await writeFile(saida, descriptografar(await readFile(arquivo), senha));
  console.log(`Pronto: ${saida}`);
}
