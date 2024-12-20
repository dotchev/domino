#!/usr/bin/env node

import axios from 'axios';
import { program } from 'commander';
import Handlebars from 'handlebars';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as UUID } from 'uuid';
import yaml from 'yaml';
import { red, green, yellow, blue, gray } from 'yoctocolors';
import clockit from 'clockit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const thisPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

Handlebars.registerHelper('$uuid', UUID);
Handlebars.registerHelper('$guid', UUID);

program
  .version(thisPackage.version)
  .description('A CLI tool to execute a sequence of linked HTTP requests defined in a YAML file')
  .option('-v, --verbose', 'print additional details')
  .argument('<file>', 'path to the YAML file')
  .action(load);

program.parse(process.argv);

function inspect(obj) {
  return JSON.stringify(obj, null, 2);
}

function abort(message) {
  console.error(red(message));
  process.exit(1);
}

async function load(file, options) {
  let doc;
  try {
    const data = fs.readFileSync(file, 'utf8');
    doc = yaml.parse(data);
  } catch (e) {
    abort(`Error loading YAML file ${file}: ${e.message}`);
  }

  try {
    await exec(doc, options);
  } catch (e) {
    abort(`Error: ${e.message}`);
  }
}

async function exec(doc, options) {
  const variables = doc.variables || {};

  const interpolate = s => s && Handlebars.compile(s)(variables);

  const actions = doc.actions || [];
  for (const action of actions) {
    console.log(green(action.name));

    const url = interpolate(action.url);
    const body = interpolate(action.body);
    const headers = action.headers || {};

    for (const h in headers) {
      headers[h] = interpolate(headers[h]);
    }

    console.log('>', yellow(action.method), blue(url));
    if (options.verbose) {
      console.log(headers);
      body && console.log(body);
    }
    const timer = clockit.start();
    const response = await axios({
      method: action.method,
      url: url,
      data: body,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
    variables.response = response;
    console.log(`< ${yellow(response.status)} ${gray(`${timer.ms.toFixed(0)}ms`)}`);
    if (options.verbose) {
      console.log(response.headers);
      console.log(inspect(response.data));
    }

    for (const key in action.capture) {
      const expr = action.capture[key];
      try {
        variables[key] = eval(expr);
      } catch (e) {
        abort(`Error evaluating capture "${expr}": ${e.message}`);
      }
    }

    for (const assertion of action.assert) {
      try {
        if (!eval(assertion)) {
          abort(`Assertion failed: ${assertion}`);
        }
      } catch (e) {
        abort(`Error evaluating assert "${assertion}": ${e.message}`);
      }
    }
  }

  console.log(green('Done'));
}
