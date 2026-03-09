// users/fix-lcov.mjs
import { readFileSync, writeFileSync } from 'fs';

const file = 'coverage/lcov.info';
const content = readFileSync(file, 'utf8');
const fixed = content
  .replace(/SF:src\\/g, 'SF:users/src/')  // prefijo
  .replace(/\\/g, '/');                    // todos los backslashes restantes
writeFileSync(file, fixed);
