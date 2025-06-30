/*
extension.ts
Super FX hover/tooltip handler.

Copyright © 2025 Sunlit
Released under the MIT license.

Please credit me if you use this code in your software or make any derivatives of this code.
It's not like you have to pay me or anything. Crediting me is free.
*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface HelpEntry {
  description: string;
  flags: string;
  opcodes: string;
}

let helpData: Record<string, HelpEntry> = {};

function parseFlags(flagsRaw: string): { statusLine: string, description: string } {
  const lines = flagsRaw.trim().split('\n');
  const statusLine = lines[0].trim();
  const description = lines.slice(1).join('\n').trim();
  return { statusLine, description };
}

function renderFlagsTable(flagsStr: string): string {
  const values = flagsStr.trim().split('').map(c => c || ' ');

  return [
    '```\n' +
    '┌──┬──┬──┬──┬──┬──┬──┬──┬──┐',
    '│b │a1│a2│r │g │v │s │c │z │',
    '├──┼──┼──┼──┼──┼──┼──┼──┼──┤',
    '│' + values.map(v => `${v} `).join('│') + '│',
    '└──┴──┴──┴──┴──┴──┴──┴──┴──┘',
    '```'
  ].join('\n');
}


function renderOpcodeTable(opcodeStr: string): string {
  const lines = opcodeStr.trim().split('\n');

  // Remove final line if it's a parenthetical note (See also)
  const lastLine = lines[lines.length - 1].trim();
  const seeAlso = lastLine.startsWith('(') && lastLine.endsWith(')') ? lines.pop() : null;

  const tableRows = lines.map(line => line.split('\t'));

  // Ensure all rows have exactly 4 columns
  for (const row of tableRows) {
    while (row.length < 4) row.push('');
  }

  const pad = (str: string, len: number) => str.padEnd(len, ' ');

  const colWidths = [15, 15, 15, 3]; // Adjust these as needed
  const formatRow = (cols: string[]) =>
    '│' + cols.map((col, i) => pad(col, colWidths[i])).join('│') + '│';

  const borderTop    = '┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐';
  const borderMiddle = '├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤';
  const borderBottom = '└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘';

  const header = formatRow(['Codes', 'Opcode', 'Syntax', 'C']);
  const bodyRows = tableRows.map(formatRow);

  let table = '```\n';
  table += borderTop + '\n';
  table += header + '\n';
  table += borderMiddle + '\n';
  table += bodyRows.join('\n') + '\n';
  table += borderBottom + '\n';
  if (seeAlso) {
    table += `See also: ` + seeAlso + '\n';
  }
  table += '```';

  return table;
}

export function activate(context: vscode.ExtensionContext) {
  // Load the help JSON file
  const helpFilePath = path.join(context.extensionPath, 'src', 'data', 'superfx_help.json');
  const rawData = fs.readFileSync(helpFilePath, 'utf8');
  helpData = JSON.parse(rawData);

  // Register hover provider
  const provider = vscode.languages.registerHoverProvider({ scheme: 'file', language: 'argsuperfx' }, {
provideHover(document, position) {
  const range = document.getWordRangeAtPosition(position);
  let word = document.getText(range).toUpperCase();

    // Branch aliases that map to a shared entry
    const branchGroup = [
    "BCC", "BCS", "BEQ", "BGE", "BLT", "BMI",
    "BNE", "BPL", "BRA", "BVC", "BVS"
    ];

    let lookupWord = word;

    // Normalize to shared entry for branches
    if (branchGroup.includes(word)) {
    lookupWord = "B(CC,CS,EQ,NE,GE,LT,MI,PL,RA,VC,VS) BRANCH CONDITIONALLY.";
    }

    // Try finding a matching help key
    let key = Object.keys(helpData).find(k => k.startsWith(lookupWord));


  // Fallback: if word starts with 'M', try without it
  if (!key && word.startsWith('M')) {
    const altWord = word.slice(1);
    key = Object.keys(helpData).find(k => k.startsWith(altWord));
    if (key) word = altWord; // update `word` for correct formatting
  }

  if (key) {
    const entry = helpData[key];
    const hoverText = new vscode.MarkdownString();
    const splitIndex = key.indexOf(' ');
    const formattedKey = splitIndex !== -1
      ? `${key.slice(0, splitIndex)}\n${key.slice(splitIndex + 1)}`
      : `\`${key}\``;

    hoverText.appendCodeblock(formattedKey, 'plaintext');

    hoverText.appendCodeblock('\n', 'plaintext');

    hoverText.appendCodeblock(entry.description.trim(), 'plaintext');

    // Separator
    hoverText.appendMarkdown(`---\n`);

    // Render flags table
    hoverText.appendMarkdown(`**Flags:**\n`);

    const { statusLine, description } = parseFlags(entry.flags);
    hoverText.appendMarkdown(renderFlagsTable(statusLine) + '\n\n');

    if (description) {
      hoverText.appendCodeblock(description + '\n\n', 'plaintext');
    }

    // Render opcodes table
    hoverText.appendMarkdown(`**Opcodes:**\n`);

    hoverText.appendMarkdown(renderOpcodeTable(entry.opcodes.trim()));
    hoverText.isTrusted = true;

    return new vscode.Hover(hoverText, range);
  }

  return undefined;
}
  });

  context.subscriptions.push(provider);
}
