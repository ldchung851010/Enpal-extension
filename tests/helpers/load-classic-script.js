import fs from 'node:fs';
import vm from 'node:vm';

export function createClassicContext(globals = {}) {
  return vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    ...globals
  });
}

export function runClassicScript(filePath, context) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
  return context;
}

export function loadClassicScript(filePath, globals = {}) {
  const context = createClassicContext(globals);
  return runClassicScript(filePath, context);
}
