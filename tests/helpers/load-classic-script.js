import fs from 'node:fs';
import vm from 'node:vm';

export function loadClassicScript(filePath, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
  return context;
}
