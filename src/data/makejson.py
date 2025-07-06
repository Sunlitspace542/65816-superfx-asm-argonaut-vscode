import json
import re
import sys

def parse_file(input_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        raw_text = f.read()

    # Split entries by lines starting with a dot followed by mnemonic name
    entries = re.split(r'\n(?=\.\w+)', raw_text.strip())
    result = {}

    for entry in entries:
        lines = entry.strip().splitlines()

        # First line: .MNEMONIC Brief description
        if not lines or not lines[0].startswith('.'):
            continue

        header_match = re.match(r'\.([^\s]+)\s+(.*)', lines[0])
        if not header_match:
            continue

        mnemonic = header_match.group(1).upper()
        short_desc = header_match.group(2).strip()
        full_key = f"{mnemonic} {short_desc.upper()}"

        # Join everything after the first line back together for control-code splitting
        rest = "\n".join(lines[1:])

        # Split on control character \x11
        parts = rest.split('\x11')
        if len(parts) < 3:
            print(f"Warning: malformed entry for {mnemonic}")
            continue

        description = parts[0].strip()
        flags = parts[1].strip()
        opcodes = parts[2].strip()

        result[full_key] = {
            "description": description,
            "flags": flags,
            "opcodes": opcodes
        }

    return result

def main():
#    if len(sys.argv) != 3:
#        print("Usage: python parse_prefix.py <input.txt> <output.json>")
#        sys.exit(1)

    input_file = "./superfx_help.txt"
    output_file = "./superfx_help.json"

    parsed = parse_file(input_file)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(parsed, f, indent=2)

    print(f"Parsed {len(parsed)} entries to {output_file}")

if __name__ == '__main__':
    main()
