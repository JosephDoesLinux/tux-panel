const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // const x = require('y') -> import x from 'y'
  content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\(['"]([^'"]+)['"]\);/g, "import $1 from '$2';");
  
  // const { x, y } = require('z') -> import { x, y } from 'z'
  content = content.replace(/const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\);/g, "import { $1 } from '$2';");
  
  // module.exports = x -> export default x
  content = content.replace(/module\.exports\s*=\s*([a-zA-Z0-9_]+);/g, "export default $1;");
  
  // module.exports = { x, y } -> export { x, y }
  content = content.replace(/module\.exports\s*=\s*\{([^}]+)\};/g, "export { $1 };");

  fs.writeFileSync(file, content, 'utf8');
});
console.log('Conversion complete.');
