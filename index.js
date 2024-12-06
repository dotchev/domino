#!/usr/bin/env node`

import { program } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import yaml from 'yaml';
import { v4 as UUID } from 'uuid';
import axios from 'axios';

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

async function load(file) {
  let doc;
  try {
    const data = fs.readFileSync(file, 'utf8');
    doc = yaml.parse(data);
  } catch (e) {
    console.error(`Error loading YAML file ${file}: ${e.message}`);
    process.exit(1);
  }

  try {
    await exec(doc);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

async function exec(doc) {
  const variables = doc.variables || {};

  const actions = doc.actions || [];
  for (const action of actions) {
    console.log(action.name);

    const url = Handlebars.compile(action.url)(variables);
    const body = Handlebars.compile(action.body)(variables);

    const response = await axios({
      method: action.method,
      url: url,
      data: body,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log(response.status, response.data);
  }

  console.log('Done');
}