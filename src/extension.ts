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

const macroDocs: Map<string, { markdown: vscode.MarkdownString; file: string; line: number }> = new Map();
const legend = new vscode.SemanticTokensLegend(['macro'], []);

function formatDocLines(docLines: string[]): string {
    const body: string[] = [];
    const paramLines: string[] = [];
    let returnsLines: string[] = []
    
    for (const line of docLines) {
        const clean = line.replace(/^;[*]{1,2}\s?/, '').trim();
        
        if (clean.startsWith('@param')) {
            paramLines.push(clean.replace('@param', '').trim());
        } else if (clean.startsWith('@returns') || clean.startsWith('@return')) {
            returnsLines.push(clean.replace(/@returns?/, '').trim());
        } else {
            body.push(clean);
        }
    }
    
    const output: string[] = [];
    
    if (body.length > 0) {
        output.push(body.join('\n') + '\n');
    }
    
    if (paramLines.length > 0) {
        output.push('\n**Parameters:**\n');
        output.push('```plaintext\n' + paramLines.join('\n') + '\n```');
    }
    
    if (returnsLines.length > 0) {
        output.push('\n**Returns:**\n');
        output.push('```plaintext\n' + returnsLines.join('\n') + '\n```');
    }
    
    return output.join('\n');
}


function updateDocCacheForFile(filePath: string) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // 1. Check for doc block above
        const docLines: string[] = [];
        let j = i - 1;
        while (j >= 0) {
            const l = lines[j].trim();
            if (/^;[*]{1,2}/.test(l)) {
                docLines.unshift(l.replace(/^;[*]{1,2}\s?/, ''));
                j--;
            } else if (l === '') {
                j--;
            } else {
                break;
            }
        }
        
        // 2. Macro
        const macroMatch = line.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*)\s+MACRO\b/i);
        if (macroMatch) {
            const name = macroMatch[1].toUpperCase();
            const markdown = new vscode.MarkdownString();
            if (docLines.length > 0) {
                const formatted = formatDocLines(docLines);
                markdown.appendMarkdown(formatted);
            } else {
                markdown.appendCodeblock(line.trim(), 'arg65816');
            }
            macroDocs.set(name, { markdown, file: filePath, line: i }); // `i` is the line number of the macro label or routine
            i++;
            continue;
        }
        
        // 3. Routine label
        //const labelMatch = line.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*)$/);
        const labelMatch = line.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*)\b/);
        const nextLine = lines[i + 1]?.trim() ?? '';
        
        if (labelMatch) {
            const name = labelMatch[1].toUpperCase();
            const markdown = new vscode.MarkdownString();
            if (docLines.length > 0) {
                const formatted = formatDocLines(docLines);
                markdown.appendMarkdown(formatted);
            } else {
                markdown.appendCodeblock(line.trim(), 'arg65816');
            }
            macroDocs.set(name, { markdown, file: filePath, line: i }); // `i` is the line number of the macro label or routine
            i++;
            continue;
        }
        
        i++;
    }
}

function scanWorkspaceForDocs() {
    const pattern = '**/*.{ASM,EXT,INC,MC}';
    vscode.workspace.findFiles(pattern, '**/node_modules/**').then(files => {
        for (const file of files) {
            const lines = fs.readFileSync(file.fsPath, 'utf8').split(/\r?\n/);
            const filePath = file.fsPath;
            let i = 0;
            
            while (i < lines.length) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // 1. Check for doc block above
                const docLines: string[] = [];
                let j = i - 1;
                while (j >= 0) {
                    const l = lines[j].trim();
                    if (/^;[*]{1,2}/.test(l)) {
                        docLines.unshift(l.replace(/^;[*]{1,2}\s?/, ''));
                        j--;
                    } else if (l === '') {
                        j--;
                    } else {
                        break;
                    }
                }
                
                // 2. Match macro definitions
                const macroMatch = line.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*)\s+MACRO\b/i);
                if (macroMatch) {
                    const name = macroMatch[1].toUpperCase();
                    const markdown = new vscode.MarkdownString();
                    
                    if (docLines.length > 0) {
                        const formatted = formatDocLines(docLines);
                        markdown.appendMarkdown(formatted);
                    } else {
                        markdown.appendCodeblock(line.trim(), 'arg65816');
                    }
                    
                    macroDocs.set(name, { markdown, file: filePath, line: i }); // `i` is the line number of the macro label or routine
                    i++;
                    continue;
                }
                
                // 3. Match routine/function labels
                const labelMatch = line.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*)\b/);
                const nextLine = lines[i + 1]?.trim() ?? '';
                
                if (labelMatch) {
                    const name = labelMatch[1].toUpperCase();
                    const markdown = new vscode.MarkdownString();
                    
                    if (docLines.length > 0) {
                        const formatted = formatDocLines(docLines);
                        markdown.appendMarkdown(formatted);
                    } else {
                        markdown.appendCodeblock(line.trim(), 'arg65816');
                    }
                    macroDocs.set(name, { markdown, file: filePath, line: i }); // `i` is the line number of the macro label or routine
                    i++;
                    continue;
                }
                
                i++;
            }
        }
    });
}

interface HelpEntry {
    description: string;
    flags: string;
    opcodes: string;
}

let helpData: Record<string, HelpEntry> = {};

// Parses flags field in JSON
function parseFlags(flagsRaw: string): { statusLine: string, description: string } {
    const lines = flagsRaw.trim().split('\n');
    const statusLine = lines[0].trim();
    const description = lines.slice(1).join('\n').trim();
    return { statusLine, description };
}

// Renders ASCII art flags table
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

// Renders ASCII art opcode table
function renderOpcodeTable(opcodeStr: string): string {
    const lines = opcodeStr.trim().split('\n');
    
    // Remove final line if it's a parenthetical note (See also)
    const lastLine = lines[lines.length - 1].trim();
    const seeAlso = lastLine.startsWith('(') && lastLine.endsWith(')') ? lines.pop() : null;
    
    const tableRows = lines.map(line => line.split('\t'));
    
    // Ensure all rows have exactly 6 columns
    for (const row of tableRows) {
        while (row.length < 6) row.push('-');
    }
    
    const pad = (str: string, len: number) => str.padEnd(len, ' ');
    
    const colWidths = [15, 15, 15, 5, 5, 5]; // Adjust these as needed
    const formatRow = (cols: string[]) =>
        '│' + cols.map((col, i) => pad(col, colWidths[i])).join('│') + '│';
    
    const borderTop    = '┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐';
    const borderMiddle = '├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤';
    const borderBottom = '└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘';
    
    const header = formatRow(['Codes', 'Opcode', 'Syntax', 'ROM', 'RAM', 'Cache']);
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
    scanWorkspaceForDocs();
    
    // Watch for file saves and rescan just that file
    const saveWatcher = vscode.workspace.onDidSaveTextDocument(document => {
        const filePath = document.uri.fsPath;
        if (/\.(ASM|EXT|INC|MC)$/i.test(filePath)) {
            updateDocCacheForFile(filePath);
        }
    });
    
    // Load the help JSON file
    const helpFilePath = path.join(context.extensionPath, 'src', 'data', 'superfx_help.json');
    const rawData = fs.readFileSync(helpFilePath, 'utf8');
    helpData = JSON.parse(rawData);
    
    const docProvider = vscode.languages.registerHoverProvider(
        [{ scheme: 'file', language: 'argsuperfx' }, { scheme: 'file', language: 'arg65816' }],
        {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position, /[a-zA-Z_@][a-zA-Z0-9_@]*/);
                if (!range) return;
                
                const word = document.getText(range).toUpperCase();
                
                // Check if it's a macro invocation (must be indented)
                const lineText = document.lineAt(position.line).text;
                const isInvoked = /^\s+[a-zA-Z_@][a-zA-Z0-9_@]*/.test(lineText);
                const isInvokedWithLabelPrefix = /^([a-zA-Z_@][a-zA-Z0-9_@]*\s+)?[a-zA-Z_@][a-zA-Z0-9_@]*/.test(lineText);
                const isInvokedWithSubLabelPrefix = /^.([a-zA-Z_@][a-zA-Z0-9_@]*\s+)?[a-zA-Z_@][a-zA-Z0-9_@]*/.test(lineText);
                
                if ((isInvoked || isInvokedWithLabelPrefix || isInvokedWithSubLabelPrefix) && macroDocs.has(word)) {
                    const { markdown, file, line } = macroDocs.get(word)!;
                    const enrichedMarkdown = new vscode.MarkdownString(markdown.value);
                    const relativePath = vscode.workspace.asRelativePath(file);
                    const uri = vscode.Uri.file(file).with({ fragment: `L${line + 1}` }); // Correct jump target
                    enrichedMarkdown.appendMarkdown(`\n\n---\n\nDefined in: [\`${relativePath}\`](${uri.toString()})`);
                    enrichedMarkdown.isTrusted = true;
                    return new vscode.Hover(enrichedMarkdown, range);
                }
                
                return;
            }
        }
    );
    // This doesn't get tokens for invocations after labels, but I don't like colorizing them anyway so I don't care
    const semanticProvider: vscode.DocumentSemanticTokensProvider = {
        provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
            const builder = new vscode.SemanticTokensBuilder(legend);
            
            for (let line = 0; line < document.lineCount; line++) {
                const text = document.lineAt(line).text;
                const match = text.match(/^\s+([a-zA-Z_@][a-zA-Z0-9_@]*)/);
                if (match) {
                    const [_, word] = match;
                    if (macroDocs.has(word.toUpperCase())) {
                        const start = text.indexOf(word);
                        builder.push(line, start, word.length, 0); // tokenType index 0 => 'macro'
                    }
                }
            }
            
            return builder.build();
        }
    };
    
    
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
    
    context.subscriptions.push(saveWatcher);
    context.subscriptions.push(provider);
    context.subscriptions.push(docProvider);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: 'arg65816', scheme: 'file' },
            semanticProvider,
            legend
        )
    );
    
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: 'argsuperfx', scheme: 'file' },
            semanticProvider,
            legend
        )
    );
    
}

