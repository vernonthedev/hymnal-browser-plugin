import os
import sys
import time
from pathlib import Path
import win32com.client

# ================= CONFIG =================

SOURCE_DIR = r"D:\livestreamEKC\sdaFamily\Sda Hymnal - Fujairah SDA Church(Gulf Field)"
OUTPUT_DIR = r"D:\livestreamEKC\sdaFamily\Converted_PowerPoints"

# ==========================================

def ensure_output_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)
        print(f"[+] Created output directory: {path}")

def get_pps_files(directory):
    pps_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.lower().endswith((".pps", ".ppsx")):
                pps_files.append(os.path.join(root, file))
    return pps_files

def convert_files(files, output_dir):
    print("\n[+] Starting PowerPoint COM engine...")
    powerpoint = win32com.client.Dispatch("PowerPoint.Application")
    powerpoint.Visible = True

    success = 0
    failed = 0

    for idx, file_path in enumerate(files, 1):
        try:
            file_name = Path(file_path).stem
            output_file = os.path.join(output_dir, f"{file_name}.pptx")

            if os.path.exists(output_file):
                print(f"[SKIP] Already converted: {file_name}")
                continue

            print(f"[{idx}/{len(files)}] Converting: {file_name}")

            presentation = powerpoint.Presentations.Open(
                file_path,
                WithWindow=False,
                ReadOnly=True
            )

            # 24 = pptx format
            presentation.SaveAs(output_file, 24)
            presentation.Close()

            success += 1
            print(f"    ✔ Saved -> {output_file}")

        except Exception as e:
            failed += 1
            print(f"    ✖ Failed -> {file_path}")
            print(f"      Error: {e}")

    powerpoint.Quit()
    return success, failed

def main():
    start_time = time.time()

    print("\n====== PPS → PPT CONVERTER ======")
    print(f"Source Directory: {SOURCE_DIR}")
    print(f"Output Directory: {OUTPUT_DIR}")

    if not os.path.exists(SOURCE_DIR):
        print("[ERROR] Source directory does not exist.")
        sys.exit(1)

    ensure_output_dir(OUTPUT_DIR)

    print("\n[+] Scanning for PPS files...")
    files = get_pps_files(SOURCE_DIR)

    if not files:
        print("[!] No .pps or .ppsx files found.")
        sys.exit(0)

    print(f"[+] Found {len(files)} files for conversion.\n")

    success, failed = convert_files(files, OUTPUT_DIR)

    elapsed = round(time.time() - start_time, 2)

    print("\n====== CONVERSION COMPLETE ======")
    print(f"Total Files : {len(files)}")
    print(f"Converted   : {success}")
    print(f"Failed      : {failed}")
    print(f"Time Taken  : {elapsed} seconds")
    print("=================================\n")

if __name__ == "__main__":
    main()