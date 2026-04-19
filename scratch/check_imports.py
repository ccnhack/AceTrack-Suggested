import os
import re

def check_platform_imports(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if 'Platform' in content:
                        # Simple check for Platform in import from react-native
                        if not re.search(r'import\s+\{.*Platform.*\}\s+from\s+[\'"]react-native[\'"]', content, re.DOTALL):
                            # Also check for CJS
                            if not re.search(r'const\s+\{.*Platform.*\}\s+=\s+require\([\'"]react-native[\'"]\)', content):
                                print(f"FILE: {path}")

if __name__ == "__main__":
    check_platform_imports('.')
