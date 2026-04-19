import os

file_path = '/Users/shashankshekhar/Final Working/AceTrack_Stablility_Enhanced/screens/MatchmakingScreen.js'

with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for i in range(len(lines)):
    line = lines[i]
    if '</ScrollView>' in line:
        # Check context: If the preceding lines contain modal-specific logic
        context_window = "".join(lines[max(0, i-10):i])
        if 'matchmaking.challenge.submit' in context_window or 'submitCounterProposal' in context_window:
            new_lines.append('              </Pressable>\n')
    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
