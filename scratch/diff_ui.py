import os
import subprocess
import glob

def run_diff():
    ref_dir = os.path.abspath("../mobile-app 4")
    target_dir = os.path.abspath(".")
    
    # Check screens
    print("--- SCREENS DIFF ---")
    screens = glob.glob(os.path.join(target_dir, "screens", "*.js"))
    for screen in screens:
        basename = os.path.basename(screen)
        ref_screen = os.path.join(ref_dir, "screens", basename)
        if os.path.exists(ref_screen):
            res = subprocess.run(["diff", "-q", ref_screen, screen], capture_output=True, text=True)
            if res.returncode != 0:
                print(f"DIFFERS: screens/{basename}")
        else:
            print(f"MISSING IN REF: screens/{basename}")
            
    # Check components
    print("\n--- COMPONENTS DIFF ---")
    components = glob.glob(os.path.join(target_dir, "components", "**", "*.js"), recursive=True)
    for comp in components:
        rel_path = os.path.relpath(comp, target_dir)
        ref_comp = os.path.join(ref_dir, rel_path)
        if os.path.exists(ref_comp):
            res = subprocess.run(["diff", "-q", ref_comp, comp], capture_output=True, text=True)
            if res.returncode != 0:
                print(f"DIFFERS: {rel_path}")
        else:
            print(f"MISSING IN REF: {rel_path}")

if __name__ == "__main__":
    run_diff()
