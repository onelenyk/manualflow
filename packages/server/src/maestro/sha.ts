import fs from 'fs';
import crypto from 'crypto';

export async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
