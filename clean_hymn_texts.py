import os
import re

TEXT_DIR = r"D:\livestreamEKC\hymn_texts"
CLEAN_DIR = r"D:\livestreamEKC\hymn_texts_clean"

os.makedirs(CLEAN_DIR, exist_ok=True)

# Patterns to remove
REMOVE_PATTERNS = [
    r"^\s*#.*",                     # lines starting with #
    r"^\s*\d+\.\s+.*",              # "4. Praise My Soul..."
    r"^\s*Hymn\s+\d+.*",            # "Hymn 25 ..."
    r"^\s*Slide\s+\d+.*",           # "Slide 1"
    r"^\s*\[Slide\s+\d+\]",         # "[Slide 1]"
]

def should_remove(line: str) -> bool:
    line = line.strip()
    if not line:
        return True  # remove empty lines

    for pattern in REMOVE_PATTERNS:
        if re.match(pattern, line, re.IGNORECASE):
            return True

    return False


def clean_file(input_path, output_path):
    with open(input_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    cleaned = []
    for line in lines:
        if not should_remove(line):
            cleaned.append(line.strip())

    # Reformat nicely
    final_lines = []
    for line in cleaned:
        if line:
            final_lines.append(line)

    with open(output_path, "w", encoding="utf-8") as f:
        for line in final_lines:
            f.write(line + "\n")



def main():
    files = [f for f in os.listdir(TEXT_DIR) if f.endswith(".txt")]

    print("\n====== CLEANING HYMN TEXT FILES ======\n")
    print(f"Source: {TEXT_DIR}")
    print(f"Output: {CLEAN_DIR}")
    print(f"Files found: {len(files)}\n")

    cleaned_count = 0

    for file in files:
        in_path = os.path.join(TEXT_DIR, file)
        out_path = os.path.join(CLEAN_DIR, file)

        try:
            clean_file(in_path, out_path)
            print(f"[✓] Cleaned {file}")
            cleaned_count += 1
        except Exception as e:
            print(f"[ERROR] {file}: {e}")

    print("\n====================================")
    print(f"Cleaned: {cleaned_count}/{len(files)} files")
    print("====================================\n")


if __name__ == "__main__":
    main()