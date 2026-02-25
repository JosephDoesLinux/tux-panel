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

const files = walk('./src/routes');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('import { Request, Response, NextFunction } from \'express\';')) {
    content = content.replace(/import \{ Router\s*\} from 'express';/, "import { Router, Request, Response, NextFunction } from 'express';");
  }

  content = content.replace(/\(req, res, next\)/g, "(req: Request, res: Response, next: NextFunction)");
  content = content.replace(/\(_req, res, next\)/g, "(_req: Request, res: Response, next: NextFunction)");
  content = content.replace(/\(req, res\)/g, "(req: Request, res: Response)");
  content = content.replace(/\(_req, res\)/g, "(_req: Request, res: Response)");

  fs.writeFileSync(file, content, 'utf8');
});
console.log('Routes updated.');
