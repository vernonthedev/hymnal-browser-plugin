import os

TEXT_DIR = r"D:\livestreamEKC\hymn_texts"
CLEAN_DIR = r"D:\livestreamEKC\hymn_texts_clean"

os.makedirs(CLEAN_DIR, exist_ok=True)

def clean_line(line: str) -> str:
    # If there's a #, cut everything after it
    if "#" in line:
        line = line.split("#", 1)[0]

    return line.strip()


def clean_file(input_path, output_path):
    with open(input_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    cleaned_lines = []

    for line in lines:
        cleaned = clean_line(line)
        if cleaned:   # keep non-empty
            cleaned_lines.append(cleaned)

    with open(output_path, "w", encoding="utf-8") as f:
        for line in cleaned_lines:
            f.write(line + "\n")


def main():
    files = [f for f in os.listdir(TEXT_DIR) if f.endswith(".txt")]

    print("\n====== SAFE HYMN TEXT CLEANER ======\n")
    print(f"Source: {TEXT_DIR}")
    print(f"Output: {CLEAN_DIR}")
    print(f"Files found: {len(files)}\n")

    success = 0

    for file in files:
        in_path = os.path.join(TEXT_DIR, file)
        out_path = os.path.join(CLEAN_DIR, file)

        try:
            clean_file(in_path, out_path)
            print(f"[✓] Cleaned {file}")
            success += 1
        except Exception as e:
            print(f"[ERROR] {file}: {e}")

    print("\n===================================")
    print(f"Cleaned: {success}/{len(files)} files")
    print("===================================\n")


if __name__ == "__main__":
    main()