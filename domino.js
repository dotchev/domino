#!/usr/bin/env node

import axios from 'axios';
import { program } from 'commander';
import Handlebars from 'handlebars';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as UUID } from 'uuid';
import yaml from 'yaml';
import colors from 'yoctocolors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const thisPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

Handlebars.registerHelper('$uuid', UUID);
Handlebars.registerHelper('$guid', UUID);

program
  .version(thisPackage.version)
  .description('A CLI tool to load and parse a YAML file')
  .argument('<file>', 'path to the YAML file')
  .action(load);

program.parse(process.argv);

function inspect(obj) {
  return JSON.stringify(obj, null, 2);
}

function abort(message) {
  console.error(colors.red(message));
  process.exit(1);
}

async function load(file) {
  let doc;
  try {
    const data = fs.readFileSync(file, 'utf8');
    doc = yaml.parse(data);
  } catch (e) {
    abort(`Error loading YAML file ${file}: ${e.message}`);
  }

  try {
    await exec(doc);
  } catch (e) {
    abort(`Error: ${e.message}`);
  }
}

async function exec(doc) {
  const variables = doc.variables || {};

  const interpolate = s => s && Handlebars.compile(s)(variables);

  const actions = doc.actions || [];
  for (const action of actions) {
    console.log(colors.green(action.name));

    const url = interpolate(action.url);
    const body = interpolate(action.body);
    const headers = action.headers || {};

    for (const h in headers) {
      headers[h] = interpolate(headers[h]);
    }

    console.log('Request:', colors.yellow(action.method), colors.blue(url), '\n', body);
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
    console.log('Response:', response.status, '\n', inspect(response.data));

    for (const key in action.capture) {
      variables[key] = eval(action.capture[key]);
    }

    for (const assertion of action.assert) {
      const result = eval(assertion);
      if (!result) {
        abort(`Assertion failed: ${assertion}`);
      }
    }
  }

  console.log(colors.green('Done'));
}
