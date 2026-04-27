import os
import re

def check_files(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.js') or file.endswith('.ts') or file.endswith('.tsx'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    try:
                        content = f.read()
                        if 'shadows.' in content and 'import ' in content:
                            if not re.search(r'import\s+.*shadows.*from', content):
                                print(f"Missing import in {path}")
                    except Exception as e:
                        pass

check_files('components')
check_files('screens')
check_files('context')
