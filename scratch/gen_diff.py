import os
import subprocess

components = [
    "components/Layout.js",
    "components/TournamentCard.js",
    "components/MatchCard.js",
    "screens/MatchesScreen.js",
    "screens/ExploreScreen.js",
    "screens/InsightsScreen.js"
]

ref_dir = os.path.abspath("../mobile-app 4")
target_dir = os.path.abspath(".")

with open("scratch/diff_report.txt", "w") as f:
    for comp in components:
        f.write(f"\n============================\nDIFF FOR {comp}\n============================\n")
        ref_comp = os.path.join(ref_dir, comp)
        targ_comp = os.path.join(target_dir, comp)
        if os.path.exists(ref_comp):
            res = subprocess.run(["diff", "-U", "1", ref_comp, targ_comp], capture_output=True, text=True)
            # just take the first 50 lines of diff for brevity
            out = res.stdout.split("\n")
            f.write("\n".join(out[:100]))
            if len(out) > 100:
                f.write("\n...[TRUNCATED]...\n")
